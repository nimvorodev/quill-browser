import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";
import { HOME, bangUrl, hostOf, isUrl, parseBang, parseSearchUrl, prettyUrl, type SearchEngine } from "../lib/nav";
import { parseVideo } from "../lib/video";
import { parseGitHub } from "../lib/github";
import { EnginePicker } from "./EnginePicker";
import type { Bookmark, HistoryEntry, OriginalSubMode, Tab, ViewMode } from "../lib/store";

type Sug = { kind: "history" | "bookmark" | "shelf" | "search" | "url"; title: string; url: string; sub?: string };

export function Toolbar({
  tab,
  input,
  setInput,
  onSubmit,
  onSetView,
  onBack,
  onForward,
  onReload,
  onHome,
  onBookmark,
  bookmarked,
  engine,
  onEngine,
  ghost,
  onGhost,
  shieldsOn,
  onShields,
  aiOpen,
  onAI,
  onPalette,
  onPanel,
  onScribble,
  zoom,
  setZoom,
  history,
  bookmarks,
  shelf,
  queued,
  onReadLater,
}: {
  tab: Tab;
  input: string;
  setInput: (s: string) => void;
  onSubmit: (mode?: ViewMode, override?: string) => void;
  onSetView: (view: ViewMode, origSub?: OriginalSubMode) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onBookmark: () => void;
  bookmarked: boolean;
  engine: SearchEngine;
  onEngine: (e: SearchEngine) => void;
  ghost: boolean;
  onGhost: () => void;
  shieldsOn: boolean;
  onShields: () => void;
  aiOpen: boolean;
  onAI: () => void;
  onPalette: () => void;
  onPanel: (p: string) => void;
  onScribble: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  shelf: { name: string; url: string; blurb: string }[];
  queued: boolean;
  onReadLater: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  // -1 = no suggestion selected: Enter submits the raw input (a search).
  // Anything else hijacks the keystroke into the first URL suggestion.
  const [hi, setHi] = useState(-1);
  const [menu, setMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") {
        setOpen(false);
        setMenu(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
      if (!menuRef.current?.contains(target)) setMenu(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  useEffect(() => setHi(-1), [input]);

  const sugs = useMemo<Sug[]>(() => {
    const q = input.trim().toLowerCase();
    if (!q) {
      return [
        ...bookmarks.slice(0, 4).map((b) => ({ kind: "bookmark" as const, title: b.title, url: b.url, sub: hostOf(b.url) })),
        ...history.slice(0, 4).map((h) => ({ kind: "history" as const, title: h.title || hostOf(h.url), url: h.url, sub: hostOf(h.url) })),
      ];
    }
    const out: Sug[] = [];
    if (isUrl(q)) {
      const display = /^(https?:|quill:)/i.test(q) ? q : `https://${q}`;
      out.push({ kind: "url", title: display, url: input.trim(), sub: "go straight there" });
    }
    const seen = new Set<string>();
    const add = (arr: Sug[]) =>
      arr.forEach((s) => {
        if (!seen.has(s.url) && out.length < 9) {
          seen.add(s.url);
          out.push(s);
        }
      });
    add(bookmarks.filter((b) => (b.title + b.url).toLowerCase().includes(q)).map((b) => ({ kind: "bookmark", title: b.title, url: b.url, sub: hostOf(b.url) })));
    add(history.filter((h) => (h.title + h.url).toLowerCase().includes(q)).map((h) => ({ kind: "history", title: h.title || hostOf(h.url), url: h.url, sub: hostOf(h.url) })));
    add(shelf.filter((s) => (s.name + s.blurb).toLowerCase().includes(q)).map((s) => ({ kind: "shelf", title: s.name, url: s.url, sub: s.blurb })));
    if (q.startsWith("!")) {
      const bang = parseBang(input);
      if (bang && bang.query) {
        out.push({
          kind: "search",
          title: `${input.trim()} → ${bang.bang.label}`,
          url: bangUrl(bang.bang, bang.query),
          sub: "bang shortcut — runs inside Quill",
        });
      } else {
        out.push({
          kind: "search",
          title: `${q} → pick a bang`,
          url: input.trim(),
          sub: "!w, !gh, !yt, !mdn, !r … then your words",
        });
      }
    }
    out.push({ kind: "search", title: input.trim(), url: engine.url(input.trim()), sub: `search with ${engine.name}` });
    return out.slice(0, 10);
  }, [input, bookmarks, history, shelf, engine]);

  const pick = (s?: Sug) => {
    if (!s) return;
    setInput(s.url);
    setOpen(false);
    inputRef.current?.blur();
    onSubmit(undefined, s.url);
  };

  const secure = tab.url.startsWith("https://") || tab.url.startsWith("quill://");
  const isOrig = tab.view === "original" || tab.view === "live";
  const unfocusedValue = tab.url === HOME ? "" : prettyUrl(tab.url);

  // z-30: the suggestion dropdown must paint above the bookmark bar (also z-20, later in DOM).
  return (
    <div className="relative z-30 flex items-center gap-2 border-b-2 border-ink bg-paper2/80 px-2 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-1">
        {[
          { icon: "back", fn: onBack, off: tab.idx <= 0, title: "Back (Alt+←)", cls: "grid" },
          { icon: "forward", fn: onForward, off: tab.idx >= tab.stack.length - 1, title: "Forward (Alt+→)", cls: "hidden sm:grid" },
          { icon: "reload", fn: onReload, title: "Reload (Ctrl/Cmd+R)", spin: tab.loading, cls: "grid" },
          { icon: "home", fn: onHome, title: "Home (Alt+Home)", cls: "hidden md:grid" },
        ].map((b) => (
          <button
            key={b.icon}
            onClick={b.fn}
            disabled={b.off}
            title={b.title}
            className={[
              `btn-sketch ${b.cls} h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-2 border-ink transition`,
              b.off ? "border-ink3/40 text-ink3/50" : "bg-paper2 text-ink hover:bg-yellow",
            ].join(" ")}
          >
            <Icon name={b.icon} size={18} className={b.spin ? "spin-slow" : ""} />
          </button>
        ))}
      </div>

      {/* address bar */}
      <div ref={wrapRef} className="relative min-w-0 flex-1">
        <div
          className={[
            "flex h-[38px] items-center gap-2 border-b-[2.5px] px-3 transition-all",
            focused ? "border-pink bg-paper2" : "border-ink/70 bg-paper3/50 hover:bg-paper2/80",
          ].join(" ")}
          style={{ borderRadius: "18px 4px 20px 4px / 4px 20px 4px 18px" }}
        >
          <span
            className={ghost ? "text-violet" : secure ? "text-green" : "text-orange"}
            title={ghost ? "Ghost tab — no history recorded" : secure ? "Encrypted" : "Not encrypted"}
          >
            <Icon name={ghost ? "ghost" : secure ? "lock" : "shieldOff"} size={16} />
          </span>
          <input
            ref={inputRef}
            value={focused ? input : unfocusedValue}
            onFocus={() => {
              const current = tab.url === HOME ? "" : tab.url;
              setInput(current);
              setFocused(true);
              setOpen(true);
              requestAnimationFrame(() => inputRef.current?.select());
            }}
            onBlur={() =>
              setTimeout(() => {
                // Focus moved into the dropdown itself (e.g. the engine picker) — keep it open.
                if (wrapRef.current?.contains(document.activeElement)) return;
                setFocused(false);
                setOpen(false);
                setInput(tab.url === HOME ? "" : tab.url);
              }, 130)
            }
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, sugs.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, -1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (open && hi >= 0 && sugs[hi]) pick(sugs[hi]);
                else {
                  setOpen(false);
                  inputRef.current?.blur();
                  onSubmit(undefined);
                }
              }
            }}
            placeholder="type a URL, or write what you're looking for…"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[17px] tracking-wide placeholder:text-ink3/80"
          />

          {/* Instant Page View Switcher: Re-inked / Original Website / Split */}
          {tab.view !== "start" && !parseSearchUrl(tab.url) && !parseVideo(tab.url) && !parseGitHub(tab.url) && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => onSetView("reader")}
                className={[
                  "hd-soft btn-sketch flex items-center gap-1 px-2 py-[1.5px] text-[13.5px]",
                  tab.view === "reader" ? "bg-yellow font-bold text-[#1a2440]" : "bg-paper2 text-ink2 hover:bg-yellow/50",
                ].join(" ")}
                title="Re-inked Reader: stripped of trackers & reset in clean ink (Ctrl/Cmd+E)"
              >
                <Icon name="scissors" size={12} /> <span className="hidden md:inline">re-ink</span>
              </button>
              <button
                onClick={() => onSetView("original")}
                className={[
                  "hd-soft btn-sketch flex items-center gap-1 px-2 py-[1.5px] text-[13.5px]",
                  isOrig ? "bg-cyan font-bold text-[#12171f]" : "bg-paper2 text-ink2 hover:bg-cyan/50",
                ].join(" ")}
                title="Show the Original Website (Shielded HTML, Interactive HTML, or Direct Live Frame)"
              >
                <Icon name="globe" size={12} /> <span className="hidden sm:inline">original</span>
              </button>
              <button
                onClick={() => onSetView(tab.view === "split" ? "reader" : "split")}
                className={[
                  "hd-soft btn-sketch hidden items-center gap-1 px-1.5 py-[1.5px] text-[13.5px] xl:flex",
                  tab.view === "split" ? "bg-lime font-bold text-[#12171f]" : "bg-paper2 text-ink2 hover:bg-lime/50",
                ].join(" ")}
                title="Split View: Re-inked + Original Website side-by-side"
              >
                <Icon name="split" size={12} />
              </button>
            </div>
          )}

          <button
            onClick={onReadLater}
            className="transition hover:scale-125"
            title={queued ? "Remove from the read-later queue" : "Read later — saved to the start page queue"}
          >
            <Icon
              name="clock"
              size={17}
              fill={queued ? "var(--cyan)" : "none"}
              className={queued ? "text-cyan" : "text-ink2 hover:text-cyan"}
              strokeWidth={queued ? 1.4 : 1.9}
            />
          </button>
          <button
            onClick={onBookmark}
            className="transition hover:scale-125"
            title={bookmarked ? "Remove bookmark" : "Bookmark this page (Ctrl/Cmd+D)"}
          >
            <Icon
              name="star"
              size={18}
              fill={bookmarked ? "var(--yellow)" : "none"}
              className={bookmarked ? "text-yellow" : "text-ink2 hover:text-yellow"}
              strokeWidth={bookmarked ? 1.2 : 1.9}
            />
          </button>
        </div>

        {open && sugs.length > 0 && (
          <div className="pop-in absolute left-0 right-0 top-[44px] z-50 border-2 border-ink bg-paper2 text-ink ink-shadow-lg">
            {sugs.map((s, i) => (
              <button
                key={s.url + i}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={[
                  "flex w-full items-center gap-3 px-3 py-[7px] text-left transition",
                  i === hi ? "bg-yellow/40" : "hover:bg-paper3/60",
                ].join(" ")}
              >
                <span className="text-ink2">
                  <Icon
                    name={
                      s.kind === "bookmark"
                        ? "star"
                        : s.kind === "history"
                          ? "history"
                          : s.kind === "shelf"
                            ? "book"
                            : s.kind === "url"
                              ? "globe"
                              : "search"
                    }
                    size={15}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px]">{s.title}</span>
                  {s.sub && <span className="block truncate text-[13px] text-ink3">{s.sub}</span>}
                </span>
                {i === hi && <span className="text-[12px] text-ink3">↵</span>}
              </button>
            ))}
            <div className="flex items-center gap-2 border-t border-dashed border-ink/30 bg-paper3/70 px-3 py-1.5 text-[13px] text-ink2">
              <EnginePicker engine={engine} onChange={onEngine} compact />
              <span className="ml-auto hidden sm:inline">↑↓ to move · !bang works</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onGhost}
          title={ghost ? "Leave ghost mode" : "Ghost mode — this tab writes no history"}
          className={[
            "btn-sketch hd grid h-[34px] w-[34px] shrink-0 place-items-center",
            ghost ? "bg-violet text-white" : "bg-paper2 text-ink hover:bg-violet hover:text-white",
          ].join(" ")}
        >
          <Icon name="ghost" size={17} />
        </button>
        <button
          onClick={onShields}
          title="Shields & blocked-request ledger"
          className={[
            "btn-sketch hd relative grid h-[34px] w-[34px] shrink-0 place-items-center",
            shieldsOn ? "bg-lime text-[#12171f]" : "bg-paper2 text-red",
          ].join(" ")}
        >
          <Icon name={shieldsOn ? "shield" : "shieldOff"} size={17} />
          {tab.blocked.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full border border-ink bg-pink px-1 text-[11px] font-bold text-white">
              {tab.blocked.length}
            </span>
          )}
        </button>
        <button
          onClick={onScribble}
          title="Scribble on the page with a marker"
          className="btn-sketch hd hidden h-[34px] w-[34px] shrink-0 place-items-center bg-paper2 text-ink hover:bg-pink hover:text-white lg:grid"
        >
          <Icon name="marker" size={17} />
        </button>
        <button
          onClick={onAI}
          title="AI sidekick (Ctrl/Cmd+J)"
          className={[
            "btn-sketch hd flex h-[34px] items-center gap-1.5 px-3",
            aiOpen ? "bg-pink text-white" : "bg-paper2 text-ink hover:bg-pink hover:text-white",
          ].join(" ")}
        >
          <Icon name="spark" size={17} />
          <span className="hidden text-[15px] lg:inline">ask AI</span>
        </button>
        <button
          onClick={onPalette}
          title="Command palette (Ctrl/Cmd+K)"
          className="btn-sketch hd hidden h-[34px] w-[34px] shrink-0 items-center justify-center bg-paper2 text-ink2 hover:bg-yellow hover:text-ink sm:flex"
        >
          <Icon name="zap" size={16} />
        </button>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => {
              setMenu((m) => !m);
              setOpen(false);
            }}
            title="More options & original website views"
            className="btn-sketch hd grid h-[34px] w-[34px] place-items-center bg-paper2 text-ink hover:bg-yellow"
          >
            <Icon name="dots" size={17} strokeWidth={2.6} />
          </button>
          {menu && (
            <div className="pop-in absolute right-0 top-[40px] z-50 w-[264px] border-2 border-ink bg-paper2 ink-shadow-lg">
              {tab.view !== "start" && (
                <div className="border-b border-dashed border-ink/30 bg-paper3/30 py-1">
                  <p className="px-3 py-0.5 text-[11.5px] uppercase tracking-[0.16em] text-ink3">page view</p>
                  {[
                    { label: "Re-inked clean reader", icon: "scissors", active: tab.view === "reader", fn: () => onSetView("reader") },
                    {
                      label: "Original · shielded HTML",
                      icon: "shield",
                      active: isOrig && tab.originalMode === "shielded",
                      fn: () => onSetView("original", "shielded"),
                    },
                    {
                      label: "Original · interactive HTML",
                      icon: "zap",
                      active: isOrig && tab.originalMode === "raw",
                      fn: () => onSetView("original", "raw"),
                    },
                    {
                      label: "Original · direct live frame",
                      icon: "globe",
                      active: isOrig && tab.originalMode === "live",
                      fn: () => onSetView("original", "live"),
                    },
                    { label: "Split: Re-inked + Original", icon: "split", active: tab.view === "split", fn: () => onSetView("split") },
                  ].map((v) => (
                    <button
                      key={v.label}
                      onClick={() => {
                        v.fn();
                        setMenu(false);
                      }}
                      className={[
                        "flex w-full items-center gap-2.5 px-3 py-[6px] text-left text-[15px] transition",
                        v.active ? "bg-yellow/50 font-bold" : "hover:bg-yellow/35",
                      ].join(" ")}
                    >
                      <Icon name={v.icon} size={15} />
                      <span className="flex-1">{v.label}</span>
                      {v.active && <span className="text-[12px]">✓</span>}
                    </button>
                  ))}
                </div>
              )}

              {[
                { label: "History", icon: "history", fn: () => onPanel("history") },
                { label: "Bookmarks", icon: "book", fn: () => onPanel("bookmarks") },
                { label: "Margin notes", icon: "note", fn: () => onPanel("notes") },
                { label: "Shields & privacy", icon: "shield", fn: () => onPanel("privacy") },
                { label: "Downloads", icon: "download", fn: () => onPanel("downloads") },
                { label: "Scribble overlay", icon: "marker", fn: onScribble },
                { label: "Settings", icon: "gear", fn: () => onPanel("settings") },
                { label: "Keyboard shortcuts", icon: "keyboard", fn: () => onPanel("shortcuts") },
              ].map((m) => (
                <button
                  key={m.label}
                  onClick={() => {
                    m.fn();
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[16px] transition hover:bg-yellow/40"
                >
                  <Icon name={m.icon} size={16} /> {m.label}
                </button>
              ))}
              <div className="flex items-center gap-2 border-t border-dashed border-ink/30 px-3 py-2">
                <span className="text-[14px] text-ink2">zoom</span>
                <button onClick={() => setZoom(Math.max(70, zoom - 10))} className="hd grid h-[24px] w-[24px] place-items-center bg-paper3/60 hover:bg-yellow">
                  <Icon name="minus" size={13} />
                </button>
                <span className="w-[42px] text-center text-[15px] tabular-nums">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(160, zoom + 10))} className="hd grid h-[24px] w-[24px] place-items-center bg-paper3/60 hover:bg-yellow">
                  <Icon name="plus" size={13} />
                </button>
                <button onClick={() => setZoom(100)} className="ml-auto text-[13px] text-ink3 underline decoration-dotted hover:text-ink">
                  reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Little hand-drawn bookmarks bar. */
export function BookmarkBar({
  bookmarks,
  onOpen,
  onRemove,
  editing,
}: {
  bookmarks: Bookmark[];
  onOpen: (url: string) => void;
  onRemove: (url: string) => void;
  editing: boolean;
}) {
  if (!bookmarks.length) return null;
  return (
    <div className="no-scrollbar relative z-20 flex items-center gap-1.5 overflow-x-auto border-b border-dashed border-ink/25 bg-paper3/40 px-3 py-1">
      <span className="shrink-0 pr-1 text-[13px] italic text-ink3">dog-eared:</span>
      {bookmarks.map((b) => (
        <span
          key={b.url}
          className="group flex shrink-0 items-center gap-1 border border-transparent px-1.5 py-[1px] text-[15px] transition hover:border-ink/40 hover:bg-yellow/40"
          style={{ borderRadius: "10px 3px 12px 3px / 3px 12px 3px 10px" }}
        >
          <button onClick={() => onOpen(b.url)} className="flex items-center gap-1">
            <Icon name={b.doodle || "star"} size={13} className="text-ink2" />
            {b.title}
          </button>
          {/* Un-bookmark straight from the bar: shows on hover (always visible while editing). */}
          <button
            onClick={() => onRemove(b.url)}
            className={["text-ink3 transition hover:text-red", editing ? "" : "opacity-0 group-hover:opacity-100"].join(" ")}
            title="Remove bookmark"
            aria-label={`Remove bookmark ${b.title}`}
          >
            <Icon name="close" size={11} strokeWidth={2.6} />
          </button>
        </span>
      ))}
    </div>
  );
}
