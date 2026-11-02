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
  state: "downloading" | "completed" | "cancelled" | "interrupted";
}

export interface DesktopBridge {
  platform: "win32" | "darwin" | "linux";
  version: string;
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
  /** Blocked-request counter from the network layer (webview pages). */
  onBlocked(cb: (info: { url: string; host: string }) => void): () => void;
  /** Clear cookies, cache and storage for the webview partition. */
  clearBrowsingData(): Promise<void>;
  /** Screenshot of the whole app window (page + overlays) as a PNG data URL; "" if unavailable. */
  capturePage(): Promise<string>;
  /** Reveal a downloaded file in the system file manager. */
  showItem(path: string): Promise<void>;
  /** Turn encrypted DNS (Cloudflare DoH) on/off; applies after an app restart. */
  setDoh(enabled: boolean): Promise<boolean>;
  /** Real <title> of a webview page, delivered as it loads and changes. */
  onFrameTitle(cb: (info: { url: string; title: string }) => void): () => void;
  /** Download progress from both the webviews and the renderer itself. */
  onDownload(cb: (item: DownloadItem) => void): () => void;
  /** Request desktop webview partition name (persisted, isolated from app). */
  partition: string;
  /** Native menu accelerators ("new-tab", "close-tab", "reload", "palette"). */
  onCommand(cb: (cmd: string) => void): () => void;
  /** Popups opened by web content; the app opens them as a new tab. */
  onOpenUrl(cb: (url: string) => void): () => void;
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
