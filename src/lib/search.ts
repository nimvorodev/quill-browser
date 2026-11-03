import { ENGINES, engineById, hostOf } from "./nav";
import { relayHtml } from "./relay";
import { acceptHit, parseBingImages, type ImageHit, type SearchHit } from "./parsers";
import { PREFIX } from "./store";

export interface SearchRun {
  engineId: string;
  engineName: string;
  query: string;
  hits: SearchHit[];
  via: string;
  fallback: boolean;
  note: string;
}

const enc = (q: string) => encodeURIComponent(q);

/** Mwmbl's API sends CORS headers, so it works even when every relay is busy. */
async function mwmblHits(q: string, signal?: AbortSignal): Promise<{ hits: SearchHit[]; via: string } | null> {
  try {
    const r = await fetch(`https://mwmbl.org/api/v1/search/?s=${enc(q)}`, { signal });
    if (!r.ok) return null;
    const rows = (await r.json()) as { url: string; title: { value: string }[]; extract: { value: string }[] }[];
    const hits: SearchHit[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const title = (row.title || []).map((t) => t.value).join("").replace(/\s+/g, " ").trim();
      if (!title || !acceptHit(row.url) || hits.some((h) => h.url === row.url)) continue;
      hits.push({
        title: title.slice(0, 180),
        url: row.url,
        snippet: (row.extract || []).map((t) => t.value).join("").replace(/\s+/g, " ").trim().slice(0, 260),
        host: hostOf(row.url),
      });
      if (hits.length >= 14) break;
    }
    return hits.length ? { hits, via: "mwmbl api (direct)" } : null;
  } catch {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return null;
  }
}

/** Runs a web search for an engine. Every result list is rendered inside Quill. */
export async function runSearch(engineId: string, query: string, signal?: AbortSignal): Promise<SearchRun> {
  const engine = engineById(engineId) ?? ENGINES[0];
  const q = query.trim();
  const base = { engineId: engine.id, engineName: engine.name, query: q };
  if (!q) return { ...base, hits: [], via: "", fallback: false, note: "Type something to search." };

  if (engine.id === "wiki") {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&srlimit=12&utf8=1&format=json&origin=*`, { signal });
    if (!r.ok) throw new Error(`Wikipedia answered HTTP ${r.status}`);
    const data = await r.json();
    const rows = (data?.query?.search || []) as { title: string; snippet: string }[];
    const hits: SearchHit[] = rows.map((row) => ({
      title: row.title,
      url: `https://en.wikipedia.org/wiki/${enc(row.title.replace(/ /g, "_"))}`,
      snippet: row.snippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'"),
      host: "en.wikipedia.org",
    }));
    return {
      ...base,
      hits,
      via: "wikipedia api (direct, no proxy)",
      fallback: false,
      note: hits.length ? "Live Wikipedia search, fetched directly." : "Wikipedia had no articles for that.",
    };
  }

  if (engine.id === "mwmbl") {
    const mw = await mwmblHits(q, signal);
    return mw
      ? { ...base, hits: mw.hits, via: mw.via, fallback: false, note: "Mwmbl's open, non-profit index, read directly." }
      : { ...base, hits: [], via: "mwmbl api", fallback: false, note: "Mwmbl had nothing for that. Try DuckDuckGo." };
  }

  if (engine.id === "youtube") {
    return { ...base, hits: [], via: "", fallback: false, note: "YouTube opens as its own video desk." };
  }

  // ponytail: every other engine opens its real results page as the live site — nothing to render here.
  return { ...base, hits: [], via: "", fallback: false, note: `${engine.name} results open as the real site.` };
}

/* ---------------- suggestions & recent searches ---------------- */

/** Image search: Bing's image SERP read through the relay (works where DDG's image API is bot-walled). */
export async function imageSearch(q: string, signal?: AbortSignal): Promise<{ hits: ImageHit[]; via: string }> {
  const r = await relayHtml(`https://www.bing.com/images/search?q=${enc(q)}&form=HDRSC2`, signal, 20000);
  const hits = parseBingImages(r.text);
  if (!hits.length) throw new Error("the image page came back empty");
  return { hits, via: r.via };
}

let jsonpSeq = 0;

/** JSONP via a script tag. Used only for YouTube's suggest endpoint, the one that offers it. */
function jsonp(url: string, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const name = `__quillJsonp${++jsonpSeq}`;
    const s = document.createElement("script");
    let timer = 0;
    const done = () => {
      window.clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[name];
      s.remove();
    };
    timer = window.setTimeout(() => {
      done();
      reject(new Error("suggestions timed out"));
    }, 4000);
    (window as unknown as Record<string, unknown>)[name] = (data: unknown) => {
      done();
      resolve(data);
    };
    s.onerror = () => {
      done();
      reject(new Error("suggestions blocked"));
    };
    signal?.addEventListener(
      "abort",
      () => {
        done();
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
    s.src = `${url}&callback=${name}`;
    document.head.appendChild(s);
  });
}

export async function fetchSuggestions(engineId: string, q: string, signal?: AbortSignal): Promise<string[]> {
  if (engineId === "wiki") {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${enc(q)}&limit=6&namespace=0&format=json&origin=*`, { signal });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.[1]) ? (j[1] as string[]).slice(0, 6) : [];
  }
  if (engineId === "youtube") {
    const data = (await jsonp(`https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${enc(q)}`, signal)) as unknown[];
    const rows = Array.isArray(data?.[1]) ? (data[1] as unknown[][]) : [];
    return rows.map((x) => String(x?.[0] ?? "")).filter(Boolean).slice(0, 6);
  }
  if (engineId === "github") {
    // GitHub's API is CORS-open, so repository names can be suggested directly.
    const r = await fetch(`https://api.github.com/search/repositories?q=${enc(q)}&per_page=6`, { signal });
    if (!r.ok) return [];
    const j = await r.json();
    return ((j.items || []) as { full_name: string }[]).map((x) => x.full_name).slice(0, 6);
  }
  return [];
}

const RECENT_KEY = PREFIX + "recent";

export function getRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string) {
  const v = q.trim();
  if (!v) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([v, ...getRecent().filter((x) => x !== v)].slice(0, 30)));
  } catch {
    /* storage full or blocked */
  }
}
