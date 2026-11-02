import { useEffect, useMemo, useRef, useState } from "react";
import { BANGS, isUrl, parseBang, type SearchEngine } from "../lib/nav";
import { fetchSuggestions, getRecent } from "../lib/search";
import { EnginePicker } from "./EnginePicker";
import { Icon } from "./Icons";

type Item = { kind: "bang" | "suggest" | "recent"; label: string; sub: string; value: string };

/**
 * One search box for the whole browser: engine picker, bang autocomplete (type "!"),
 * live suggestions where an engine offers them, and recent searches everywhere.
 */
export function SearchBox({
  engine,
  onEngine,
  onSubmit,
  size = "lg",
  placeholder = "write a web address, a question, or a !bang…",
  initial = "",
  showEngine = true,
  showHints = true,
  autoFocus = false,
}: {
  engine: SearchEngine;
  onEngine?: (e: SearchEngine) => void;
  onSubmit: (text: string, engineId: string) => void;
  size?: "lg" | "md";
  placeholder?: string;
  initial?: string;
  showEngine?: boolean;
  showHints?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setText(initial), [initial]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const bang = parseBang(text);

  const bangMenu = useMemo(() => {
    if (!text.startsWith("!") || text.includes(" ")) return [];
    const stub = text.slice(1).toLowerCase();
    return BANGS.filter((b) => b.triggers.some((t) => t.startsWith(stub))).slice(0, 7);
  }, [text]);

  const recent = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q || text.startsWith("!") || isUrl(q)) return [];
    return getRecent()
      .filter((r) => r.toLowerCase().includes(q) && r.toLowerCase() !== q)
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, focused]);

  useEffect(() => {
    const q = text.trim();
    if (!focused || !q || q.startsWith("!") || isUrl(q)) {
      setRemote([]);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      fetchSuggestions(engine.id, q, ac.signal)
        .then((list) => setRemote(list))
        .catch(() => setRemote([]));
    }, 180);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [text, focused, engine.id]);

  const items: Item[] = bangMenu.length
    ? bangMenu.map((b) => ({ kind: "bang", label: `!${b.triggers[0]}`, sub: b.label, value: `!${b.triggers[0]} ` }))
    : [
        ...remote.map((s) => ({ kind: "suggest" as const, label: s, sub: `${engine.short} suggests`, value: s })),
        ...recent.map((s) => ({ kind: "recent" as const, label: s, sub: "recent search", value: s })),
      ].slice(0, 8);

  const open = focused && items.length > 0;

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v, engine.id);
    setFocused(false);
    setHi(-1);
    input.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocused(true);
      setHi((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(-1, h - 1));
    } else if (e.key === "Escape") {
      setFocused(false);
      setHi(-1);
      input.current?.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = hi >= 0 ? items[hi] : undefined;
      if (pick && pick.kind === "bang") {
        setText(pick.value);
        setHi(-1);
      } else if (pick) {
        submit(pick.value);
      } else {
        submit(text);
      }
    }
  };

  const bigText = size === "lg";

  return (
    <div className="relative w-full min-w-0">
      <div
        className={["hd flex min-w-0 items-center gap-2 bg-paper2 text-ink ink-shadow", bigText ? "px-4 py-3" : "px-3 py-2"].join(" ")}
      >
        <Icon name="search" size={bigText ? 22 : 18} className="shrink-0 text-pink" />
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setHi(-1);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onKeyDown={onKey}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search or enter an address"
          className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink3/80"
          style={{ fontFamily: "var(--font-display)", fontSize: bigText ? 22 : 18 }}
        />
        {bang && bang.query && (
          <span className="hidden max-w-[180px] shrink-0 truncate rounded-full border border-ink/50 bg-yellow/70 px-2 py-[1px] text-[13px] text-[#1a2440] md:inline">
            → {bang.bang.label}
          </span>
        )}
        {showEngine && onEngine && <EnginePicker engine={engine} onChange={onEngine} compact={!bigText} align="right" />}
        <button
          type="button"
          onClick={() => submit(text)}
          className={["hd btn-sketch shrink-0 bg-yellow text-[#1a2440]", bigText ? "px-3 py-1 text-[17px]" : "px-2.5 py-0.5 text-[15px]"].join(" ")}
        >
          go →
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          className="pop-in absolute left-0 right-0 top-[calc(100%+6px)] z-50 border-2 border-ink bg-paper2 text-ink ink-shadow-lg"
          style={{ borderRadius: "14px 4px 16px 4px / 4px 16px 4px 14px" }}
        >
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.value}-${i}`}
              type="button"
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                if (it.kind === "bang") {
                  setText(it.value);
                  setHi(-1);
                } else {
                  submit(it.value);
                }
              }}
              className={["flex w-full min-w-0 items-center gap-3 px-3 py-1.5 text-left", i === hi ? "bg-yellow text-[#1a2440]" : "hover:bg-paper3"].join(" ")}
            >
              <Icon name={it.kind === "bang" ? "zap" : it.kind === "recent" ? "history" : "search"} size={14} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px]">{it.label}</span>
                <span className={["block truncate text-[12.5px] italic", i === hi ? "text-[#1a2440]/75" : "text-ink3"].join(" ")}>{it.sub}</span>
              </span>
            </button>
          ))}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 border-t border-dashed border-ink/25 bg-paper3/60 px-3 py-1 text-[12px] text-ink3">
            <span className="truncate">↑↓ move · ↵ search · esc close</span>
          </div>
        </div>
      )}

      {showHints && bigText && (
        <p className="mt-2 px-1 text-[13.5px] italic text-ink3">
          tip: <b className="not-italic text-ink2">!yt</b> videos · <b className="not-italic text-ink2">!w</b> wikipedia ·{" "}
          <b className="not-italic text-ink2">!gh</b> github · <b className="not-italic text-ink2">!mdn</b> docs · <b className="not-italic text-ink2">!r</b> reddit — results stay in Quill
        </p>
      )}
    </div>
  );
}
