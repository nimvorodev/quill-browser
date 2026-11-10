import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { ENGINES, SHELF, prettyUrl, hostOf } from "../lib/nav";
import { desktop, type DownloadItem } from "../lib/platform";
import type { Settings } from "../lib/settings";
import type { Bookmark, HistoryEntry, Note } from "../lib/store";

export function Drawer({
  open, title, icon, onClose, children, width = 420,
}: {
  open: boolean; title: string; icon: string; onClose: () => void; children: ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !/input|textarea|select/i.test(t?.tagName || "")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // no-drag: the drawer panel tops out over the logo-row drag region; without it the close button is dead.
  return (
    <div className="no-drag absolute inset-0 z-[70] flex" role="dialog" aria-label={title}>
      <div className="fade-in absolute inset-0 bg-ink/25" onClick={onClose} />
      <div
        className="drawer-in relative flex h-full flex-col border-r-2 border-ink bg-paper2 text-ink shadow-[8px_0_24px_rgba(0,0,0,0.18)]"
        style={{ width: `min(${width}px, 92vw)` }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-ink px-3 py-2.5">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-ink bg-yellow">
            <Icon name={icon} size={17} />
          </span>
          <h2 className="flex-1 text-[28px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            {title}
          </h2>
          <button onClick={onClose} className="hd grid h-[28px] w-[28px] place-items-center bg-paper2 hover:bg-red hover:text-white">
            <Icon name="close" size={14} strokeWidth={2.4} />
          </button>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- history ---------------- */
export function HistoryPanel({
  history,
  closed,
  onReopenClosed,
  onOpen,
  onClear,
  onForget,
}: {
  history: HistoryEntry[];
  /** Recently closed tabs (in-memory, newest last) — restorable, like Chrome's history menu. */
  closed: { url: string; title: string }[];
  onReopenClosed: (index: number) => void;
  onOpen: (url: string) => void;
  onClear: () => void;
  onForget: (at: number) => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const list = history.filter((h) => (h.title + h.url).toLowerCase().includes(q.toLowerCase()));
    const map = new Map<string, HistoryEntry[]>();
    for (const h of list) {
      const day = new Date(h.at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(h);
    }
    return [...map.entries()];
  }, [history, q]);

  return (
    <div className="p-3">
      <div className="hd mb-3 flex items-center gap-2 bg-paper3/40 px-3 py-1.5">
        <Icon name="search" size={15} className="text-ink2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter the log…" className="flex-1 bg-transparent text-[16px] placeholder:text-ink3" />
        {history.length > 0 && (
          <button onClick={onClear} className="text-[14px] text-ink2 underline decoration-dotted hover:text-red">
            erase all
          </button>
        )}
      </div>
      {!history.length && !closed.length && <p className="p-4 text-center text-[16px] italic text-ink3">the log is empty — go read something</p>}
      {closed.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-[13px] uppercase tracking-[0.18em] text-ink3">recently closed</p>
          <div className="ruled border-l-2 border-ink/20 pl-2">
            {closed.map((c, i) => (
              <button
                key={c.url + i}
                onClick={() => onReopenClosed(i)}
                className="flex w-full items-center gap-2 py-[5px] text-left hover:underline decoration-wavy decoration-pink underline-offset-4"
              >
                <Icon name="reload" size={13} className="shrink-0 text-ink3" />
                <span className="min-w-0 flex-1 truncate text-[16.5px]">{c.title || prettyUrl(c.url)}</span>
                <span className="shrink-0 text-[12.5px] text-ink3">reopen</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {groups.map(([day, items]) => (
        <div key={day} className="mb-4">
          <p className="mb-1 text-[13px] uppercase tracking-[0.18em] text-ink3">{day}</p>
          <div className="ruled border-l-2 border-ink/20 pl-2">
            {items.map((h) => (
              <div key={h.at + h.url} className="group flex items-start gap-2 py-[5px] leading-[22px]">
                {h.ghost && <Icon name="ghost" size={13} className="mt-[6px] shrink-0 text-violet" />}
                <button
                  onClick={() => onOpen(h.url)}
                  className="min-w-0 flex-1 text-left hover:underline decoration-wavy decoration-pink underline-offset-4"
                >
                  <span className="block truncate text-[16.5px]">{h.title || prettyUrl(h.url)}</span>
                  {/* the full address under the title makes entries findable at a glance */}
                  {h.title && <span className="block truncate text-[12.5px] text-ink3">{prettyUrl(h.url)}</span>}
                </button>
                <span className="shrink-0 text-[13px] tabular-nums text-ink3">
                  {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  onClick={() => onForget(h.at)}
                  className="shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100 hover:text-red"
                  title="Forget this one"
                >
                  <Icon name="close" size={12} strokeWidth={2.6} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- bookmarks ---------------- */
export function BookmarksPanel({
  bookmarks, onOpen, onRemove, onAdd, onRename, onMove, currentUrl, currentTitle,
}: {
  bookmarks: Bookmark[];
  onOpen: (url: string) => void;
  onRemove: (url: string) => void;
  onAdd: (b: Bookmark) => void;
  onRename: (url: string, title: string) => void;
  onMove: (url: string, dir: -1 | 1) => void;
  currentUrl: string;
  currentTitle: string;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  // Inline rename: the url being edited + its draft text.
  const [editing, setEditing] = useState<{ url: string; text: string } | null>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const commitRename = () => {
    if (editing && editing.text.trim()) onRename(editing.url, editing.text.trim());
    setEditing(null);
  };
  return (
    <div className="p-3">
      <div className="hd mb-3 bg-paper3/40 p-2.5">
        <p className="mb-1.5 text-[17px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>add a dog-ear</p>
        <div className="flex gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="name"
            className="hd-soft w-[38%] bg-paper2 px-2 py-1 text-[15px] placeholder:text-ink3"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="hd-soft min-w-0 flex-1 bg-paper2 px-2 py-1 text-[15px] placeholder:text-ink3"
          />
          <button
            onClick={() => {
              const raw = url.trim();
              if (!raw) return;
              const normalized = /^(https?:|quill:)/i.test(raw) ? raw : `https://${raw}`;
              onAdd({ title: title.trim() || hostOf(normalized), url: normalized, doodle: "star" });
              setTitle("");
              setUrl("");
            }}
            className="hd btn-sketch shrink-0 bg-yellow px-2.5 text-[15px]"
          >
            add
          </button>
        </div>
        {currentUrl && !currentUrl.startsWith("quill://") && (
          <button
            onClick={() => onAdd({ title: currentTitle || hostOf(currentUrl), url: currentUrl, doodle: "star" })}
            className="hd-soft mt-2 flex w-full items-center gap-1.5 bg-paper2 px-2 py-1 text-[14.5px] hover:bg-yellow/50"
          >
            <Icon name="star" size={13} /> bookmark the current page
          </button>
        )}
      </div>
      <div className="space-y-1">
        {bookmarks.map((b, i) => (
          <div key={b.url} className="group flex items-center gap-2 border-b border-dashed border-ink/20 py-1.5">
            <div className="flex shrink-0 flex-col">
              <button
                onClick={() => onMove(b.url, -1)}
                disabled={i === 0}
                className="grid h-[14px] w-4 place-items-center text-ink3 hover:text-ink disabled:opacity-25"
                title="Move up"
              >
                <Icon name="chevUp" size={12} />
              </button>
              <button
                onClick={() => onMove(b.url, 1)}
                disabled={i === bookmarks.length - 1}
                className="grid h-[14px] w-4 place-items-center text-ink3 hover:text-ink disabled:opacity-25"
                title="Move down"
              >
                <Icon name="chevDown" size={12} />
              </button>
            </div>
            <Icon name={b.doodle || "star"} size={16} className="shrink-0 text-ink2" />
            {editing?.url === b.url ? (
              <input
                ref={renameInput}
                autoFocus
                value={editing.text}
                onChange={(e) => setEditing({ url: b.url, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") setEditing(null);
                }}
                onBlur={commitRename}
                className="hd-soft min-w-0 flex-1 bg-paper2 px-1 py-0.5 text-[16px]"
              />
            ) : (
              <button onClick={() => onOpen(b.url)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[17px] hover:underline decoration-wavy decoration-cyan underline-offset-4">{b.title}</span>
                <span className="block truncate text-[13px] text-ink3">{prettyUrl(b.url)}</span>
              </button>
            )}
            <button
              onClick={() => {
                // Clicking the pen on the row already being edited is a no-op —
                // re-running setEditing here would revert the draft to the
                // pre-commit title from this render.
                if (editing?.url === b.url) return;
                // Commit any in-flight edit first — switching rows unmounts
                // the old input and would silently drop the draft.
                commitRename();
                setEditing({ url: b.url, text: b.title });
              }}
              className="shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100 hover:text-cyan"
              title="Rename"
            >
              <Icon name="pen" size={14} />
            </button>
            <button onClick={() => onRemove(b.url)} className="shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100 hover:text-red" title="Remove">
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
        {!bookmarks.length && <p className="p-4 text-center text-[16px] italic text-ink3">no dog-ears yet</p>}
      </div>
      <p className="mt-4 text-[13px] uppercase tracking-[0.18em] text-ink3">suggested</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {SHELF.slice(0, 8).map((s) => (
          <button
            key={s.url}
            onClick={() => onAdd({ title: s.name, url: s.url, doodle: s.doodle })}
            className="hd-soft bg-paper3/50 px-2 py-[2px] text-[14px] hover:bg-lime/40"
          >
            + {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- notes ---------------- */
const DRAWER_NOTE_COLORS = ["#fff2a8", "#ffc7d8", "#bdf3fb", "#d8f3b8", "#ffd9b8", "#ddd0ff"];

export function NotesPanel({ notes, setNotes, onGoStart }: { notes: Note[]; setNotes: (f: (p: Note[]) => Note[]) => void; onGoStart: () => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return notes;
    return notes.filter((n) => n.text.toLowerCase().includes(s));
  }, [notes, q]);
  const addNote = () =>
    setNotes((p) => [
      ...p,
      {
        id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        text: "",
        color: DRAWER_NOTE_COLORS[p.length % DRAWER_NOTE_COLORS.length],
        x: 10 + (p.length % 4) * 34,
        y: 44 + (p.length % 5) * 26,
        rot: Math.random() * 6 - 3,
        at: Date.now(),
      },
    ]);
  return (
    <div className="p-3">
      <p className="mb-2 text-[15px] italic text-ink2">
        sticky notes live on the new-tab page — drag them anywhere.{" "}
        <button onClick={onGoStart} className="underline decoration-wavy decoration-pink underline-offset-2">open it</button>
      </p>
      <div className="hd mb-3 flex items-center gap-2 bg-paper3/40 px-3 py-1.5">
        <Icon name="search" size={15} className="text-ink2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search notes…" className="flex-1 bg-transparent text-[16px] placeholder:text-ink3" />
        <button onClick={addNote} className="hd btn-sketch flex shrink-0 items-center gap-1 bg-yellow px-2 py-[2px] text-[14px] text-[#1a2440]" title="Stick a new note">
          <Icon name="plus" size={12} strokeWidth={2.6} /> note
        </button>
      </div>
      <div className="space-y-2">
        {shown.map((n) => (
          <div key={n.id} className="sticky-shadow border border-ink/20 p-2" style={{ background: n.color, transform: `rotate(${n.rot / 2}deg)`, color: "#1a2440" }}>
            <textarea
              value={n.text}
              onChange={(e) => setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)))}
              className="no-scrollbar h-[70px] w-full overflow-y-auto bg-transparent text-[19px] leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
              placeholder="…"
            />
            <div className="mt-1 flex items-center justify-between text-[13px]">
              <span className="flex gap-[3px]">
                {DRAWER_NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, color: c } : x)))}
                    className="h-[11px] w-[11px] rounded-full border border-ink/40 transition hover:scale-125"
                    style={{ background: c, outline: n.color === c ? "2px solid #1a2440" : "none", outlineOffset: 1 }}
                    title="Recolor note"
                  />
                ))}
              </span>
              <span className="opacity-60">{new Date(n.at).toLocaleDateString()}</span>
              <button onClick={() => setNotes((p) => p.filter((x) => x.id !== n.id))} className="opacity-60 hover:opacity-100" title="Delete note">
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
        ))}
        {!notes.length && <p className="p-4 text-center text-[16px] italic text-ink3">not a single note yet — stick one above</p>}
        {!!notes.length && !shown.length && <p className="p-4 text-center text-[16px] italic text-ink3">no notes match “{q}”</p>}
      </div>
    </div>
  );
}

/* ---------------- settings ---------------- */
export function SettingsPanel({
  settings, setSettings, counts, onWipe,
}: {
  settings: Settings;
  setSettings: (f: (p: Settings) => Settings) => void;
  counts: { history: number; bookmarks: number; notes: number; chats: number };
  onWipe: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  // The burn button stays armed for 3s only — a stale "tap once more" state
  // must not destroy the notebook without a fresh double-tap.
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirm]);
  return (
    <div className="space-y-5 p-3">
      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>search with</h3>
        <div className="grid gap-1.5">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              onClick={() => setSettings((s) => ({ ...s, engine: e.id }))}
              className={[
                "hd-soft flex items-center gap-2 p-2 text-left transition",
                settings.engine === e.id ? "bg-yellow/50 ink-shadow-sm" : "bg-paper3/40 hover:bg-paper3",
              ].join(" ")}
            >
              <span className={settings.engine === e.id ? "text-green" : "text-ink3"}>
                <Icon name={settings.engine === e.id ? "check" : "globe"} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] leading-tight">{e.name}</span>
                <span className="block truncate text-[13px] italic text-ink3">{e.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>default page view</h3>
        <div className="grid gap-1.5">
          {(
            [
              { id: "reader" as const, label: "Re-inked Reader (clean ink)", note: "fetch via relay, strip trackers, set in notebook ink", icon: "scissors" },
              { id: "original" as const, label: "Original Website (shielded HTML)", note: "keep original site CSS & layout with trackers stripped", icon: "shield" },
              { id: "live" as const, label: "Original Website (direct live frame)", note: "load URL directly inside a sandboxed iframe", icon: "globe" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setSettings((s) => ({ ...s, defaultView: v.id }))}
              className={[
                "hd-soft flex items-center gap-2 p-2 text-left transition",
                settings.defaultView === v.id ? "bg-cyan/40 ink-shadow-sm" : "bg-paper3/40 hover:bg-paper3",
              ].join(" ")}
            >
              <span className={settings.defaultView === v.id ? "text-ink" : "text-ink3"}>
                <Icon name={settings.defaultView === v.id ? "check" : v.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16.5px] leading-tight">{v.label}</span>
                <span className="block truncate text-[13px] italic text-ink3">{v.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>look &amp; feel</h3>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="mr-auto text-[16.5px]">tab layout</span>
          {(["top", "side"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSettings((s) => ({ ...s, tabsLayout: v }))}
              className={[
                "hd-soft flex items-center gap-1.5 px-2.5 py-1 text-[15px] transition",
                settings.tabsLayout === v ? "bg-yellow/60 ink-shadow-sm" : "bg-paper3/40 hover:bg-paper3",
              ].join(" ")}
            >
              <Icon name={v === "top" ? "layers" : "split"} size={15} />
              {v === "top" ? "top strip" : "side rail"}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          {[
            { k: "restoreSession" as const, label: "Restore last session", note: "reopen your tabs when you come back (ghost tabs never persist)", on: settings.restoreSession, fn: () => setSettings((s) => ({ ...s, restoreSession: !s.restoreSession })) },
            { k: "darkOriginal" as const, label: "Dark original pages", note: "night ink on the real site, images stay natural", on: settings.darkOriginal, fn: () => setSettings((s) => ({ ...s, darkOriginal: !s.darkOriginal })) },
            { k: "theme" as const, label: "Midnight ink", note: "swap daylight paper for a dark notebook", on: settings.theme === "night", fn: () => setSettings((s) => ({ ...s, theme: s.theme === "night" ? "day" : "night" })) },
            { k: "showBookmarkBar" as const, label: "Bookmarks bar", note: "the row of dog-ears under the address bar", on: settings.showBookmarkBar, fn: () => setSettings((s) => ({ ...s, showBookmarkBar: !s.showBookmarkBar })) },
            { k: "ambient" as const, label: "Ambient doodles", note: "slow-drifting ink sketches in the background", on: settings.ambient, fn: () => setSettings((s) => ({ ...s, ambient: !s.ambient })) },
          ].map((r) => (
            <button key={r.k} onClick={r.fn} className="hd-soft flex items-center gap-2 bg-paper3/40 p-2 text-left hover:bg-paper3">
              <span className="min-w-0 flex-1">
                <span className="block text-[16.5px] leading-tight">{r.label}</span>
                <span className="block text-[13px] italic text-ink3">{r.note}</span>
              </span>
              <span
                className="relative h-[20px] w-[38px] shrink-0 rounded-full border-2 border-ink transition-colors"
                style={{ background: r.on ? "var(--green)" : "var(--paper-3)" }}
              >
                <span className="absolute top-[1.5px] h-[13px] w-[13px] rounded-full border border-ink bg-paper2 transition-all" style={{ left: r.on ? "20px" : "2px" }} />
              </span>
            </button>
          ))}
          <div className="hd-soft flex items-center gap-3 bg-paper3/40 p-2">
            <span className="flex-1">
              <span className="block text-[16.5px] leading-tight">Reader type size</span>
              <span className="block text-[13px] italic text-ink3">applies to article text</span>
            </span>
            <input
              type="range" min={-1} max={4} step={1} value={settings.fontStep}
              onChange={(e) => setSettings((s) => ({ ...s, fontStep: Number(e.target.value) }))}
              className="w-[130px] accent-pink"
            />
            <span className="w-[40px] text-right text-[15px] tabular-nums text-ink2">{100 + settings.fontStep * 8}%</span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>what's stored here</h3>
        <div className="hd grid grid-cols-2 gap-px overflow-hidden bg-ink/15 p-px">
          {[
            ["history entries", counts.history],
            ["bookmarks", counts.bookmarks],
            ["margin notes", counts.notes],
            ["AI messages", counts.chats],
          ].map(([l, n]) => (
            <div key={String(l)} className="bg-paper2 px-3 py-2">
              <p className="text-[26px] leading-none tabular-nums" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{n as number}</p>
              <p className="text-[13px] uppercase tracking-wider text-ink3">{l}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => (confirm ? onWipe() : setConfirm(true))}
          className={[
            "hd btn-sketch mt-2 w-full px-3 py-1.5 text-[16px]",
            confirm ? "bg-red text-white" : "bg-paper2 hover:bg-red hover:text-white",
          ].join(" ")}
        >
          {confirm ? "tap once more — burn the whole notebook" : "burn the whole notebook"}
        </button>
      </section>
    </div>
  );
}

/* ---------------- shortcuts ---------------- */
const KEYS: [string, string][] = [
  ["Ctrl/⌘ + K", "command palette"],
  ["Ctrl/⌘ + T", "new tab"],
  ["Ctrl/⌘ + W", "close tab"],
  ["Ctrl/⌘ + L", "jump to the address bar"],
  ["Ctrl/⌘ + F", "find in this page"],
  ["Ctrl/⌘ + P", "save this page as PDF"],
  ["right-click a tab", "tab menu — close others / site, duplicate, mute"],
  ["Ctrl/⌘ + J", "toggle the AI margin"],
  ["Ctrl/⌘ + D", "bookmark this page"],
  ["Ctrl/⌘ + B", "bookmarks drawer"],
  ["Ctrl/⌘ + H", "history drawer"],
  ["Ctrl/⌘ + E", "reader / live toggle"],
  ["Ctrl/⌘ + ⇧ + S", "scribble overlay"],
  ["Ctrl/⌘ + ⇧ + G", "ghost mode"],
  ["Ctrl/⌘ + ⇧ + P", "shields on/off"],
  ["Ctrl/⌘ + ⇧ + X", "zap an element (original view)"],
  ["F5", "reload · F11 fullscreen · F12 devtools"],
  ["Alt + ← / →", "back / forward"],
  ["Alt + Home", "go home"],
  ["Ctrl/⌘ + +/−", "zoom in / out"],
  ["Ctrl/⌘ + 0", "reset zoom"],
  ["Ctrl/⌘ + Tab", "cycle tabs (⇧ = reverse)"],
  ["Ctrl/⌘ + ⇧ + T", "reopen the last closed tab"],
  ["Ctrl/⌘ + S", "save this page as HTML"],
  ["Ctrl/⌘ + L / F6 / Alt+D", "focus the address bar"],
  ["Ctrl/⌘ + N", "new window (fresh, no session restore)"],
  ["Ctrl/⌘ + U", "view page source"],
  ["Ctrl/⌘ + O", "open a local file"],
  ["hold ⏮ / ⏭", "this tab's history dropdown"],
  ["middle-click a tab", "close it"],
  ["Ctrl/⌘ + 1…9", "jump to tab (9 = last)"],
  ["Esc", "close anything that's open"],
];

export function ShortcutsPanel() {
  return (
    <div className="p-3">
      <p className="mb-3 text-[15px] italic text-ink2">everything has a two-key route. Learn four and you'll never touch the mouse again.</p>
      <div className="grid gap-1.5">
        {KEYS.map(([k, label]) => (
          <div key={k} className="flex items-center gap-2 border-b border-dashed border-ink/20 py-1.5">
            <kbd className="hd-soft shrink-0 bg-paper3/70 px-2 py-[1px] text-[13.5px] whitespace-nowrap">{k}</kbd>
            <span className="min-w-0 truncate text-[15.5px] text-ink2">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- downloads ---------------- */

const mb = (n: number) => (n > 0 ? `${(n / 1048576).toFixed(1)} MB` : "—");

export function DownloadsPanel({ items, onControl }: { items: DownloadItem[]; onControl?: (id: string, action: "pause" | "resume" | "cancel") => void }) {
  if (!items.length) {
    return (
      <p className="p-3 text-[16px] italic text-ink3">
        Nothing yet. Files land in your system Downloads folder and show up here while they download.
      </p>
    );
  }
  return (
    <ul className="space-y-2 p-3">
      {items.map((d) => (
        <li key={d.id} className="hd bg-paper2 p-2.5 text-ink">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15.5px]">{d.filename}</span>
              <span className="block text-[13px] italic text-ink3">
                {d.state === "downloading" ? `${mb(d.received)} / ${mb(d.total)}` : d.state === "completed" ? mb(d.total) : d.state}
              </span>
            </span>
            {(d.state === "downloading" || d.state === "paused") && onControl && (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onControl(d.id, d.state === "paused" ? "resume" : "pause")}
                  className="hd-soft btn-sketch bg-paper3/60 px-2 py-0.5 text-[13.5px] text-ink hover:bg-yellow"
                  title={d.state === "paused" ? "Resume download" : "Pause download"}
                >
                  {d.state === "paused" ? "resume" : "pause"}
                </button>
                <button
                  onClick={() => onControl(d.id, "cancel")}
                  className="hd-soft btn-sketch bg-paper3/60 px-2 py-0.5 text-[13.5px] text-ink3 hover:bg-pink hover:text-white"
                  title="Cancel download"
                >
                  cancel
                </button>
              </span>
            )}
            {d.state === "completed" && (
              <button
                onClick={() => void desktop?.showItem(d.path)}
                className="hd-soft btn-sketch bg-paper3/60 px-2 py-0.5 text-[13.5px] text-ink hover:bg-yellow"
                title="Show in your Downloads folder"
              >
                show ↗
              </button>
            )}
          </div>
          {d.state === "downloading" && d.total > 0 && (
            <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-pink transition-all" style={{ width: `${Math.min(100, (d.received / d.total) * 100)}%` }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
