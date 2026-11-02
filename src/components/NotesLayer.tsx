import { useRef, useState } from "react";
import { StickyNote } from "./StickyNote";
import type { Note } from "../lib/store";

/**
 * Notes that float over the whole browser window. They sit above every page
 * and persist across tabs, but never block clicks between them: the layer
 * itself is pointer-events:none, each note re-enables pointer events.
 */
export function NotesLayer({
  notes,
  setNotes,
  hidden,
}: {
  notes: Note[];
  setNotes: (f: (p: Note[]) => Note[]) => void;
  hidden?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  // Z-order is tracked separately from the array so a grab never reorders
  // (and remounts) the note mid-gesture.
  const [frontId, setFrontId] = useState<string | null>(null);
  const floating = notes.filter((n) => n.place === "window");
  if (hidden || floating.length === 0) return null;

  const front = (id: string) => setFrontId(id);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-[60]" aria-label="Floating notes">
      {floating.map((n) => {
        const z = notes.indexOf(n);
        return (
          <StickyNote
            key={n.id}
            note={n}
            boardRef={layerRef}
            zIndex={n.id === frontId ? 200 : 100 + z}
            interactive
            onChange={(patch) => setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, ...patch } : x)))}
            onDelete={() => setNotes((p) => p.filter((x) => x.id !== n.id))}
            onFront={() => front(n.id)}
            onTogglePlace={() => setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, place: "start", x: 12, y: 44 } : x)))}
          />
        );
      })}
    </div>
  );
}
