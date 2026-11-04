import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { hostOf, isFrameHostile } from "../lib/nav";
import type { OriginalSubMode, Tab } from "../lib/store";
import { isDesktop, openOutside } from "../lib/platform";
import { WebFrame, type WebviewEl } from "./WebFrame";

/** A zap selector must be short, plain, and parseable — never trust frame input blindly. */
function isSafeSelector(sel: string): boolean {
  if (typeof sel !== "string" || sel.length === 0 || sel.length > 300) return false;
  if (/[<>&"'`\\]/.test(sel)) return false;
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

function isSafeHref(href: string): boolean {
  if (typeof href !== "string" || href.length === 0 || href.length > 2048) return false;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface LiveProps {
  tab: Tab;
  subMode: OriginalSubMode;
  onSubMode: (m: OriginalSubMode) => void;
  strict: boolean;
  autoplay: boolean;
  referrer: "no-referrer" | "strict-origin-when-cross-origin";
  zoom: number;
  onTitle: (t: string) => void;
  onReader: () => void;
  onSplit?: () => void;
  onNavigate: (href: string, newTab?: boolean) => void;
  /** The live page itself moved (link click inside a webview). Updates the address bar only. */
  onFrameNavigate?: (href: string) => void;
  onRetryHtml: () => void;
  onOpenShields: () => void;
  dark: boolean;
  onToggleDark: () => void;
  zapped: string[];
  onZapped: (selector: string) => void;
  onResetZaps: () => void;
  compact?: boolean;
  /** Registry of mounted webviews by tab id (find-in-page, PDF). */
  webviewMap?: React.MutableRefObject<Map<string, WebviewEl>>;
  webviewKey?: string;
  /** Find-in-page match counts from the live webview. */
  onFoundInPage?: (info: { active: number; matches: number }) => void;
  /** Media started/stopped being audible in this tab's webview. */
  onAudible?: (audible: boolean) => void;
  /** Mute state for this tab's webview. */
  muted?: boolean;
}

const MODES: { id: OriginalSubMode; label: string; icon: string; tip: string }[] = [
  {
    id: "shielded",
    label: "shielded",
    icon: "shield",
    tip: "The real page with scripts, trackers, pixels and ad slots stripped. Works even when the site refuses frames.",
  },
  {
    id: "raw",
    label: "interactive",
    icon: "zap",
    tip: "The real page via relay, with its own scripts running in an isolated sandbox.",
  },
  {
    id: "live",
    label: "direct frame",
    icon: "antenna",
    tip: "Embeds the live site. Fastest, but some sites refuse frames and their trackers run unchecked.",
  },
];

export function LiveView(p: LiveProps) {
  const { tab, subMode, dark, zapped, compact = false } = p;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [zapMode, setZapMode] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const hasClean = Boolean(tab.article?.cleanHtml);
  const hasRaw = Boolean(tab.article?.rawHtml);
  const mode: OriginalSubMode =
    subMode === "live"
      ? "live"
      : tab.loading
        ? subMode
        : subMode === "raw" && hasRaw
          ? "raw"
          : hasClean
            ? "shielded"
            : "live";
  const isLive = mode === "live";
  const srcDoc = isLive
    ? undefined
    : mode === "raw"
      ? tab.article?.rawHtml || tab.article?.cleanHtml || undefined
      : tab.article?.cleanHtml || undefined;
  const waiting = !isLive && !srcDoc;
  const host = hostOf(tab.url);
  // Desktop renders live pages in a <webview>, which framing rules can't block.
  const hostile = !isDesktop && isFrameHostile(tab.url);
  const [forceFrame, setForceFrame] = useState(false);
  // A hostile host with no relay HTML can only show a blank frame — explain instead.
  const showHostile = hostile && isLive && !tab.loading && !forceFrame;
  const deskName = host === "github.com" ? "GitHub desk" : /youtube/.test(host) ? "tube desk" : null;

  const post = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage({ type: "quill:frame", ...msg }, "*");

  // Keep the page in step with the dark and zap controls.
  useEffect(() => {
    if (loaded && !isLive) post({ op: "dark", on: dark });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, loaded, isLive]);

  useEffect(() => {
    if (loaded && !isLive) post({ op: "zap", on: zapMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zapMode, loaded, isLive]);

  // SECURITY: only our own srcDoc frames may drive navigation or zap storage.
  // A live site must never be able to postMessage its way into navigating the tab.
  const liveRef = useRef(isLive);
  liveRef.current = isLive;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (liveRef.current) return;
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const d = e.data as { type?: string; href?: string; newTab?: boolean; selector?: string; dir?: number } | null;
      if (!d || typeof d !== "object") return;
      if (d.type === "quill:navigate" && isSafeHref(d.href || "")) {
        p.onNavigate(d.href as string, Boolean(d.newTab));
      } else if (d.type === "quill:zapped" && isSafeSelector(d.selector || "")) {
        p.onZapped(d.selector as string);
      } else if (d.type === "quill:zap-off") {
        setZapMode(false);
      } else if (d.type === "quill:zoom" && (d.dir === 1 || d.dir === -1)) {
        // rides the same throttled zoom path as the webview console bridge
        window.dispatchEvent(new CustomEvent("quill:zoom", { detail: d.dir }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.onNavigate, p.onZapped]);

  // Ctrl/⌘+⇧+X from anywhere toggles zap mode.
  useEffect(() => {
    const toggle = () => {
      if (!isLive) setZapMode((z) => !z);
    };
    window.addEventListener("quill:zap", toggle);
    return () => window.removeEventListener("quill:zap", toggle);
  }, [isLive]);

  useEffect(() => {
    setLoaded(false);
    setZapMode(false);
    setForceFrame(false);
  }, [tab.url, tab.nonce, mode, frameKey]);

  // Flash the zoom % in the control row when it changes, then fade.
  const [zoomFlash, setZoomFlash] = useState(false);
  const prevZoom = useRef(p.zoom);
  useEffect(() => {
    if (p.zoom === prevZoom.current) return;
    prevZoom.current = p.zoom;
    setZoomFlash(true);
    const t = setTimeout(() => setZoomFlash(false), 1400);
    return () => clearTimeout(t);
  }, [p.zoom]);

  const onLoad = () => {
    setLoaded(true);
    post({ op: "dark", on: dark });
    post({ op: "zaps", selectors: zapped });
    post({ op: "zap", on: zapMode });
    if (tab.article?.title) p.onTitle(tab.article.title);
  };

  // Never give untrusted HTML access to Quill's storage: srcDoc frames get no same-origin rights.
  // No popups-to-escape-sandbox (phishing popups must stay sandboxed) and no downloads.
  // Clipboard stays with Quill, not framed pages.
  const srcDocSandbox = "allow-scripts allow-forms allow-popups allow-modals";

  const zoomStyle =
    p.zoom !== 100
      ? { transform: `scale(${p.zoom / 100})`, transformOrigin: "top left", height: `${10000 / p.zoom}%`, width: `${10000 / p.zoom}%` }
      : { height: "100%", width: "100%" };

  return (
    <div className="relative flex h-full w-full flex-col bg-paper3/30">
      {hostile && !showHostile && (
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-yellow px-3 py-1.5 text-[13.5px] text-[#1a2440]">
          <span>
            {host === "github.com"
              ? "GitHub blocks proxies and framing — the desk below reads its public API instead."
              : /youtube/.test(host)
                ? "YouTube refuses to be framed, so the live page stays blank. Watch it in the tube desk instead."
                : `${host} refuses to be framed, so the direct frame may stay blank.`}
          </span>
          <button onClick={p.onReader} className="hd btn-sketch bg-paper2 px-2 py-0.5 text-[13px] text-[#1a2440]">
            {deskName ? `open the ${deskName}` : "try re-inked"}
          </button>
        </div>
      )}

      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="hd btn-sketch absolute left-3 top-2 z-30 flex items-center gap-1 bg-paper2/90 px-2 py-0.5 text-[12.5px] text-ink2 ink-shadow-sm"
          title="Show the original-page controls"
        >
          <Icon name="globe" size={12} className="text-cyan" /> {mode} ▾
        </button>
      ) : (
        <div className="relative z-20 flex flex-wrap items-center gap-1.5 border-b-2 border-ink/80 bg-paper2/95 px-2.5 py-1.5 text-[14px] text-ink">
          <span className="mr-1 hidden items-center gap-1 text-ink sm:flex" style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700 }}>
            <Icon name="globe" size={15} className="text-cyan" /> the real site:
          </span>

          {MODES.map((m) => {
            const active = subMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  p.onSubMode(m.id);
                  if ((m.id === "shielded" || m.id === "raw") && !hasClean && !tab.loading) p.onRetryHtml();
                }}
                title={m.tip}
                className={[
                  "hd-soft btn-sketch flex items-center gap-1 px-2 py-[2px] text-[13.5px] transition",
                  active ? "bg-yellow font-bold text-[#1a2440] ink-shadow-sm" : "bg-paper3/50 text-ink2 hover:bg-paper3",
                ].join(" ")}
              >
                <Icon name={m.icon} size={13} />
                <span>{m.label}</span>
              </button>
            );
          })}

          <span className="mx-0.5 h-5 w-px bg-ink/20" />

          <button
            onClick={() => !isLive && setZapMode((z) => !z)}
            disabled={isLive}
            title={isLive ? "The zapper works on shielded and interactive pages" : "Zap: click any element to hide it. Esc stops. (Ctrl/⌘+⇧+X)"}
            className={[
              "hd-soft btn-sketch flex items-center gap-1 px-2 py-[2px] text-[13.5px]",
              zapMode ? "bg-pink font-bold text-white" : "bg-paper3/50 text-ink2 hover:bg-yellow",
              isLive ? "opacity-40" : "",
            ].join(" ")}
          >
            <Icon name="eraser" size={13} /> <span className="hidden md:inline">zap</span>
          </button>
          {zapped.length > 0 && (
            <button
              onClick={() => {
                p.onResetZaps();
                setFrameKey((k) => k + 1);
              }}
              title="Forget the elements you zapped on this site"
              className="hd-soft px-2 py-[1px] text-[12.5px] text-ink2 hover:bg-red/20"
            >
              {zapped.length} zapped · reset
            </button>
          )}
          <button
            onClick={p.onToggleDark}
            disabled={isLive}
            title="Dark original: night ink on the real page, images stay natural"
            className={[
              "hd-soft btn-sketch flex items-center gap-1 px-2 py-[2px] text-[13.5px]",
              dark ? "bg-violet font-bold text-white" : "bg-paper3/50 text-ink2 hover:bg-paper3",
              isLive ? "opacity-40" : "",
            ].join(" ")}
          >
            <Icon name="moon" size={13} /> <span className="hidden md:inline">dark</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {zoomFlash && p.zoom !== 100 && (
              <span
                className="hd-soft mr-1 border-2 border-ink bg-paper2 px-2 py-[1px] text-[13px] font-semibold tabular-nums text-ink ink-shadow"
                style={{ borderRadius: "10px 3px 12px 3px / 3px 12px 3px 10px", transform: "rotate(-1.5deg)" }}
                role="status"
              >
                {p.zoom}%
              </span>
            )}
            {!compact && (
              <button
                onClick={p.onReader}
                className="hd-soft btn-sketch flex items-center gap-1 bg-cyan/80 px-2 py-[2px] text-[13.5px] text-[#12171f] hover:bg-cyan"
                title="Switch to the re-inked reading view"
              >
                <Icon name="scissors" size={12} /> <span className="hidden sm:inline">re-ink</span>
              </button>
            )}
            {!compact && p.onSplit && (
              <button
                onClick={p.onSplit}
                className="hd-soft btn-sketch hidden items-center gap-1 bg-paper3/60 px-2 py-[2px] text-[13.5px] hover:bg-yellow md:flex"
              >
                <Icon name="split" size={12} /> split
              </button>
            )}
            <button
              onClick={() => openOutside(tab.url)}
              className="hd-soft btn-sketch flex items-center gap-1 bg-paper3/60 px-2 py-[2px] text-[13.5px] hover:bg-yellow"
            >
              <Icon name="external" size={12} /> <span className="hidden md:inline">pop out</span>
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="hd-soft grid h-[24px] w-[24px] place-items-center bg-paper3/40 text-ink3 hover:text-ink"
              title="Hide this bar"
            >
              <Icon name="chevronDown" size={13} className="rotate-180" />
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        {showHostile ? (
          <div className="paper-bg grid h-full place-items-center overflow-y-auto p-6">
            <div className="hd relative w-full max-w-[520px] bg-paper2 p-5 text-ink ink-shadow">
              <span className="tape" style={{ top: -12, left: 28, transform: "rotate(-4deg)" }} />
              <div className="mb-2 flex items-center gap-2">
                <Icon name="shieldOff" size={22} className="text-orange" />
                <h2 className="text-[30px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                  {host} won't load here
                </h2>
              </div>
              <p className="text-[15.5px] leading-snug text-ink2">
                {host === "github.com" ? (
                  <>
                    GitHub refuses every public relay (403) and sends <code className="rounded bg-paper3 px-1 text-[13px]">X-Frame-Options: DENY</code>, so
                    its original page can't load inside Quill — or any app that respects framing rules. The GitHub desk reads the same content through
                    GitHub's public API instead.
                  </>
                ) : /youtube/.test(host) ? (
                  <>
                    YouTube refuses to be framed, so its pages stay blank here. The tube desk plays its videos through YouTube's official player instead.
                  </>
                ) : (
                  <>
                    This site refuses to be framed and the relay couldn't fetch a copy, so there's nothing to show in a direct frame. Try the re-inked
                    reader, or open it in a real browser tab.
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={p.onReader} className="hd btn-sketch flex items-center gap-1.5 bg-yellow px-3 py-1.5 text-[15.5px] text-[#1a2440]">
                  <Icon name={deskName ? "spark" : "scissors"} size={15} />
                  {deskName ? `open the ${deskName}` : "try re-inked"}
                </button>
                <button
                  onClick={() => openOutside(tab.url)}
                  className="hd btn-sketch flex items-center gap-1.5 bg-paper3 px-3 py-1.5 text-[15.5px] text-ink"
                >
                  <Icon name="external" size={15} /> open outside ↗
                </button>
                <button onClick={() => setForceFrame(true)} className="hd-soft px-3 py-1.5 text-[14px] text-ink2 hover:bg-paper3" title="Usually just a blank box">
                  try the frame anyway
                </button>
              </div>
            </div>
          </div>
        ) : waiting ? (
          <div className="paper-bg grid h-full place-items-center p-6">
            <div className="flex max-w-[440px] flex-col items-center gap-3 text-center text-ink2">
              <svg width="110" height="54" viewBox="0 0 110 54" fill="none">
                <path
                  d="M6 44 C 22 10, 40 10, 54 30 S 88 48, 104 14"
                  stroke="var(--cyan)"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  className="draw"
                  style={{ ["--len" as any]: 190 }}
                />
              </svg>
              <p className="text-[22px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                {tab.stage === "stripping"
                  ? "stripping trackers from the page…"
                  : tab.stage === "reinking"
                    ? "preparing the shielded page…"
                    : `fetching ${hostOf(tab.url)} through a relay…`}
              </p>
              {tab.stageNote && <p className="text-[14px] italic text-ink3">{tab.stageNote}</p>}
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => p.onSubMode("live")}
                  className="hd btn-sketch flex items-center gap-1.5 bg-yellow px-3 py-1 text-[15px] text-[#1a2440]"
                >
                  <Icon name="antenna" size={14} /> show the direct frame now
                </button>
                <button
                  onClick={() => openOutside(tab.url)}
                  className="hd-soft btn-sketch flex items-center gap-1.5 bg-paper2 px-3 py-1 text-[15px] text-ink"
                >
                  <Icon name="external" size={14} /> open in a browser tab
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {!hasClean && subMode !== "live" && !tab.loading && (
              <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-ink/30 bg-yellow/35 px-3 py-1.5 text-[13.5px] text-ink">
                <span>The relay couldn't fetch this page's HTML, so you're seeing the direct frame.</span>
                <span className="flex gap-1.5">
                  <button onClick={p.onRetryHtml} className="hd-soft bg-paper2 px-2 py-0.5 text-[13px] text-ink hover:bg-cyan hover:text-[#12171f]">
                    retry relay
                  </button>
                  <button
                    onClick={() => openOutside(tab.url)}
                    className="hd-soft bg-paper2 px-2 py-0.5 text-[13px] text-ink hover:bg-yellow hover:text-[#1a2440]"
                  >
                    open outside ↗
                  </button>
                </span>
              </div>
            )}

            {isLive ? (
              <WebFrame
                key={`live|${frameKey}`}
                url={tab.url}
                nonce={tab.nonce}
                zoom={p.zoom}
                strict={p.strict}
                autoplay={p.autoplay}
                referrer={p.referrer}
                onTitle={p.onTitle}
                onLoaded={() => setLoaded(true)}
                onNavigate={p.onFrameNavigate}
                elMap={p.webviewMap}
                elKey={p.webviewKey}
                onFoundInPage={p.onFoundInPage}
                onAudible={p.onAudible}
                muted={p.muted}
              />
            ) : (
              <iframe
                key={`${tab.url}|${mode}|${tab.nonce}|${frameKey}`}
                ref={frameRef}
                srcDoc={srcDoc}
                title={tab.title || hostOf(tab.url)}
                sandbox={srcDocSandbox}
                referrerPolicy={p.referrer}
                allow={p.autoplay ? "autoplay; fullscreen" : "fullscreen"}
                className="border-0 bg-white"
                style={zoomStyle}
                onLoad={onLoad}
              />
            )}

            {!loaded && !isLive && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-paper/75">
                <div className="flex flex-col items-center gap-2 text-ink2">
                  <svg width="84" height="42" viewBox="0 0 90 46" fill="none">
                    <path
                      d="M4 40 C 18 8, 34 8, 46 26 S 74 44, 86 12"
                      stroke="var(--pink)"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      className="draw"
                      style={{ ["--len" as any]: 160 }}
                    />
                  </svg>
                  <p className="text-[17px] italic">rendering {hostOf(tab.url)}…</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
