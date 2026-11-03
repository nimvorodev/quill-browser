import { useEffect, useState } from "react";
import { ENGINES, engineById, parseSearchUrl, type SearchEngine } from "../lib/nav";
import { imageSearch, runSearch, type SearchRun } from "../lib/search";
import type { ImageHit, SearchHit } from "../lib/parsers";
import { EngineGlyph } from "./EnginePicker";
import { Icon } from "./Icons";
import { SearchBox } from "./SearchBox";

/** Quick lenses: re-run the same words through a bang. */
const LENS = [
  { label: "web", bang: "" },
  { label: "videos", bang: "!yt" },
  { label: "wikipedia", bang: "!w" },
  { label: "github", bang: "!gh" },
  { label: "reddit", bang: "!r" },
  { label: "docs", bang: "!mdn" },
  { label: "stack overflow", bang: "!so" },
  { label: "papers", bang: "!arxiv" },
];

export function SearchView({
  url,
  onSearch,
  onOpen,
  onAsk,
}: {
  url: string;
  onSearch: (text: string, engineId?: string) => void;
  onOpen: (href: string, newTab?: boolean) => void;
  onAsk?: (prompt: string, ctx: string) => void;
}) {
  const parsed = parseSearchUrl(url);
  const engine: SearchEngine = engineById(parsed?.engineId) ?? ENGINES[0];
  const query = parsed?.query ?? "";
  const [run, setRun] = useState<SearchRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"web" | "images">("web");
  const [imgs, setImgs] = useState<ImageHit[] | null>(null);

  useEffect(() => {
    if (!query || mode === "images") {
      setRun(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setRun(null);
    runSearch(engine.id, query, ac.signal)
      .then((res) => {
        if (!ac.signal.aborted) setRun(res);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [engine.id, query, attempt, mode]);

  useEffect(() => {
    if (!query || mode !== "images") {
      setImgs(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setImgs(null);
    imageSearch(query, ac.signal)
      .then((res) => {
        if (!ac.signal.aborted) setImgs(res.hits);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [query, attempt, mode]);

  // The engine's own homepage (no query attached) — where "open on <engine>" goes.
  const engineHome = (() => {
    try {
      return new URL(engine.url("")).origin;
    } catch {
      return "https://duckduckgo.com";
    }
  })();

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-4 py-6 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] uppercase tracking-[0.16em] text-ink3">
          <EngineGlyph engine={engine} size={22} />
          <span>
            {engine.name} · {engine.mode === "results" ? "reads here" : "opens its own site"}
          </span>
        </div>
        <h1
          className="mb-4 min-w-0 break-words text-[36px] leading-tight text-ink [overflow-wrap:anywhere]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {query || "search"}
        </h1>

        <div className="mb-3">
          <SearchBox
            engine={engine}
            onEngine={(e) => onSearch(query, e.id)}
            onSubmit={(text, id) => onSearch(text, id)}
            size="md"
            initial={query}
            showHints={false}
          />
        </div>

        <div className="mb-5 flex flex-wrap gap-1.5">
          <button
            onClick={() => setMode((m) => (m === "images" ? "web" : "images"))}
            className={[
              "hd-soft btn-sketch px-2.5 py-0.5 text-[14px]",
              mode === "images" ? "bg-cyan font-bold text-[#12171f]" : "bg-paper2 text-ink hover:bg-cyan/60",
            ].join(" ")}
          >
            images
          </button>
          {LENS.map((l) => (
            <button
              key={l.label}
              onClick={() => {
                setMode("web");
                onSearch(l.bang ? `${l.bang} ${query}` : query, l.bang ? undefined : engine.id);
              }}
              className="hd-soft btn-sketch bg-paper2 px-2.5 py-0.5 text-[14px] text-ink hover:bg-yellow hover:text-[#1a2440]"
            >
              {l.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="hd mb-4 bg-paper2 p-4 text-ink2">
            <p className="text-[22px] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              asking {mode === "images" ? "Bing for images" : engine.name}…
            </p>
            <p className="mt-1 text-[15px] italic">reading a results page through a relay, then unwrapping every redirect.</p>
          </div>
        )}

        {error && (
          <div className="hd mb-4 bg-red/10 p-4 text-ink">
            <p className="text-[18px]">The relays stumbled: {error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setAttempt((a) => a + 1)} className="hd btn-sketch bg-yellow px-3 py-1 text-[#1a2440]">
                try again
              </button>
              <button onClick={() => onOpen(engineHome, true)} className="hd-soft btn-sketch bg-paper2 px-3 py-1 text-ink">
                open on {engine.name} ↗
              </button>
            </div>
          </div>
        )}

        {mode === "images" && !loading && (
          <>
            {imgs && imgs.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {imgs.map((h, i) => (
                  <div key={i + h.image} className="group hd overflow-hidden border-2 border-ink bg-paper2">
                    <button
                      onClick={() => onOpen(h.image, true)}
                      title={h.title || h.image}
                      className="block aspect-[4/3] w-full overflow-hidden bg-paper3/50"
                    >
                      <img
                        src={h.thumb}
                        alt={h.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                        onError={(e) => {
                          // some hosts refuse hotlinks; drop the card quietly
                          const card = (e.currentTarget as HTMLImageElement).closest(".group");
                          if (card) (card as HTMLElement).style.display = "none";
                        }}
                      />
                    </button>
                    <p className="line-clamp-2 px-2 py-1 text-left text-[13px] leading-tight text-ink2">{h.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              !error && <p className="px-1 text-[17px] italic text-ink3">No images came back for “{query}”.</p>
            )}
          </>
        )}

        {mode === "web" && run && !loading && (
          <>
            <div
              className={[
                "mb-4 rounded-[16px] border-2 border-ink px-4 py-2.5 text-[15px] leading-snug text-ink",
                run.fallback ? "bg-orange/25" : "bg-lime/20",
              ].join(" ")}
            >
              <p className="break-words">{run.note}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink2">
                <span className="min-w-0 truncate">
                  {run.hits.length} results · via {run.via || "—"}
                </span>
                {onAsk && run.hits.length > 0 && (
                  <button
                    onClick={() =>
                      onAsk(
                        `Summarise these ${engine.name} results for "${query}" in a few bullets, with the most useful links first.`,
                        run.hits.map((h, i) => `${i + 1}. ${h.title} (${h.url})\n${h.snippet}`).join("\n\n").slice(0, 8000),
                      )
                    }
                    className="hd-soft btn-sketch flex items-center gap-1 bg-pink/20 px-2.5 py-0.5 text-[14px] text-ink hover:bg-pink hover:text-white"
                  >
                    <Icon name="spark" size={12} /> summarise
                  </button>
                )}
                <button
                  onClick={() => onOpen(engineHome, true)}
                  className="hd-soft btn-sketch ml-auto flex items-center gap-1 bg-paper2 px-2.5 py-0.5 text-[14px] text-ink hover:bg-yellow hover:text-[#1a2440]"
                >
                  <Icon name="plus" size={12} /> open on {engine.name}
                </button>
              </div>
            </div>

            {run.hits.length === 0 ? (
              <p className="px-1 text-[17px] italic text-ink3">Nothing readable came back for “{query}”.</p>
            ) : (
              <ol className="space-y-2.5">
                {run.hits.map((hit, i) => (
                  <ResultCard key={hit.url + i} hit={hit} rank={i + 1} onOpen={onOpen} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  hit,
  rank,
  onOpen,
}: {
  hit: SearchHit;
  rank: number;
  onOpen: (href: string, newTab?: boolean) => void;
}) {
  let path = "";
  try {
    const u = new URL(hit.url);
    path = (u.pathname + u.search).replace(/\/$/, "");
  } catch {
    path = "";
  }
  return (
    <li className="min-w-0 overflow-hidden rounded-[18px] border-2 border-ink bg-paper2 px-4 py-3 text-ink transition hover:-translate-y-[1px]">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper3 text-[12px] font-bold">
          {rank}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <button
            onClick={() => onOpen(hit.url)}
            onAuxClick={(e) => {
              if (e.button === 1) onOpen(hit.url, true);
            }}
            className="line-clamp-2 block w-full min-w-0 break-words text-left text-[19px] leading-snug text-ink underline-offset-4 [overflow-wrap:anywhere] hover:underline hover:decoration-pink"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {hit.title}
          </button>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-ink3">
            <span className="min-w-0 truncate font-bold text-ink2">{hit.host}</span>
            {path && path !== "" && <span className="min-w-0 truncate">{path}</span>}
          </p>
          {hit.snippet && (
            <p className="mt-1 line-clamp-3 break-words text-[15px] leading-snug text-ink2 [overflow-wrap:anywhere]">{hit.snippet}</p>
          )}
        </div>
        <button
          onClick={() => onOpen(hit.url, true)}
          title="Open in a new tab"
          className="hd-soft grid h-8 w-8 shrink-0 place-items-center bg-paper3 text-ink2 hover:bg-cyan hover:text-[#12171f]"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
    </li>
  );
}
