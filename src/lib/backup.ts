import type { HistoryEntry, Bookmark, LaterItem, Note } from "./store";
import type { Settings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import { isSafeWebUrl } from "./nav";

/** Everything worth keeping, as one JSON file. */
export interface Backup {
  v: 1;
  at: number;
  settings?: Partial<Settings>;
  history?: HistoryEntry[];
  bookmarks?: Bookmark[];
  notes?: Note[];
  later?: LaterItem[];
  /** Hosts pinned to the direct frame. */
  siteViews?: Record<string, "live">;
  /** Hosts with pop-ups blocked. */
  popupHosts?: Record<string, true>;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Parse an imported backup. The file is untrusted input (user picked it, but it
 * could be anything): every list is re-validated, URLs must pass isSafeWebUrl,
 * counts are capped at what Quill itself would ever store.
 * Returns null when the file isn't a Quill backup.
 */
export function parseBackup(raw: string): Backup | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const b = data as Record<string, unknown>;
  if (b.v !== 1) return null;

  const out: Backup = { v: 1, at: num(b.at) || Date.now() };

  if (typeof b.settings === "object" && b.settings !== null) {
    // Only known setting keys with the right type survive.
    const s = b.settings as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      const t = typeof (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
      if (t && t !== "undefined" && typeof v === t) picked[k] = v;
    }
    if (Object.keys(picked).length) out.settings = picked as Partial<Settings>;
  }

  if (Array.isArray(b.history)) {
    const list = b.history
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .filter((x) => isSafeWebUrl(str(x.url, 2048)) && !str(x.url, 2048).startsWith("quill://"))
      .map((x) => ({ url: str(x.url, 2048), title: str(x.title, 200), at: num(x.at) }));
    if (list.length) out.history = list.slice(0, 400);
  }

  if (Array.isArray(b.bookmarks)) {
    const list = b.bookmarks
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .filter((x) => isSafeWebUrl(str(x.url, 2048)) && !str(x.url, 2048).startsWith("quill://"))
      .map((x) => ({ title: str(x.title, 200), url: str(x.url, 2048), doodle: str(x.doodle, 40) || "star" }));
    if (list.length) out.bookmarks = list.slice(0, 500);
  }

  if (Array.isArray(b.later)) {
    const list = b.later
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .filter((x) => isSafeWebUrl(str(x.url, 2048)) && !str(x.url, 2048).startsWith("quill://"))
      .map((x) => ({ url: str(x.url, 2048), title: str(x.title, 200), at: num(x.at) }));
    if (list.length) out.later = list.slice(0, 200);
  }

  // Per-site preferences: host-keyed maps with fixed values.
  const pickHostMap = (raw: unknown, val: "live" | true) => {
    if (typeof raw !== "object" || raw === null) return null;
    const picked: Record<string, "live" | true> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (/^[a-z0-9.-]{1,253}$/i.test(k) && v === val) picked[k.toLowerCase()] = val;
    }
    return Object.keys(picked).length ? picked : null;
  };
  const views = pickHostMap(b.siteViews, "live");
  if (views) out.siteViews = views as Record<string, "live">;
  const pops = pickHostMap(b.popupHosts, true);
  if (pops) out.popupHosts = pops as Record<string, true>;

  if (Array.isArray(b.notes)) {
    const list = b.notes
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .filter((x) => str(x.id, 40))
      .map((x) => ({
        id: str(x.id, 40),
        text: str(x.text, 5000),
        color: str(x.color, 40) || "yellow",
        x: num(x.x),
        y: num(x.y),
        rot: num(x.rot),
        at: num(x.at) || Date.now(),
        w: num(x.w) || undefined,
        h: num(x.h) || undefined,
        folded: x.folded === true,
        place: x.place === "window" ? ("window" as const) : ("start" as const),
      }));
    if (list.length) out.notes = list.slice(0, 300);
  }

  return out;
}
