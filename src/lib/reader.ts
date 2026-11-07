import {
  blockCheck,
  COSMETIC_SELECTORS,
  INLINE_TRACKERS,
  KNOWN_HOSTS,
  stripTrackingParams,
  unwrapRedirect,
  type BlockResult,
  type FilterOptions,
} from "./filters";

export type ReadStage = "fetching" | "stripping" | "reinking";

export type Link = { text: string; href: string };

export type TocItem = { id: string; text: string; level: number };

export type ArticleNode =
  | { t: "h"; id: string; text: string; level: number; links?: Link[] }
  | { t: "p"; text: string; links?: Link[] }
  | { t: "li"; text: string; links?: Link[]; rank?: string }
  | { t: "q"; text: string; links?: Link[] }
  | { t: "table"; headers: string[]; rows: string[][] }
  | { t: "img"; src: string; alt: string }
  | { t: "code"; text: string; lang?: string }
  | { t: "sep" };

export interface Article {
  url: string;
  title: string;
  site: string;
  byline: string;
  lead: string;
  nodes: ArticleNode[];
  toc: TocItem[];
  words: number;
  minutes: number;
  blocked: BlockResult[];
  scanned: number;
  text: string;
  via: string;
  fetchMs: number;
  /** True when the page is an empty shell that only builds itself with JavaScript. */
  shell: boolean;
  cleanHtml: string | null;
  rawHtml: string | null;
}

export interface ReadPageOptions {
  filters?: FilterOptions;
  forceReload?: boolean;
  onStage?: (stage: ReadStage, detail?: string) => void;
}

/* ------------------------------------------------------------------ */
/* Fast In-Memory Session Cache & Multi-Relay Parallel Fetcher        */
/* ------------------------------------------------------------------ */

type RawGrab = {
  html: string | null;
  markdown: string | null;
  via: string;
  ms: number;
};

const CACHE_TTL = 5 * 60 * 1000;
const grabCache = new Map<string, { at: number; data: RawGrab }>();

const BAD_PROXY_BODY = /^(error code:\s*\d{3}|rate limit|too many requests|access denied|\s*\{\s*"error")/i;

function looksLikeBotChallenge(html: string): boolean {
  const head = html.slice(0, 6000);
  if (/cf-browser-verification|challenge-platform|just a moment\.\.\.|enable javascript and cookies to continue/i.test(head)) {
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
    if (plain.trim().split(/\s+/).length < 60) return true;
  }
  return false;
}

function wikipediaRestUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const m = u.hostname.match(/^([a-z]{2,3})\.(?:m\.)?wikipedia\.org$/i);
    if (!m) return null;
    if (!u.pathname.startsWith("/wiki/")) return null;
    const slug = u.pathname.slice(6);
    if (!slug || /^(Special|File|Talk|User|Template|Help|Category|Portal):/i.test(decodeURIComponent(slug))) return null;
    return `https://${m[1].toLowerCase()}.wikipedia.org/api/rest_v1/page/html/${slug}`;
  } catch {
    return null;
  }
}

async function timedFetch(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal: AbortSignal,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const onAbort = () => ac.abort();
  outerSignal.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
    outerSignal.removeEventListener("abort", onAbort);
  }
}

function firstResolved<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let pending = promises.length;
    if (pending === 0) return reject(new Error("no runners"));
    const errs: unknown[] = [];
    promises.forEach((p) =>
      p.then(resolve).catch((e) => {
        errs.push(e);
        pending -= 1;
        if (pending === 0) reject(new Error(errs.map((x) => (x instanceof Error ? x.message : String(x))).join("; ")));
      }),
    );
  });
}

async function fetchJinaMarkdown(url: string, signal: AbortSignal): Promise<string> {
  const r = await timedFetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } }, 12000, signal);
  if (!r.ok) throw new Error(`r.jina.ai HTTP ${r.status}`);
  const txt = await r.text();
  if (!txt || txt.length < 60 || BAD_PROXY_BODY.test(txt.trim())) throw new Error("r.jina.ai empty");
  return txt;
}

async function grab(
  url: string,
  signal: AbortSignal,
  forceReload = false,
  onStage?: (stage: ReadStage, detail?: string) => void,
): Promise<RawGrab> {
  if (!forceReload) {
    const hit = grabCache.get(url);
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      return { ...hit.data, ms: 1 };
    }
  }

  const t0 = performance.now();
  onStage?.("fetching", "racing relays for clean HTML…");

  // 1. Official Wikimedia CORS HTML fast-path (~150ms, zero proxy)
  const wikiApi = wikipediaRestUrl(url);
  if (wikiApi) {
    try {
      const r = await timedFetch(wikiApi, { headers: { Accept: "text/html" } }, 6500, signal);
      if (r.ok) {
        const html = await r.text();
        if (html && html.length > 200) {
          const res: RawGrab = { html, markdown: null, via: "wikimedia rest (direct)", ms: Math.round(performance.now() - t0) };
          grabCache.set(url, { at: Date.now(), data: res });
          return res;
        }
      }
    } catch {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
    }
  }

  // 2. Race HTML-capable relays in parallel so dead/slow proxies never block the user
  const raceAbort = new AbortController();
  const linkOuter = () => raceAbort.abort();
  signal.addEventListener("abort", linkOuter, { once: true });

  type HtmlCandidate = { html: string; via: string };

  const htmlRunners: { via: string; run: () => Promise<HtmlCandidate> }[] = [
    {
      via: "r.jina.ai (html)",
      run: async () => {
        const r = await timedFetch(
          `https://r.jina.ai/${url}`,
          { headers: { Accept: "text/html,*/*", "X-Return-Format": "html" } },
          9500,
          raceAbort.signal,
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.text();
        if (!body || body.length < 140 || BAD_PROXY_BODY.test(body.trim()) || !/<(html|body|div|article|main|table|p)\b/i.test(body)) {
          throw new Error("not html");
        }
        if (looksLikeBotChallenge(body)) throw new Error("bot wall");
        return { html: body, via: "r.jina.ai (rendered html)" };
      },
    },
    {
      via: "allorigins.win (json)",
      run: async () => {
        const r = await timedFetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
          { headers: { Accept: "application/json" } },
          8500,
          raceAbort.signal,
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const body = typeof j?.contents === "string" ? j.contents : "";
        if (!body || body.length < 140 || BAD_PROXY_BODY.test(body.trim()) || !/<(html|body|div|article|main|table|p)\b/i.test(body)) {
          throw new Error("invalid contents");
        }
        if (looksLikeBotChallenge(body)) throw new Error("bot wall");
        return { html: body, via: "allorigins.win" };
      },
    },
    {
      via: "allorigins.win (raw)",
      run: async () => {
        const r = await timedFetch(
          `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
          { headers: { Accept: "text/html,*/*" } },
          8500,
          raceAbort.signal,
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.text();
        if (!body || body.length < 140 || BAD_PROXY_BODY.test(body.trim()) || !/<(html|body|div|article|main|table|p)\b/i.test(body)) {
          throw new Error("not html");
        }
        if (looksLikeBotChallenge(body)) throw new Error("bot wall");
        return { html: body, via: "allorigins.win (raw)" };
      },
    },
    {
      via: "codetabs.com",
      run: async () => {
        const r = await timedFetch(
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
          { headers: { Accept: "text/html,*/*" } },
          8500,
          raceAbort.signal,
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.text();
        if (!body || body.length < 140 || BAD_PROXY_BODY.test(body.trim()) || !/<(html|body|div|article|main|table|p)\b/i.test(body)) {
          throw new Error("not html");
        }
        if (looksLikeBotChallenge(body)) throw new Error("bot wall");
        return { html: body, via: "codetabs.com" };
      },
    },
    {
      via: "direct cors",
      run: async () => {
        const r = await timedFetch(url, { headers: { Accept: "text/html,*/*" } }, 5000, raceAbort.signal);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.text();
        if (!body || body.length < 140 || !/<(html|body|div|article|main|table|p)\b/i.test(body)) {
          throw new Error("not html");
        }
        return { html: body, via: "direct (cors)" };
      },
    },
  ];

  let htmlWin: HtmlCandidate | null = null;
  const errors: string[] = [];
  try {
    htmlWin = await firstResolved(
      htmlRunners.map((runner) =>
        runner.run().catch((e) => {
          errors.push(`${runner.via}: ${e instanceof Error ? e.message : "failed"}`);
          throw e;
        }),
      ),
    );
    // Cancel slower relays once we have valid HTML
    raceAbort.abort();
  } catch {
    htmlWin = null;
  } finally {
    signal.removeEventListener("abort", linkOuter);
  }

  if (signal.aborted) throw new DOMException("aborted", "AbortError");

  // Check if winning HTML is a thin JS shell (< 35 words of visible text); if so, supplement with Jina Markdown
  if (htmlWin) {
    const quickText = htmlWin.html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordEst = quickText.split(" ").filter(Boolean).length;
    if (wordEst < 35 && !htmlWin.via.includes("r.jina.ai")) {
      try {
        onStage?.("fetching", "hydrating JS shell via headless reader…");
        const md = await fetchJinaMarkdown(url, signal);
        const res: RawGrab = {
          html: htmlWin.html,
          markdown: md,
          via: `${htmlWin.via} + r.jina.ai`,
          ms: Math.round(performance.now() - t0),
        };
        grabCache.set(url, { at: Date.now(), data: res });
        return res;
      } catch {
        // Keep htmlWin as-is
      }
    }
    const res: RawGrab = {
      html: htmlWin.html,
      markdown: null,
      via: htmlWin.via,
      ms: Math.round(performance.now() - t0),
    };
    grabCache.set(url, { at: Date.now(), data: res });
    return res;
  }

  // 3. Fallback to Jina Markdown text reader
  try {
    onStage?.("fetching", "HTML relays blocked — trying headless text relay…");
    const md = await fetchJinaMarkdown(url, signal);
    const res: RawGrab = {
      html: null,
      markdown: md,
      via: "r.jina.ai (text)",
      ms: Math.round(performance.now() - t0),
    };
    grabCache.set(url, { at: Date.now(), data: res });
    return res;
  } catch (e) {
    errors.push(`r.jina.ai: ${e instanceof Error ? e.message : "failed"}`);
  }

  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  throw new Error(
    `Every relay refused or timed out (${errors.slice(0, 4).join(" · ")}). The site may be offline, paywalled, or blocking relays — switch to Original (Live Frame) or open it outside Quill.`,
  );
}

/* ------------------------------------------------------------------ */
/* URL & Asset Resolution + Original Website srcDoc Builder           */
/* ------------------------------------------------------------------ */

const BRIDGE_SCRIPT = `<script data-quill-bridge="1">
(function(){
  document.addEventListener("click", function(e){ if (window.__quillZap) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var raw = a.getAttribute("href") || "";
    if (!raw || raw.charAt(0) === "#" || /^javascript:/i.test(raw)) return;
    var href = a.href || raw;
    if (!/^https?:/i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      parent.postMessage({ type: "quill:navigate", href: href, newTab: !!(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) }, "*");
    } catch (_) {}
  }, true);
})();
</script>`;

/** Words a reader would actually see. Used to spot pages that are empty until their JavaScript runs. */
function visibleWordCount(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** In-frame controller for original pages: zap-to-hide, dark ink, and remembered hides. Runs only inside our srcDoc frames. */
const FRAME_SCRIPT = `<script data-quill-frame="1">
(function () {
  var zapOn = false, dark = false, hover = null, prevOutline = "", hint = null, styleEl = null;
  function all(sel) { try { return document.querySelectorAll(sel); } catch (e) { return []; } }
  function ensureStyle() {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-quill-frame-style", "1");
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }
  function setDark(on) {
    dark = on;
    ensureStyle().textContent = on
      ? "html{background:#14161b!important;color-scheme:dark!important}" +
        "body{background:#14161b!important;color:#e3e6ec!important}" +
        "body *{background-color:transparent!important;color:inherit!important;border-color:#3d4250!important}" +
        "body a,body a *{color:#8ab4f8!important}" +
        "body input,body textarea,body select,body button{background-color:#1e2129!important;color:#e3e6ec!important}"
      : "";
  }
  function selectorFor(el) {
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id) && all("#" + el.id).length === 1) return "#" + el.id;
    var parts = [], cur = el, depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && depth < 7) {
      var part = cur.tagName.toLowerCase();
      var classes = [].slice.call(cur.classList || []).filter(function (c) { return /^[A-Za-z_][\\w-]{0,40}$/.test(c); }).slice(0, 2);
      if (classes.length) part += "." + classes.join(".");
      var par = cur.parentElement;
      if (par) {
        var same = [].filter.call(par.children, function (c) { return c.tagName === cur.tagName; });
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      var sel = parts.join(" > ");
      if (all(sel).length === 1) return sel;
      cur = par; depth++;
    }
    return parts.join(" > ");
  }
  function showHint(on) {
    if (on && !hint) {
      hint = document.createElement("div");
      hint.setAttribute("data-quill-hint", "1");
      hint.textContent = "zap mode: click anything to hide it · Esc to stop";
      hint.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#fff2a8;color:#1a2440;border:2px solid #1a2440;border-radius:14px 4px 16px 4px;padding:6px 12px;font:600 14px/1.2 system-ui,sans-serif;box-shadow:3px 3px 0 #1a2440;pointer-events:none";
      document.documentElement.appendChild(hint);
    } else if (!on && hint) { hint.remove(); hint = null; }
  }
  function clearHover() { if (hover) { hover.style.outline = prevOutline; hover = null; } }
  function setZap(on) { zapOn = on; window.__quillZap = on; showHint(on); if (!on) clearHover(); }
  document.addEventListener("mousemove", function (e) {
    if (!zapOn) return;
    var el = e.target;
    if (!el || el === hover || el === hint || el.nodeType !== 1 || el === document.documentElement || el === document.body) return;
    clearHover(); hover = el; prevOutline = el.style.outline;
    el.style.outline = "2px dashed #ff5d8f"; el.style.outlineOffset = "2px";
  }, true);
  document.addEventListener("click", function (e) {
    if (!zapOn) return;
    var el = e.target;
    if (!el || el === hint || el.nodeType !== 1 || el === document.documentElement || el === document.body) return;
    e.preventDefault(); e.stopPropagation();
    var sel = selectorFor(el);
    clearHover();
    el.style.setProperty("display", "none", "important");
    parent.postMessage({ type: "quill:zapped", selector: sel }, "*");
  }, true);
  document.addEventListener("keydown", function (e) {
    if (zapOn && e.key === "Escape") { setZap(false); parent.postMessage({ type: "quill:zap-off" }, "*"); }
  }, true);
  window.addEventListener("message", function (e) {
    if (e.source !== parent || !e.data || e.data.type !== "quill:frame") return;
    var d = e.data;
    if (d.op === "zap") setZap(!!d.on);
    else if (d.op === "dark") setDark(!!d.on);
    else if (d.op === "zaps" && d.selectors) {
      d.selectors.forEach(function (s) {
        [].forEach.call(all(s), function (el) { el.style.setProperty("display", "none", "important"); });
      });
    }
  });
  // Ctrl+wheel zooms the tab: the srcDoc frame owns its wheel events, so it
  // flags the gesture up to the app (same trust level as the webview console
  // bridge — a page can only nudge the visible zoom level).
  window.addEventListener("wheel", function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    parent.postMessage({ type: "quill:zoom", dir: e.deltaY < 0 ? 1 : -1 }, "*");
  }, { passive: false });
})();
</script>`;

const UNLOCK_SCROLL_STYLE = `<style data-quill-style="1">
html, body { overflow: auto !important; position: static !important; height: auto !important; }
</style>`;

function normalizeDomAssets(doc: Document, baseUrl: string) {
  let baseProto = "https:";
  try {
    baseProto = new URL(baseUrl).protocol;
  } catch {}

  const resolveAttr = (el: Element, attr: string) => {
    const v = el.getAttribute(attr);
    if (!v) return;
    const trimmed = v.trim();
    if (!trimmed || /^(data|#|javascript:|mailto:)/i.test(trimmed)) return;
    try {
      if (trimmed.startsWith("//")) {
        el.setAttribute(attr, `${baseProto}${trimmed}`);
      } else {
        el.setAttribute(attr, new URL(trimmed, baseUrl).href);
      }
    } catch {}
  };

  // Promote lazy-loaded image attributes before resolving URLs
  doc.querySelectorAll("img, source").forEach((el) => {
    const src = el.getAttribute("src") || "";
    if (!src || src.startsWith("data:image/gif") || src.startsWith("data:image/svg")) {
      const lazy =
        el.getAttribute("data-src") ||
        el.getAttribute("data-lazy-src") ||
        el.getAttribute("data-original") ||
        el.getAttribute("data-actualsrc");
      if (lazy) el.setAttribute("src", lazy);
    }
    const srcset = el.getAttribute("srcset") || el.getAttribute("data-srcset");
    if (srcset) {
      const fixed = srcset
        .split(",")
        .map((part) => {
          const pieces = part.trim().split(/\s+/);
          if (!pieces[0]) return part;
          try {
            pieces[0] = pieces[0].startsWith("//") ? `${baseProto}${pieces[0]}` : new URL(pieces[0], baseUrl).href;
          } catch {}
          return pieces.join(" ");
        })
        .join(", ");
      el.setAttribute("srcset", fixed);
    }
  });

  doc.querySelectorAll("[src]").forEach((el) => resolveAttr(el, "src"));
  doc.querySelectorAll("link[href], a[href], area[href]").forEach((el) => resolveAttr(el, "href"));
  doc.querySelectorAll("video[poster]").forEach((el) => resolveAttr(el, "poster"));
  doc.querySelectorAll("form[action]").forEach((el) => resolveAttr(el, "action"));
}

function serializeForSrcDoc(doc: Document, baseUrl: string, unlockScroll: boolean): string {
  const clone = doc.cloneNode(true) as Document;
  // Remove CSP or meta-refresh tags that break srcDoc rendering
  clone.querySelectorAll("meta[http-equiv]").forEach((m) => {
    const eq = (m.getAttribute("http-equiv") || "").toLowerCase();
    if (eq === "content-security-policy" || eq === "refresh" || eq === "x-frame-options") m.remove();
  });
  clone.querySelectorAll("base").forEach((b) => b.remove());

  let head = clone.head;
  if (!head) {
    head = clone.createElement("head");
    clone.documentElement?.prepend(head);
  }
  const base = clone.createElement("base");
  base.setAttribute("href", baseUrl);
  base.setAttribute("target", "_blank");
  head.prepend(base);

  const extras = (unlockScroll ? UNLOCK_SCROLL_STYLE : "") + BRIDGE_SCRIPT + FRAME_SCRIPT;
  // Inject via the DOM, never string-replace: a "</body>" inside an attribute
  // value or comment would otherwise swallow the bridge scripts.
  if (clone.body) {
    const extraDoc = new DOMParser().parseFromString(extras, "text/html");
    for (const el of [...extraDoc.head.children, ...extraDoc.body.children]) clone.body.appendChild(el);
    return "<!doctype html>\n" + (clone.documentElement?.outerHTML || "");
  }
  return "<!doctype html>\n" + (clone.documentElement?.outerHTML || "") + extras;
}

/* ------------------------------------------------------------------ */
/* Deep Tracker, Pixel, Ad-Frame & Cosmetic Stripper                  */
/* ------------------------------------------------------------------ */

function isTrackingPixel(el: Element, absUrl: string): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== "img") return false;
  const w = el.getAttribute("width");
  const h = el.getAttribute("height");
  if ((w === "1" || w === "0") && (h === "1" || h === "0")) return true;
  const style = (el.getAttribute("style") || "").toLowerCase();
  if ((/width:\s*[01]px/.test(style) && /height:\s*[01]px/.test(style)) || (/display:\s*none/.test(style) && /\?.*=/.test(absUrl))) {
    return true;
  }
  return /\/(1x1|pixel|beacon|spacer)\.(gif|png)(\?|$)/i.test(absUrl);
}

function stripTrackersFromDom(
  doc: Document,
  url: string,
  site: string,
  rawHtmlText: string,
  opts?: FilterOptions,
): { cleanDoc: Document; blocked: BlockResult[]; scanned: number } {
  const cleanDoc = doc.cloneNode(true) as Document;
  const blocked: BlockResult[] = [];
  const recordedKeys = new Set<string>();
  const seenUrls = new Set<string>();
  let scanned = 0;

  const pushBlock = (b: BlockResult) => {
    const key = `${b.kind || "network"}|${b.rule}|${b.url.slice(0, 120)}`;
    if (recordedKeys.has(key)) return;
    recordedKeys.add(key);
    blocked.push(b);
  };

  // 1. Inspect & strip <script> tags
  cleanDoc.querySelectorAll("script").forEach((sc) => {
    const src = sc.getAttribute("src") || "";
    if (src) {
      seenUrls.add(src);
      scanned++;
      const hit = blockCheck(src, opts, "script");
      if (hit) pushBlock(hit);
    } else {
      const code = sc.textContent || "";
      if (code.trim()) {
        scanned++;
        if (opts?.shields !== false) {
          for (const [re, ruleName, cat] of INLINE_TRACKERS) {
            if (cat === "social" && opts?.blockSocial === false) continue;
            if (cat === "miners" && opts?.blockMiners === false) continue;
            if (re.test(code)) {
              pushBlock({ cat, rule: ruleName, url: site, kind: "inline" });
            }
          }
        }
      }
    }
    // Always remove scripts in Shielded Original HTML so zero page JS executes
    sc.remove();
  });

  // Remove <noscript> fallback tracking pixels in cleanDoc
  cleanDoc.querySelectorAll("noscript").forEach((ns) => {
    const inner = ns.textContent || ns.innerHTML || "";
    const urls = inner.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const u of urls) {
      scanned++;
      const hit = blockCheck(u, opts, "pixel");
      if (hit) pushBlock(hit);
    }
    ns.remove();
  });

  // 2. Inspect & strip <iframe>, <embed>, <object>
  cleanDoc.querySelectorAll("iframe, embed, object").forEach((fr) => {
    const src = fr.getAttribute("src") || fr.getAttribute("data") || "";
    scanned++;
    if (!src || src === "about:blank" || /^javascript:/i.test(src)) {
      if (opts?.shields !== false) fr.remove();
      return;
    }
    seenUrls.add(src);
    const hit = blockCheck(src, opts, "iframe");
    if (hit) {
      pushBlock(hit);
      fr.remove();
    }
  });

  // 3. Inspect <img>, <source>, <video>, <audio>, <link>
  cleanDoc.querySelectorAll("img, source, video, audio, link").forEach((el) => {
    const attr = el.tagName.toLowerCase() === "link" ? "href" : "src";
    const src = el.getAttribute(attr) || "";
    if (!src) return;
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      scanned++;
    }
    if (opts?.shields !== false && isTrackingPixel(el, src)) {
      pushBlock({ cat: "trackers", rule: "pixel:1x1-beacon", url: src, kind: "pixel" });
      el.remove();
      return;
    }
    const hit = blockCheck(src, opts, el.tagName.toLowerCase() === "img" ? "pixel" : "network");
    if (hit) {
      pushBlock(hit);
      el.remove();
    }
  });

  // 4. Scrub tracking query params & redirect wrappers on all <a href> links
  const paramRulesSeen = new Set<string>();
  cleanDoc.querySelectorAll("a[href]").forEach((a) => {
    const raw = a.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(raw)) return;
    const unwrapped = unwrapRedirect(raw, { ...opts, stripParams: false });
    const { url: scrubbed, stripped } = stripTrackingParams(unwrapped, opts);
    for (const st of stripped) {
      if (!paramRulesSeen.has(st.rule)) {
        paramRulesSeen.add(st.rule);
        pushBlock(st);
      }
    }
    if (scrubbed !== raw) a.setAttribute("href", scrubbed);
  });

  // 5. Cosmetic DOM stripping (ad containers & cookie consent walls)
  if (opts?.shields !== false) {
    for (const sel of COSMETIC_SELECTORS) {
      try {
        const matches = cleanDoc.querySelectorAll(sel);
        if (matches.length > 0) {
          matches.forEach((m) => {
            // Never accidentally remove body/main/article if a site put a weird class on root
            const tag = m.tagName.toLowerCase();
            if (tag === "html" || tag === "body" || tag === "main" || tag === "article") return;
            m.remove();
          });
          pushBlock({ cat: "ads", rule: `cosmetic:${sel}`, url: site, kind: "cosmetic" });
        }
      } catch {}
    }
  }

  // 6. Catch any obfuscated third-party tracker URLs hidden inside JSON/data attributes
  if (opts?.shields !== false) {
    const hostRegex = new RegExp(
      `https?:\\/\\/[a-z0-9.-]*(${KNOWN_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|")})[^"'\\s<>)]*`,
      "gi",
    );
    const hidden = rawHtmlText.match(hostRegex) || [];
    for (const h of hidden) {
      if (seenUrls.has(h)) continue;
      seenUrls.add(h);
      scanned++;
      const hit = blockCheck(h, opts, "network");
      if (hit) pushBlock(hit);
    }
  }

  // 7. Strip event-handler attributes — the srcDoc frame allows scripts, so a
  // surviving onerror= would run page JS in the "zero page JS" document.
  cleanDoc.querySelectorAll("*").forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      if (a.name.toLowerCase().startsWith("on")) el.removeAttribute(a.name);
    }
  });

  void url;
  return { cleanDoc, blocked, scanned };
}

/* ------------------------------------------------------------------ */
/* Artisanal Re-inking Extractor                                      */
/* ------------------------------------------------------------------ */

const STRIP_FOR_READER =
  "script,style,noscript,iframe,svg,canvas,form,button,input,select,video,audio,object,embed,template,.mw-editsection,.navbox,.vertical-navbox,.catlinks,.reflist,.mw-empty-elt,sup.reference";

const JUNK_TOKEN =
  /(?:^|[-_\s])(advert|adsby|adslot|ad-slot|ad-banner|promo-box|sponsored|sidebar|share-bar|social-share|comment-form|related-posts|newsletter|popup|modal|cookie-banner|cookie-consent|consent-banner|breadcrumb|paywall|signup|subscribe-box|taboola|outbrain|disqus)(?:$|[-_\s])/i;

function slugify(text: string, idx: number): string {
  const s = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return s ? `sec-${s}-${idx}` : `sec-${idx}`;
}

function scoreBlock(el: Element): number {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean).length;
  if (words < 25) return -50;

  const paras = el.querySelectorAll("p").length;
  const items = el.querySelectorAll("li").length;
  const links = el.querySelectorAll("a");
  let linkWords = 0;
  links.forEach((a) => {
    linkWords += (a.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  });
  const linkDensity = linkWords / Math.max(words, 1);
  const commas = (text.match(/[,.;:!?]/g) || []).length;

  let bonus = 0;
  if (tag === "article") bonus += 240;
  if (tag === "main" || el.getAttribute("role") === "main") bonus += 200;
  const idCls = `${el.id || ""} ${typeof el.className === "string" ? el.className : ""}`;
  if (/(article|post-content|entry-content|story-body|markdown-body|mw-content-text|prose|main-content)/i.test(idCls)) {
    bonus += 220;
  }
  if (JUNK_TOKEN.test(idCls)) bonus -= 400;

  return (words * 0.65 + paras * 26 + Math.min(items, 40) * 6 + commas * 4 + bonus) * Math.max(0.15, 1 - linkDensity * 0.85);
}

/** Specialized clean extractor for Hacker News & Lobsters style story tables/lists. */
function tryExtractStoryFeed(doc: Document, base: string, opts?: FilterOptions): ArticleNode[] | null {
  // Hacker News (tr.athing)
  const hnRows = Array.from(doc.querySelectorAll("tr.athing"));
  if (hnRows.length >= 5) {
    const out: ArticleNode[] = [];
    hnRows.forEach((row, idx) => {
      const titleAnchor = row.querySelector(".titleline > a, a.titlelink, td.title > a") as HTMLAnchorElement | null;
      if (!titleAnchor) return;
      const titleText = (titleAnchor.textContent || "").replace(/\s+/g, " ").trim();
      if (!titleText) return;
      let href = titleAnchor.getAttribute("href") || "";
      try {
        href = unwrapRedirect(new URL(href, base).href, opts);
      } catch {}
      const siteStr = (row.querySelector(".sitestr")?.textContent || "").trim();
      const rank = (row.querySelector(".rank")?.textContent || `${idx + 1}.`).trim();
      const subRow = row.nextElementSibling;
      const subText = (subRow?.querySelector(".subtext")?.textContent || "").replace(/\s+/g, " ").trim();

      const links: Link[] = [];
      if (/^https?:/.test(href) && !blockCheck(href, opts)) {
        links.push({ text: titleText, href });
      }
      // Find comments link
      if (subRow) {
        const subAnchors = Array.from(subRow.querySelectorAll("a[href]"));
        const cmt = subAnchors.find((a) => /comment|discuss|item\?id=/i.test((a.textContent || "") + (a.getAttribute("href") || "")));
        if (cmt) {
          try {
            const cHref = new URL(cmt.getAttribute("href")!, base).href;
            if (cHref !== href) links.push({ text: (cmt.textContent || "discussion").trim(), href: cHref });
          } catch {}
        }
      }
      const summary = [titleText, siteStr ? `(${siteStr})` : "", subText ? `— ${subText}` : ""].filter(Boolean).join(" ");
      out.push({ t: "li", rank, text: summary, links });
    });
    if (out.length >= 5) return out;
  }

  // Lobsters (ol.stories li.story)
  const lobRows = Array.from(doc.querySelectorAll("li.story, .story_liner"));
  if (lobRows.length >= 5) {
    const out: ArticleNode[] = [];
    lobRows.forEach((row, idx) => {
      const a = row.querySelector(".u-url, a.u-url, .link a") as HTMLAnchorElement | null;
      if (!a) return;
      const titleText = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!titleText) return;
      let href = a.getAttribute("href") || "";
      try {
        href = unwrapRedirect(new URL(href, base).href, opts);
      } catch {}
      const domain = (row.querySelector(".domain")?.textContent || "").trim();
      const by = (row.querySelector(".byline")?.textContent || "").replace(/\s+/g, " ").trim();
      const links: Link[] = [];
      if (/^https?:/.test(href) && !blockCheck(href, opts)) links.push({ text: titleText, href });
      const cmt = row.querySelector(".comments_label a");
      if (cmt?.getAttribute("href")) {
        try {
          links.push({ text: (cmt.textContent || "comments").trim(), href: new URL(cmt.getAttribute("href")!, base).href });
        } catch {}
      }
      out.push({
        t: "li",
        rank: `${idx + 1}.`,
        text: [titleText, domain ? `(${domain})` : "", by ? `— ${by}` : ""].filter(Boolean).join(" "),
        links,
      });
    });
    if (out.length >= 5) return out;
  }

  return null;
}

function isSmallIconImage(img: Element): boolean {
  const w = Number(img.getAttribute("width") || 0);
  const h = Number(img.getAttribute("height") || 0);
  if ((w > 0 && w < 44) || (h > 0 && h < 44)) return true;
  const src = (img.getAttribute("src") || "").toLowerCase();
  if (!src || src.startsWith("data:image/gif") || /\/(icon|favicon|avatar|emoji|badge|sprite|spinner|pixel|1x1)[-_.\/]/i.test(src)) {
    return true;
  }
  return false;
}

function extractTable(table: Element): ArticleNode | null {
  // Skip layout tables that contain nested tables or huge prose blocks
  if (table.querySelector("table") || table.querySelectorAll("p").length > 8) return null;
  const trs = Array.from(table.querySelectorAll("tr")).slice(0, 40);
  if (trs.length < 2) return null;

  let headers: string[] = [];
  const rows: string[][] = [];

  trs.forEach((tr, idx) => {
    const ths = Array.from(tr.querySelectorAll("th")).map((c) => (c.textContent || "").replace(/\s+/g, " ").trim());
    const tds = Array.from(tr.querySelectorAll("td")).map((c) => (c.textContent || "").replace(/\s+/g, " ").trim());
    if (idx === 0 && ths.length > 0 && tds.length === 0) {
      headers = ths;
    } else {
      const row = [...ths, ...tds];
      if (row.some((cell) => cell.length > 0)) rows.push(row);
    }
  });

  if (!headers.length && rows.length < 2) return null;
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length));
  if (colCount < 2 || colCount > 9) return null;
  return { t: "table", headers, rows };
}

function nodesFrom(root: Element, base: string, mainTitle: string, opts?: FilterOptions): ArticleNode[] {
  const out: ArticleNode[] = [];
  let headingSeq = 0;

  const linksOf = (el: Element): Link[] => {
    const found: Link[] = [];
    el.querySelectorAll("a[href]").forEach((a) => {
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      const raw = a.getAttribute("href") || "";
      if (!text || text.length < 2 || !raw || raw.startsWith("#") || /^javascript:/i.test(raw)) return;
      let href = "";
      try {
        href = unwrapRedirect(new URL(raw, base).href, opts);
      } catch {
        return;
      }
      if (!/^https?:/.test(href) || blockCheck(href, opts)) return;
      if (!found.some((l) => l.href === href && l.text === text)) {
        found.push({ text: text.slice(0, 140), href });
      }
    });
    return found.slice(0, 8);
  };

  const pushText = (t: string, kind: "h" | "p" | "li" | "q" | "code", level = 2, el?: Element) => {
    const clean = kind === "code" ? t.replace(/^\n+|\s+$/g, "") : t.replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (kind === "h" && clean.toLowerCase() === mainTitle.trim().toLowerCase()) return;
    const links = el && kind !== "code" ? linksOf(el) : undefined;
    if (kind === "h") {
      out.push({ t: "h", id: slugify(clean, ++headingSeq), text: clean, level, links });
    } else if (kind === "li") {
      out.push({ t: "li", text: clean, links });
    } else if (kind === "q") {
      out.push({ t: "q", text: clean, links });
    } else if (kind === "code") {
      const codeEl = el?.querySelector("code");
      const cls = codeEl?.className || el?.className || "";
      const langMatch = typeof cls === "string" ? cls.match(/language-([a-z0-9+#-]+)/i) : null;
      out.push({ t: "code", text: clean, lang: langMatch?.[1] });
    } else if (clean.length > 1) {
      out.push({ t: "p", text: clean, links });
    }
  };

  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "nav" || tag === "footer" || tag === "aside") return;
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "navigation" || role === "contentinfo" || role === "complementary" || role === "search") return;

    const cls = `${typeof el.className === "string" ? el.className : ""} ${el.id || ""}`;
    if (tag !== "article" && tag !== "main" && tag !== "body" && tag !== "section" && JUNK_TOKEN.test(cls)) return;

    if (/^h[1-6]$/.test(tag)) return pushText(el.textContent || "", "h", Number(tag[1]), el);
    if (tag === "p") return pushText(el.textContent || "", "p", 2, el);
    if (tag === "li") {
      // If list item wraps nested lists, take its direct text + inline children before walking nested ul/ol
      const nestedList = el.querySelector("ul, ol");
      if (nestedList) {
        const clone = el.cloneNode(true) as Element;
        clone.querySelectorAll("ul, ol").forEach((u) => u.remove());
        pushText(clone.textContent || "", "li", 2, clone);
        el.querySelectorAll(":scope > ul, :scope > ol").forEach((u) => walk(u));
        return;
      }
      return pushText(el.textContent || "", "li", 2, el);
    }
    if (tag === "blockquote") return pushText(el.textContent || "", "q", 2, el);
    if (tag === "pre") return pushText(el.textContent || "", "code", 2, el);
    if (tag === "table") {
      const tbl = extractTable(el);
      if (tbl) {
        out.push(tbl);
        return;
      }
    }
    if (tag === "figure" || tag === "picture") {
      const img = el.querySelector("img");
      if (img && !isSmallIconImage(img)) {
        const raw = img.getAttribute("src");
        if (raw) {
          try {
            const src = new URL(raw, base).href;
            if (!blockCheck(src, opts)) {
              const cap = (el.querySelector("figcaption")?.textContent || img.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
              out.push({ t: "img", src, alt: cap });
            }
          } catch {}
        }
      }
      return;
    }
    if (tag === "img") {
      if (isSmallIconImage(el)) return;
      const raw = el.getAttribute("src");
      if (raw) {
        try {
          const src = new URL(raw, base).href;
          if (!blockCheck(src, opts)) {
            out.push({ t: "img", src, alt: (el.getAttribute("alt") || "").replace(/\s+/g, " ").trim() });
          }
        } catch {}
      }
      return;
    }
    if (tag === "hr") {
      out.push({ t: "sep" });
      return;
    }

    // Handle classic web essays (e.g. Paul Graham, APOD) that put prose separated by <br><br> inside a <div> or <td> without <p> tags
    if ((tag === "div" || tag === "td" || tag === "section") && el.querySelectorAll("p, div, table, article, section, ul, ol").length === 0) {
      const html = el.innerHTML || "";
      if (/<br\s*\/?>\s*<br\s*\/?>/i.test(html)) {
        const chunks = html.split(/(?:<br\s*\/?>\s*){2,}/i);
        for (const ch of chunks) {
          const tmp = el.ownerDocument.createElement("div");
          tmp.innerHTML = ch;
          const txt = (tmp.textContent || "").replace(/\s+/g, " ").trim();
          if (txt.length > 20) pushText(txt, "p", 2, tmp);
        }
        return;
      }
      const directTxt = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (directTxt.split(" ").length >= 18) {
        pushText(directTxt, "p", 2, el);
        return;
      }
    }

    for (const child of Array.from(el.children)) walk(child);
  };

  walk(root);
  return out;
}

export function markdownNodes(md: string, title: string, opts?: FilterOptions): ArticleNode[] {
  const lines = md.split("\n");
  const out: ArticleNode[] = [];
  let inCode = false;
  let codeLang = "";
  let headingSeq = 0;
  let buf: string[] = [];
  let bufLinks: Link[] = [];
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length >= 2) {
      const headers = tableRows[0];
      const rows = tableRows.slice(1);
      out.push({ t: "table", headers, rows });
    } else if (tableRows.length === 1) {
      out.push({ t: "p", text: tableRows[0].join(" · ") });
    }
    tableRows = [];
  };

  const flush = () => {
    flushTable();
    if (buf.length) {
      const text = buf.join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push({ t: "p", text, links: bufLinks.length ? bufLinks.slice(0, 8) : undefined });
    }
    buf = [];
    bufLinks = [];
  };

  const harvest = (line: string, into: Link[]) => {
    (line.match(/\[([^\]]+)\]\((https?:[^)\s]+)/g) || []).forEach((m) => {
      const mm = m.match(/\[([^\]]+)\]\((https?:[^)\s]+)/)!;
      const href = unwrapRedirect(mm[2], opts);
      if (!blockCheck(href, opts) && !into.some((l) => l.href === href)) {
        into.push({ text: mm[1].slice(0, 140), href });
      }
    });
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const fence = line.match(/^```([a-z0-9+#-]*)/i);
    if (fence) {
      flush();
      if (inCode) {
        inCode = false;
        codeLang = "";
      } else {
        codeLang = fence[1] || "";
        out.push({ t: "code", text: "", lang: codeLang || undefined });
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      const last = out[out.length - 1];
      if (last && last.t === "code") last.text += (last.text ? "\n" : "") + line;
      continue;
    }

    if (/^\s*\|/.test(line)) {
      if (buf.length) {
        const text = buf.join(" ").replace(/\s+/g, " ").trim();
        if (text) out.push({ t: "p", text, links: bufLinks.length ? bufLinks.slice(0, 8) : undefined });
        buf = [];
        bufLinks = [];
      }
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      const cells = line
        .replace(/^\s*\||\|\s*$/g, "")
        .split("|")
        .map((c) => c.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim());
      if (cells.some(Boolean)) tableRows.push(cells);
      continue;
    } else if (tableRows.length) {
      flushTable();
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      const text = h[2].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
      if (text && text.toLowerCase() !== title.trim().toLowerCase()) {
        const links: Link[] = [];
        harvest(h[2], links);
        out.push({
          t: "h",
          id: slugify(text, ++headingSeq),
          text,
          level: Math.min(h[1].length, 4),
          links: links.length ? links : undefined,
        });
      }
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const qRaw = line.replace(/^>\s?/, "");
      const links: Link[] = [];
      harvest(qRaw, links);
      out.push({
        t: "q",
        text: qRaw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim(),
        links: links.length ? links : undefined,
      });
      continue;
    }
    const li = line.match(/^\s*(?:[-*+•]|(\d+\.))\s+(.*)$/);
    if (li) {
      flush();
      const rank = li[1];
      const itemRaw = li[2];
      const links: Link[] = [];
      harvest(itemRaw, links);
      out.push({
        t: "li",
        rank,
        text: itemRaw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim(),
        links: links.length ? links.slice(0, 8) : undefined,
      });
      continue;
    }
    if (/^!\[/.test(line)) {
      flush();
      const m = line.match(/^!\[(.*?)\]\((https?:[^)\s]+)\)/);
      if (m && !blockCheck(m[2], opts)) out.push({ t: "img", src: m[2], alt: m[1] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    harvest(line, bufLinks);
    buf.push(line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim());
  }
  flush();
  return out.filter((n) => (n.t === "code" ? n.text.length > 0 : true)).slice(0, 420);
}

const JUNK_TEXT =
  /^(\[?edit\]?|contents|hide|show|jump to .*|skip to .*|read more|continue reading|subscribe|sign (in|up)|log ?(in|out)|menu|search|share|tweet|pin|email|print|advertisement|sponsored|cookie settings|accept all cookies|\.\.\.|↑|↓)$/i;

/** Drop tiny chrome fragments & consecutive duplicates that survive extraction. */
function tidy(nodes: ArticleNode[]): ArticleNode[] {
  const out: ArticleNode[] = [];
  const seenImgs = new Set<string>();

  for (const n of nodes) {
    if (n.t === "sep") {
      if (out.length > 0 && out[out.length - 1].t !== "sep") out.push(n);
      continue;
    }
    if (n.t === "img") {
      if (!seenImgs.has(n.src)) {
        seenImgs.add(n.src);
        out.push(n);
      }
      continue;
    }
    if (n.t === "code" || n.t === "table") {
      out.push(n);
      continue;
    }
    const t = n.text.trim();
    if (t.length <= 2 || JUNK_TEXT.test(t)) continue;
    const prev = out[out.length - 1];
    if (prev && "text" in prev && prev.text.trim() === t) continue;
    out.push(n);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main Entry: readPage                                               */
/* ------------------------------------------------------------------ */

export async function readPage(
  rawUrl: string,
  signal: AbortSignal,
  options: ReadPageOptions = {},
): Promise<Article> {
  const { filters, forceReload = false, onStage } = options;

  // Scrub tracking query params on the page URL itself first
  const { url, stripped: urlParamBlocked } = stripTrackingParams(rawUrl, filters);

  const grabbed = await grab(url, signal, forceReload, onStage);
  const html = grabbed.html;
  const markdown = grabbed.markdown;
  const via = grabbed.via;
  const ms = grabbed.ms;
  // Pages that are empty until their JavaScript runs get re-inked automatically instead of showing a blank original.
  const isShell = html ? visibleWordCount(html) < 140 && (html.match(/<script\b/gi) || []).length >= 3 : false;

  let title = "";
  let site = "";
  let byline = "";
  let lead = "";
  let nodes: ArticleNode[] = [];
  let blocked: BlockResult[] = [...urlParamBlocked];
  let scanned = urlParamBlocked.length;
  let cleanHtml: string | null = null;
  let rawHtml: string | null = null;

  try {
    site = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    site = url;
  }

  if (html) {
    onStage?.("stripping", "scrubbing scripts, ad frames, pixels & tracking params…");
    const doc = new DOMParser().parseFromString(html, "text/html");
    normalizeDomAssets(doc, url);

    title =
      (doc.querySelector("meta[property='og:title']")?.getAttribute("content") || "").trim() ||
      (doc.querySelector("meta[name='twitter:title']")?.getAttribute("content") || "").trim() ||
      doc.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim() ||
      doc.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ||
      site;

    // On Wikimedia REST HTML pages, <title> is the raw article title; clean trailing site suffix if present
    title = title.replace(/\s+[-–|]\s+(Wikipedia|The Free Encyclopedia)$/i, "").trim() || site;

    const author =
      (doc.querySelector("meta[name='author']")?.getAttribute("content") || "").trim() ||
      (doc.querySelector("[rel='author']")?.textContent || "").replace(/\s+/g, " ").trim();
    const pubDate = (
      doc.querySelector("meta[property='article:published_time']")?.getAttribute("content") ||
      doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
      ""
    ).slice(0, 10);
    byline = [author, pubDate].filter(Boolean).join(" · ");

    lead = (
      doc.querySelector("meta[property='og:description']")?.getAttribute("content") ||
      doc.querySelector("meta[name='description']")?.getAttribute("content") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);

    // Prepare Interactive Original HTML (site scripts kept, frame-breakers removed, <base> + link bridge injected)
    rawHtml = serializeForSrcDoc(doc, url, false);

    // Strip trackers, pixels, ad iframes, inline analytics & cosmetic ad/cookie walls
    const stripRes = stripTrackersFromDom(doc, url, site, html, filters);
    blocked = blocked.concat(stripRes.blocked);
    scanned += stripRes.scanned;

    // Prepare Shielded Original HTML (zero trackers, zero page scripts, unlocked scroll, <base> + link bridge)
    cleanHtml = serializeForSrcDoc(stripRes.cleanDoc, url, true);

    onStage?.("reinking", "setting type, headings, tables & inline links…");

    // Extract re-inked nodes from a working copy of cleanDoc
    const readerDoc = stripRes.cleanDoc.cloneNode(true) as Document;
    readerDoc.querySelectorAll(STRIP_FOR_READER).forEach((el) => el.remove());

    // Try specialized feed extraction (Hacker News / Lobsters) first
    const feedNodes = tryExtractStoryFeed(readerDoc, url, filters);
    if (feedNodes) {
      nodes = feedNodes;
    } else if (!markdown) {
      const wikiRoot = readerDoc.querySelector("#mw-content-text, body > section");
      if (wikiRoot && /wikipedia\.org$/i.test(site)) {
        nodes = nodesFrom(wikiRoot.parentElement?.tagName === "BODY" ? readerDoc.body : wikiRoot, url, title, filters);
      } else {
        const candidates = Array.from(
          readerDoc.querySelectorAll("article, main, [role='main'], #content, .post-content, .entry-content, .markdown-body, section, div, td"),
        ).filter((el) => (el.textContent || "").split(/\s+/).length > 40);
        candidates.sort((a, b) => scoreBlock(b) - scoreBlock(a));
        const best = candidates[0] || readerDoc.body;
        nodes = best ? nodesFrom(best, url, title, filters) : [];
        if (nodes.filter((n) => n.t === "p" || n.t === "li").length < 3 && readerDoc.body && best !== readerDoc.body) {
          nodes = nodesFrom(readerDoc.body, url, title, filters);
        }
      }
    }
  }

  // Use Markdown nodes if HTML wasn't available OR if JS-hydrated supplement was fetched
  if (markdown && nodes.length < 3) {
    onStage?.("stripping", "scanning links & stripping trackers…");
    const firstTitle = markdown.split("\n").find((l) => l.trim().startsWith("Title:"));
    if (!title || title === site) {
      title = firstTitle ? firstTitle.replace(/^Title:\s*/, "").trim() : site;
    }
    const hits = markdown.match(/https?:\/\/[^\s)"'<>]+/g) || [];
    const seen = new Set<string>();
    for (const h of hits) {
      if (seen.has(h)) continue;
      seen.add(h);
      scanned++;
      const hit = blockCheck(h, filters, "network");
      if (hit) blocked.push(hit);
    }
    onStage?.("reinking", "setting type from hydrated markdown…");
    const cut = markdown.indexOf("Markdown Content:");
    nodes = markdownNodes(cut >= 0 ? markdown.slice(cut + "Markdown Content:".length) : markdown, title, filters);
  }

  nodes = tidy(nodes).slice(0, 380);

  const toc: TocItem[] = nodes
    .filter((n): n is Extract<ArticleNode, { t: "h" }> => n.t === "h" && n.level <= 3)
    .map((h) => ({ id: h.id, text: h.text, level: h.level }));

  const text = nodes
    .map((n) => {
      if ("text" in n) return n.text;
      if (n.t === "table") return [n.headers.join(" | "), ...n.rows.map((r) => r.join(" | "))].filter(Boolean).join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  const words = text.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title: title || site,
    site,
    byline,
    lead,
    nodes,
    toc,
    words,
    minutes: Math.max(1, Math.round(words / 220)),
    blocked,
    scanned,
    text: text.slice(0, 60000),
    via,
    fetchMs: ms,
    shell: isShell,
    cleanHtml,
    rawHtml,
  };
}
