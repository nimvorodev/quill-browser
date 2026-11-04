/**
 * Scribble ink store: one page's strokes + text notes, persisted to localStorage.
 * Keys are per-URL (minus fragment), so annotations ride with the page.
 */

export type Pt = { x: number; y: number; p: number };
export type Stroke = { pts: Pt[]; color: string; size: number; erase: boolean };
export type TextItem = { id: string; x: number; y: number; text: string; color: string; size: number };
export type InkDoc = { strokes: Stroke[]; texts: TextItem[]; at: number };

const KEY = "quill.v1.ink";
const MAX_PAGES = 40;
const MAX_STROKES = 600;
const MAX_PTS = 800;
const MAX_TEXTS = 50;

/** Storage is untrusted (corrupted writes, hand edits): everything is re-validated. */
const num = (v: unknown, lo: number, hi: number, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const hex = (v: unknown) => (/^#[0-9a-f]{3,8}$/i.test(str(v, 9)) ? str(v, 9) : "#1a2440");

function parseStroke(v: Record<string, unknown>): Stroke | null {
  if (!Array.isArray(v.pts) || v.pts.length === 0) return null;
  const pts = v.pts
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .slice(0, MAX_PTS)
    .map((p) => ({ x: num(p.x, -99999, 99999), y: num(p.y, -99999, 99999), p: Math.min(1, Math.max(0.25, typeof p.p === "number" && Number.isFinite(p.p) ? p.p : 0.5)) }));
  if (!pts.length) return null;
  return { pts, color: hex(v.color), size: num(v.size, 2, 80, 5), erase: v.erase === true };
}

function parseText(v: Record<string, unknown>): TextItem | null {
  const id = str(v.id, 40);
  const text = str(v.text, 600);
  if (!id || !text.trim()) return null;
  return { id, text, x: num(v.x, -99999, 99999), y: num(v.y, -99999, 99999), color: hex(v.color), size: num(v.size, 10, 72, 22) };
}

/** The localStorage key for a page's ink. */
export function inkKey(url: string | undefined, home: string): string {
  if (!url || url === home) return "start";
  return url.split("#")[0].slice(0, 400);
}

export function loadInk(key: string): InkDoc {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { strokes: [], texts: [], at: 0 };
    const all = JSON.parse(raw) as Record<string, unknown>;
    const doc = all[key];
    if (typeof doc !== "object" || doc === null) return { strokes: [], texts: [], at: 0 };
    const d = doc as Record<string, unknown>;
    const strokes = (Array.isArray(d.strokes) ? d.strokes : [])
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map(parseStroke)
      .filter((s): s is Stroke => s !== null)
      .slice(0, MAX_STROKES);
    const texts = (Array.isArray(d.texts) ? d.texts : [])
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map(parseText)
      .filter((t): t is TextItem => t !== null)
      .slice(0, MAX_TEXTS);
    return { strokes, texts, at: num(d.at, 0, 4e12) };
  } catch {
    return { strokes: [], texts: [], at: 0 };
  }
}

export function saveInk(key: string, doc: Omit<InkDoc, "at">) {
  try {
    const raw = localStorage.getItem(KEY);
    const all: Record<string, InkDoc> = raw ? JSON.parse(raw) : {};
    if (Object.keys(all).length >= MAX_PAGES && !(key in all)) {
      // Evict the stalest page to stay inside the localStorage budget.
      const stalest = Object.entries(all).sort((a, b) => (a[1].at || 0) - (b[1].at || 0))[0];
      if (stalest) delete all[stalest[0]];
    }
    all[key] = { ...doc, strokes: doc.strokes.slice(-MAX_STROKES), texts: doc.texts.slice(-MAX_TEXTS), at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked — ink stays on screen, just not persisted */
  }
}
