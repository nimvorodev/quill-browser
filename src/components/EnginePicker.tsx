import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ENGINES, type SearchEngine } from "../lib/nav";
import { Icon } from "./Icons";

/** Round engine badge. Yellow means results read here; paper means the engine opens its own site. */
export function EngineGlyph({ engine, size = 26 }: { engine: SearchEngine; size?: number }) {
  return (
    <span
      className={[
        "grid shrink-0 place-items-center rounded-full border-2 border-ink text-[11px] font-bold text-[#1a2440]",
        engine.mode === "results" ? "bg-yellow" : "bg-paper3",
      ].join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {engine.short}
    </span>
  );
}

/**
 * Hand-drawn engine menu. A native <select> ignores our theme in dark mode (white list, light text),
 * so the menu is drawn here with the app's own ink and paper.
 */
export function EnginePicker({
  engine,
  onChange,
  dropUp = false,
  compact = false,
  align = "left",
}: {
  engine: SearchEngine;
  onChange: (e: SearchEngine) => void;
  dropUp?: boolean;
  compact?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[hi]?.focus();
  }, [open, hi]);

  const openMenu = () => {
    setHi(Math.max(0, ENGINES.findIndex((e) => e.id === engine.id)));
    setOpen(true);
  };

  const pick = (e: SearchEngine) => {
    onChange(e);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKey = (ev: ReactKeyboardEvent) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setHi((h) => Math.min(ENGINES.length - 1, h + 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      pick(ENGINES[hi]);
    } else if (ev.key === "Escape" || ev.key === "Tab") {
      setOpen(false);
      trigger.current?.focus();
    }
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="hd-soft btn-sketch flex max-w-[190px] items-center gap-1.5 bg-paper3 px-2 py-1 text-[15px] text-ink"
        title={`Search with ${engine.name} — ${engine.mode === "results" ? "reads here" : "opens its site"}`}
      >
        <EngineGlyph engine={engine} size={20} />
        <span className="truncate">{compact ? engine.short : engine.name}</span>
        <Icon name="chevronDown" size={12} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open && (
        <div
          ref={menu}
          role="listbox"
          aria-label="Search engines"
          onKeyDown={onKey}
          className={[
            "pop-in no-scrollbar absolute z-[80] max-h-[min(420px,55vh)] w-[272px] overflow-y-auto border-2 border-ink bg-paper2 text-ink ink-shadow-lg",
            dropUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
          style={{ borderRadius: "16px 5px 18px 5px / 5px 18px 5px 16px" }}
        >
          {ENGINES.map((e, i) => {
            const on = e.id === engine.id;
            const section = e.mode === "results" ? "reads here" : "opens its own site";
            const groupHead = i === 0 || ENGINES[i - 1].mode !== e.mode ? section : null;
            return (
              <div key={e.id}>
                {groupHead && (
                  <p className="border-t border-dashed border-ink/25 px-3 pb-0.5 pt-2 text-[11px] uppercase tracking-[0.16em] text-ink3">
                    {groupHead}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  tabIndex={i === hi ? 0 : -1}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(e)}
                  className={[
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition",
                    i === hi ? "bg-yellow text-[#1a2440]" : "text-ink hover:bg-paper3",
                  ].join(" ")}
                >
                  <EngineGlyph engine={e} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[16px] leading-tight">
                      {e.name}
                      {on && <span className="text-[12px]">✓</span>}
                    </span>
                    <span className={["block truncate text-[12.5px] italic", i === hi ? "text-[#1a2440]/75" : "text-ink3"].join(" ")}>
                      {e.note}
                    </span>
                  </span>
                  <span
                    className={[
                      "shrink-0 rounded-full border px-1.5 text-[10.5px] uppercase tracking-wide",
                      i === hi ? "border-[#1a2440]/60 text-[#1a2440]" : "border-ink/40 text-ink3",
                    ].join(" ")}
                  >
                    {e.mode === "results" ? "in-app" : "site ↗"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
