/**
 * GitHub in Quill.
 *
 * github.com refuses every public relay (403) and sends X-Frame-Options: DENY,
 * so it can neither be proxied nor framed. Its API is CORS-open (access-control-allow-origin: *),
 * so Quill reads repos, READMEs, issues and files straight from api.github.com instead.
 */

export type GhKind = "home" | "trending" | "search" | "repo" | "user" | "org";

export interface GhRef {
  kind: GhKind;
  owner?: string;
  repo?: string;
  path?: string;
  query?: string;
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** GitHub logins and repo names. Anything else is not a real repo path. */
const GH_NAME = /^[\w.\-]{1,100}$/;

/** Top-level github.com pages that are not users — show the desk home instead of a 404. */
const GH_RESERVED = new Set([
  "settings", "login", "logout", "signup", "join", "dashboard", "notifications",
  "issues", "pulls", "marketplace", "explore", "topics", "collections", "events",
  "codespaces", "new", "sessions", "site", "security", "contact", "about",
  "features", "pricing", "sponsors", "readme", "git-guides",
]);

export function parseGitHub(raw: string): GhRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "gist.github.com" || host === "raw.githubusercontent.com") return null;
  if (host !== "github.com") return null;

  const parts = u.pathname.split("/").filter(Boolean).map(safeDecode);
  if (parts.length === 0) return { kind: "home" };
  if (parts[0] === "trending") return { kind: "trending" };
  if (parts[0] === "search") return { kind: "search", query: u.searchParams.get("q") || "" };
  if (GH_RESERVED.has(parts[0].toLowerCase())) return { kind: "home" };
  if (parts[0] === "orgs" || parts[0] === "users") {
    return parts[1] && GH_NAME.test(parts[1]) ? { kind: "org", owner: parts[1] } : { kind: "home" };
  }
  if (parts[0].startsWith("@")) {
    const owner = parts[0].slice(1);
    return GH_NAME.test(owner) ? { kind: "user", owner } : { kind: "home" };
  }
  if (parts.length === 1) return GH_NAME.test(parts[0]) ? { kind: "user", owner: parts[0] } : null;
  if (parts[1] === "repositories" || parts[1] === "projects" || parts[1] === "stars") {
    return GH_NAME.test(parts[0]) ? { kind: "org", owner: parts[0] } : null;
  }
  if (!GH_NAME.test(parts[0]) || !GH_NAME.test(parts[1].replace(/\.git$/, ""))) return null;
  const repo = parts[1].replace(/\.git$/, "");
  if (parts.length >= 3) {
    // tree/blob/raw/<branch>/<path> — drop the branch segment, keep the file path.
    if (["tree", "blob", "raw", "blame"].includes(parts[2])) {
      return { kind: "repo", owner: parts[0], repo, path: parts.slice(4).join("/") || undefined };
    }
    // Repo sub-pages (issues, pulls, actions…) have no file path — land on the repo.
    if (["commits", "issues", "pulls", "wiki", "discussions", "compare", "releases", "actions", "projects", "security", "pulse", "graphs", "network", "settings", "stargazers", "watchers", "forks", "search"].includes(parts[2])) {
      return { kind: "repo", owner: parts[0], repo };
    }
  }
  if (parts.length >= 2) return { kind: "repo", owner: parts[0], repo, path: parts.slice(2).join("/") || undefined };
  return { kind: "home" };
}

const API = "https://api.github.com";
const HEADERS = { Accept: "application/vnd.github+json" } as Record<string, string>;

async function api(path: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: HEADERS, signal });
  if (res.status === 403 || res.status === 429) {
    const left = res.headers.get("x-ratelimit-remaining");
    if (left === "0") throw new Error("GitHub's hourly API limit is used up. It resets within the hour.");
  }
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`);
  return res.json();
}

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
const shortNum = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
const shortDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export interface Repo {
  full_name: string;
  owner: string;
  repo: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  issues: number;
  topics: string[];
  license: string;
  homepage: string;
  updated: string;
  defaultBranch: string;
  starsToday?: number;
  private: boolean;
}

const toRepo = (r: any): Repo => ({
  full_name: r.full_name || `${r.owner?.login}/${r.name}`,
  owner: r.owner?.login || "",
  repo: r.name || "",
  description: clean(r.description),
  language: r.language || "",
  stars: r.stargazers_count ?? 0,
  forks: r.forks_count ?? 0,
  issues: r.open_issues_count ?? 0,
  topics: (r.topics || []).slice(0, 6),
  license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : "",
  homepage: r.homepage || "",
  updated: shortDate(r.pushed_at || r.updated_at),
  defaultBranch: typeof r.default_branch === "string" && r.default_branch ? r.default_branch : "main",
  private: !!r.private,
});

export interface SearchRepo {
  items: Repo[];
  total: number;
}

export async function repoInfo(owner: string, repo: string, signal?: AbortSignal): Promise<Repo> {
  return toRepo(await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, signal));
}

export async function searchRepos(q: string, signal?: AbortSignal): Promise<SearchRepo> {
  const j = await api(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`, signal);
  return { items: (j.items || []).map(toRepo), total: j.total_count || 0 };
}

export async function trendingRepos(signal?: AbortSignal, language?: string): Promise<Repo[]> {
  const week = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const q = language ? `created:>${week} language:${language}` : `created:>${week}`;
  const j = await api(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`, signal);
  return (j.items || []).map(toRepo);
}

export async function userRepos(login: string, signal?: AbortSignal): Promise<Repo[]> {
  const j = await api(`/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=20`, signal);
  return (Array.isArray(j) ? j : []).map(toRepo);
}

export async function userInfo(login: string, signal?: AbortSignal) {
  return api(`/users/${encodeURIComponent(login)}`, signal);
}

export interface Issue {
  number: number;
  title: string;
  state: string;
  user: string;
  comments: number;
  created: string;
  labels: string[];
  pr: boolean;
}

export async function repoIssues(owner: string, repo: string, signal?: AbortSignal): Promise<Issue[]> {
  const j = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=15`, signal);
  return (Array.isArray(j) ? j : []).map((i: any) => ({
    number: i.number,
    title: clean(i.title),
    state: i.state,
    user: i.user?.login || "",
    comments: i.comments ?? 0,
    created: shortDate(i.created_at),
    labels: (i.labels || []).map((l: any) => l.name).slice(0, 3),
    pr: !!i.pull_request,
  }));
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

export async function repoFiles(owner: string, repo: string, path: string, signal?: AbortSignal): Promise<FileEntry[]> {
  const p = path ? `/${encodeURI(path.split("/").join("/"))}` : "";
  const j = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${p}`, signal);
  if (!Array.isArray(j)) return [];
  return j
    .map((f: any) => ({ name: f.name, path: f.path, type: f.type === "dir" ? ("dir" as const) : ("file" as const), size: f.size ?? 0 }))
    .sort((a: FileEntry, b: FileEntry) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

export interface Readme {
  name: string;
  html: string;
  raw: string;
}

// noscript/template/svg/math: mutation-XSS carriers — they re-parse with
// different semantics than DOMParser's parse-serialize round trip, so
// sanitized-looking HTML can reassemble into live script on injection.
const DANGEROUS_TAGS = new Set(["script", "iframe", "object", "embed", "link", "meta", "base", "style", "title", "form", "button", "input", "select", "textarea", "applet", "frame", "frameset", "marquee", "noscript", "template", "svg", "math"]);

function cleanUrlAttr(value: string | null, kind: "link" | "media"): string | null {
  if (value == null) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(#|mailto:|tel:)/i.test(v)) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith("//")) return v.startsWith("//") ? `https:${v}` : v;
  // data: and javascript: URLs never survive, except data: images.
  if (/^data:/i.test(v)) return kind === "media" && /^data:image\//i.test(v) ? v : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  return v; // relative — resolved by the caller
}

/**
 * Defense-in-depth README sanitizer. GitHub's HTML API already sanitises, but this HTML
 * is injected into Quill's own document (which holds AI keys in localStorage), so we
 * sanitise again: dangerous tags die, event handlers / inline styles / classes die
 * (a README must never restyle or overlay the app), and relative links are rewritten
 * to absolute GitHub / raw URLs so they actually work.
 */
export function sanitizeReadmeHtml(html: string, owner: string, repo: string, branch: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";

  const resolveRel = (v: string, media: boolean) => {
    const rel = v.replace(/^\/+/, "");
    if (!rel) return null;
    const enc = rel.split("/").map((s) => encodeURIComponent(safeDecode(s))).join("/");
    return media
      ? `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${enc}`
      : `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${enc}`;
  };

  const els = Array.from(root.querySelectorAll("*"));
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (tag === "themed-picture" || tag === "picture") {
      // Unwrap: the component would otherwise stretch sizeless images.
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      continue;
    }
    if (tag === "form") {
      // Keep the contents, drop the form itself (no submissions from inside a README).
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      continue;
    }
    if (tag === "input") {
      // Task-list checkboxes become plain glyphs — no live controls inside injected HTML.
      const type = (el.getAttribute("type") || "").toLowerCase();
      const span = doc.createElement("span");
      span.textContent = type === "checkbox" ? (el.hasAttribute("checked") ? "☑ " : "☐ ") : "";
      el.replaceWith(span);
      continue;
    }
    if (DANGEROUS_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    // Strip anything that can execute, restyle, or overlay the app.
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n.startsWith("on") || n === "style" || n === "class" || n === "id" || n === "tabindex" || n === "contenteditable") {
        el.removeAttribute(attr.name);
      }
    }
    const scrub = (attr: string, kind: "link" | "media") => {
      if (!el.hasAttribute(attr)) return;
      const cleaned = cleanUrlAttr(el.getAttribute(attr), kind);
      if (cleaned == null) {
        el.removeAttribute(attr);
        return;
      }
      // Inline data: images are kept verbatim — they'd otherwise fall through
      // to the relative-URL rewriter and come out as bogus GitHub URLs.
      if (cleaned.startsWith("data:image/")) {
        el.setAttribute(attr, cleaned);
        return;
      }
      if (/^(#|mailto:|tel:|https?:)/i.test(cleaned)) {
        el.setAttribute(attr, cleaned);
        return;
      }
      const abs = resolveRel(cleaned, kind === "media");
      if (abs) el.setAttribute(attr, cleaned.startsWith("#") ? cleaned : abs);
      else el.removeAttribute(attr);
    };
    if (tag === "a") {
      scrub("href", "link");
      el.removeAttribute("target");
    } else if (tag === "img") {
      scrub("src", "media");
      el.removeAttribute("srcset");
      el.removeAttribute("width");
      el.removeAttribute("height");
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "no-referrer");
    } else if (tag === "video" || tag === "audio" || tag === "source" || tag === "track") {
      scrub("src", "media");
      scrub("poster", "media");
    }
  }
  return root.innerHTML;
}

/** README rendered as GitHub's own HTML, re-sanitised and re-linked for Quill. */
export async function readme(owner: string, repo: string, signal?: AbortSignal, branch?: string): Promise<Readme | null> {
  const res = await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
    headers: { Accept: "application/vnd.github.html" },
    signal,
  });
  if (!res.ok) return null;
  const html = await res.text();
  if (!html || html.length < 20) return null;
  const clean = sanitizeReadmeHtml(html, owner, repo, branch || "HEAD");
  return {
    name: "README",
    html: `<div class="markdown-body quill-md">${clean}</div>`,
    raw: html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
  };
}

/** Raw file text for the in-app file viewer. raw.githubusercontent.com is CORS-open. Capped at ~400 KB. */
export async function fileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  const enc = path.split("/").map((s) => encodeURIComponent(s)).join("/");
  const res = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${enc}`, { signal });
  if (!res.ok) throw new Error(`file answered HTTP ${res.status}`);
  const text = await res.text();
  const CAP = 400_000;
  if (text.length > CAP) return { text: text.slice(0, CAP), truncated: true };
  return { text, truncated: false };
}

export interface GhLang {
  name: string;
  pct: number;
}

export async function languages(owner: string, repo: string, signal?: AbortSignal): Promise<GhLang[]> {
  const j = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, signal);
  const entries = Object.entries(j || {}) as [string, number][];
  const total = entries.reduce((a, [, n]) => a + n, 0) || 1;
  return entries.map(([name, n]) => ({ name, pct: Math.round((n / total) * 100) })).sort((a, b) => b.pct - a.pct);
}

export function fileUrl(ref: GhRef) {
  const p = ref.path ? `/${ref.path.split("/").map(encodeURIComponent).join("/")}` : "";
  return `https://github.com/${ref.owner}/${ref.repo}/blob/HEAD${p}`;
}

export function repoUrl(owner: string, repo: string) {
  return `https://github.com/${owner}/${repo}`;
}

export function issuesUrl(owner: string, repo: string) {
  return `https://github.com/${owner}/${repo}/issues`;
}

export function searchUrl(q: string) {
  return `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`;
}

export function num(n: number) {
  return shortNum(n);
}
