import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, ReadStage } from "./reader";
import type { BlockResult } from "./filters";

export const uid = () => Math.random().toString(36).slice(2, 10);

export type ViewMode = "start" | "reader" | "original" | "live" | "split";
export type OriginalSubMode = "shielded" | "raw" | "live";

export interface Tab {
  id: string;
  title: string;
  url: string;
  stack: string[];
  idx: number;
  view: ViewMode;
  originalMode: OriginalSubMode;
  loading: boolean;
  stage: ReadStage | null;
  stageNote: string;
  pinned: boolean;
  ghost: boolean;
  article: Article | null;
  error: string | null;
  blocked: BlockResult[];
  zoom: number;
  allow: string[];
  deny: string[];
  nonce: number;
}

export interface HistoryEntry {
  url: string;
  title: string;
  at: number;
  ghost?: boolean;
}
export interface Bookmark {
  title: string;
  url: string;
  doodle: string;
}
export interface Note {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  rot: number;
  at: number;
  /** Size in px. Older notes without these use the defaults. */
  w?: number;
  h?: number;
  /** Where the note lives: pinned to the start page, or floating over the whole window. */
  place?: "start" | "window";
  /** Folded notes show only their first line. */
  folded?: boolean;
}

export const NOTE_DEFAULT_W = 190;
export const NOTE_DEFAULT_H = 150;
export const NOTE_MIN_W = 130;
export const NOTE_MIN_H = 90;
export const NOTE_MAX_W = 520;
export const NOTE_MAX_H = 520;

/** A tile on the start-page shelf. The shelf is user-editable and stored locally. */
export interface ShelfItem {
  id: string;
  name: string;
  url: string;
  doodle: string;
  color: string;
  blurb: string;
}

export const PREFIX = "quill.v1.";

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function useLocal<T>(key: string, initial: T) {
  const ref = useRef<T>(initial);
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      const merged = isPlainObj(initial) && isPlainObj(parsed) ? ({ ...initial, ...parsed } as T) : (parsed as T);
      ref.current = merged;
      return merged;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setState((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        ref.current = next;
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key],
  );
  return [state, set] as const;
}

export function wipeStorage(keys?: string[]) {
  try {
    if (!keys) {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith(PREFIX)) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } else keys.forEach((k) => localStorage.removeItem(PREFIX + k));
  } catch {}
}

export function useNow(interval = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
