import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "./Icons";
import { desktop } from "../lib/platform";

type Pt = { x: number; y: number; p: number };
type Stroke = { pts: Pt[]; color: string; size: number; erase: boolean };

const COLORS = [
  { name: "ink", v: "#1a2440" },
  { name: "pink", v: "#ff5d8f" },
  { name: "cyan", v: "#23c3d6" },
  { name: "lime", v: "#8ed44b" },
  { name: "orange", v: "#ff8a3d" },
  { name: "violet", v: "#8b6cf0" },
];

export function Scribble({ open, onClose, dark }: { open: boolean; onClose: () => void; dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[1].v);
  const [size, setSize] = useState(5);
  const [highlight, setHighlight] = useState(false);
  const [erase, setErase] = useState(false);
  const [, force] = useState(0);
  // True for the ~150ms while the desktop screenshot is taken, so the toolbar/hint stay out of the shot.
  const [hiding, setHiding] = useState(false);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    for (const s of all) {
      if (!s.pts.length) continue;
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.globalAlpha = s.erase ? 1 : highlightAlpha(s);
      ctx.strokeStyle = s.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length - 1; i++) {
        const mid = { x: (s.pts[i].x + s.pts[i + 1].x) / 2, y: (s.pts[i].y + s.pts[i + 1].y) / 2 };
        ctx.lineWidth = s.size * (0.6 + s.pts[i].p * 0.8);
        ctx.quadraticCurveTo(s.pts[i].x, s.pts[i].y, mid.x, mid.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  const highlightAlpha = (s: Stroke) => (s.size > 12 ? 0.34 : 0.94);

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

  useEffect(() => {
    if (!open) return;
    resize();
    window.addEventListener("resize", resize);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        strokes.current.pop();
        redraw();
        force((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, highlight, erase]);

  if (!open) return null;

  const pos = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // no-drag: Electron swallows clicks on anything sitting over a drag region unless it opts out.
  return (
    <div className="no-drag fixed inset-0 z-[95]" style={{ cursor: "crosshair" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const p = pos(e);
          current.current = {
            pts: [{ ...p, p: 0.5 }],
            color: erase ? "#000" : color,
            size: erase ? size * 4 : highlight ? 22 : size,
            erase,
          };
          redraw();
        }}
        onPointerMove={(e) => {
          if (!current.current) return;
          const p = pos(e);
          const last = current.current.pts[current.current.pts.length - 1];
          const d = Math.hypot(p.x - last.x, p.y - last.y);
          if (d < 1.6) return;
          current.current.pts.push({ ...p, p: Math.max(0.25, Math.min(1, 6 / (d + 3))) });
          redraw();
        }}
        onPointerUp={() => {
          if (current.current) strokes.current.push(current.current);
          current.current = null;
          redraw();
          force((n) => n + 1);
        }}
      />

      {/* toolbar */}
      <div
        className={`pop-in absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 border-2 border-ink bg-paper2 px-3 py-2 ink-shadow-lg ${hiding ? "invisible" : ""}`}
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
                setErase(false);
              }}
              className="h-[22px] w-[22px] rounded-full border-2 transition hover:scale-110"
              style={{
                background: c.v,
                borderColor: color === c.v && !erase ? "var(--ink)" : "color-mix(in srgb, var(--ink) 35%, transparent)",
                transform: color === c.v && !erase ? "scale(1.18) rotate(-8deg)" : undefined,
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
        <ToolBtn on={highlight} onClick={() => { setHighlight((h) => !h); setErase(false); }} icon="marker" label="highlighter" />
        <ToolBtn on={erase} onClick={() => { setErase((v) => !v); setHighlight(false); }} icon="eraser" label="eraser" />
        <ToolBtn on={false} onClick={() => { strokes.current.pop(); redraw(); force((n) => n + 1); }} icon="undo" label="undo (Ctrl+Z)" />
        <ToolBtn on={false} onClick={() => { strokes.current = []; redraw(); force((n) => n + 1); }} icon="trash" label="clear all" />
        <ToolBtn
          on={false}
          onClick={async () => {
            // Desktop: the main process screenshots the real window — the page with the scribbles on it.
            // Web build: JS can't reach the page pixels, so the scribble layer alone is exported.
            setHiding(true);
            try {
              let href = "";
              if (desktop) {
                await new Promise((r) => setTimeout(r, 150)); // let the chrome hide paint
                href = await desktop.capturePage();
              } else {
                const c = canvasRef.current!;
                const out = document.createElement("canvas");
                out.width = c.width;
                out.height = c.height;
                const octx = out.getContext("2d")!;
                octx.fillStyle = dark ? "#12171f" : "#f7f4ea";
                octx.fillRect(0, 0, out.width, out.height);
                octx.drawImage(c, 0, 0);
                href = out.toDataURL("image/png");
              }
              if (href) {
                const a = document.createElement("a");
                a.href = href;
                a.download = "quill-scribble.png";
                a.click();
              }
            } finally {
              setHiding(false);
            }
          }}
          icon="download"
          label="save as PNG"
        />
        <span className="h-6 w-px bg-ink/25" />
        <button onClick={onClose} className="hd grid h-[28px] w-[28px] place-items-center bg-pink text-white hover:bg-red" title="Done (Esc)">
          <Icon name="check" size={16} strokeWidth={2.6} />
        </button>
      </div>

      <p className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 border-2 border-dashed border-ink/30 bg-paper2/80 px-3 py-1 text-[14px] italic text-ink2 ${hiding ? "invisible" : ""}`}>
        draw straight on top of the page · strokes stay until you erase them · Esc to put the pen down
      </p>
    </div>
  );
}

function ToolBtn({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={[
        "hd grid h-[28px] w-[28px] place-items-center transition",
        on ? "bg-yellow ink-shadow-sm" : "bg-paper3/50 hover:bg-yellow/60",
      ].join(" ")}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
