import { useEffect, useState } from "react";
import type { Tab } from "../lib/store";
import { Icon, Logo } from "./Icons";
import { hostOf } from "../lib/nav";
import { desktop, isDesktop, isMac } from "../lib/platform";

const TAB_COLORS = ["var(--yellow)", "var(--pink)", "var(--cyan)", "var(--lime)", "var(--orange)", "var(--violet)"];

export type TabMenuAction = "reload" | "duplicate" | "pin" | "mute" | "close" | "close-others" | "close-right" | "close-site" | "popups";

/**
 * Tab strip. Tabs shrink to share the row (like Chrome/Brave) instead of
 * overflowing into a horizontal scrollbar. On desktop the empty space is a
 * window-drag region, and Windows/Linux get in-app window controls.
 * Right-click a tab for the tab menu (close others/site, duplicate, mute…).
 */
export function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
  onPin,
  onReorder,
  onTheme,
  theme,
  onFocusMode,
  onMute,
  onMenuAction,
  popupHosts,
}: {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onPin: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onTheme: () => void;
  theme: string;
  onFocusMode: () => void;
  onMute?: (id: string) => void;
  onMenuAction?: (action: TabMenuAction, id: string) => void;
  /** Hosts with pop-ups blocked — drives the tab menu label. */
  popupHosts?: Record<string, true>;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!desktop) return;
    void desktop.isMaximized().then(setMaximized);
    return desktop.onMaximizeChange(setMaximized);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const crowded = tabs.length > 7;
  const tight = tabs.length > 12;
  const showWinControls = isDesktop && !isMac;

  return (
    <div
      className="drag-region relative flex h-[44px] select-none items-end gap-[3px] pr-2"
      style={{ paddingLeft: isDesktop && isMac ? 84 : 12 }}
    >
      <span className="mb-[8px] mr-1 flex shrink-0 items-end" title="Quill — the hand-written private browser">
        <Logo size={24} />
      </span>
      <div className="flex min-w-0 flex-1 items-end gap-[3px]">
        {tabs.map((t, i) => {
          const active = t.id === activeId;
          const color = TAB_COLORS[i % TAB_COLORS.length];
          return (
            <div
              key={t.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null && drag !== i) onReorder(drag, i);
                setDrag(null);
                setOver(null);
              }}
              onClick={() => onSelect(t.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ id: t.id, x: e.clientX, y: e.clientY });
              }}
              onMouseDown={(e) => {
                // Middle-click closes the tab — every browser's convention.
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(t.id);
                }
              }}
              role="tab"
              aria-selected={active}
              className={[
                "tab-shape group relative flex h-[36px] min-w-0 cursor-pointer items-center gap-2 transition-[background,transform] duration-150",
                tight ? "px-2" : "px-3",
                active ? "bg-paper2 -mb-[2px] z-40" : "bg-paper3/60 hover:bg-paper2/80",
                over === i && drag !== null && drag !== i ? "translate-x-1" : "",
                t.pinned ? "w-[46px] shrink-0 justify-center px-0" : "flex-1 basis-0",
              ].join(" ")}
              style={{
                maxWidth: t.pinned ? 46 : 230,
                minWidth: t.pinned ? 46 : tight ? 60 : crowded ? 90 : 120,
                boxShadow: active ? `inset 0 3px 0 ${color}` : undefined,
              }}
              title={t.title ? `${t.title} — ${t.url}` : t.url}
            >
              {t.ghost ? (
                <span className="shrink-0 text-ink2">
                  <Icon name="ghost" size={15} />
                </span>
              ) : (
                <span
                  className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#1a2440]"
                  style={{ background: color, fontFamily: "var(--font-display)" }}
                >
                  {t.view === "start" ? "✦" : hostOf(t.url).charAt(0).toUpperCase() || "?"}
                </span>
              )}
              {!t.pinned && (
                <span
                  className={["min-w-0 flex-1 truncate leading-none", tight ? "text-[13px]" : "text-[15px]"].join(" ")}
                  style={{ fontFamily: "var(--font-hand)", minWidth: 0 }}
                >
                  {t.loading ? <span className="italic text-ink2">scribbling…</span> : t.title || (t.view === "start" ? "New page" : hostOf(t.url))}
                </span>
              )}
              {t.loading && (
                <span className="absolute bottom-1 left-3 right-3 h-[2.5px] overflow-hidden rounded-full bg-ink/10">
                  <span className="tab-sweep block h-full w-1/3 rounded-full bg-pink" />
                </span>
              )}
              {!t.pinned && (
                <span className="flex shrink-0 items-center gap-0.5">
                  {(t.audible || t.muted) && !tight && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMute?.(t.id);
                      }}
                      className={["grid h-[18px] w-[18px] place-items-center rounded-full transition", t.muted ? "text-red" : "text-ink2 hover:text-ink"].join(" ")}
                      title={t.muted ? "Unmute tab" : "Mute tab"}
                      aria-label={t.muted ? "Unmute tab" : "Mute tab"}
                    >
                      <Icon name={t.muted ? "speakerOff" : "speaker"} size={13} />
                    </button>
                  )}
                  {!tight && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin(t.id);
                      }}
                      className="grid h-[18px] w-[18px] place-items-center rounded-full text-ink3 opacity-0 transition group-hover:opacity-100 hover:text-ink"
                      title="Pin tab"
                      aria-label="Pin tab"
                    >
                      <Icon name="pin" size={12} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(t.id);
                    }}
                    className={[
                      "grid h-[18px] w-[18px] place-items-center rounded-full text-ink3 transition hover:bg-red hover:text-white",
                      active ? "opacity-70" : "opacity-0 group-hover:opacity-100",
                      // On a crowded strip inactive tabs keep their width for the title; close on hover only.
                      tight && !active ? "absolute right-1 top-1/2 -translate-y-1/2 bg-paper2" : "",
                    ].join(" ")}
                    title="Close tab"
                    aria-label="Close tab"
                  >
                    <Icon name="close" size={12} strokeWidth={2.4} />
                  </button>
                </span>
              )}
              {t.pinned && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(t.id);
                  }}
                  className="absolute -right-1 -top-1 hidden h-[14px] w-[14px] place-items-center rounded-full border border-ink bg-pink text-white group-hover:grid"
                  title="Unpin tab"
                  aria-label="Unpin tab"
                >
                  <Icon name="close" size={8} strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={onNew}
          className="hd btn-sketch mb-[5px] ml-1 grid h-[28px] w-[28px] shrink-0 place-items-center bg-paper2 text-ink hover:bg-yellow"
          title="New tab (Ctrl/Cmd+T)"
          aria-label="New tab"
        >
          <Icon name="plus" size={15} strokeWidth={2.4} />
        </button>
      </div>

      <div className="no-drag mb-[7px] flex shrink-0 items-center gap-1.5 pl-2">
        <button onClick={onFocusMode} className="btn-sketch hd grid h-[28px] w-[28px] place-items-center bg-paper2 hover:bg-cyan" title="Focus mode — hide all the chrome" aria-label="Focus mode">
          <Icon name="eyeOff" size={15} />
        </button>
        <button onClick={onTheme} className="btn-sketch hd grid h-[28px] w-[28px] place-items-center bg-paper2 hover:bg-yellow" title={theme === "night" ? "Switch to daylight paper" : "Switch to midnight ink"} aria-label="Toggle theme">
          <Icon name={theme === "night" ? "sun" : "moon"} size={15} />
        </button>
        {showWinControls && (
          <span className="ml-2 flex items-center gap-1 border-l border-dashed border-ink/30 pl-2">
            <button onClick={() => desktop?.minimize()} className="grid h-[28px] w-[30px] place-items-center rounded text-ink2 hover:bg-paper3" title="Minimise" aria-label="Minimise window">
              <Icon name="minus" size={14} />
            </button>
            <button onClick={() => desktop?.maximize()} className="grid h-[28px] w-[30px] place-items-center rounded text-ink2 hover:bg-paper3" title={maximized ? "Restore" : "Maximise"} aria-label={maximized ? "Restore window" : "Maximise window"}>
              <Icon name={maximized ? "copy" : "split"} size={13} />
            </button>
            <button onClick={() => desktop?.close()} className="grid h-[28px] w-[30px] place-items-center rounded text-ink2 hover:bg-red hover:text-white" title="Close" aria-label="Close window">
              <Icon name="close" size={14} strokeWidth={2.4} />
            </button>
          </span>
        )}
      </div>

      {/* right-click tab menu */}
      {menu && onMenuAction && (() => {
        const t = tabs.find((x) => x.id === menu.id);
        if (!t) return null;
        const items: { key: TabMenuAction; label: string; icon: string; sep?: boolean; danger?: boolean }[] = [
          { key: "reload", label: "Reload", icon: "reload" },
          { key: "duplicate", label: "Duplicate", icon: "copy" },
          { key: "pin", label: t.pinned ? "Unpin tab" : "Pin tab", icon: "pin" },
          { key: "mute", label: t.muted ? "Unmute tab" : "Mute tab", icon: t.muted ? "speaker" : "speakerOff" },
          { key: "popups", label: popupHosts?.[hostOf(t.url)] ? "Allow pop-ups on this site" : "Block pop-ups on this site", icon: "shieldOff" },
          { key: "close", label: "Close tab", icon: "close", sep: true, danger: true },
          { key: "close-others", label: "Close other tabs", icon: "filter", danger: true },
          { key: "close-right", label: "Close tabs to the right", icon: "forward", danger: true },
          { key: "close-site", label: `Close all ${hostOf(t.url)} tabs`, icon: "trash", danger: true },
        ];
        const run = (action: TabMenuAction) => {
          onMenuAction(action, t.id);
          setMenu(null);
        };
        return (
          <>
            <div className="no-drag fixed inset-0 z-[84]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
            <div
              className="no-drag fixed z-[85] min-w-[210px] border-2 border-ink bg-paper2 py-1 text-ink ink-shadow"
              style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 260), borderRadius: "12px 4px 14px 4px / 4px 14px 4px 12px" }}
              role="menu"
            >
              {items.map((it) => (
                <div key={it.key}>
                  {it.sep && <div className="mx-2 my-1 border-t border-dashed border-ink/30" />}
                  <button
                    onClick={() => run(it.key)}
                    role="menuitem"
                    className={["flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] transition", it.danger ? "text-ink hover:bg-red hover:text-white" : "hover:bg-yellow/45"].join(" ")}
                  >
                    <Icon name={it.icon} size={14} />
                    {it.label}
                  </button>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
