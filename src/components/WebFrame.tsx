import { useEffect, useRef, useState } from "react";
import { desktop, isDesktop } from "../lib/platform";

/**
 * Shows a real, live web page.
 *
 * Desktop (Electron): an isolated <webview> in its own persisted partition.
 * X-Frame-Options and frame-ancestors don't apply to webviews, so sites like
 * GitHub and YouTube load as themselves. Navigation inside stays inside.
 *
 * Web build: a sandboxed <iframe>. Sites that refuse framing stay blank;
 * the caller decides what to show instead (`onBlockedFrame`).
 */
export interface WebFrameProps {
  url: string;
  nonce: number;
  zoom: number;
  strict: boolean;
  autoplay: boolean;
  referrer: "no-referrer" | "strict-origin-when-cross-origin";
  onTitle: (t: string) => void;
  onNavigate?: (url: string) => void;
  onLoaded?: () => void;
  onNewWindow?: (url: string) => void;
  canGoBackRef?: React.MutableRefObject<(() => boolean) | null>;
  /** Registry of mounted webviews by tab id — find-in-page and PDF target the active one. */
  elMap?: React.MutableRefObject<Map<string, WebviewEl>>;
  /** Key under which this webview registers itself in elMap (the tab id). */
  elKey?: string;
  /** Find-in-page match counts from the webview. */
  onFoundInPage?: (info: { active: number; matches: number }) => void;
  /** Media started/stopped being audible in this webview. */
  onAudible?: (audible: boolean) => void;
  /** Mute state applied to this webview. */
  muted?: boolean;
}

export type WebviewEl = HTMLElement & {
  src: string;
  loadURL(u: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  goBack(): void;
  reload(): void;
  setZoomFactor(f: number): void;
  setAudioMuted(m: boolean): void;
  findInPage(text: string, opts?: { forward?: boolean; findNext?: boolean }): void;
  stopFindInPage(action: "clearSelection" | "keepSelection"): void;
  getWebContentsId(): number;
};

export function WebFrame(p: WebFrameProps) {
  if (isDesktop) return <DesktopView {...p} />;
  return <IframeView {...p} />;
}

/* ---------------- Electron <webview> ---------------- */

function DesktopView(p: WebFrameProps) {
  const ref = useRef<WebviewEl | null>(null);
  const lastUrl = useRef(p.url);
  // Listeners are wired once per element (mount effect below), but handlers
  // and zoom/mute change every render — they must read the LATEST props or
  // the webview keeps mount-time values (zoom reset on reload, ghost toggled
  // after mount ignored, mute out of sync).
  const propsRef = useRef(p);
  propsRef.current = p;

  // Mount: wire events once per element.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTitle = (e: Event) => propsRef.current.onTitle((e as unknown as { title: string }).title || "");
    const onNav = (e: Event) => {
      const u = (e as unknown as { url: string }).url;
      if (u && u !== lastUrl.current) {
        lastUrl.current = u;
        propsRef.current.onNavigate?.(u);
      }
    };
    const onStop = () => {
      propsRef.current.onLoaded?.();
      try {
        el.setZoomFactor(propsRef.current.zoom / 100);
      } catch {
        /* not ready */
      }
    };
    const onReady = () => {
      try {
        el.setZoomFactor(propsRef.current.zoom / 100);
        el.setAudioMuted(propsRef.current.muted === true);
      } catch {
        /* not ready */
      }
    };
    const onFound = (e: Event) => {
      const d = e as unknown as { activeMatchOrdinal: number; matches: number };
      propsRef.current.onFoundInPage?.({ active: d.activeMatchOrdinal, matches: d.matches });
    };
    // ponytail: any media element flipping play/pause moves the flag — a page
    // with two players can briefly misreport. isCurrentlyAudible polling is
    // the upgrade path if that ever bites.
    const onMedia = (e: Event) => propsRef.current.onAudible?.(e.type === "media-started-playing");
    el.addEventListener("page-title-updated", onTitle);
    el.addEventListener("did-navigate", onNav);
    el.addEventListener("did-navigate-in-page", onNav);
    el.addEventListener("did-stop-loading", onStop);
    el.addEventListener("dom-ready", onReady);
    el.addEventListener("found-in-page", onFound);
    el.addEventListener("media-started-playing", onMedia);
    el.addEventListener("media-paused", onMedia);
    if (p.elMap && p.elKey) p.elMap.current.set(p.elKey, el);
    if (p.canGoBackRef) {
      p.canGoBackRef.current = () => {
        try {
          if (el.canGoBack()) {
            el.goBack();
            return true;
          }
        } catch {
          /* not ready */
        }
        return false;
      };
    }
    return () => {
      el.removeEventListener("page-title-updated", onTitle);
      el.removeEventListener("did-navigate", onNav);
      el.removeEventListener("did-navigate-in-page", onNav);
      el.removeEventListener("did-stop-loading", onStop);
      el.removeEventListener("dom-ready", onReady);
      el.removeEventListener("found-in-page", onFound);
      el.removeEventListener("media-started-playing", onMedia);
      el.removeEventListener("media-paused", onMedia);
      if (p.elMap && p.elKey && p.elMap.current.get(p.elKey) === el) p.elMap.current.delete(p.elKey);
      if (p.canGoBackRef) p.canGoBackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL changes from the address bar: only load if the webview isn't already there.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (p.url !== lastUrl.current) {
      lastUrl.current = p.url;
      el.loadURL(p.url).catch(() => {});
    }
  }, [p.url]);

  useEffect(() => {
    const el = ref.current;
    if (!el || p.nonce === 0) return;
    try {
      el.reload();
    } catch {
      /* not ready */
    }
  }, [p.nonce]);

  useEffect(() => {
    try {
      ref.current?.setZoomFactor(p.zoom / 100);
    } catch {
      /* not ready */
    }
  }, [p.zoom]);

  useEffect(() => {
    try {
      ref.current?.setAudioMuted(p.muted === true);
    } catch {
      /* not ready */
    }
  }, [p.muted]);

  // React doesn't know <webview>; create it imperatively so attributes land before load.
  return (
    <div
      className="h-full w-full"
      ref={(host) => {
        if (!host || ref.current) return;
        const el = document.createElement("webview") as WebviewEl;
        el.setAttribute("src", p.url);
        el.setAttribute("partition", desktop?.partition || "persist:quill-web");
        el.setAttribute("allowpopups", "");
        el.setAttribute("webpreferences", "contextIsolation=yes, sandbox=yes, nodeIntegration=no");
        el.style.width = "100%";
        el.style.height = "100%";
        host.appendChild(el);
        ref.current = el;
      }}
    />
  );
}

/* ---------------- plain iframe (web build) ---------------- */

function IframeView(p: WebFrameProps) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => setLoaded(false), [p.url, p.nonce]);

  // No popups-to-escape-sandbox (phishing popups stay sandboxed), no downloads,
  // and clipboard stays with Quill, not the framed page.
  const sandbox = p.strict ? "allow-scripts allow-forms allow-popups allow-modals" : "allow-scripts allow-forms allow-popups allow-modals allow-same-origin";
  const zoomStyle =
    p.zoom !== 100
      ? { transform: `scale(${p.zoom / 100})`, transformOrigin: "top left", height: `${10000 / p.zoom}%`, width: `${10000 / p.zoom}%` }
      : { height: "100%", width: "100%" };

  return (
    <>
      <iframe
        key={`${p.url}|${p.strict}|${p.nonce}`}
        ref={frameRef}
        src={p.url}
        title="page"
        sandbox={sandbox}
        referrerPolicy={p.referrer}
        allow={p.autoplay ? "autoplay; fullscreen" : "fullscreen"}
        className="border-0 bg-white"
        style={zoomStyle}
        onLoad={() => {
          setLoaded(true);
          p.onLoaded?.();
          try {
            const t = frameRef.current?.contentDocument?.title?.trim();
            if (t) p.onTitle(t);
          } catch {
            /* cross-origin: expected */
          }
        }}
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-paper/75">
          <p className="text-[17px] italic text-ink2">loading…</p>
        </div>
      )}
    </>
  );
}
