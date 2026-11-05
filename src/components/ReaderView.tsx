import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import type { Article, Link, ReadStage } from "../lib/reader";
import { CAT_LABEL, CAT_COLOR, type Category } from "../lib/filters";
import type { PaperTone, ReinkStyle } from "../lib/settings";
import { pinSizelessImages } from "../lib/images";
import { isFrameHostile } from "../lib/nav";
import { streamChat, type AIConfig } from "../lib/ai";

/** Translate target languages — the picker in the re-ink toolbar. */
const LANGS: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  ru: "Russian",
  ar: "Arabic",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
};

/** Weave real links inline where their anchor words appear, plus chips for any extra links. */
function Linked({
  text,
  links,
  onLink,
}: {
  text: string;
  links?: Link[];
  onLink: (href: string, newTab?: boolean) => void;
}) {
  if (!links?.length) return <>{text}</>;

  // Match anchor texts inside `text` greedily without overlaps
  type Span = { start: number; end: number; link: Link };
  const spans: Span[] = [];
  const usedLinks = new Set<number>();
  const lower = text.toLowerCase();

  // Sort longer link texts first so specific phrases match before single words
  const indexed = links.map((l, idx) => ({ l, idx })).sort((a, b) => b.l.text.length - a.l.text.length);

  for (const { l, idx } of indexed) {
    const needle = l.text.trim().toLowerCase();
    if (needle.length < 2) continue;
    let from = 0;
    while (from < lower.length) {
      const pos = lower.indexOf(needle, from);
      if (pos < 0) break;
      const end = pos + needle.length;
      const overlaps = spans.some((s) => !(end <= s.start || pos >= s.end));
      if (!overlaps) {
        spans.push({ start: pos, end, link: l });
        usedLinks.add(idx);
        break;
      }
      from = pos + 1;
    }
  }

  spans.sort((a, b) => a.start - b.start);

  const inlineNodes: ReactNode[] = [];
  if (spans.length === 0) {
    inlineNodes.push(text);
  } else {
    let cursor = 0;
    spans.forEach((sp, i) => {
      if (sp.start > cursor) inlineNodes.push(text.slice(cursor, sp.start));
      const label = text.slice(sp.start, sp.end);
      inlineNodes.push(
        <a
          key={`in-${i}`}
          href={sp.link.href}
          title={sp.link.href}
          onClick={(e) => {
            e.preventDefault();
            onLink(sp.link.href, e.metaKey || e.ctrlKey || e.shiftKey);
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onLink(sp.link.href, true);
            }
          }}
          className="cursor-pointer underline decoration-wavy decoration-pink/85 decoration-[1.8px] underline-offset-[4px] transition hover:bg-yellow/55 hover:decoration-pink"
        >
          {label}
        </a>,
      );
      cursor = sp.end;
    });
    if (cursor < text.length) inlineNodes.push(text.slice(cursor));
  }

  const extras = links.filter((_, idx) => !usedLinks.has(idx));

  return (
    <>
      {inlineNodes}
      {extras.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {extras.map((l, i) => (
            <a
              key={`ex-${i}`}
              href={l.href}
              title={l.href}
              onClick={(e) => {
                e.preventDefault();
                onLink(l.href, e.metaKey || e.ctrlKey || e.shiftKey);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onLink(l.href, true);
                }
              }}
              className="hd-soft inline-flex max-w-full items-center gap-1 bg-paper2 px-2 py-[1px] text-[13px] text-ink2 transition hover:bg-cyan hover:text-[#12171f]"
            >
              <Icon name="external" size={11} />
              <span className="truncate">{l.text.length > 56 ? l.text.slice(0, 56) + "…" : l.text}</span>
            </a>
          ))}
        </span>
      )}
    </>
  );
}

function CodeBlock({ text, lang }: { text: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-4">
      <div className="flex items-center justify-between border-2 border-b-0 border-ink/60 bg-paper3/90 px-3 py-1 text-[12px] text-ink3" style={{ borderRadius: "10px 3px 0 0" }}>
        <span>{lang || "code"}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="flex items-center gap-1 text-ink2 hover:text-ink"
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre
        className="no-scrollbar overflow-x-auto border-2 border-ink/70 bg-paper3/60 p-3 text-[13.5px] leading-relaxed"
        style={{ fontFamily: "ui-monospace, monospace", borderRadius: "0 0 12px 3px" }}
      >
        {text}
      </pre>
    </div>
  );
}

function toMarkdown(a: Article) {
  const head = `# ${a.title}\n\n> source: ${a.url}\n> re-inked via Quill (${a.via}) · ${a.words} words · ~${a.minutes} min\n> ${a.blocked.length} ad/tracker requests & params stripped before render\n\n`;
  const body = a.nodes
    .map((n) => {
      if (n.t === "h") return `${"#".repeat(Math.min(n.level + 1, 6))} ${n.text}`;
      if (n.t === "p") return n.text;
      if (n.t === "li") return `${n.rank ? n.rank : "-"} ${n.text}`;
      if (n.t === "q") return `> ${n.text}`;
      if (n.t === "code") return "```" + (n.lang || "") + "\n" + n.text + "\n```";
      if (n.t === "img") return `![${n.alt}](${n.src})`;
      if (n.t === "table") {
        const hdr = n.headers.length ? n.headers : n.rows[0] || [];
        const rest = n.headers.length ? n.rows : n.rows.slice(1);
        const sep = hdr.map(() => "---");
        return [
          `| ${hdr.join(" | ")} |`,
          `| ${sep.join(" | ")} |`,
          ...rest.map((r) => `| ${r.join(" | ")} |`),
        ].join("\n");
      }
      return "---";
    })
    .join("\n\n");
  return head + body;
}

const STAGES: { id: ReadStage; label: string }[] = [
  { id: "fetching", label: "1. Fetching via relay" },
  { id: "stripping", label: "2. Stripping trackers & pixels" },
  { id: "reinking", label: "3. Re-inking onto paper" },
];

export function ReaderView({
  article,
  loading,
  stage,
  stageNote,
  error,
  url,
  onRetry,
  onShowOriginal,
  onLiveFrame,
  onSplit,
  onOpenOutside,
  onAsk,
  onNote,
  onLink,
  aiCfg,
  shieldsOn,
  fontStep,
  setFontStep,
  reinkStyle,
  setReinkStyle,
  paperTone,
  setPaperTone,
  showImages,
  setShowImages,
  compact = false,
}: {
  article: Article | null;
  loading: boolean;
  stage: ReadStage | null;
  stageNote: string;
  error: string | null;
  url: string;
  /** AI engine config — the translate button runs the page text through it. */
  aiCfg: AIConfig;
  onRetry: () => void;
  onShowOriginal: () => void;
  onLiveFrame: () => void;
  onSplit?: () => void;
  onOpenOutside: () => void;
  onAsk: (prompt: string, passage?: string) => void;
  /** Save a text selection as a sticky note (start page). */
  onNote?: (text: string) => void;
  onLink: (href: string, newTab?: boolean) => void;
  shieldsOn: boolean;
  fontStep: number;
  setFontStep: (n: number) => void;
  reinkStyle: ReinkStyle;
  setReinkStyle: (s: ReinkStyle) => void;
  paperTone: PaperTone;
  setPaperTone: (p: PaperTone) => void;
  showImages: boolean;
  setShowImages: (b: boolean) => void;
  compact?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [showLedger, setShowLedger] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [sel, setSel] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  // Page translation: the configured AI engine (offline Scribe or Ollama etc.)
  // translates the re-inked text; the original is one click back.
  const [lang, setLang] = useState((navigator.language || "en").slice(0, 2));
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const transBuf = useRef("");

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      setProgress(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
      setSel(null);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [article, loading]);

  useEffect(() => {
    const up = () => {
      const s = window.getSelection();
      const text = s?.toString().trim() || "";
      if (text.length > 18 && s && s.rangeCount > 0 && scroller.current?.contains(s.anchorNode)) {
        const r = s.getRangeAt(0).getBoundingClientRect();
        const host = scroller.current.getBoundingClientRect();
        const rawX = r.left - host.left + r.width / 2;
        const clampedX = Math.max(95, Math.min(host.width - 95, rawX));
        const topRel = r.top - host.top;
        const below = topRel < 52;
        const y = below ? Math.min(host.height - 44, r.bottom - host.top + 8) : topRel - 8;
        setSel({ text, x: clampedX, y, below });
      } else {
        setSel(null);
      }
    };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);

  // Reset the translation when the page changes.
  useEffect(() => {
    setTranslation(null);
    setTranslating(false);
  }, [url]);

  const translate = async () => {
    if (!article || translating) return;
    setTranslating(true);
    transBuf.current = "";
    setTranslation("");
    try {
      // ponytail: 24k-char cap — the offline Scribe's context is small; a
      // chunked/parallel translation can replace this when long pages matter.
      await streamChat(
        aiCfg,
        [
          {
            role: "user",
            content: `Translate the following article into ${LANGS[lang] || "English"}. Reply with ONLY the translation as plain text, keeping the paragraph breaks.\n\n${article.text.slice(0, 24000)}`,
          },
        ],
        (tok) => {
          transBuf.current += tok;
          setTranslation(transBuf.current);
        },
      );
    } catch {
      setTranslation((t) => t || "(translation failed — check the AI engine in the ask-AI panel)");
    }
    setTranslating(false);
  };

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    (article?.blocked || []).forEach((b) => (m[b.cat] = (m[b.cat] || 0) + 1));
    return m;
  }, [article]);

  // Site images that carry only a viewBox have no intrinsic width and would stretch.
  useEffect(() => {
    pinSizelessImages(bodyRef.current);
  }, [article, showImages]);

  if (loading) {
    const activeIdx = Math.max(0, STAGES.findIndex((s) => s.id === (stage || "fetching")));
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex max-w-[460px] flex-col items-center gap-4 text-center text-ink2">
          <svg width="130" height="70" viewBox="0 0 130 70" fill="none">
            <path
              d="M6 58 C 26 12, 48 12, 64 38 S 108 62, 124 18"
              stroke="var(--cyan)"
              strokeWidth="3"
              strokeLinecap="round"
              className="draw"
              style={{ ["--len" as any]: 220 }}
            />
            <path d="M14 64h100" stroke="var(--ink)" strokeOpacity=".25" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 8" />
          </svg>
          <p className="text-[24px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            fetching, stripping trackers, re-inking…
          </p>

          {/* Live 3-stage pipeline */}
          <div className="hd w-full bg-paper2/85 p-3 text-left ink-shadow-sm">
            {STAGES.map((st, idx) => {
              const done = idx < activeIdx;
              const current = idx === activeIdx;
              return (
                <div key={st.id} className="flex items-center gap-2 py-1 text-[15px]">
                  <span
                    className={[
                      "grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full border border-ink text-[11px]",
                      done ? "bg-lime text-[#12171f]" : current ? "bg-yellow text-[#1a2440]" : "bg-paper3 text-ink3",
                    ].join(" ")}
                  >
                    {done ? "✓" : current ? "✎" : idx + 1}
                  </span>
                  <span className={current ? "font-bold text-ink" : done ? "text-ink2" : "text-ink3"}>{st.label}</span>
                </div>
              );
            })}
            {stageNote && <p className="mt-1.5 border-t border-dashed border-ink/20 pt-1.5 text-[13px] italic text-ink3">{stageNote}</p>}
          </div>

          <p className="max-w-full truncate text-[14px] italic text-ink3">{url}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={onLiveFrame} className="hd-soft btn-sketch flex items-center gap-1.5 bg-paper2 px-3 py-1 text-[14.5px] hover:bg-cyan">
              <Icon name="globe" size={14} /> show original live frame now
            </button>
            <button onClick={onOpenOutside} className="hd-soft btn-sketch flex items-center gap-1.5 bg-paper2 px-3 py-1 text-[14.5px] hover:bg-yellow">
              <Icon name="external" size={14} /> open in browser tab
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="hd relative max-w-[620px] bg-paper2 p-6 ink-shadow-lg">
          <span className="tape" style={{ top: -13, left: 30, transform: "rotate(-5deg)", background: "color-mix(in srgb, var(--pink) 55%, white)" }} />
          <div className="mb-3 flex items-center gap-3">
            <svg width="46" height="46" viewBox="0 0 46 46" className="wiggle">
              <path d="M23 6c9 6 15 13 15 20a15 15 0 0 1-30 0c0-7 6-14 15-20z" fill="var(--ink)" fillOpacity=".14" />
              <path d="M23 6c9 6 15 13 15 20a15 15 0 0 1-30 0c0-7 6-14 15-20z" stroke="var(--ink)" strokeWidth="2" fill="none" />
              <path d="M17 20c2-2 5-2 6 0M24 20c2-2 5-2 6 0M18 30c3 3 7 3 10 0" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
            <h2 className="text-[34px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              the ink ran dry
            </h2>
          </div>
          <p className="reading mb-1 text-ink2">{error || "Nothing came back from the relay."}</p>
          {isFrameHostile(url) && (
            <p className="mb-2 rounded border-2 border-ink bg-yellow/40 px-2 py-1 text-[14px] text-ink">
              Heads-up: this site also refuses to be framed, so the live frame will stay blank — opening outside is the reliable route.
            </p>
          )}
          <p className="mb-4 break-all text-[14px] italic text-ink3">{url}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={onRetry} className="hd btn-sketch flex items-center gap-1.5 bg-yellow px-3 py-1.5 text-[17px] text-[#1a2440]">
              <Icon name="reload" size={16} /> try relays again
            </button>
            <button onClick={onLiveFrame} className="hd btn-sketch flex items-center gap-1.5 bg-cyan px-3 py-1.5 text-[17px] text-[#12171f]">
              <Icon name="globe" size={16} /> show original website (live frame)
            </button>
            <button onClick={onOpenOutside} className="hd btn-sketch flex items-center gap-1.5 bg-paper3/70 px-3 py-1.5 text-[17px]">
              <Icon name="external" size={16} /> open outside Quill
            </button>
          </div>
          <p className="mt-4 border-t border-dashed border-ink/25 pt-3 text-[14px] text-ink3">
            Reader relays are public CORS proxies — they only see the URL you request (never your cookies, keys or notes). For sites that
            block proxies, <em>Original Website (Live Frame)</em> loads them directly in a sandboxed iframe.
          </p>
        </div>
      </div>
    );
  }

  const fontClass = reinkStyle === "serif" ? "reading-serif" : reinkStyle === "mono" ? "reading-mono" : "reading";

  return (
    <div className="relative h-full">
      <div className="absolute left-0 right-0 top-0 z-20 h-[5px] bg-ink/10">
        <div className="h-full bg-pink transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
      </div>

      <div ref={scroller} className="no-scrollbar h-full overflow-y-auto pt-2">
        <div
          className={[
            "mx-auto my-4 max-w-[780px] px-5 pb-20 pt-5 sm:px-7",
            paperTone === "sepia" ? "paper-sepia" : "",
          ].join(" ")}
          style={{
            background: paperTone === "sepia" ? undefined : "color-mix(in srgb, var(--paper-2) 78%, transparent)",
            borderRadius: "26px 6px 26px 6px / 6px 26px 6px 26px",
            border: "1.5px solid color-mix(in srgb, var(--ink) 18%, transparent)",
            boxShadow: "5px 6px 0 color-mix(in srgb, var(--ink) 8%, transparent)",
          }}
        >
          {/* masthead */}
          <div className="mb-5 border-b-[3px] border-double border-ink/70 pb-4">
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[13.5px] text-ink2">
              <span className="hd-soft flex items-center gap-1 bg-yellow/45 px-2 py-[1px] font-bold text-[#1a2440]">
                <Icon name="scissors" size={12} /> re-inked
              </span>
              <span className="flex items-center gap-1">
                <Icon name="globe" size={13} /> {article.site}
              </span>
              {article.byline && <span className="italic">· {article.byline}</span>}
              <span>· {article.words.toLocaleString()} words</span>
              <span>· ~{article.minutes} min</span>
              <span className="hidden text-[12.5px] text-ink3 md:inline">
                · via {article.via} ({article.fetchMs}ms)
              </span>

              {!compact && (
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <button
                    onClick={onShowOriginal}
                    className="hd-soft btn-sketch flex items-center gap-1 bg-cyan/85 px-2.5 py-[2px] text-[13.5px] font-bold text-[#12171f] hover:bg-cyan"
                    title="Show the original website (Shielded HTML, Interactive HTML, or Direct Live Frame)"
                  >
                    <Icon name="globe" size={13} /> original site
                  </button>
                  {onSplit && (
                    <button
                      onClick={onSplit}
                      className="hd-soft btn-sketch hidden items-center gap-1 bg-paper2 px-2 py-[2px] text-[13.5px] hover:bg-yellow sm:flex"
                      title="Compare Re-inked & Original Website side-by-side"
                    >
                      <Icon name="split" size={12} /> split
                    </button>
                  )}
                  <button
                    onClick={onOpenOutside}
                    className="hd-soft btn-sketch grid h-[25px] w-[25px] place-items-center bg-paper2 hover:bg-yellow"
                    title="Open original website in a native browser tab"
                  >
                    <Icon name="external" size={12} />
                  </button>
                </span>
              )}
            </div>

            <h1
              className="leading-[0.98] text-current"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: `clamp(2rem, 4.6vw, ${2.6 + fontStep * 0.22}rem)` }}
            >
              {article.title}
            </h1>

            {article.lead && (
              <p className="mt-2 text-[16px] italic leading-snug opacity-80">{article.lead}</p>
            )}

            {/* Re-inking customization toolbar */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1 text-[13px]">
              <span className="text-ink3 italic mr-1">ink &amp; paper:</span>
              {(
                [
                  ["notebook", "handwritten"],
                  ["serif", "book serif"],
                  ["mono", "typewriter"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setReinkStyle(id)}
                  className={[
                    "hd-soft px-2 py-[1px] transition",
                    reinkStyle === id ? "bg-yellow text-[#1a2440] font-bold" : "bg-paper2/70 text-ink2 hover:bg-paper3",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setPaperTone(paperTone === "sepia" ? "default" : "sepia")}
                className={[
                  "hd-soft px-2 py-[1px] transition",
                  paperTone === "sepia" ? "bg-[#e2cfa9] text-[#2b2116] font-bold" : "bg-paper2/70 text-ink2 hover:bg-paper3",
                ].join(" ")}
                title="Toggle warm archival sepia paper"
              >
                sepia
              </button>
              <button
                onClick={() => setShowImages(!showImages)}
                className={[
                  "hd-soft px-2 py-[1px] transition",
                  showImages ? "bg-paper2/70 text-ink2 hover:bg-paper3" : "bg-pink/20 text-pink font-bold",
                ].join(" ")}
                title="Show or hide external images in re-inked view"
              >
                {showImages ? "pictures: on" : "ink-only (no pics)"}
              </button>

              {/* Translate the page through the configured AI engine. */}
              <span className="flex items-center gap-1">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  title="Translation target language"
                  className="hd-soft cursor-pointer bg-paper2/70 px-1 py-[1px] text-[13px] text-ink2 outline-none"
                >
                  {Object.entries(LANGS).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => (translation !== null ? setTranslation(null) : void translate())}
                  disabled={translating}
                  className={[
                    "hd-soft px-2 py-[1px] transition",
                    translation !== null ? "bg-cyan font-bold text-[#12171f]" : "bg-paper2/70 text-ink2 hover:bg-paper3",
                  ].join(" ")}
                  title={translation !== null ? "Show the original text" : "Translate this page with your AI engine"}
                >
                  {translating ? "translating…" : translation !== null ? `✓ ${LANGS[lang] || lang} · back to original` : "translate"}
                </button>
              </span>

              <span className="ml-auto flex items-center gap-1">
                <button onClick={() => setFontStep(Math.max(-1, fontStep - 1))} className="hd grid h-[24px] w-[24px] place-items-center bg-paper2 text-ink hover:bg-yellow" title="Smaller type">
                  <Icon name="minus" size={12} />
                </button>
                <button onClick={() => setFontStep(Math.min(4, fontStep + 1))} className="hd grid h-[24px] w-[24px] place-items-center bg-paper2 text-ink hover:bg-yellow" title="Bigger type">
                  <Icon name="plus" size={12} />
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(article.text);
                    setCopiedAll(true);
                    setTimeout(() => setCopiedAll(false), 1800);
                  }}
                  className="hd grid h-[24px] w-[24px] place-items-center bg-paper2 text-ink hover:bg-cyan"
                  title="Copy all re-inked text"
                >
                  <Icon name={copiedAll ? "check" : "copy"} size={12} />
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([toMarkdown(article)], { type: "text/markdown" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${article.site}-${article.title.slice(0, 40).replace(/[^\w]+/g, "-").toLowerCase()}.md`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="hd grid h-[24px] w-[24px] place-items-center bg-paper2 text-ink hover:bg-lime"
                  title="Save as Markdown (.md)"
                >
                  <Icon name="download" size={12} />
                </button>
              </span>
            </div>
          </div>

          {/* block ledger */}
          <button
            onClick={() => setShowLedger((s) => !s)}
            className="hd mb-4 flex w-full items-center gap-3 bg-paper2 px-3 py-2 text-left text-ink ink-shadow-sm transition hover:-translate-y-[1px]"
          >
            <span
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-2 border-ink text-[#12171f]"
              style={{ background: !shieldsOn ? "var(--orange)" : article.blocked.length ? "var(--lime)" : "var(--paper3)" }}
            >
              <Icon name={shieldsOn ? "shield" : "shieldOff"} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17.5px] leading-tight">
                {shieldsOn
                  ? article.blocked.length
                    ? `${article.blocked.length} trackers, pixels & ad slots stripped (${article.scanned} resources audited)`
                    : `0 trackers found across ${article.scanned} audited resources — remarkably clean`
                  : "shields are OFF — trackers were not stripped"}
              </span>
              <span className="block truncate text-[13.5px] italic text-ink3">
                {Object.entries(catCounts)
                  .map(([c, n]) => `${CAT_LABEL[c as Category]}: ${n}`)
                  .join(" · ") || "tap to inspect the audit ledger"}
              </span>
            </span>
            <Icon name="chevronDown" size={16} className={showLedger ? "rotate-180 transition" : "transition"} />
          </button>
          {showLedger && (
            <div className="pop-in mb-5 border-2 border-dashed border-ink/40 bg-paper3/45 p-3 text-ink">
              {article.blocked.length === 0 && <p className="text-[15px] italic text-ink3">no matches in the filter list.</p>}
              <ul className="no-scrollbar max-h-[220px] space-y-1 overflow-y-auto">
                {article.blocked.slice(0, 140).map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13.5px]">
                    <span className="h-[9px] w-[9px] shrink-0 rounded-full border border-ink" style={{ background: CAT_COLOR[b.cat] }} />
                    <span className="w-[135px] shrink-0 truncate text-ink2">{CAT_LABEL[b.cat]}</span>
                    {b.kind && (
                      <span className="shrink-0 rounded border border-ink/25 bg-paper2 px-1 text-[11px] uppercase text-ink3">
                        {b.kind}
                      </span>
                    )}
                    <code className="min-w-0 flex-1 truncate text-ink">{b.rule}</code>
                    <span className="max-w-[210px] shrink-0 truncate text-ink3/85">{b.url}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* collapsible Table of Contents */}
          {article.toc.length >= 3 && (
            <div className="hd-soft mb-6 bg-paper2/70 px-3 py-2 text-ink">
              <button
                onClick={() => setShowToc((t) => !t)}
                className="flex w-full items-center justify-between text-left text-[15.5px]"
              >
                <span className="flex items-center gap-1.5 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>
                  <span className="text-pink">§</span> index of sections ({article.toc.length})
                </span>
                <Icon name="chevronDown" size={15} className={showToc ? "rotate-180 transition" : "transition"} />
              </button>
              {showToc && (
                <div className="mt-2 grid gap-1 border-t border-dashed border-ink/20 pt-2 sm:grid-cols-2">
                  {article.toc.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        const target = scroller.current?.querySelector(`#${CSS.escape(item.id)}`);
                        target?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="truncate text-left text-[14.5px] text-ink2 hover:text-pink hover:underline"
                      style={{ paddingLeft: `${(item.level - 1) * 10}px` }}
                    >
                      § {item.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* body */}
          <article ref={bodyRef} className={fontClass} style={{ fontSize: `${(reinkStyle === "mono" ? 15 : 17) + fontStep * 1.4}px` }}>
            {translation !== null
              ? translation
                  .split(/\n\s*\n/)
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <p key={i} className="mb-4">
                      {p}
                    </p>
                  ))
              : article.nodes.map((n, i) => {
              if (n.t === "h")
                return (
                  <h2
                    id={n.id}
                    key={i}
                    className="mt-7 mb-2 scroll-mt-4 leading-tight"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: `${1.58 - n.level * 0.07}em` }}
                  >
                    <span className="mr-2 text-pink">§</span>
                    <Linked text={n.text} links={n.links} onLink={onLink} />
                  </h2>
                );
              if (n.t === "p")
                return (
                  <p key={i} className="mb-4">
                    <Linked text={n.text} links={n.links} onLink={onLink} />
                  </p>
                );
              if (n.t === "li")
                return (
                  <div key={i} className="mb-2 flex gap-2.5">
                    {n.rank ? (
                      <span className="min-w-[26px] shrink-0 text-right font-bold text-pink tabular-nums" style={{ fontFamily: "var(--font-display)", fontSize: "1.1em" }}>
                        {n.rank}
                      </span>
                    ) : (
                      <span className="mt-[0.58em] h-[7px] w-[7px] shrink-0 rotate-45 bg-pink" />
                    )}
                    <span className="min-w-0 flex-1">
                      <Linked text={n.text} links={n.links} onLink={onLink} />
                    </span>
                  </div>
                );
              if (n.t === "q")
                return (
                  <blockquote key={i} className="my-5 border-l-[3px] border-yellow bg-paper2/70 py-2 pl-4 pr-3 italic opacity-90">
                    <Linked text={n.text} links={n.links} onLink={onLink} />
                  </blockquote>
                );
              if (n.t === "code") return <CodeBlock key={i} text={n.text} lang={n.lang} />;
              if (n.t === "table")
                return (
                  <div key={i} className="no-scrollbar my-5 overflow-x-auto">
                    <table className="w-full border-collapse border-2 border-ink/70 bg-paper2/70 text-[0.9em]">
                      {n.headers.length > 0 && (
                        <thead>
                          <tr className="border-b-2 border-ink/70 bg-yellow/30">
                            {n.headers.map((h, hi) => (
                              <th key={hi} className="border-r border-dashed border-ink/30 px-3 py-1.5 text-left font-bold last:border-r-0">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {n.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-dashed border-ink/25 last:border-b-0 odd:bg-paper3/25">
                            {row.map((cell, ci) => (
                              <td key={ci} className="border-r border-dashed border-ink/20 px-3 py-1.5 align-top last:border-r-0">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              if (n.t === "img") {
                if (!showImages) return null;
                return (
                  <figure key={i} className="my-5">
                    <img
                      src={n.src}
                      alt={n.alt}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = "none")}
                      className="max-h-[440px] w-auto max-w-full border-2 border-ink bg-white ink-shadow-sm"
                      style={{ borderRadius: "8px 2px 10px 2px" }}
                    />
                    {n.alt && <figcaption className="mt-1 text-[14px] italic opacity-75">{n.alt}</figcaption>}
                  </figure>
                );
              }
              return <hr key={i} className="my-6 border-0 border-t-2 border-dashed border-ink/25" />;
            })}

            <p className="mt-10 text-center text-[20px] opacity-60" style={{ fontFamily: "var(--font-display)" }}>
              ✦ end of re-inked page ✦
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-ink">
              {[
                { label: "summarise this", prompt: "Summarise this page in 5 tight bullet points." },
                { label: "what's the argument?", prompt: "What is the core argument of this page, and what does it leave out?" },
                { label: "explain simply", prompt: "Explain this page like I'm 12, keeping it concrete." },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => onAsk(a.prompt)}
                  className="hd-soft btn-sketch flex items-center gap-1.5 bg-paper2 px-3 py-1 text-[15px] hover:bg-yellow/60"
                >
                  <Icon name="spark" size={14} /> {a.label}
                </button>
              ))}
              {!compact && (
                <button
                  onClick={onShowOriginal}
                  className="hd-soft btn-sketch flex items-center gap-1.5 bg-cyan/80 px-3 py-1 text-[15px] text-[#12171f] hover:bg-cyan"
                >
                  <Icon name="globe" size={14} /> view original website
                </button>
              )}
            </div>
          </article>
        </div>
      </div>

      {sel && (
        <div
          className={["pop-in hd absolute z-30 flex -translate-x-1/2 items-center gap-1 ink-shadow-sm", sel.below ? "" : "-translate-y-full"].join(" ")}
          style={{ left: sel.x, top: sel.y }}
        >
          {onNote && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                onNote(sel.text.slice(0, 600));
                setSel(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="flex items-center gap-1.5 bg-yellow px-2.5 py-1 text-[15px] font-bold text-[#1a2440]"
              title="Save this passage as a sticky note on your start page"
            >
              <Icon name="note" size={14} /> note
            </button>
          )}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onAsk(
                `Explain this selected passage and give me one sharp question to ask about it:\n\n“${sel.text.slice(0, 1200)}”`,
                sel.text,
              );
              setSel(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="flex items-center gap-1.5 bg-pink px-2.5 py-1 text-[15px] text-white"
          >
            <Icon name="spark" size={14} /> ask AI about this
          </button>
        </div>
      )}
    </div>
  );
}
