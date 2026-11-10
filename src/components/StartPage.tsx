import { useRef, useState } from "react";
import { Icon } from "./Icons";
import { type SearchEngine } from "../lib/nav";
import { SearchBox } from "./SearchBox";
import { desktop } from "../lib/platform";
import { checkForUpdates, isNewer } from "../lib/updates";
import { NOTE_COLORS, StickyNote } from "./StickyNote";
import { uid, useNow, NOTE_DEFAULT_H, NOTE_DEFAULT_W, type Bookmark, type HistoryEntry, type LaterItem, type Note, type ShelfItem } from "../lib/store";
import { CAT_LABEL, CAT_COLOR, type Category } from "../lib/filters";

const SHELF_COLORS = ["var(--cyan)", "var(--orange)", "var(--yellow)", "var(--violet)", "var(--lime)", "var(--pink)", "var(--red)"];
const SHELF_DOODLES = ["book", "news", "quill", "atom", "archive", "code", "smile", "star", "shell", "branch", "globe", "zap", "heart", "coffee", "bulb", "palette"];

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return { text: "Still awake?", sub: "the web is quietest now" };
  if (h < 12) return { text: "Good morning", sub: "a blank page, an ink-full pen" };
  if (h < 18) return { text: "Good afternoon", sub: "let's read something worth reading" };
  return { text: "Good evening", sub: "curl up, the trackers are locked out" };
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export function StartPage({
  onOpen,
  onSearch,
  notes,
  setNotes,
  shelf,
  setShelf,
  history,
  bookmarks,
  byCat,
  blockedTotal,
  shieldsOn,
  onShields,
  ghost,
  onGhost,
  engine,
  onEngine,
  onAsk,
  onPalette,
  later,
  onRemoveLater,
  onReadNext,
}: {
  onOpen: (url: string) => void;
  onSearch: (q: string, engineId?: string) => void;
  notes: Note[];
  setNotes: (f: (p: Note[]) => Note[]) => void;
  shelf: ShelfItem[];
  setShelf: (f: (p: ShelfItem[]) => ShelfItem[]) => void;
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  byCat: Record<string, number>;
  blockedTotal: number;
  shieldsOn: boolean;
  onShields: () => void;
  ghost: boolean;
  onGhost: () => void;
  engine: SearchEngine;
  onEngine: (e: SearchEngine) => void;
  onAsk: (prompt: string) => void;
  onPalette: () => void;
  /** The read-later queue, newest first. */
  later: LaterItem[];
  onRemoveLater: (url: string) => void;
  onReadNext: () => void;
}) {
  const now = useNow(30000);
  const g = greeting(now);
  const boardRef = useRef<HTMLDivElement>(null);
  const [editShelf, setEditShelf] = useState(false);
  const [editing, setEditing] = useState<ShelfItem | null>(null);
  const [dragTile, setDragTile] = useState<string | null>(null);
  const [overTile, setOverTile] = useState<string | null>(null);

  const maxCat = Math.max(1, ...Object.values(byCat));
  const boardNotes = notes.filter((n) => (n.place ?? "start") === "start");

  /* ---------- notes ---------- */
  // Z-order is tracked separately from the array so a grab never reorders
  // (and remounts) the note mid-gesture.
  const [frontId, setFrontId] = useState<string | null>(null);
  const front = (id: string) => setFrontId(id);

  const stickNote = () =>
    setNotes((p) => {
      const b = boardRef.current;
      const bw = Math.max(40, (b?.clientWidth || 300) - NOTE_DEFAULT_W - 8);
      const bh = Math.max(40, (b?.clientHeight || 300) - NOTE_DEFAULT_H - 8);
      return [
        ...p,
        {
          id: uid(),
          text: "",
          color: NOTE_COLORS[p.length % NOTE_COLORS.length],
          x: 8 + Math.floor(Math.random() * bw),
          y: 8 + Math.floor(Math.random() * bh),
          rot: Math.random() * 5 - 2.5,
          at: Date.now(),
          w: NOTE_DEFAULT_W,
          h: NOTE_DEFAULT_H,
          place: "start",
        },
      ];
    });

  /** Dropping a note outside the board sets it loose over the whole window. */
  const onNoteDragEnd = (id: string, cx: number, cy: number) => {
    const b = boardRef.current?.getBoundingClientRect();
    if (!b) return;
    const inside = cx >= b.left - 20 && cx <= b.right + 20 && cy >= b.top - 20 && cy <= b.bottom + 20;
    if (inside) return;
    setNotes((p) =>
      p.map((n) =>
        n.id === id
          ? { ...n, place: "window", x: Math.max(0, Math.round(cx - (n.w ?? NOTE_DEFAULT_W) / 2)), y: Math.max(0, Math.round(cy - 20)) }
          : n,
      ),
    );
  };

  /* ---------- shelf ---------- */
  const saveTile = (t: ShelfItem) => {
    const url = /^(https?:)\/\//i.test(t.url.trim()) ? t.url.trim() : `https://${t.url.trim()}`;
    const clean = { ...t, url, name: t.name.trim() || hostOf(url), blurb: t.blurb.trim() };
    setShelf((p) => (p.some((x) => x.id === clean.id) ? p.map((x) => (x.id === clean.id ? clean : x)) : [...p, clean]));
    setEditing(null);
  };
  const removeTile = (id: string) => setShelf((p) => p.filter((x) => x.id !== id));
  const moveTile = (from: string, to: string) =>
    setShelf((p) => {
      const a = p.findIndex((x) => x.id === from);
      const b = p.findIndex((x) => x.id === to);
      if (a < 0 || b < 0 || a === b) return p;
      const next = [...p];
      const [item] = next.splice(a, 1);
      next.splice(b, 0, item);
      return next;
    });
  const newTile = (): ShelfItem => ({
    id: uid(),
    name: "",
    url: "",
    doodle: SHELF_DOODLES[shelf.length % SHELF_DOODLES.length],
    color: SHELF_COLORS[shelf.length % SHELF_COLORS.length],
    blurb: "",
  });

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-7 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------------- left spread ---------------- */}
        <div className="min-w-0">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 flex items-center gap-2 text-[15px] text-ink2">
                <Icon name={now.getHours() > 6 && now.getHours() < 19 ? "sun" : "moon"} size={16} className="text-orange" />
                {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                <span className="text-ink3">·</span>
                <span className="tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </p>
              <h1 className="text-[clamp(2.6rem,6vw,4.6rem)] leading-[0.9] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                {g.text},
                <br />
                <span className="marker" style={{ ["--hl" as any]: "var(--yellow)" }}>
                  wanderer
                </span>
                <span className="ml-2 align-middle text-[0.5em] text-ink3">✎</span>
              </h1>
              <p className="mt-2 text-[17px] italic text-ink2">{g.sub}</p>
            </div>
            <button
              onClick={onPalette}
              className="hd btn-sketch hidden items-center gap-2 bg-paper2 px-3 py-2 text-[15px] text-ink sm:flex"
              title="Command bar"
            >
              <Icon name="zap" size={16} /> press <kbd className="rounded border border-ink/50 px-1">⌘K</kbd> for anything
            </button>
          </header>

          <div className="mb-8">
            <SearchBox engine={engine} onEngine={onEngine} onSubmit={(q, id) => onSearch(q, id)} size="lg" />
          </div>

          {/* ---------------- shelf ---------------- */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-[26px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              <span className="hd-underline">the shelf</span>
            </h2>
            <span className="text-[15px] italic text-ink3">{editShelf ? "drag to reorder · tap a tile to edit" : "yours to arrange"}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {editShelf && (
                <button onClick={() => setEditing(newTile())} className="hd btn-sketch flex items-center gap-1 bg-yellow px-2.5 py-[3px] text-[14px] text-[#1a2440]">
                  <Icon name="plus" size={13} strokeWidth={2.6} /> add a tile
                </button>
              )}
              <button
                onClick={() => {
                  setEditShelf((v) => !v);
                  setEditing(null);
                }}
                className={["hd-soft btn-sketch flex items-center gap-1 px-2.5 py-[3px] text-[14px]", editShelf ? "bg-lime text-[#12171f]" : "bg-paper2 text-ink"].join(" ")}
                title={editShelf ? "Done editing" : "Edit the shelf"}
              >
                <Icon name={editShelf ? "check" : "pen"} size={13} /> {editShelf ? "done" : "edit"}
              </button>
            </span>
          </div>

          {editing && (
            <ShelfEditor
              // Keyed by tile: without it, switching tiles while the editor
              // is open keeps the OLD tile's state (useState(tile) runs once).
              key={editing.id}
              tile={editing}
              onCancel={() => setEditing(null)}
              onSave={saveTile}
              onDelete={shelf.some((x) => x.id === editing.id) ? () => { removeTile(editing.id); setEditing(null); } : undefined}
            />
          )}

          <div className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shelf.map((t, i) => {
              const tilt = ((i % 3) - 1) * 0.7;
              return (
                <div
                  key={t.id}
                  draggable={editShelf}
                  onDragStart={() => setDragTile(t.id)}
                  onDragOver={(e) => {
                    if (!editShelf) return;
                    e.preventDefault();
                    setOverTile(t.id);
                  }}
                  onDragLeave={() => setOverTile((o) => (o === t.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragTile && dragTile !== t.id) moveTile(dragTile, t.id);
                    setDragTile(null);
                    setOverTile(null);
                  }}
                  onDragEnd={() => {
                    setDragTile(null);
                    setOverTile(null);
                  }}
                  className={["group relative min-w-0 transition", overTile === t.id && dragTile && dragTile !== t.id ? "scale-[1.04]" : "", editShelf ? "cursor-grab active:cursor-grabbing" : ""].join(" ")}
                  style={{ transform: `rotate(${editShelf ? 0 : tilt}deg)` }}
                >
                  <button
                    onClick={() => (editShelf ? setEditing(t) : onOpen(t.url))}
                    className={["hd btn-sketch flex w-full min-w-0 items-start gap-3 bg-paper2 p-3 text-left text-ink", editShelf ? "ring-2 ring-dashed ring-ink/30" : ""].join(" ")}
                    title={editShelf ? "Edit this tile" : t.url}
                  >
                    <span
                      className="grid h-[38px] w-[38px] shrink-0 place-items-center border-2 border-ink text-[#1a2440] transition group-hover:rotate-[-8deg]"
                      style={{ background: t.color, borderRadius: "45% 55% 50% 50% / 55% 45% 55% 45%" }}
                    >
                      <Icon name={t.doodle} size={20} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[18px] leading-tight">{t.name}</span>
                      <span className="block truncate text-[13.5px] italic text-ink3">{t.blurb || hostOf(t.url)}</span>
                    </span>
                  </button>
                  {editShelf && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTile(t.id);
                      }}
                      className="absolute -right-2 -top-2 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-ink bg-red text-white shadow"
                      title="Remove tile"
                      aria-label={`Remove ${t.name}`}
                    >
                      <Icon name="close" size={11} strokeWidth={2.8} />
                    </button>
                  )}
                </div>
              );
            })}
            {editShelf && (
              <button
                onClick={() => setEditing(newTile())}
                className="hd flex min-h-[66px] items-center justify-center gap-2 border-dashed bg-paper3/40 text-[16px] text-ink2 hover:bg-yellow/40 hover:text-ink"
              >
                <Icon name="plus" size={16} strokeWidth={2.4} /> new tile
              </button>
            )}
            {!shelf.length && !editShelf && (
              <p className="col-span-full py-4 text-center text-[16px] italic text-ink3">the shelf is empty — tap edit to add your places</p>
            )}
          </div>

          {/* read-later queue */}
          {later.length > 0 && (
            <section className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-[24px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                  <span className="hd-underline">to read</span> <span className="text-[15px] italic text-ink3">({later.length})</span>
                </h2>
                <button onClick={onReadNext} className="hd-soft btn-sketch bg-cyan/60 px-2.5 py-0.5 text-[14px] text-[#12171f] hover:bg-cyan">
                  read next <Icon name="forward" size={12} />
                </button>
              </div>
              <div className="ruled border-l-2 border-ink/20 pl-3">
                {later.map((item) => (
                  <div key={item.url + item.at} className="group flex w-full min-w-0 items-baseline gap-2 py-[5px] text-left leading-[28px]">
                    <button onClick={() => onOpen(item.url)} className="min-w-0 flex-1 truncate text-[17px] text-ink hover:underline decoration-wavy decoration-cyan underline-offset-4">
                      {item.title || item.url}
                    </button>
                    <span className="shrink-0 text-[13px] text-ink3">{timeAgo(item.at)}</span>
                    <button
                      onClick={() => onRemoveLater(item.url)}
                      className="shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100 hover:text-red"
                      title="Drop from the queue"
                    >
                      <Icon name="close" size={12} strokeWidth={2.6} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* recent + bookmarks */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section className="min-w-0">
              <h2 className="mb-2 text-[24px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                <span className="hd-underline">recently</span>
              </h2>
              <div className="ruled border-l-2 border-ink/20 pl-3">
                {history.length === 0 && <p className="py-3 text-[16px] italic text-ink3">nothing yet — the page is blank</p>}
                {history.slice(0, 6).map((h) => (
                  <button key={h.at + h.url} onClick={() => onOpen(h.url)} className="group flex w-full min-w-0 items-baseline gap-2 py-[5px] text-left leading-[28px]">
                    <span className="min-w-0 flex-1 truncate text-[17px] text-ink group-hover:underline decoration-wavy decoration-pink underline-offset-4">
                      {h.title || h.url}
                    </span>
                    <span className="shrink-0 text-[13px] text-ink3">{h.ghost ? "👻" : timeAgo(h.at)}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="min-w-0">
              <h2 className="mb-2 text-[24px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                <span className="hd-underline">dog-eared</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {bookmarks.map((b) => (
                  <button key={b.url} onClick={() => onOpen(b.url)} className="hd-soft btn-sketch flex min-w-0 items-center gap-1.5 bg-paper2 px-2.5 py-1 text-[16px] text-ink">
                    <Icon name={b.doodle || "star"} size={14} className="text-ink2" />
                    <span className="truncate">{b.title}</span>
                  </button>
                ))}
                {!bookmarks.length && <p className="py-2 text-[16px] italic text-ink3">no dog-ears yet</p>}
              </div>
            </section>
          </div>
        </div>

        {/* ---------------- margin column ---------------- */}
        <aside className="min-w-0 space-y-5">
          <div className="hd relative bg-paper2 p-4 text-ink ink-shadow tilt-r">
            <span className="tape" style={{ top: -12, left: 24, transform: "rotate(-4deg)" }} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[15px] uppercase tracking-[0.18em] text-ink3">today's catches</p>
                <p className="text-[54px] leading-[0.85] tabular-nums" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                  {blockedTotal.toLocaleString()}
                </p>
                <p className="text-[15px] italic text-ink2">ads, trackers & nasties turned away</p>
              </div>
              <button
                onClick={onShields}
                className={["hd btn-sketch grid h-[46px] w-[46px] place-items-center", shieldsOn ? "bg-lime text-[#12171f]" : "bg-red text-white"].join(" ")}
                title="Toggle shields"
              >
                <Icon name={shieldsOn ? "shield" : "shieldOff"} size={24} />
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              {(Object.keys(CAT_LABEL) as Category[]).map((c) => (
                <div key={c} className="flex items-center gap-2 text-[14px]">
                  <span className="w-[132px] shrink-0 truncate text-ink2">{CAT_LABEL[c]}</span>
                  <span className="h-[10px] flex-1 overflow-hidden rounded-full border border-ink/30 bg-paper3">
                    <span className="block h-full transition-all duration-700" style={{ width: `${((byCat[c] || 0) / maxCat) * 100}%`, background: CAT_COLOR[c] }} />
                  </span>
                  <span className="w-[38px] shrink-0 text-right tabular-nums text-ink3">{byCat[c] || 0}</span>
                </div>
              ))}
            </div>
            <button
              onClick={onGhost}
              className={["hd-soft mt-3 flex w-full items-center gap-2 px-3 py-1.5 text-[15px] transition", ghost ? "bg-violet text-white" : "bg-paper3/60 text-ink hover:bg-violet/20"].join(" ")}
            >
              <Icon name="ghost" size={16} />
              {ghost ? "ghost mode on — nothing written down" : "go ghost for this tab"}
            </button>
          </div>

          {/* ---------------- margin notes ---------------- */}
          <div className="hd relative bg-paper3/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[22px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                margin notes
              </h3>
              <button onClick={stickNote} className="hd btn-sketch flex items-center gap-1 bg-paper2 px-2 py-[2px] text-[14px] text-ink">
                <Icon name="plus" size={12} strokeWidth={2.6} /> stick a note
              </button>
            </div>
            <div ref={boardRef} className="grid-paper relative h-[360px] overflow-hidden rounded-sm border border-dashed border-ink/20">
              {boardNotes.length === 0 && (
                <p className="px-4 pt-8 text-center text-[15px] italic text-ink3">
                  stick a note, drag the corner to resize, drag it off this board to let it float over the whole window
                </p>
              )}
              {boardNotes.map((n) => (
                <StickyNote
                  key={n.id}
                  note={n}
                  boardRef={boardRef}
                  zIndex={n.id === frontId ? 60 : 10 + notes.indexOf(n)}
                  onChange={(patch) => setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, ...patch } : x)))}
                  onDelete={() => setNotes((p) => p.filter((x) => x.id !== n.id))}
                  onFront={() => front(n.id)}
                  onTogglePlace={() => setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, place: "window", x: 80, y: 120 } : x)))}
                  onDragEnd={(cx, cy) => onNoteDragEnd(n.id, cx, cy)}
                />
              ))}
            </div>
            <p className="mt-2 text-[12.5px] italic text-ink3">
              {notes.filter((n) => n.place === "window").length > 0
                ? `${notes.filter((n) => n.place === "window").length} floating over the window · pin them back from each note`
                : "notes survive reloads · arrow keys nudge a focused note"}
            </p>
          </div>

          <div className="hd relative overflow-hidden bg-paper2 p-4 text-ink ink-shadow tilt-l">
            <span className="tape" style={{ top: -10, right: 18, transform: "rotate(6deg)", background: "color-mix(in srgb, var(--pink) 55%, white)" }} />
            <h3 className="mb-1 flex items-center gap-2 text-[24px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              <Icon name="spark" size={20} className="text-pink" /> the margin AI
            </h3>
            <p className="mb-3 text-[15px] italic text-ink2">works offline out of the box, or plug in Ollama / OpenAI / OpenRouter / Groq / anything OpenAI-shaped.</p>
            <div className="flex flex-wrap gap-2">
              {["Summarise my last page", "What did I read today?", "Draft a note about this"].map((p) => (
                <button key={p} onClick={() => onAsk(p)} className="hd-soft btn-sketch bg-paper3/50 px-2.5 py-1 text-[14.5px] text-ink hover:bg-yellow/50">
                  {p}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <UpdatesRow />
    </div>
  );
}

/* ---------------- check for updates ---------------- */
/** Manual GitHub-release check — compares against the installed version. */
function UpdatesRow() {
  const [state, setState] = useState<"idle" | "checking" | "ok" | "outdated">("idle");
  const [latest, setLatest] = useState<{ url: string } | null>(null);
  const check = async () => {
    setState("checking");
    const [cur, res] = await Promise.all([desktop?.version().catch(() => "") ?? "", checkForUpdates()]);
    // Offline / rate-limited silently returns to idle — don't alarm on a v1 check.
    if (!res?.latest || !cur) return setState("idle");
    setLatest({ url: res.url || "" });
    setState(isNewer(res.latest, cur) ? "outdated" : "ok");
  };
  return (
    <div className="mt-5 flex items-center justify-center gap-2 border-t border-dashed border-ink/20 pt-4 text-[13.5px] text-ink3">
      {state === "outdated" && latest?.url ? (
        <button onClick={() => void desktop?.openExternal(latest.url)} className="underline decoration-wavy decoration-yellow underline-offset-2 hover:text-ink">
          v{latest.url.split("/").pop()} — a newer Quill is out, grab it
        </button>
      ) : state === "ok" ? (
        <span className="italic">you're on the latest Quill ✦</span>
      ) : (
        <button onClick={() => void check()} disabled={state === "checking"} className="hover:text-ink disabled:opacity-50">
          {state === "checking" ? "checking…" : "check for updates"}
        </button>
      )}
    </div>
  );
}

/* ---------------- shelf editor ---------------- */
function ShelfEditor({
  tile,
  onSave,
  onCancel,
  onDelete,
}: {
  tile: ShelfItem;
  onSave: (t: ShelfItem) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [t, setT] = useState<ShelfItem>(tile);
  const valid = t.url.trim().length > 3;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(t);
      }}
      className="hd mb-4 bg-paper2 p-3 text-ink ink-shadow"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid h-[38px] w-[38px] shrink-0 place-items-center border-2 border-ink text-[#1a2440]"
          style={{ background: t.color, borderRadius: "45% 55% 50% 50% / 55% 45% 55% 45%" }}
        >
          <Icon name={t.doodle} size={20} strokeWidth={2} />
        </span>
        <p className="text-[20px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {onDelete ? "edit tile" : "new tile"}
        </p>
        <button type="button" onClick={onCancel} className="hd-soft ml-auto grid h-[26px] w-[26px] place-items-center bg-paper3 hover:bg-red hover:text-white" aria-label="Cancel">
          <Icon name="close" size={13} strokeWidth={2.4} />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[13px] text-ink2">
          name
          <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Hacker News" className="hd-soft mt-0.5 w-full bg-paper3/50 px-2 py-1 text-[16px] text-ink placeholder:text-ink3" />
        </label>
        <label className="block text-[13px] text-ink2">
          address
          <input value={t.url} onChange={(e) => setT({ ...t, url: e.target.value })} placeholder="news.ycombinator.com" autoFocus className="hd-soft mt-0.5 w-full bg-paper3/50 px-2 py-1 text-[16px] text-ink placeholder:text-ink3" />
        </label>
        <label className="block text-[13px] text-ink2 sm:col-span-2">
          little blurb
          <input value={t.blurb} onChange={(e) => setT({ ...t, blurb: e.target.value })} placeholder="what the nerds are up to" className="hd-soft mt-0.5 w-full bg-paper3/50 px-2 py-1 text-[16px] text-ink placeholder:text-ink3" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1">
          {SHELF_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setT({ ...t, color: c })} className="h-[18px] w-[18px] rounded-full border-2" style={{ background: c, borderColor: t.color === c ? "var(--ink)" : "transparent" }} aria-label="Pick colour" />
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {SHELF_DOODLES.map((d) => (
            <button key={d} type="button" onClick={() => setT({ ...t, doodle: d })} className={["grid h-[26px] w-[26px] place-items-center rounded border", t.doodle === d ? "border-ink bg-yellow text-[#1a2440]" : "border-ink/20 text-ink2 hover:bg-paper3"].join(" ")} aria-label={`Doodle ${d}`}>
              <Icon name={d} size={14} />
            </button>
          ))}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={!valid} className="hd btn-sketch bg-yellow px-3 py-1 text-[15px] text-[#1a2440] disabled:opacity-40">
          save tile
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="hd-soft btn-sketch bg-paper3 px-3 py-1 text-[15px] text-ink hover:bg-red hover:text-white">
            remove
          </button>
        )}
      </div>
    </form>
  );
}
