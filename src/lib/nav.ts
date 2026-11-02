export const HOME = "quill://start";

export type EngineMode = "results" | "site";

export interface SearchEngine {
  id: string;
  name: string;
  short: string;
  note: string;
  mode: EngineMode;
  url: (q: string) => string;
}

const enc = (q: string) => encodeURIComponent(q);

/**
 * "results" engines render inside Quill from a direct public API (no relays).
 * "site" engines open their real results page as the live site — the shields
 * still strip trackers and ads at the network layer.
 * Google links are forwarded to their own page like any other site.
 */
export const ENGINES: SearchEngine[] = [
  { id: "mwmbl", name: "Mwmbl", short: "Mw", note: "open, non-profit index", mode: "results", url: (q) => `https://mwmbl.org/?q=${enc(q)}` },
  { id: "wiki", name: "Wikipedia", short: "W", note: "the encyclopedia", mode: "results", url: (q) => `https://en.wikipedia.org/w/index.php?search=${enc(q)}` },
  { id: "youtube", name: "YouTube", short: "▶", note: "videos play inside Quill", mode: "results", url: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
  // GitHub can't be proxied or framed, so it gets its own in-app desk fed by the public API.
  { id: "github", name: "GitHub", short: "Gh", note: "repos, READMEs & issues", mode: "results", url: (q) => `https://github.com/search?q=${enc(q)}&type=repositories` },
  { id: "google", name: "Google", short: "G", note: "web results", mode: "site", url: (q) => `https://www.google.com/search?q=${enc(q)}` },
  { id: "ddg", name: "DuckDuckGo", short: "DDG", note: "private web results", mode: "site", url: (q) => `https://duckduckgo.com/?q=${enc(q)}` },
  { id: "bing", name: "Bing", short: "B", note: "Microsoft web results", mode: "site", url: (q) => `https://www.bing.com/search?q=${enc(q)}` },
  { id: "brave", name: "Brave Search", short: "Br", note: "independent index", mode: "site", url: (q) => `https://search.brave.com/search?q=${enc(q)}` },
  { id: "startpage", name: "Startpage", short: "SP", note: "Google results, privately", mode: "site", url: (q) => `https://www.startpage.com/sp/search?query=${enc(q)}` },
  { id: "mojeek", name: "Mojeek", short: "Mj", note: "own crawler & index", mode: "site", url: (q) => `https://www.mojeek.com/search?q=${enc(q)}` },
  { id: "ecosia", name: "Ecosia", short: "Eco", note: "plants trees", mode: "site", url: (q) => `https://www.ecosia.org/search?q=${enc(q)}` },
];

export function engineById(id?: string | null): SearchEngine | undefined {
  return ENGINES.find((e) => e.id === id);
}

/** Bang shortcuts: `!yt cats`, `!w rust`, `!gh tokio`. Site bangs run a DuckDuckGo search scoped with site: */
export interface Bang {
  triggers: string[];
  label: string;
  kind: "engine" | "site";
  target: string;
}

export const BANGS: Bang[] = [
  { triggers: ["yt", "youtube", "v"], label: "YouTube videos", kind: "engine", target: "youtube" },
  { triggers: ["w", "wiki", "wikipedia"], label: "Wikipedia", kind: "engine", target: "wiki" },
  { triggers: ["mw", "mwmbl"], label: "Mwmbl index", kind: "engine", target: "mwmbl" },
  { triggers: ["ddg", "d"], label: "DuckDuckGo", kind: "engine", target: "ddg" },
  { triggers: ["g", "google"], label: "Google", kind: "engine", target: "google" },
  { triggers: ["b", "bing"], label: "Bing", kind: "engine", target: "bing" },
  { triggers: ["brave"], label: "Brave Search", kind: "engine", target: "brave" },
  { triggers: ["sp", "startpage"], label: "Startpage", kind: "engine", target: "startpage" },
  { triggers: ["mj", "mojeek"], label: "Mojeek", kind: "engine", target: "mojeek" },
  { triggers: ["eco", "ecosia"], label: "Ecosia", kind: "engine", target: "ecosia" },
  { triggers: ["gh", "github"], label: "GitHub", kind: "engine", target: "github" },
  { triggers: ["mdn"], label: "MDN web docs", kind: "site", target: "developer.mozilla.org" },
  { triggers: ["so", "stack"], label: "Stack Overflow", kind: "site", target: "stackoverflow.com" },
  { triggers: ["r", "reddit"], label: "Reddit", kind: "site", target: "reddit.com" },
  { triggers: ["hn"], label: "Hacker News", kind: "site", target: "news.ycombinator.com" },
  { triggers: ["arxiv"], label: "arXiv papers", kind: "site", target: "arxiv.org" },
  { triggers: ["npm"], label: "npm packages", kind: "site", target: "npmjs.com" },
  { triggers: ["gut", "gutenberg"], label: "Project Gutenberg", kind: "site", target: "gutenberg.org" },
];

export function parseBang(input: string): { bang: Bang; trigger: string; query: string } | null {
  const m = input.trim().match(/^!([a-z0-9]+)(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const trigger = m[1].toLowerCase();
  const bang = BANGS.find((b) => b.triggers.includes(trigger));
  if (!bang) return null;
  return { bang, trigger, query: (m[2] || "").trim() };
}

export function bangUrl(bang: Bang, query: string): string {
  if (bang.kind === "engine") return (engineById(bang.target) ?? ENGINES[0]).url(query);
  return (engineById("ddg") ?? ENGINES[0]).url(`${query} site:${bang.target}`);
}

const URLISH = /^(https?:\/\/|quill:\/\/)/i;

export function isUrl(input: string): boolean {
  const s = input.trim();
  if (!s || s.startsWith("!")) return false;
  if (URLISH.test(s) || /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(s)) return true;
  if (/\s/.test(s)) return false;
  return /^[^\s]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s);
}

export function normalize(input: string, engine: SearchEngine): string {
  const s = input.trim();
  if (!s) return HOME;
  if (s.startsWith("quill://")) return s.toLowerCase();
  const bang = parseBang(s);
  if (bang && bang.query) return bangUrl(bang.bang, bang.query);
  if (isUrl(s)) {
    if (/^(https?:|quill:)/i.test(s)) return s;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(s)) return `http://${s}`;
    return `https://${s}`;
  }
  return engine.url(s);
}

/** Recognise in-app search URLs. The web engines (DDG, Bing, …) open their real site instead. */
export function parseSearchUrl(raw: string): { engineId: string; query: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const p = u.pathname;
  const q = (k: string) => (u.searchParams.get(k) || "").trim();
  const hit = (engineId: string, query: string) => (query ? { engineId, query } : null);

  if (host === "mwmbl.org" && p === "/") return hit("mwmbl", q("q"));
  if (host === "en.wikipedia.org" && p.startsWith("/w/index.php")) return hit("wiki", q("search"));
  return null;
}

/** Real search-engine results pages: always shown as the live site, never relayed or re-inked. */
export function isSearchSiteUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const p = u.pathname;
  const serp = (...prefixes: string[]) => prefixes.some((x) => p === x || p.startsWith(x + "/"));
  if (host === "duckduckgo.com") return serp("/", "/search", "/images", "/videos", "/news");
  if (host === "bing.com") return serp("/search", "/images", "/videos", "/news");
  if (host === "search.brave.com") return serp("/search", "/images", "/news");
  if (host === "startpage.com") return serp("/sp/search");
  if (host === "mojeek.com") return serp("/search", "/images");
  if (host === "ecosia.org") return serp("/search", "/images");
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return serp("/search", "/images");
  return false;
}

/** PDFs that live at extensionless endpoints (arxiv.org/pdf/…), which the live viewer must render too. */
export function isPdfUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (/\.pdf(?:[?#]|$)/i.test(u.pathname)) return true;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // ponytail: known extensionless PDF endpoints; add hosts here as they turn up.
    return host === "arxiv.org" && /^\/pdf(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Sites whose JS-heavy shell only works as the real live page — re-inking them
 * leaves their own loading spinner spinning forever.
 * ponytail: add hosts here as they're discovered; the general fix is out of scope.
 */
export function isSpaHost(raw: string): boolean {
  try {
    const h = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return h === "reddit.com" || h.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

export function prettyUrl(u: string) {
  if (u.startsWith("quill://")) return u;
  try {
    const p = new URL(u);
    const path = p.pathname === "/" && !p.search ? "" : p.pathname;
    const query = p.search ? (p.search.length <= 56 ? p.search : p.search.slice(0, 53) + "…") : "";
    return p.hostname.replace(/^www\./, "") + path + query;
  } catch {
    return u;
  }
}

export function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

/** Only these schemes may ever reach a tab, an iframe, or a restored session. */
export function isSafeWebUrl(u: string): boolean {
  if (u === HOME || u.startsWith("quill://")) return true;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Hosts that refuse to be framed (X-Frame-Options / frame-ancestors).
 * A direct live frame of these is always blank — Quill shows its in-app
 * desk (YouTube / GitHub) or an explainer instead of an empty box.
 */
const FRAME_HOSTILE = new Set([
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "github.com",
  "gist.github.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
]);

export function isFrameHostile(u: string): boolean {
  try {
    return FRAME_HOSTILE.has(new URL(u).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, ""));
  } catch {
    return false;
  }
}

const LOCAL_HOST = /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|[^/]+\.local)(:\d+)?(\/|$)/i;

export function forceHttps(u: string) {
  if (u.startsWith("http://") && !LOCAL_HOST.test(u)) return "https://" + u.slice(7);
  return u;
}

export type Tile = { name: string; url: string; doodle: string; color: string; reader?: boolean; blurb: string };

export const SHELF: Tile[] = [
  { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page", doodle: "book", color: "var(--cyan)", blurb: "the free encyclopedia", reader: true },
  { name: "Hacker News", url: "https://news.ycombinator.com", doodle: "news", color: "var(--orange)", blurb: "what the nerds are up to", reader: true },
  { name: "Gutenberg", url: "https://www.gutenberg.org", doodle: "quill", color: "var(--yellow)", blurb: "70,000 free books", reader: true },
  { name: "arXiv", url: "https://arxiv.org/list/cs.AI/recent", doodle: "atom", color: "var(--violet)", blurb: "fresh preprints", reader: true },
  { name: "Internet Archive", url: "https://archive.org", doodle: "archive", color: "var(--lime)", blurb: "the whole web, saved", reader: true },
  { name: "MDN", url: "https://developer.mozilla.org/en-US/", doodle: "code", color: "var(--pink)", blurb: "web docs", reader: true },
  { name: "xkcd", url: "https://xkcd.com", doodle: "smile", color: "var(--cyan)", blurb: "a webcomic of nerds" },
  { name: "YouTube", url: "https://www.youtube.com", doodle: "star", color: "var(--red)", blurb: "videos, inside Quill" },
  { name: "Lobsters", url: "https://lobste.rs", doodle: "shell", color: "var(--red)", blurb: "computing, no drama", reader: true },
  { name: "Wikinews", url: "https://en.wikinews.org/wiki/Main_Page", doodle: "news", color: "var(--yellow)", blurb: "neutral news", reader: true },
  { name: "GitHub", url: "https://github.com/trending", doodle: "branch", color: "var(--lime)", blurb: "trending repos", reader: true },
  { name: "Standard Ebooks", url: "https://standardebooks.org", doodle: "quill", color: "var(--orange)", blurb: "beautiful public domain", reader: true },
];

export const QUICK_PROMPTS = [
  { label: "Summarise this page", prompt: "Summarise the current page in 5 tight bullet points.", icon: "pen" },
  { label: "Explain like I'm 12", prompt: "Explain the current page as if I were 12 years old. Keep it warm and concrete.", icon: "bulb" },
  { label: "Pull the key facts", prompt: "List every concrete fact, number, name and date on this page as bullets.", icon: "star" },
  { label: "Translate to my language", prompt: "Translate the main text of this page into my UI language, keeping the tone.", icon: "globe" },
  { label: "Who wrote this & why?", prompt: "Analyse the framing, funding and incentives behind this page. Be blunt.", icon: "eye" },
  { label: "Anything fishy?", prompt: "Scan this page for tracking bait, dark patterns, or claims that need a source.", icon: "shield" },
];

export const TIPS = [
  "Pages open as the real site, with trackers stripped. Tap ✂ re-ink for clean type.",
  "Bang shortcuts: !yt lofi · !w rust · !gh tokio · !mdn fetch — they open the real results, shielded.",
  "Zap an annoying banner with Ctrl/⌘+⇧+X. Quill remembers it for that site.",
  "Dark original flips the real page to night ink, with images left natural.",
  "YouTube plays inside Quill through the privacy embed, and related videos queue up.",
  "Ghost mode keeps a tab out of your history. Ghost tabs never come back on restart.",
  "The AI key never leaves your machine. It sits in localStorage on this device.",
  "Drag tabs to re-order them. Pin the ones you live in.",
];
