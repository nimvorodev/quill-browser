/**
 * Platform bridge. The same React app runs in two shells:
 *  - the web build (any browser, iframe-only), and
 *  - the Quill desktop app (Electron, Windows & macOS).
 *
 * Desktop exposes a tiny, allow-listed API on `window.quill` from the preload
 * script. Nothing here grants renderer code Node access.
 */

/** A download tracked by the main process: saved into the system Downloads folder, progress streamed live. */
export interface DownloadItem {
  id: string;
  filename: string;
  path: string;
  received: number;
  total: number;
  state: "downloading" | "paused" | "completed" | "cancelled" | "interrupted";
}

export interface DesktopBridge {
  platform: "win32" | "darwin" | "linux";
  /** Window controls (frameless on Windows / Linux; macOS uses native traffic lights). */
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximizeChange(cb: (max: boolean) => void): () => void;
  /** Open a URL in the user's default system browser. */
  openExternal(url: string): Promise<void>;
  /** Ad / tracker rules the main process should block at the network level. */
  setBlockRules(hosts: string[], enabled: boolean): Promise<void>;
  /** Show the system save dialog for each download instead of auto-saving. */
  setAskSave(enabled: boolean): Promise<void>;
  /** Blocked-request counter from the network layer (webview pages). */
  onBlocked(cb: (info: { url: string; host: string }) => void): () => void;
  /** Clear cookies, cache and storage for the webview partition. */
  clearBrowsingData(): Promise<void>;
  /** Screenshot of the whole app window (page + overlays) as a PNG data URL; "" if unavailable. */
  capturePage(): Promise<string>;
  /** Copy a PNG data URL (scribble capture) to the system clipboard. */
  copyImage(dataUrl: string): Promise<boolean>;
  /** Reveal a downloaded file in the system file manager; true when shown. */
  showItem(path: string): Promise<boolean>;
  /** Turn encrypted DNS (Cloudflare DoH) on/off; applies after an app restart. */
  setDoh(enabled: boolean): Promise<boolean>;
  /** Real <title> of a webview page, delivered as it loads and changes. */
  onFrameTitle(cb: (info: { url: string; title: string }) => void): () => void;
  /** Print a webview page to PDF; the file lands in the system Downloads folder. */
  savePdf(webContentsId: number, name: string): Promise<boolean>;
  /** Save a page's HTML to Downloads; true when written. */
  saveHtml(html: string, name: string): Promise<boolean>;
  /** Toggle app fullscreen (F11). */
  toggleFullscreen(): Promise<boolean>;
  /** Installed app version (package.json) — "check for updates" compares it. */
  version(): Promise<string>;
  /** Open the OS print dialog for a webview page. */
  printPage(webContentsId: number): Promise<boolean>;
  /** Open a local file (system picker); returns the chosen path or null. */
  openFile(): Promise<string | null>;
  /** Open another Quill window (skips session restore). */
  newWindow(): void;
  /** Pause / resume / cancel an in-flight download by drawer id. */
  dlControl(id: string, action: "pause" | "resume" | "cancel"): void;
  /** Push per-site permission grants { host: [permission] } to the main process. */
  setPermRules(rules: Record<string, string[]>): void;
  /** Answer a permission prompt; `always` persists the grant for the host. */
  permRespond(id: string, allow: boolean, always: boolean, host: string, permission: string): Promise<boolean>;
  /** A site asked for camera/mic/location/notifications. */
  onPermRequest(cb: (req: { id: string; host: string; permission: string }) => void): () => void;
  /** Download progress from both the webviews and the renderer itself. */
  onDownload(cb: (item: DownloadItem) => void): () => void;
  /** Request desktop webview partition name (persisted, isolated from app). */
  partition: string;
  /** Native menu accelerators ("new-tab", "close-tab", "reload", "palette"). */
  onCommand(cb: (cmd: string) => void): () => void;
  /** Popups opened by web content — url is the popup, from is the page that opened it. */
  onOpenUrl(cb: (info: { url: string; from: string }) => void): () => void;
}

declare global {
  interface Window {
    quill?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== "undefined" ? window.quill : undefined;
export const isDesktop = Boolean(desktop);
export const isMac = desktop?.platform === "darwin" || (typeof navigator !== "undefined" && /Mac/.test(navigator.platform));

/** Open outside Quill: system browser on desktop, new tab in the web build. */
export function openOutside(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (desktop) {
    void desktop.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
