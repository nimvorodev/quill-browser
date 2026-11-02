/** Public read-only relays. Jina is the most reliable; the others are fallbacks. Quill only ever sends the URL it was asked to read. */

export interface RelayResult {
  text: string;
  via: string;
}

const BAD = /^(error code:\s*\d{3}|rate limit|too many requests|access denied)/i;

async function timedFetch(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), ms);
  const onAbort = () => ac.abort();
  outer?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

async function readText(url: string, init: RequestInit, ms: number, via: string, outer?: AbortSignal, minLen = 60): Promise<RelayResult> {
  const r = await timedFetch(url, init, ms, outer);
  if (!r.ok) throw new Error(`${via} HTTP ${r.status}`);
  const text = await r.text();
  if (text.length < minLen || BAD.test(text.trim())) throw new Error(`${via} returned nothing usable`);
  return { text, via };
}

/** Page as markdown: links and headings survive, which is ideal for result lists. */
export function relayMarkdown(url: string, signal?: AbortSignal, ms = 12000): Promise<RelayResult> {
  return readText(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } }, ms, "r.jina.ai", signal);
}

/** Rendered HTML: keeps inline JSON such as ytInitialData intact. */
export function relayHtml(url: string, signal?: AbortSignal, ms = 18000): Promise<RelayResult> {
  return readText(
    `https://r.jina.ai/${url}`,
    { headers: { Accept: "text/html", "X-Return-Format": "html" } },
    ms,
    "r.jina.ai (html)",
    signal,
    200,
  );
}

/** Try every relay in order until one answers with something usable. */
export async function relayAny(url: string, signal?: AbortSignal, ms = 12000): Promise<RelayResult> {
  const attempts: Array<() => Promise<RelayResult>> = [
    () => relayMarkdown(url, signal, ms),
    () => readText(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {}, ms, "allorigins.win", signal),
    () => readText(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, {}, ms, "codetabs.com", signal),
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      return await attempt();
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "failed");
    }
  }
  throw new Error(`no relay answered — ${errors.slice(-2).join(" · ")}`);
}
