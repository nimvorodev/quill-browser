import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINES } from "../lib/nav";
import type { HistoryEntry } from "../lib/store";
import {
  embedSrc,
  fetchOEmbed,
  loadYouTubeApi,
  parseVideo,
  thumbUrl,
  watchUrl,
  youtubeChannel,
  youtubePlaylist,
  youtubeRelated,
  youtubeSearch,
  clearWatchPos,
  loadWatchPos,
  saveWatchPos,
  YT_ERRORS,
  type OEmbed,
  type VideoHit,
  type VideoRef,
  type YTPlayerInstance,
} from "../lib/video";
import { Icon } from "./Icons";
import { SearchBox } from "./SearchBox";
import { isDesktop } from "../lib/platform";
import { DeskModeSwitch, type DeskMode } from "./DeskHeader";
import { WebFrame, type WebviewEl } from "./WebFrame";

const STARTERS = ["lofi hip hop", "nature documentary", "piano lessons", "css grid tutorial", "space telescope"];
const YT_ENGINE = ENGINES.find((e) => e.id === "youtube") ?? ENGINES[0];
const HEAD = { fontFamily: "var(--font-display)", fontWeight: 700 } as const;

// Tube-desk audio: the IFrame player is the one thing the tab strip can't reach
// through WebFrame, so each player registers its controls here, keyed by tab id.
// ponytail: module-level map, one entry per playing tab — fine at this scale.
const tubePlayers = new Map<string, { mute: () => void; unmute: () => void; time: () => number }>();

type Phase = "loading" | "ready" | "error" | "iframe";

/** Audio wiring for the embedded player: what the tab strip shows and controls. */
interface PlayerAudio {
  /** Tab id — the registry key. */
  key?: string;
  /** Start muted / apply mute changes. */
  muted?: boolean;
  /** Player started/stopped being audible. */
  onAudible?: (audible: boolean) => void;
}

/**
 * Official YouTube player (IFrame API) on the privacy domain. Reports real error codes,
 * and falls back to a plain embed if the API script is blocked. Remembers where each
 * video was paused and resumes there; reports audible state for the tab strip.
 */
function useYouTubePlayer(id: string | undefined, list: string | undefined, onEnded: () => void, audio: PlayerAudio = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const [phase, setPhase] = useState<Phase>("loading");
  const [code, setCode] = useState<number | undefined>(undefined);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || (!id && !list)) return;
    let cancelled = false;
    let player: YTPlayerInstance | null = null;
    setPhase("loading");
    setCode(undefined);
    host.innerHTML = "";
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    host.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const playerVars: Record<string, unknown> = { rel: 0, modestbranding: 1, playsinline: 1 };
        if (/^https?:/.test(window.location.origin)) playerVars.origin = window.location.origin;
        if (list) {
          playerVars.list = list;
          if (!id) playerVars.listType = "playlist";
        }
        if (audioRef.current.muted) playerVars.mute = 1;
        const resume = id ? loadWatchPos(id) : 0;
        if (resume) playerVars.start = Math.floor(resume);
        player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          ...(id ? { videoId: id } : {}),
          playerVars,
          events: {
            onReady: () => {
              if (!cancelled) setPhase("ready");
            },
            onError: (e: { data: number }) => {
              if (!cancelled) {
                setCode(e.data);
                setPhase("error");
              }
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              // 1 playing · 2 paused · 0 ended — anything else (buffering, cued) leaves the flag alone.
              const audible = e.data === 1 ? true : e.data === 0 || e.data === 2 ? false : null;
              if (audible !== null) audioRef.current.onAudible?.(audible);
              if (e.data === YT.PlayerState.ENDED) {
                if (id) clearWatchPos(id);
                endedRef.current();
              }
            },
          },
        });
        if (audioRef.current.key) {
          tubePlayers.set(audioRef.current.key, {
            mute: () => { try { player?.mute(); } catch { /* gone */ } },
            unmute: () => { try { player?.unMute(); } catch { /* gone */ } },
            time: () => { try { return player ? Math.floor(player.getCurrentTime()) : 0; } catch { return 0; } },
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("iframe");
      });

    // Remember the position every few seconds while the desk is open — cheap, and
    // a crash or close still leaves a resume point behind.
    const posTimer = id
      ? window.setInterval(() => {
          try {
            if (player) saveWatchPos(id, player.getCurrentTime());
          } catch {
            /* not ready */
          }
        }, 5000)
      : 0;

    return () => {
      cancelled = true;
      if (posTimer) window.clearInterval(posTimer);
      if (audioRef.current.key && tubePlayers.get(audioRef.current.key)) tubePlayers.delete(audioRef.current.key);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [id, list]);

  return { hostRef, phase, code };
}

export function TubeView({
  url,
  history,
  onNavigate,
  onSearch,
  onOpenOutside,
  onLive,
  mode = "desk",
  onMode,
  zoom = 100,
  nonce = 0,
  onFrameNavigate,
  onTitle,
  webviewMap,
  webviewKey,
  muted,
  onAudible,
}: {
  url: string;
  history: HistoryEntry[];
  onNavigate: (href: string) => void;
  onSearch: (text: string) => void;
  onOpenOutside: (href: string) => void;
  onLive: () => void;
  mode?: DeskMode;
  onMode?: (m: DeskMode) => void;
  zoom?: number;
  nonce?: number;
  onFrameNavigate?: (href: string) => void;
  onTitle?: (t: string) => void;
  webviewMap?: React.MutableRefObject<Map<string, WebviewEl>>;
  webviewKey?: string;
  muted?: boolean;
  onAudible?: (audible: boolean) => void;
}) {
  const vref: VideoRef = parseVideo(url) ?? { kind: "home" };

  // Desktop: the original youtube.com page in a real webview.
  if (mode === "original" && isDesktop) {
    return (
      <div className="relative flex h-full w-full flex-col">
        <div className="relative z-20 flex flex-wrap items-center gap-2 border-b-2 border-ink/80 bg-paper2/95 px-2.5 py-1.5 text-ink">
          <span className="flex items-center gap-1 text-ink" style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700 }}>
            <Icon name="star" size={15} className="text-pink" /> original youtube
          </span>
          <span className="hidden text-[13px] italic text-ink3 md:inline">the real site, in an isolated window · ad hosts blocked at the network</span>
          <span className="ml-auto">
            <DeskModeSwitch mode={mode} onMode={(m) => onMode?.(m)} siteName="YouTube" siteUrl={url} accent="var(--pink)" />
          </span>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          <WebFrame
            url={url}
            nonce={nonce}
            zoom={zoom}
            strict
            autoplay
            referrer="strict-origin-when-cross-origin"
            onTitle={(t) => onTitle?.(t)}
            onNavigate={onFrameNavigate}
            elMap={webviewMap}
            elKey={webviewKey}
            muted={muted}
            onAudible={onAudible}
          />
        </div>
      </div>
    );
  }
  const watching = vref.kind === "watch" || vref.kind === "shorts";
  const outside = watching
    ? watchUrl(vref.id || "")
    : vref.kind === "search"
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(vref.query || "")}`
      : vref.kind === "channel"
        ? `https://www.youtube.com${vref.channelPath || ""}`
        : "https://www.youtube.com";
  const crumb =
    watching
      ? "watching"
      : vref.kind === "playlist"
        ? "playlist"
        : vref.kind === "search"
          ? `results · ${vref.query || ""}`
          : vref.kind === "channel"
            ? `channel · ${vref.channelPath || ""}`
            : "home";

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className="mx-auto max-w-[1160px] px-4 py-5 sm:px-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] uppercase tracking-[0.18em] text-ink3">the tube desk · {crumb}</p>
            <h1 className="text-[34px] leading-none text-ink" style={HEAD}>
              <span className="marker" style={{ ["--hl" as any]: "var(--pink)" }}>
                youtube, inside quill
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <DeskModeSwitch mode={mode} onMode={(m) => onMode?.(m)} siteName="YouTube" siteUrl={outside} accent="var(--pink)" />
            {watching && !isDesktop && (
              <button
                onClick={onLive}
                title="YouTube blocks framing in a browser tab, so this usually stays blank"
                className="hd-soft btn-sketch flex items-center gap-1 bg-paper2 px-2.5 py-1 text-[14px] text-ink2 hover:bg-paper3"
              >
                <Icon name="globe" size={13} /> try the live frame
              </button>
            )}
          </div>
        </header>

        <div className="mb-5">
          <SearchBox
            engine={YT_ENGINE}
            onSubmit={(text) => onSearch(text)}
            size="md"
            placeholder="search YouTube…"
            showEngine={false}
            showHints={false}
            initial={vref.kind === "search" ? vref.query || "" : ""}
          />
        </div>

        {vref.kind === "home" && <TubeHome history={history} onSearch={onSearch} onNavigate={onNavigate} />}
        {(vref.kind === "watch" || vref.kind === "shorts" || vref.kind === "playlist") && (
          <WatchLayout vref={vref} onNavigate={onNavigate} onOpenOutside={onOpenOutside} muted={muted} onAudible={onAudible} tabKey={webviewKey} />
        )}
        {(vref.kind === "search" || vref.kind === "channel") && (
          <ResultsGrid
            kind={vref.kind}
            query={vref.query}
            channelPath={vref.channelPath}
            onNavigate={onNavigate}
            onOpenOutside={onOpenOutside}
          />
        )}
      </div>
    </div>
  );
}

function WatchLayout({
  vref,
  onNavigate,
  onOpenOutside,
  muted,
  onAudible,
  tabKey,
}: {
  vref: VideoRef;
  onNavigate: (href: string) => void;
  onOpenOutside: (href: string) => void;
  muted?: boolean;
  onAudible?: (audible: boolean) => void;
  tabKey?: string;
}) {
  const id = vref.id;
  const list = vref.list;
  const [meta, setMeta] = useState<OEmbed | null>(null);
  const [related, setRelated] = useState<VideoHit[]>([]);
  const [playlistItems, setPlaylistItems] = useState<VideoHit[] | null>(null);
  const [note, setNote] = useState("");
  const [autoplay, setAutoplay] = useState(true);
  const [ended, setEnded] = useState(false);
  const [count, setCount] = useState(6);
  const relatedRef = useRef<VideoHit[]>([]);
  const autoRef = useRef(true);
  const navRef = useRef(onNavigate);
  autoRef.current = autoplay;
  relatedRef.current = related;
  navRef.current = onNavigate;

  const { hostRef, phase, code } = useYouTubePlayer(id, list, () => {
    if (autoRef.current && relatedRef.current.length) {
      setCount(6);
      setEnded(true);
    }
  }, { key: tabKey, muted, onAudible });

  // Tab-strip mute reaches the embedded player through the registry (the one
  // surface WebFrame can't control). Re-applied when the player is recreated.
  useEffect(() => {
    const p = tabKey ? tubePlayers.get(tabKey) : undefined;
    if (!p) return;
    try {
      if (muted) p.mute();
      else p.unmute();
    } catch {
      /* player gone */
    }
  }, [muted, tabKey, id, list]);

  useEffect(() => {
    setEnded(false);
    setMeta(null);
    setRelated([]);
    setPlaylistItems(null);
    setNote("");
  }, [id, list]);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    fetchOEmbed(watchUrl(id), ac.signal).then((m) => {
      if (!ac.signal.aborted) setMeta(m);
    });
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    if (!id || !meta?.title) return;
    const ac = new AbortController();
    setNote("finding similar videos…");
    // The watch page's own related list first; a title search as the fallback.
    const load = async () => {
      try {
        const rel = (await youtubeRelated(id, ac.signal)).filter((v) => v.id !== id);
        if (ac.signal.aborted) return;
        if (rel.length) {
          setRelated(rel);
          setNote("");
          return;
        }
      } catch (e) {
        if (ac.signal.aborted) return;
      }
      try {
        const alt = (await youtubeSearch(meta.title, ac.signal)).filter((v) => v.id !== id);
        if (ac.signal.aborted) return;
        setRelated(alt);
        setNote(alt.length ? "" : "no similar videos came back");
      } catch {
        if (!ac.signal.aborted) setNote("similar videos are unavailable right now.");
      }
    };
    void load();
    return () => ac.abort();
  }, [id, meta?.title]);

  // Playlist contents — the player already plays the list; this shows what's in it.
  useEffect(() => {
    if (!list) return;
    const ac = new AbortController();
    youtubePlaylist(list, ac.signal)
      .then((items) => {
        if (!ac.signal.aborted) setPlaylistItems(items);
      })
      .catch(() => {
        /* the player still plays the list; the sidebar just stays hidden */
      });
    return () => ac.abort();
  }, [list]);

  useEffect(() => {
    if (!ended) return;
    if (count <= 0) {
      const next = relatedRef.current[0];
      setEnded(false);
      if (next) navRef.current(watchUrl(next.id));
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [ended, count]);

  const embed = embedSrc(vref);
  const shorts = vref.kind === "shorts";
  const next = related[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <section className="min-w-0">
        <div
          className={["relative w-full overflow-hidden border-2 border-ink bg-black ink-shadow", shorts ? "mx-auto max-w-[360px]" : ""].join(" ")}
          style={{ borderRadius: "16px 6px 18px 6px / 6px 18px 6px 16px" }}
        >
          <div className={shorts ? "relative aspect-[9/16] w-full" : "relative aspect-video w-full"}>
            <div ref={hostRef} className="absolute inset-0" />

            {phase === "iframe" && embed && (
              <iframe
                key={embed}
                src={embed}
                title={meta?.title || "YouTube video"}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}

            {phase === "loading" && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-[15px] italic text-white/80">loading the player…</div>
            )}

            {phase === "error" && code !== undefined && id && (
              <div className="absolute inset-0 grid place-items-center bg-ink/85 p-4">
                <div className="hd max-w-[440px] bg-paper2 p-4 text-ink">
                  <p className="text-[21px] leading-tight" style={HEAD}>
                    this one won't play inside Quill
                  </p>
                  <p className="mt-1 text-[15px] text-ink2">
                    {YT_ERRORS[code] || "YouTube couldn't play it here."} <span className="text-ink3">(YouTube code {code})</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => onOpenOutside(watchUrl(id))} className="hd btn-sketch bg-yellow px-3 py-1 text-[15px] text-[#1a2440]">
                      open on YouTube ↗
                    </button>
                    {next && (
                      <button onClick={() => onNavigate(watchUrl(next.id))} className="hd-soft btn-sketch bg-paper3 px-3 py-1 text-[15px] text-ink">
                        play a similar video
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {ended && next && (
              <div className="absolute inset-0 grid place-items-center bg-ink/80 p-4">
                <div className="hd max-w-[420px] bg-paper2 p-4 text-ink">
                  <p className="text-[12.5px] uppercase tracking-[0.16em] text-ink3">up next in {count}s</p>
                  <p className="mt-1 line-clamp-2 break-words text-[19px] [overflow-wrap:anywhere]" style={HEAD}>
                    {next.title}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        setEnded(false);
                        onNavigate(watchUrl(next.id));
                      }}
                      className="hd btn-sketch bg-yellow px-3 py-1 text-[15px] text-[#1a2440]"
                    >
                      play now
                    </button>
                    <button onClick={() => setEnded(false)} className="hd-soft btn-sketch bg-paper3 px-3 py-1 text-[15px] text-ink">
                      cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 min-w-0 px-1 text-ink">
          <p className="break-words text-[26px] leading-tight [overflow-wrap:anywhere]" style={HEAD}>
            {meta?.title || (id ? "YouTube video" : "Playlist")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[14.5px] text-ink2">
            {meta?.author && (
              <button
                onClick={() => meta.authorUrl && onNavigate(meta.authorUrl)}
                title="Open this channel in the tube desk"
                className="underline decoration-dotted hover:text-ink"
              >
                {meta.author}
              </button>
            )}
            <span className="text-ink3">· privacy embed, no cookies</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setAutoplay((a) => !a)}
              className={["hd-soft btn-sketch px-2.5 py-1 text-[14px]", autoplay ? "bg-lime/40 text-ink" : "bg-paper2 text-ink2"].join(" ")}
            >
              autoplay next: {autoplay ? "on" : "off"}
            </button>
            {id && (
              <button
                onClick={() => {
                  // Carry the current timestamp (if it's worth jumping to) so the
                  // link opens where you were.
                  const t = tabKey ? tubePlayers.get(tabKey)?.time?.() ?? 0 : 0;
                  void navigator.clipboard?.writeText(watchUrl(id, t));
                }}
                className="hd-soft btn-sketch flex items-center gap-1 bg-paper2 px-2.5 py-1 text-[14px] text-ink2 hover:bg-cyan hover:text-[#12171f]"
              >
                <Icon name="copy" size={12} /> copy link
              </button>
            )}
          </div>
        </div>
      </section>

      <aside className="min-w-0">
        {list && playlistItems && playlistItems.length > 0 && (
          <div className="mb-5">
            <h2 className="mb-2 text-[23px] text-ink" style={HEAD}>
              in this playlist <span className="text-[14px] italic text-ink3">({playlistItems.length})</span>
            </h2>
            <div className="no-scrollbar max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {playlistItems.map((v) => (
                <button
                  key={v.id + v.title}
                  onClick={() => onNavigate(watchUrl(v.id))}
                  className={["hd-soft flex w-full items-center gap-2 p-1 text-left", v.id === id ? "bg-yellow/40" : "hover:bg-paper3/60"].join(" ")}
                  style={{ borderRadius: "10px 3px 12px 3px" }}
                >
                  <span className="relative shrink-0 overflow-hidden border border-ink/40" style={{ borderRadius: "8px 3px 8px 3px" }}>
                    <img src={thumbUrl(v.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-[42px] w-[75px] object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{v.title || "YouTube video"}</span>
                  {v.id === id && <span className="shrink-0 text-[12px] italic text-ink2">playing</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[23px] text-ink" style={HEAD}>
            up next
          </h2>
          <span className="text-[13px] italic text-ink3">{note}</span>
        </div>
        <div className="space-y-3">
          {related.slice(0, 12).map((v) => (
            <VideoCard key={v.id} hit={v} onOpen={(vid) => onNavigate(watchUrl(vid))} compact />
          ))}
        </div>
      </aside>
    </div>
  );
}

function ResultsGrid({
  kind,
  query,
  channelPath,
  onNavigate,
  onOpenOutside,
}: {
  kind: "search" | "channel";
  query?: string;
  channelPath?: string;
  onNavigate: (href: string) => void;
  onOpenOutside: (href: string) => void;
}) {
  const [hits, setHits] = useState<VideoHit[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (kind === "search" && !query) {
      setHits(null);
      setErr("");
      setBusy(false);
      return;
    }
    const ac = new AbortController();
    setBusy(true);
    setErr("");
    setHits(null);
    const job = kind === "channel" ? youtubeChannel(channelPath || "/", ac.signal) : youtubeSearch(query || "", ac.signal);
    job
      .then((list) => {
        if (!ac.signal.aborted) setHits(list);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : "YouTube didn't answer");
      })
      .finally(() => {
        if (!ac.signal.aborted) setBusy(false);
      });
    return () => ac.abort();
  }, [kind, query, channelPath, attempt]);

  if (kind === "search" && !query) {
    return <p className="text-[17px] italic text-ink3">Type something above to search YouTube.</p>;
  }

  const title = kind === "channel" ? `uploads · ${(channelPath || "").replace("/", "")}` : `results for “${query}”`;

  return (
    <section>
      <h2 className="mb-3 break-words text-[24px] text-ink [overflow-wrap:anywhere]" style={HEAD}>
        {title}
      </h2>
      {busy && <p className="text-[16px] italic text-ink2">reading YouTube's own results page through a relay…</p>}
      {err && (
        <div className="hd mb-3 bg-red/10 p-3 text-[15.5px] text-ink">
          <p>The relays couldn't read YouTube just now: {err}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => setAttempt((a) => a + 1)} className="hd-soft btn-sketch bg-paper2 px-2.5 py-0.5 text-[14px] text-ink hover:bg-yellow hover:text-[#1a2440]">
              try again
            </button>
            <button
              onClick={() => onOpenOutside(`https://www.youtube.com/results?search_query=${encodeURIComponent(query || "")}`)}
              className="hd-soft btn-sketch bg-paper2 px-2.5 py-0.5 text-[14px] text-ink hover:bg-yellow hover:text-[#1a2440]"
            >
              open on YouTube ↗
            </button>
          </div>
        </div>
      )}
      {hits && hits.length === 0 && <p className="text-[16px] italic text-ink3">Nothing playable came back. Try different words.</p>}
      {hits && hits.length > 0 && (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {hits.map((v) => (
            <VideoCard key={v.id} hit={v} onOpen={(id) => onNavigate(watchUrl(id))} />
          ))}
        </div>
      )}
    </section>
  );
}

function TubeHome({
  history,
  onSearch,
  onNavigate,
}: {
  history: HistoryEntry[];
  onSearch: (q: string) => void;
  onNavigate: (href: string) => void;
}) {
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; title: string }[] = [];
    for (const h of history) {
      const r = parseVideo(h.url);
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ id: r.id, title: h.title || "YouTube video" });
      if (out.length >= 9) break;
    }
    return out;
  }, [history]);

  return (
    <div className="space-y-6">
      <div className="hd relative bg-paper2 p-5 text-ink ink-shadow">
        <span className="tape" style={{ top: -12, left: 28, transform: "rotate(-4deg)" }} />
        <p className="text-[21px] leading-snug" style={HEAD}>
          YouTube's own pages refuse to load inside other sites. Search here and the videos play right inside Quill.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => onSearch(s)}
              className="hd-soft btn-sketch bg-paper3 px-2.5 py-1 text-[15px] text-ink hover:bg-yellow hover:text-[#1a2440]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-[24px] text-ink" style={HEAD}>
            watched lately
          </h2>
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((v) => (
              <VideoCard
                key={v.id}
                hit={{ id: v.id, title: v.title, channel: "", duration: "", views: "", published: "" }}
                onOpen={(id) => onNavigate(watchUrl(id))}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function VideoCard({ hit, onOpen, compact = false }: { hit: VideoHit; onOpen: (id: string) => void; compact?: boolean }) {
  return (
    <button onClick={() => onOpen(hit.id)} className={["group flex min-w-0 text-left text-ink", compact ? "gap-2.5" : "flex-col gap-2"].join(" ")}>
      <span
        className={["relative block shrink-0 overflow-hidden border-2 border-ink bg-paper3", compact ? "h-[66px] w-[118px]" : "aspect-video w-full"].join(" ")}
        style={{ borderRadius: "12px 4px 14px 4px" }}
      >
        <img
          src={thumbUrl(hit.id)}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        {hit.duration && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] text-white">{hit.duration}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block break-words text-[17px] leading-snug [overflow-wrap:anywhere] group-hover:underline" style={HEAD}>
          {hit.title || "YouTube video"}
        </span>
        {hit.channel && <span className="mt-0.5 block truncate text-[13px] text-ink2">{hit.channel}</span>}
        {(hit.views || hit.published) && (
          <span className="block truncate text-[12.5px] text-ink3">{[hit.views, hit.published].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </button>
  );
}
