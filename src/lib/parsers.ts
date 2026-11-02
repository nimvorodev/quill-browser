import { blockCheck, unwrapRedirect } from "./filters";
import { hostOf } from "./nav";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  host: string;
}

export interface VideoHit {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  published: string;
}

/** Only the first few hundred characters are checked, so a result that merely mentions "forbidden" still passes. */
const WALL_HEAD = /verifying your request|just a moment\.\.\.|cf-browser-verification|captcha|anomaly-modal|target url returned error (?:4|5)\d\d|too many requests|enable javascript and cookies|bots use duckduckgo|complete the following challenge|unusual traffic/i;

const WRAPPER = /(^|\.)(duckduckgo\.com|search\.brave\.com|startpage\.com|mojeek\.com|ecosia\.org|bing\.com|google\.[a-z.]+|yahoo\.com|qwant\.com|mwmbl\.org)$/i;

export function acceptHit(url: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!/^https?:/i.test(url)) return false;
  if (WRAPPER.test(host)) return false;
  if (blockCheck(url, { shields: true, blockSocial: true, blockMiners: true }, "navigation")) return false;
  return true;
}

function cleanHitUrl(raw: string): string {
  const url = raw.replace(/&amp;/g, "&").replace(/[),.;]+$/, "");
  try {
    return unwrapRedirect(url, { shields: true, stripParams: true });
  } catch {
    return url;
  }
}

function pushHit(out: SearchHit[], title: string, rawUrl: string, snippet: string) {
  const url = cleanHitUrl(rawUrl);
  const cleanTitle = title.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  if (cleanTitle.length < 2 || !acceptHit(url) || out.some((h) => h.url === url)) return;
  out.push({
    title: cleanTitle.slice(0, 180),
    url,
    snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 260),
    host: hostOf(url),
  });
}

export function parseMarkdownResults(markdown: string): SearchHit[] {
  const cut = markdown.indexOf("Markdown Content:");
  const body = cut >= 0 ? markdown.slice(cut + "Markdown Content:".length) : markdown;
  if (WALL_HEAD.test(body.slice(0, 900))) return [];
  const hits: SearchHit[] = [];
  let pending: { title: string; url: string } | null = null;
  let snippet: string[] = [];
  const flush = () => {
    if (pending) pushHit(hits, pending.title, pending.url, snippet.join(" "));
    pending = null;
    snippet = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("!")) continue;
    const bare = line.match(/^\[([^\]]{4,200})\]\((https?:[^)\s]+)\)\s*$/);
    const headed = bare ?? line.match(/^(?:#{1,4}\s+|\d+\.\s+#{0,4}\s*)\[([^\]]+)\]\((https?:[^)\s]+)/);
    if (headed) {
      flush();
      pending = { title: headed[1], url: headed[2] };
      continue;
    }
    if (pending) {
      const extra = line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#]/g, "").trim();
      if (extra.length > 12) snippet.push(extra);
    }
  }
  flush();
  return hits.slice(0, 30);
}

export function parseHtmlResults(html: string): SearchHit[] {
  if (typeof DOMParser === "undefined" || WALL_HEAD.test(html.slice(0, 1500))) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const hits: SearchHit[] = [];
  doc.querySelectorAll("a.result__a, a.result-link, h2 a, h3 a, .result__title a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const title = (a.textContent || "").replace(/\s+/g, " ").trim();
    if (!href || !title) return;
    const block = a.closest(".result, .web-result, li, article, .g") || a.parentElement;
    const snippet = (block?.querySelector(".result__snippet, .snippet, p")?.textContent || "").replace(/\s+/g, " ").trim();
    let abs = href;
    try {
      abs = new URL(href, "https://html.duckduckgo.com").href;
    } catch {
      /* keep raw */
    }
    pushHit(hits, title, abs, snippet);
  });
  return hits.slice(0, 30);
}

/** Relays return HTML or markdown depending on the request; sniff which one this is. */
export function parseRelayed(text: string): SearchHit[] {
  return /<\s*(html|body|div|a)[\s>]/i.test(text.slice(0, 3000)) ? parseHtmlResults(text) : parseMarkdownResults(text);
}

export interface ImageHit {
  title: string;
  /** Full-size original image (some hosts refuse hotlinks). */
  image: string;
  /** Bing's own thumbnail — always loads. */
  thumb: string;
  /** The page the image lives on. */
  page: string;
}

/** Bing image results: each tile is <a class="iusc" m="{json, &quot;-escaped}">. */
export function parseBingImages(html: string): ImageHit[] {
  const out: ImageHit[] = [];
  const seen = new Set<string>();
  const re = /class="iusc"[^>]*m="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: { murl?: string; turl?: string; purl?: string; t?: string };
    try {
      data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    } catch {
      continue;
    }
    const image = typeof data.murl === "string" && /^https?:/i.test(data.murl) ? data.murl : "";
    if (!image || seen.has(image)) continue;
    seen.add(image);
    out.push({
      title: String(data.t || "").replace(/\s+/g, " ").trim().slice(0, 120),
      image,
      thumb: typeof data.turl === "string" && /^https?:/i.test(data.turl) ? data.turl : image,
      page: typeof data.purl === "string" ? data.purl : "",
    });
    if (out.length >= 24) break;
  }
  return out;
}

/* ---------------- YouTube ---------------- */

/** Pull the ytInitialData JSON out of a YouTube page by balancing braces, respecting strings. */
export function extractYtInitialData(html: string): unknown {
  const markers = ["var ytInitialData = ", 'window["ytInitialData"] = ', "ytInitialData = "];
  let idx = -1;
  for (const m of markers) {
    idx = html.indexOf(m);
    if (idx >= 0) {
      idx += m.length;
      break;
    }
  }
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const runsText = (n: any): string => {
  if (!n) return "";
  if (typeof n === "string") return n;
  if (typeof n.simpleText === "string") return n.simpleText;
  if (Array.isArray(n.runs)) return n.runs.map((r: any) => r?.text || "").join("");
  if (typeof n.content === "string") return n.content;
  return "";
};

/** Walk any ytInitialData tree and collect each video renderer (classic and newer lockup layouts). */
export function collectVideos(root: unknown): VideoHit[] {
  const out: VideoHit[] = [];
  const seen = new Set<string>();
  const push = (v: VideoHit) => {
    if (!/^[\w-]{11}$/.test(v.id) || seen.has(v.id)) return;
    seen.add(v.id);
    out.push(v);
  };
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 80) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    const vr = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
    if (vr && typeof vr.videoId === "string") {
      push({
        id: vr.videoId,
        title: runsText(vr.title),
        channel: runsText(vr.ownerText || vr.longBylineText || vr.shortBylineText),
        duration: runsText(vr.lengthText),
        views: runsText(vr.viewCountText || vr.shortViewCountText),
        published: runsText(vr.publishedTimeText),
      });
      return;
    }
    const lv = node.lockupViewModel;
    if (lv && typeof lv.contentId === "string" && (!lv.contentType || /VIDEO/.test(lv.contentType))) {
      const md = lv.metadata?.lockupMetadataViewModel;
      const channel = md?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || "";
      push({ id: lv.contentId, title: md?.title?.content || "", channel, duration: "", views: "", published: "" });
      return;
    }
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  };
  walk(root, 0);
  return out;
}

/** Fallback when the HTML route fails: watch links in markdown, with their link text as titles. */
export function videosFromMarkdown(md: string): VideoHit[] {
  const out: VideoHit[] = [];
  const seen = new Set<string>();
  const titled = /\[([^\]\n]{2,200})\]\((?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?v=([\w-]{11})[^)\s]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = titled.exec(md))) {
    const id = m[2];
    const label = m[1].replace(/[*_`]/g, "").trim();
    if (seen.has(id) || /^image\b/i.test(label)) continue;
    seen.add(id);
    out.push({ id, title: label, channel: "", duration: "", views: "", published: "" });
  }
  const bare = /watch\?v=([\w-]{11})/g;
  while ((m = bare.exec(md))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], title: "YouTube video", channel: "", duration: "", views: "", published: "" });
  }
  return out.slice(0, 24);
}
