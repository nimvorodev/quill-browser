import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "./Icons";
import { NOTE_DEFAULT_H, NOTE_DEFAULT_W, NOTE_MAX_H, NOTE_MAX_W, NOTE_MIN_H, NOTE_MIN_W, type Note } from "../lib/store";

export const NOTE_COLORS = ["#fff2a8", "#ffc7d8", "#bdf3fb", "#d8f3b8", "#ffd9b8", "#ddd0ff"];

/** The ink colour that stays readable on every paper colour above. */
const NOTE_INK = "#1a2440";

export interface StickyNoteProps {
  note: Note;
  /** The element the note is positioned inside. Used to clamp drag & resize. */
  boardRef: React.RefObject<HTMLElement | null>;
  zIndex: number;
  onChange: (patch: Partial<Note>) => void;
  onDelete: () => void;
  onFront: () => void;
  /** Toggle between living on the start page and floating over the window. */
  onTogglePlace?: () => void;
  /** Called when a drag ends, with the pointer position (for drop targets). */
  onDragEnd?: (clientX: number, clientY: number) => void;
  /** Set when the parent layer is pointer-events:none, so the card re-enables them. */
  interactive?: boolean;
}

type Gesture =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "resize"; startX: number; startY: number; w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function StickyNote({ note, boardRef, zIndex, onChange, onDelete, onFront, onTogglePlace, onDragEnd, interactive }: StickyNoteProps) {
  const w = note.w ?? NOTE_DEFAULT_W;
  const h = note.folded ? 44 : (note.h ?? NOTE_DEFAULT_H);
  const gesture = useRef<Gesture | null>(null);
  const raf = useRef(0);
  const pending = useRef<Partial<Note> | null>(null);
  const [active, setActive] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const flush = () => {
    raf.current = 0;
    const p = pending.current;
    pending.current = null;
    if (p) onChange(p);
  };
  const queue = (p: Partial<Note>) => {
    pending.current = { ...(pending.current || {}), ...p };
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  const bounds = () => {
    const b = boardRef.current?.getBoundingClientRect();
    return b ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const b = bounds();
    if (g.kind === "move") {
      const x = clamp(e.clientX - b.left - g.dx, 0, Math.max(0, b.width - 48));
      const y = clamp(e.clientY - b.top - g.dy, 0, Math.max(0, b.height - 32));
      queue({ x: Math.round(x), y: Math.round(y) });
    } else {
      const nw = clamp(g.w + (e.clientX - g.startX), NOTE_MIN_W, Math.min(NOTE_MAX_W, b.width - note.x));
      const nh = clamp(g.h + (e.clientY - g.startY), NOTE_MIN_H, Math.min(NOTE_MAX_H, b.height - note.y));
      queue({ w: Math.round(nw), h: Math.round(nh) });
    }
  };
  const onUp = (e: PointerEvent) => {
    const was = gesture.current;
    gesture.current = null;
    setActive(false);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      flush();
    }
    if (was?.kind === "move") onDragEnd?.(e.clientX, e.clientY);
  };
  const begin = (g: Gesture) => {
    gesture.current = g;
    setActive(true);
    onFront();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startMove = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    begin({ kind: "move", dx: e.clientX - r.left, dy: e.clientY - r.top });
  };
  const startResize = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture so the gesture keeps tracking even when the pointer outruns the 16px handle.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* unsupported */
    }
    begin({ kind: "resize", startX: e.clientX, startY: e.clientY, w, h: note.h ?? NOTE_DEFAULT_H });
  };

  // Arrow keys nudge the note when its header is focused.
  const onHeaderKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 4;
    const b = bounds();
    if (e.key === "ArrowLeft") onChange({ x: clamp(note.x - step, 0, b.width - 48) });
    else if (e.key === "ArrowRight") onChange({ x: clamp(note.x + step, 0, b.width - 48) });
    else if (e.key === "ArrowUp") onChange({ y: clamp(note.y - step, 0, b.height - 32) });
    else if (e.key === "ArrowDown") onChange({ y: clamp(note.y + step, 0, b.height - 32) });
    else if (e.key === "Delete" || e.key === "Backspace") onDelete();
    else return;
    e.preventDefault();
  };

  const firstLine = note.text.split("\n")[0] || "…";

  return (
    <div
      ref={cardRef}
      data-note-card
      className={["sticky-shadow absolute flex flex-col border border-ink/25", active ? "transition-none" : "transition-[box-shadow] duration-150"].join(" ")}
      style={{
        left: note.x,
        top: note.y,
        width: w,
        height: h,
        background: note.color,
        color: NOTE_INK,
        transform: `rotate(${active ? 0 : note.rot}deg)`,
        zIndex,
        boxShadow: active ? "6px 10px 22px rgba(26,36,64,.32)" : undefined,
        touchAction: "none",
        pointerEvents: interactive ? "auto" : undefined,
      }}
    >
      {/* grab bar */}
      <div
        tabIndex={0}
        role="toolbar"
        aria-label="Sticky note controls"
        onPointerDown={startMove}
        onKeyDown={onHeaderKey}
        className="flex shrink-0 cursor-grab select-none items-center justify-between gap-1 px-2 pt-1.5 outline-none focus-visible:ring-2 focus-visible:ring-pink active:cursor-grabbing"
      >
        <span className="flex gap-[3px]">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onChange({ color: c })}
              className="h-[10px] w-[10px] rounded-full border border-ink/40 transition hover:scale-125"
              style={{ background: c, outline: note.color === c ? `2px solid ${NOTE_INK}` : "none", outlineOffset: 1 }}
              title="Recolour"
              aria-label={`Colour ${c}`}
            />
          ))}
        </span>
        <span className="flex items-center gap-0.5">
          {onTogglePlace && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onTogglePlace}
              className="grid h-[18px] w-[18px] place-items-center rounded text-ink/60 hover:bg-ink/10 hover:text-ink"
              title={note.place === "window" ? "Pin back to the start page" : "Float over the whole window"}
              aria-label={note.place === "window" ? "Pin to start page" : "Float over window"}
            >
              <Icon name={note.place === "window" ? "pin" : "external"} size={11} />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange({ folded: !note.folded })}
            className="grid h-[18px] w-[18px] place-items-center rounded text-ink/60 hover:bg-ink/10 hover:text-ink"
            title={note.folded ? "Unfold" : "Fold to one line"}
            aria-label={note.folded ? "Unfold note" : "Fold note"}
          >
            <Icon name="chevronDown" size={11} className={note.folded ? "" : "rotate-180"} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="grid h-[18px] w-[18px] place-items-center rounded text-ink/60 hover:bg-red hover:text-white"
            title="Delete note"
            aria-label="Delete note"
          >
            <Icon name="close" size={11} strokeWidth={2.6} />
          </button>
        </span>
      </div>

      {note.folded ? (
        <button
          type="button"
          onClick={() => onChange({ folded: false })}
          className="min-w-0 truncate px-2 pb-1 text-left text-[17px] leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
          title="Unfold"
        >
          {firstLine}
        </button>
      ) : (
        <textarea
          value={note.text}
          onChange={(e) => onChange({ text: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="scribble…"
          aria-label="Note text"
          className="no-scrollbar min-h-0 w-full flex-1 resize-none bg-transparent px-2 pb-2 leading-[1.3] outline-none placeholder:text-ink/40"
          style={{ fontFamily: "var(--font-display)", fontSize: 19, color: NOTE_INK }}
        />
      )}

      {!note.folded && (
        <div
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 h-[16px] w-[16px] cursor-nwse-resize"
          title="Resize"
          aria-hidden="true"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" className="opacity-50">
            <path d="M14 2 2 14M14 7 7 14M14 12l-2 2" stroke={NOTE_INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
