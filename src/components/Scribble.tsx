import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "./Icons";
import { desktop } from "../lib/platform";
import { loadInk, saveInk, type Stroke, type TextItem } from "../lib/scribble";

const COLORS = [
  { name: "ink", v: "#1a2440" },
  { name: "pink", v: "#ff5d8f" },
  { name: "cyan", v: "#23c3d6" },
  { name: "lime", v: "#8ed44b" },
  { name: "orange", v: "#ff8a3d" },
  { name: "violet", v: "#8b6cf0" },
];

type Tool = "pen" | "highlight" | "eraser" | "strokeErase" | "text";
type Gesture =
  | { kind: "draw" }
  | { kind: "eraseStrokes" }
  | { kind: "dragText"; id: string; dx: number; dy: number; moved: boolean; sx: number; sy: number };

export function Scribble({
  open,
  onClose,
  dark,
  pageKey,
  probeScroll,
}: {
  open: boolean;
  onClose: () => void;
  dark: boolean;
  /** Which page's ink is loaded — the active tab's URL key. */
  pageKey: string;
  /** How far the page under the overlay is scrolled (page px); may be async for webviews. */
  probeScroll: () => number | Promise<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const texts = useRef<TextItem[]>([]);
  const ops = useRef<("s" | "t")[]>([]);
  const current = useRef<Stroke | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const scroll = useRef(0);
  const saveTimer = useRef(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[1].v);
  const [size, setSize] = useState(5);
  const [editing, setEditing] = useState<{ id: string; value: string; isNew: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  // True for the ~150ms while the desktop screenshot is taken, so the toolbar/hint stay out of the shot.
  const [hiding, setHiding] = useState(false);
  const [, force] = useState(0);

  /* ---------- rendering ---------- */
  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    // Clear in identity space, then draw with the page's scroll offset —
    // ink lives in PAGE coordinates and rides the content, not the window.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, -scroll.current * dpr);

    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    for (const s of all) {
      if (!s.pts.length) continue;
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.globalAlpha = s.erase ? 1 : s.size > 12 ? 0.34 : 0.94;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const n = s.pts.length;
      if (n === 1) {
        // A tap is a dot — the curve loop below would draw nothing for it.
        ctx.beginPath();
        ctx.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < n - 1; i++) {
        const mid = { x: (s.pts[i].x + s.pts[i + 1].x) / 2, y: (s.pts[i].y + s.pts[i + 1].y) / 2 };
        ctx.lineWidth = s.size * (0.6 + s.pts[i].p * 0.8);
        ctx.quadraticCurveTo(s.pts[i].x, s.pts[i].y, mid.x, mid.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y);
      }
      // Close the tail so the stroke reaches the release point.
      ctx.lineWidth = s.size * (0.6 + s.pts[n - 1].p * 0.8);
      ctx.lineTo(s.pts[n - 1].x, s.pts[n - 1].y);
      ctx.stroke();
    }

    for (const t of texts.current) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.color;
      ctx.font = `${t.size}px Caveat, "Patrick Hand", cursive`;
      ctx.textBaseline = "top";
      t.text.split("\n").forEach((line, i) => ctx.fillText(line, t.x, t.y + i * t.size * 1.15));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  useEffect(() => {
    if (open) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, size, editing]);

  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
  }, []);

  const resize = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
    redraw();
  };

  /* ---------- persistence (per page) ---------- */
  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveInk(pageKey, { strokes: strokes.current, texts: texts.current }), 350);
  };
  useEffect(() => {
    if (!open) return;
    const doc = loadInk(pageKey);
    strokes.current = doc.strokes;
    texts.current = doc.texts;
    ops.current = [];
    current.current = null;
    scroll.current = 0;
    // A text editor left open from last time would block all drawing —
    // every (re)open starts with the pen, not an edit box.
    setEditing(null);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pageKey]);

  /* ---------- scroll tracking (page-anchored ink) ---------- */
  // ponytail: webview zoom ≠ 100% skews the page/window pixel ratio — ink over a
  // zoomed webview drifts. Correct fix = scale the scroll by the webview's zoom
  // factor; add when annotating zoomed pages actually matters to someone.
  useEffect(() => {
    if (!open) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const y = await probeScroll();
        if (typeof y === "number" && y !== scroll.current) {
          scroll.current = y;
          redraw();
        }
      } catch {
        /* probe failed — keep the last offset */
      }
      if (!stop) window.setTimeout(tick, 90);
    };
    void tick();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, probeScroll]);

  useEffect(() => {
    if (!open) return;
    resize();
    window.addEventListener("resize", resize);
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  /* ---------- hit testing (page coordinates) ---------- */
  const textBBox = (t: TextItem) => {
    const ctx = canvasRef.current?.getContext("2d");
    const lines = t.text.split("\n");
    let w = 40;
    if (ctx) {
      ctx.font = `${t.size}px Caveat, "Patrick Hand", cursive`;
      w = Math.max(20, ...lines.map((l) => ctx.measureText(l).width));
    }
    return { x: t.x, y: t.y, w, h: lines.length * t.size * 1.15 + 6 };
  };
  const textAt = (x: number, y: number): TextItem | undefined =>
    texts.current.find((t) => {
      const b = textBBox(t);
      return x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
    });
  const strokeAt = (x: number, y: number): number => {
    for (let i = strokes.current.length - 1; i >= 0; i--) {
      const s = strokes.current[i];
      const near = Math.max(10, s.size);
      if (s.pts.some((p) => Math.hypot(p.x - x, p.y - y) <= near)) return i;
    }
    return -1;
  };

  const undo = () => {
    const op = ops.current.pop();
    if (op === "s") strokes.current.pop();
    else if (op === "t") texts.current.pop();
    redraw();
    force((n) => n + 1);
    scheduleSave();
  };

  /* ---------- pointer flow ---------- */
  const pageXY = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top + scroll.current };
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || !canvasRef.current) return;
    const { x, y } = pageXY(e);
    if (g.kind === "draw" && current.current) {
      const last = current.current.pts[current.current.pts.length - 1];
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < 1.6) return;
      current.current.pts.push({ x, y, p: Math.max(0.25, Math.min(1, 6 / (d + 3))) });
      redraw();
    } else if (g.kind === "eraseStrokes") {
      const si = strokeAt(x, y);
      if (si >= 0) {
        strokes.current.splice(si, 1);
        redraw();
        scheduleSave();
      }
      const t = textAt(x, y);
      if (t) {
        texts.current = texts.current.filter((v) => v !== t);
        redraw();
        scheduleSave();
      }
    } else if (g.kind === "dragText") {
      const t = texts.current.find((v) => v.id === g.id);
      if (!t) return;
      if (Math.hypot(x - g.sx, y - g.sy) > 4) g.moved = true;
      if (g.moved) {
        t.x = Math.round(x - g.dx);
        t.y = Math.round(y - g.dy);
        redraw();
      }
    }
  };
  const onUp = () => {
    const was = gesture.current;
    gesture.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (was?.kind === "draw" && current.current) {
      strokes.current.push(current.current);
      ops.current.push("s");
      current.current = null;
      scheduleSave();
    }
    if (was?.kind === "dragText") {
      const t = texts.current.find((v) => v.id === was.id);
      if (t && !was.moved) {
        // A tap (not a drag) on a text reopens its editor.
        setEditing({ id: t.id, value: t.text, isNew: false });
      } else if (t) {
        scheduleSave();
      }
    }
    redraw();
    force((n) => n + 1);
  };
  const begin = (g: Gesture) => {
    gesture.current = g;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    // Capture can legitimately throw (stylus disconnect, untracked pointer)
    // — the gesture must survive that, so never let it abort the handler.
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* keep going without capture */
    }
    if (editing) return;
    const p = pageXY(e);
    if (tool === "text") {
      const hit = textAt(p.x, p.y);
      if (hit) {
        begin({ kind: "dragText", id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y, moved: false, sx: p.x, sy: p.y });
      } else {
        const id = Math.random().toString(36).slice(2, 10);
        texts.current.push({ id, x: Math.round(p.x), y: Math.round(p.y), text: "", color, size: 22 });
        ops.current.push("t");
        setEditing({ id, value: "", isNew: true });
        scheduleSave();
      }
      return;
    }
    if (tool === "strokeErase") {
      begin({ kind: "eraseStrokes" });
      // A tap must erase on its own — onMove only fires when the pointer travels.
      const si = strokeAt(p.x, p.y);
      if (si >= 0) strokes.current.splice(si, 1);
      const t = textAt(p.x, p.y);
      if (t) texts.current = texts.current.filter((v) => v !== t);
      redraw();
      scheduleSave();
      return;
    }
    current.current = {
      pts: [{ x: p.x, y: p.y, p: 0.5 }],
      color,
      size: tool === "eraser" ? size * 4 : tool === "highlight" ? 22 : size,
      erase: tool === "eraser",
    };
    begin({ kind: "draw" });
    redraw();
  };

  /* ---------- capture: save PNG / copy to clipboard ---------- */
  const capture = async (): Promise<string> => {
    setHiding(true);
    try {
      if (desktop) {
        await new Promise((r) => setTimeout(r, 150)); // let the chrome hide paint
        return await desktop.capturePage();
      }
      const c = canvasRef.current!;
      const out = document.createElement("canvas");
      out.width = c.width;
      out.height = c.height;
      const octx = out.getContext("2d")!;
      octx.fillStyle = dark ? "#12171f" : "#f7f4ea";
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(c, 0, 0);
      return out.toDataURL("image/png");
    } finally {
      setHiding(false);
    }
  };

  const commitEdit = () => {
    if (!editing) return;
    const t = texts.current.find((v) => v.id === editing.id);
    if (!editing.value.trim() && t) {
      // Empty text: drop it again, including its undo op.
      texts.current = texts.current.filter((v) => v !== t);
      if (editing.isNew) ops.current.pop();
    } else if (t) {
      t.text = editing.value;
      t.color = color;
    }
    setEditing(null);
    redraw();
    scheduleSave();
    force((n) => n + 1);
  };

  if (!open) return null;

  const editTarget = editing ? texts.current.find((v) => v.id === editing.id) : null;

  return (
    <div className="no-drag fixed inset-0 z-[95]" style={{ cursor: tool === "text" ? "text" : "crosshair" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onDown}
      />

      {/* text editor overlay — the canvas takes over again after commit */}
      {editing && editTarget && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing((ed) => (ed ? { ...ed, value: e.target.value } : ed))}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              commitEdit();
            }
          }}
          placeholder="scribble words…"
          rows={Math.max(1, editing.value.split("\n").length)}
          className="absolute z-[96] min-w-[120px] resize-none border-2 border-dashed border-ink/50 bg-paper2/90 px-1 outline-none"
          style={{
            left: editTarget.x,
            top: editTarget.y - scroll.current,
            fontFamily: "Caveat, 'Patrick Hand', cursive",
            fontSize: editTarget.size,
            lineHeight: 1.15,
            color: editTarget.color,
          }}
        />
      )}

      {/* toolbar */}
      <div
        className={`pop-in absolute left-1/2 top-4 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 border-2 border-ink bg-paper2 px-3 py-2 ink-shadow-lg ${hiding ? "invisible" : ""}`}
        style={{ borderRadius: "18px 6px 20px 6px / 6px 20px 6px 18px" }}
      >
        <span className="pr-1 text-[17px] text-ink2" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          ✎ scribble
        </span>
        <span className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c.v}
              onClick={() => {
                setColor(c.v);
                if (tool !== "pen") setTool("pen");
              }}
              className="h-[22px] w-[22px] rounded-full border-2 transition hover:scale-110"
              style={{
                background: c.v,
                borderColor: color === c.v && tool === "pen" ? "var(--ink)" : "color-mix(in srgb, var(--ink) 35%, transparent)",
                transform: color === c.v && tool === "pen" ? "scale(1.18) rotate(-8deg)" : undefined,
              }}
              title={c.name}
            />
          ))}
        </span>
        <span className="h-6 w-px bg-ink/25" />
        <input
          type="range" min={2} max={16} value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-[74px] accent-pink"
          title="Nib size"
        />
        <ToolBtn on={tool === "highlight"} onClick={() => setTool("highlight")} icon="marker" label="highlighter" />
        <ToolBtn on={tool === "eraser"} onClick={() => setTool("eraser")} icon="eraser" label="eraser" />
        <ToolBtn on={tool === "strokeErase"} onClick={() => setTool("strokeErase")} icon="scissors" label="stroke eraser — tap or drag over ink to remove whole strokes and texts" />
        <ToolBtn on={tool === "text"} onClick={() => setTool("text")} icon="note" label="text — click empty space to write; tap existing text to edit, drag to move" />
        <ToolBtn on={false} onClick={undo} icon="undo" label="undo (Ctrl+Z)" />
        <ToolBtn on={false} onClick={() => { strokes.current = []; texts.current = []; ops.current = []; redraw(); force((n) => n + 1); scheduleSave(); }} icon="trash" label="clear all" />
        <ToolBtn
          on={false}
          onClick={async () => {
            const href = await capture();
            if (href) {
              const a = document.createElement("a");
              a.href = href;
              a.download = "quill-scribble.png";
              a.click();
            }
          }}
          icon="download"
          label="save as PNG"
        />
        <ToolBtn
          on={copied}
          onClick={async () => {
            const href = await capture();
            if (!href) return;
            let ok = false;
            if (desktop?.copyImage) {
              ok = await desktop.copyImage(href);
            } else {
              try {
                const blob = await (await fetch(href)).blob();
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                ok = true;
              } catch {
                ok = false;
              }
            }
            if (ok) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }
          }}
          icon="copy"
          label={copied ? "copied ✓" : "copy to clipboard"}
        />
        <span className="h-6 w-px bg-ink/25" />
        <button onClick={onClose} className="hd grid h-[28px] w-[28px] place-items-center bg-pink text-white hover:bg-red" title="Done (Esc)">
          <Icon name="check" size={16} strokeWidth={2.6} />
        </button>
      </div>

      <p className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 border-2 border-dashed border-ink/30 bg-paper2/80 px-3 py-1 text-center text-[14px] italic text-ink2 ${hiding ? "invisible" : ""}`}>
        ink stays with the page — scroll and it follows · each page keeps its own · Esc to put the pen down
      </p>
    </div>
  );
}

function ToolBtn({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={["hd grid h-[28px] w-[28px] place-items-center rounded-lg transition", on ? "bg-yellow text-[#1a2440]" : "text-ink2 hover:bg-paper3 hover:text-ink"].join(" ")}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
