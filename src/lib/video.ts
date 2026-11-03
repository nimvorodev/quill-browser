import { relayHtml, relayMarkdown } from "./relay";
import { collectVideos, extractYtInitialData, videosFromMarkdown, type VideoHit } from "./parsers";

export type { VideoHit } from "./parsers";

export type VideoKind = "watch" | "shorts" | "playlist" | "search" | "channel" | "home";

export interface VideoRef {
  kind: VideoKind;
  id?: string;
  list?: string;
  query?: string;
  channelPath?: string;
}

export function parseVideo(raw: string): VideoRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id ? { kind: "watch", id, list: u.searchParams.get("list") || undefined } : { kind: "home" };
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  const parts = u.pathname.split("/").filter(Boolean);
  const v = u.searchParams.get("v");
  const list = u.searchParams.get("list") || undefined;
  if (parts[0] === "watch" && v) return { kind: "watch", id: v, list };
  if (parts[0] === "shorts" && parts[1]) return { kind: "shorts", id: parts[1] };
  if (parts[0] === "embed" && parts[1] === "videoseries") return { kind: "playlist", list };
  if (parts[0] === "embed" && parts[1]) return { kind: "watch", id: parts[1], list };
  if (parts[0] === "live" && parts[1]) return { kind: "watch", id: parts[1] };
  if (parts[0] === "playlist") return { kind: "playlist", list };
  if (parts[0] === "results") return { kind: "search", query: u.searchParams.get("search_query") || "" };
  if (parts[0] && (parts[0].startsWith("@") || parts[0] === "channel" || parts[0] === "c" || parts[0] === "user")) {
    const path = parts[0].startsWith("@") ? `/${parts[0]}` : `/${parts.slice(0, 2).join("/")}`;
    return { kind: "channel", channelPath: path };
  }
  return { kind: "home" };
}

export function watchUrl(id: string, t?: number) {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  // ponytail: only timestamps worth jumping to make it into the link.
  return t && t > 30 ? `${base}&t=${Math.floor(t)}s` : base;
}

export function thumbUrl(id: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
}

/** Privacy-enhanced embed, used when the IFrame API can't load. */
export function embedSrc(ref: VideoRef): string | null {
  // ponytail: origin param only makes sense for a real http(s) origin; file:// (packaged app) must omit it.
  const origin = /^https?:/.test(window.location.origin) ? `&origin=${encodeURIComponent(window.location.origin)}` : "";
  if (ref.kind === "playlist" && ref.list) {
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(ref.list)}&rel=0${origin}`;
  }
  if (ref.id) {
    const list = ref.list ? `&list=${encodeURIComponent(ref.list)}` : "";
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ref.id)}?rel=0&modestbranding=1&playsinline=1${list}${origin}`;
  }
  return null;
}

/** YouTube's IFrame API error codes, translated for a reader. */
export const YT_ERRORS: Record<number, string> = {
  2: "The link has an invalid video id.",
  5: "The browser's video engine choked on this one.",
  100: "The video was removed, or it is private.",
  101: "The uploader turned off embedding for this video.",
  150: "The uploader turned off embedding for this video.",
  153: "YouTube refused the embed from this app (player configuration error).",
};

export type YTPlayerInstance = {
  destroy: () => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
};
type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayerInstance;
  PlayerState: { ENDED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads YouTube's official player API once. Rejects if the script is blocked, so callers can fall back to a plain embed. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("iframe_api blocked"));
    };
    document.head.appendChild(s);
    window.setTimeout(() => {
      if (!window.YT?.Player) {
        apiPromise = null;
        reject(new Error("iframe_api timed out"));
      }
    }, 15000);
  });
  return apiPromise;
}

export interface OEmbed {
  title: string;
  author: string;
  authorUrl: string;
}

export async function fetchOEmbed(watch: string, signal?: AbortSignal): Promise<OEmbed | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    return { title: j.title || "", author: j.author_name || "", authorUrl: j.author_url || "" };
  } catch {
    return null;
  }
}

/** Results page parsed from YouTube's own data (rich metadata), with markdown as the fallback. */
async function listFrom(url: string, signal?: AbortSignal): Promise<VideoHit[]> {
  try {
    const html = await relayHtml(url, signal, 20000);
    const hits = collectVideos(extractYtInitialData(html.text));
    if (hits.length) return hits;
  } catch {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  }
  const md = await relayMarkdown(url, signal, 14000);
  const hits = videosFromMarkdown(md.text);
  if (!hits.length) throw new Error("YouTube returned no playable videos for this page.");
  return hits;
}

export function youtubeSearch(query: string, signal?: AbortSignal): Promise<VideoHit[]> {
  return listFrom(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, signal);
}

/** The watch page's own related videos — the real "up next", not a title search. */
export function youtubeRelated(id: string, signal?: AbortSignal): Promise<VideoHit[]> {
  return listFrom(watchUrl(id), signal);
}

/** A playlist's contents. */
export function youtubePlaylist(list: string, signal?: AbortSignal): Promise<VideoHit[]> {
  return listFrom(`https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`, signal);
}

/* ---------------- resume position ---------------- */

const POS_KEY = "quill.v1.ytpos";

/** Remember where a video was paused. ponytail: flat localStorage map, 200 videos by recency. */
export function saveWatchPos(id: string, t: number) {
  if (!id || t < 5 || typeof localStorage === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, { t: number; at: number }>;
    map[id] = { t: Math.floor(t), at: Date.now() };
    const keys = Object.keys(map);
    if (keys.length > 200) {
      keys.sort((a, b) => map[a].at - map[b].at).slice(0, keys.length - 200).forEach((k) => delete map[k]);
    }
    localStorage.setItem(POS_KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked */
  }
}

/** Where the video was last paused; 0 when there's nothing worth resuming. */
export function loadWatchPos(id: string): number {
  if (!id || typeof localStorage === "undefined") return 0;
  try {
    const e = (JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, { t?: unknown }>)[id];
    const t = typeof e?.t === "number" ? e.t : 0;
    return t > 30 ? t : 0;
  } catch {
    return 0;
  }
}

/** Finished watching — don't resume this one next time. */
export function clearWatchPos(id: string) {
  if (!id || typeof localStorage === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, unknown>;
    if (id in map) {
      delete map[id];
      localStorage.setItem(POS_KEY, JSON.stringify(map));
    }
  } catch {
    /* ignore */
  }
}

export function youtubeChannel(path: string, signal?: AbortSignal): Promise<VideoHit[]> {
  return listFrom(`https://www.youtube.com${path}/videos`, signal);
}
