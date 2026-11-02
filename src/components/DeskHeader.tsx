import { Icon } from "./Icons";
import { isDesktop, openOutside } from "../lib/platform";

export type DeskMode = "desk" | "original";

/**
 * Shared header for the in-app desks (GitHub, YouTube). Offers a switch between
 * Quill's hand-drawn desk and the site's original page. On desktop the original
 * page loads in a real webview; in the web build the switch explains why the
 * site can't be framed and offers to open it outside instead.
 */
export function DeskModeSwitch({
  mode,
  onMode,
  siteName,
  siteUrl,
  accent = "var(--lime)",
}: {
  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  siteName: string;
  siteUrl: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="hd-soft flex items-center overflow-hidden bg-paper3/60 p-[2px]" role="tablist" aria-label="Page style">
        <button
          role="tab"
          aria-selected={mode === "desk"}
          onClick={() => onMode("desk")}
          className={["flex items-center gap-1 px-2.5 py-[3px] text-[14px] transition", mode === "desk" ? "font-bold text-[#1a2440]" : "text-ink2 hover:text-ink"].join(" ")}
          style={{ background: mode === "desk" ? accent : "transparent", borderRadius: "10px 3px 10px 3px" }}
        >
          <Icon name="pen" size={12} /> quill desk
        </button>
        <button
          role="tab"
          aria-selected={mode === "original"}
          onClick={() => (isDesktop ? onMode("original") : openOutside(siteUrl))}
          className={["flex items-center gap-1 px-2.5 py-[3px] text-[14px] transition", mode === "original" ? "font-bold text-[#1a2440]" : "text-ink2 hover:text-ink"].join(" ")}
          style={{ background: mode === "original" ? accent : "transparent", borderRadius: "10px 3px 10px 3px" }}
          title={isDesktop ? `Show the real ${siteName} page` : `${siteName} refuses to be framed in a browser tab — opens outside`}
        >
          <Icon name="globe" size={12} /> original {siteName.toLowerCase()}
          {!isDesktop && <Icon name="external" size={10} className="opacity-70" />}
        </button>
      </div>
      {/* Desktop: the drawer/status bar and the view switcher already offer "open outside". */}
      {!isDesktop && (
        <button
          onClick={() => openOutside(siteUrl)}
          className="hd-soft btn-sketch flex items-center gap-1 bg-paper2 px-2.5 py-1 text-[14px] text-ink hover:bg-yellow hover:text-[#1a2440]"
          title="Open in a new browser tab"
        >
          <Icon name="external" size={13} /> open outside
        </button>
      )}
    </div>
  );
}
