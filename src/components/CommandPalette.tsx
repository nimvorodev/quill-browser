import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";

export type Command = {
  id: string;
  label: string;
  section: string;
  icon: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};

function score(q: string, s: string) {
  if (!q) return 1;
  const hay = s.toLowerCase();
  const needle = q.toLowerCase();
  if (hay.startsWith(needle)) return 100;
  const idx = hay.indexOf(needle);
  if (idx >= 0) return 80 - idx * 0.4;
  let hi = 0;
  let sc = 0;
  let streak = 0;
  for (const ch of needle) {
    const found = hay.indexOf(ch, hi);
    if (found < 0) return -1;
    streak = found === hi ? streak + 1 : 0;
    sc += 2 + streak;
    hi = found + 1;
  }
  return sc;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHi(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: Math.max(score(q, c.label), score(q, c.keywords || ""), score(q, c.section) - 6) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 24);
    return scored.map((x) => x.c);
  }, [q, commands]);

  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((h) => Math.min(h + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const c = results[hi];
        if (c) {
          c.run();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, hi, onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  if (!open) return null;

  let lastSection = "";

  return (
    <div
      className="no-drag fixed inset-0 z-[90] flex items-start justify-center bg-ink/35 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pop-in w-full max-w-[620px] border-2 border-ink bg-paper2 ink-shadow-lg">
        <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
          <Icon name="search" size={22} className="text-pink" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="what shall we do?"
            className="flex-1 bg-transparent text-[28px] leading-none placeholder:text-ink3/70"
            style={{ fontFamily: "var(--font-display)" }}
          />
          <kbd className="hd-soft bg-paper3/60 px-1.5 text-[12px] text-ink3">esc</kbd>
        </div>
        <div ref={listRef} className="no-scrollbar max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-[17px] italic text-ink3">
              nothing matches “{q}” — try “ghost”, “reader”, “ai”, “erase”…
            </p>
          )}
          {results.map((c, i) => {
            const head = c.section !== lastSection ? c.section : null;
            lastSection = c.section;
            return (
              <div key={c.id}>
                {head && (
                  <p className="px-4 pb-1 pt-3 text-[12px] uppercase tracking-[0.2em] text-ink3">{head}</p>
                )}
                <button
                  data-i={i}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => {
                    c.run();
                    onClose();
                  }}
                  className={[
                    "flex w-full items-center gap-3 px-4 py-2 text-left transition",
                    i === hi ? "bg-yellow/45" : "hover:bg-paper3/50",
                  ].join(" ")}
                >
                  <span className={i === hi ? "text-pink" : "text-ink2"}>
                    <Icon name={c.icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px]">{c.label}</span>
                    {c.hint && <span className="block truncate text-[13px] italic text-ink3">{c.hint}</span>}
                  </span>
                  {i === hi && <span className="text-[13px] text-ink3">↵</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-dashed border-ink/30 px-4 py-2 text-[13px] text-ink3">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span className="ml-auto italic">{commands.length} things Quill can do</span>
        </div>
      </div>
    </div>
  );
}
