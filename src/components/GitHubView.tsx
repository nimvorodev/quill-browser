import { useEffect, useMemo, useRef, useState } from "react";
import {
  fileContent,
  fileUrl,
  issuesUrl,
  languages,
  parseGitHub,
  readme,
  repoFiles,
  repoInfo,
  repoIssues,
  repoUrl,
  searchRepos,
  searchUrl,
  trendingRepos,
  userInfo,
  userRepos,
  type FileEntry,
  type GhLang,
  type Issue,
  type Readme,
  type Repo,
} from "../lib/github";
import { Icon } from "./Icons";
import { pinSizelessImages } from "../lib/images";
import { isDesktop } from "../lib/platform";
import { DeskModeSwitch, type DeskMode } from "./DeskHeader";
import { WebFrame } from "./WebFrame";

const HEAD = { fontFamily: "var(--font-display)", fontWeight: 700 } as const;
const LANG_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Dart: "#00B4AB",
  Lua: "#000080",
};

function langColor(l: string) {
  return LANG_COLORS[l] || "var(--violet)";
}

function when(iso?: string) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

function big(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function GitHubView({
  url,
  onOpen,
  onSearch,
  onOpenOutside,
  onAsk,
  mode = "desk",
  onMode,
  zoom = 100,
  nonce = 0,
  onFrameNavigate,
  onTitle,
}: {
  url: string;
  onOpen: (href: string, newTab?: boolean) => void;
  onSearch: (q: string) => void;
  onOpenOutside: (href: string) => void;
  onAsk?: (prompt: string, ctx: string) => void;
  mode?: DeskMode;
  onMode?: (m: DeskMode) => void;
  zoom?: number;
  nonce?: number;
  onFrameNavigate?: (href: string) => void;
  onTitle?: (t: string) => void;
}) {
  const ref = useMemo(() => parseGitHub(url) || { kind: "home" as const }, [url]);

  // Desktop: the original github.com page in a real webview.
  if (mode === "original" && isDesktop) {
    return (
      <div className="relative flex h-full w-full flex-col">
        <div className="relative z-20 flex flex-wrap items-center gap-2 border-b-2 border-ink/80 bg-paper2/95 px-2.5 py-1.5 text-ink">
          <span className="flex items-center gap-1 text-ink" style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700 }}>
            <Icon name="branch" size={15} className="text-lime" /> original github
          </span>
          <span className="hidden text-[13px] italic text-ink3 md:inline">the real site, in an isolated window · trackers blocked at the network</span>
          <span className="ml-auto">
            <DeskModeSwitch mode={mode} onMode={(m) => onMode?.(m)} siteName="GitHub" siteUrl={url} />
          </span>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          <WebFrame
            url={url}
            nonce={nonce}
            zoom={zoom}
            strict
            autoplay={false}
            referrer="strict-origin-when-cross-origin"
            onTitle={(t) => onTitle?.(t)}
            onNavigate={onFrameNavigate}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] uppercase tracking-[0.18em] text-ink3">
              github desk · {ref.kind === "home" ? "browse" : ref.kind === "trending" ? "trending this week" : ref.kind === "search" ? "repository search" : ref.kind === "repo" ? `${ref.owner}/${ref.repo}` : ref.kind === "org" ? "profile" : "repositories"}
            </p>
            <h1 className="text-[34px] leading-none text-ink" style={HEAD}>
              <span className="marker" style={{ ["--hl" as any]: "var(--lime)" }}>
                github, inside quill
              </span>
            </h1>
            <p className="mt-1 max-w-[620px] text-[14px] italic text-ink2">
              {isDesktop
                ? "A quiet, hand-drawn reading of GitHub's public API. Switch to the original page any time."
                : "github.com refuses proxies and framing in a browser tab, so Quill reads its public API directly. Everything below is live GitHub data."}
            </p>
          </div>
          <DeskModeSwitch mode={mode} onMode={(m) => onMode?.(m)} siteName="GitHub" siteUrl={url} />
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = (e.currentTarget.elements.namedItem("gh") as HTMLInputElement).value.trim();
            if (q) onSearch(q);
          }}
          className="hd mb-6 flex items-center gap-2 bg-paper2 px-3 py-2 text-ink ink-shadow"
        >
          <Icon name="search" size={17} className="shrink-0 text-pink" />
          <input
            name="gh"
            defaultValue={ref.kind === "search" ? ref.query || "" : ""}
            placeholder="search repositories — try “css grid” or “handwritten ui”"
            className="min-w-0 flex-1 bg-transparent text-[19px] text-ink placeholder:text-ink3/70"
            style={{ fontFamily: "var(--font-display)" }}
          />
          <button type="submit" className="hd btn-sketch shrink-0 bg-yellow px-3 py-1 text-[16px] text-[#1a2440]">
            search →
          </button>
        </form>

        {(ref.kind === "home" || ref.kind === "trending") && <Trending onOpen={onOpen} onOpenOutside={onOpenOutside} />}
        {ref.kind === "search" && <Search q={ref.query || ""} onOpen={onOpen} />}
        {ref.kind === "repo" && ref.owner && ref.repo && (
          <RepoPage owner={ref.owner} repo={ref.repo} path={ref.path} onOpen={onOpen} onOpenOutside={onOpenOutside} onAsk={onAsk} />
        )}
        {ref.kind === "user" && ref.owner && <UserPage login={ref.owner} onOpen={onOpen} />}
        {ref.kind === "org" && ref.owner && <UserPage login={ref.owner} onOpen={onOpen} />}
      </div>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function RepoCard({ repo, onOpen }: { repo: Repo; onOpen: (href: string) => void }) {
  return (
    <button onClick={() => onOpen(repoUrl(repo.owner, repo.repo))} className="hd btn-sketch bg-paper2 p-3 text-left text-ink hover:-translate-y-[1px]">
      <span className="flex min-w-0 items-baseline gap-2">
        <Icon name="branch" size={14} className="shrink-0 text-ink3" />
        <span className="min-w-0 flex-1 truncate text-[19px]" style={HEAD}>
          {repo.owner}/<b>{repo.repo}</b>
        </span>
        {repo.starsToday !== undefined && repo.starsToday > 0 && (
          <span className="shrink-0 rounded-full border border-ink/40 px-1.5 text-[11.5px]">+{repo.starsToday}★ this week</span>
        )}
      </span>
      {repo.description && <span className="mt-1 line-clamp-2 block text-[14.5px] leading-snug text-ink2">{repo.description}</span>}
      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink3">
        {repo.language && (
          <span className="flex items-center gap-1">
            <span className="h-[9px] w-[9px] rounded-full border border-ink" style={{ background: langColor(repo.language) }} />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Icon name="star" size={12} /> {big(repo.stars)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="branch" size={12} /> {big(repo.forks)}
        </span>
        {repo.issues > 0 && <span>{big(repo.issues)} open issues</span>}
        {repo.updated && <span>updated {when(repo.updated)}</span>}
      </span>
      {repo.topics.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {repo.topics.map((t) => (
            <span key={t} className="hd-soft bg-cyan/20 px-1.5 text-[12px] text-ink">
              {t}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function LangBar({ langs }: { langs: GhLang[] }) {
  if (!langs.length) return null;
  return (
    <div>
      <div className="flex h-[10px] overflow-hidden rounded-full border-2 border-ink">
        {langs.map((l) => (
          <span key={l.name} style={{ width: `${l.pct}%`, background: langColor(l.name) }} title={`${l.name} ${l.pct}%`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink2">
        {langs.slice(0, 5).map((l) => (
          <span key={l.name} className="flex items-center gap-1">
            <span className="h-[9px] w-[9px] rounded-full border border-ink" style={{ background: langColor(l.name) }} />
            {l.name} {l.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function FileViewer({
  owner,
  repo,
  branch,
  path,
  onBack,
  onOpenOutside,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  onBack: () => void;
  onOpenOutside: (href: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let dead = false;
    const ac = new AbortController();
    setText(null);
    setErr("");
    fileContent(owner, repo, branch, path, ac.signal)
      .then((r) => {
        if (!dead) {
          setText(r.text);
          setTruncated(r.truncated);
        }
      })
      .catch((e) => {
        if (!dead) setErr(e instanceof Error ? e.message : "couldn't read this file");
      });
    return () => {
      dead = true;
      ac.abort();
    };
  }, [owner, repo, branch, path]);

  const lines = text == null ? [] : text.split("\n");
  const binary = text != null && text.slice(0, 8000).includes("");

  return (
    <div className="min-w-0 overflow-hidden rounded-[16px] border-2 border-ink bg-paper2">
      <div className="flex min-w-0 items-center gap-2 border-b-2 border-ink bg-paper3/60 px-3 py-2 text-ink">
        <button onClick={onBack} className="flex shrink-0 items-center gap-1 text-ink2 hover:text-ink" title="Back to files">
          <Icon name="back" size={14} /> files
        </button>
        <span className="min-w-0 flex-1 truncate text-[14.5px]">{path.split("/").pop()}</span>
        {text != null && !binary && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="hd-soft flex shrink-0 items-center gap-1 bg-paper2 px-2 py-[1px] text-[13px] text-ink hover:bg-yellow hover:text-[#1a2440]"
          >
            <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? "copied" : "copy"}
          </button>
        )}
        <button
          onClick={() => onOpenOutside(`https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`)}
          className="hd-soft flex shrink-0 items-center gap-1 bg-paper2 px-2 py-[1px] text-[13px] text-ink hover:bg-yellow hover:text-[#1a2440]"
          title="Open this file on github.com"
        >
          <Icon name="external" size={12} />
        </button>
      </div>
      {err ? (
        <p className="p-4 text-[15px] italic text-ink2">{err}</p>
      ) : text == null ? (
        <p className="p-4 text-[15px] italic text-ink2">reading {path.split("/").pop()}…</p>
      ) : binary ? (
        <p className="p-4 text-[15px] italic text-ink2">Binary file — Quill won't try to print it. Open it on github.com instead.</p>
      ) : (
        <>
          <pre className="no-scrollbar max-h-[420px] min-w-0 overflow-auto p-3 text-[13px] leading-relaxed" style={{ fontFamily: "ui-monospace, monospace" }}>
            {lines.map((ln, i) => (
              <div key={i} className="flex min-w-0 gap-3">
                <span className="w-10 shrink-0 select-none text-right tabular-nums text-ink3">{i + 1}</span>
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">{ln || " "}</code>
              </div>
            ))}
          </pre>
          {truncated && <p className="border-t border-dashed border-ink/25 px-3 py-1.5 text-[13px] italic text-ink3">cut off at 400 KB — open on github.com for the rest.</p>}
        </>
      )}
    </div>
  );
}

function ErrorCard({ error, onRetry, onOutside }: { error: string; onRetry: () => void; onOutside: () => void }) {
  return (
    <div className="hd bg-red/10 p-4 text-ink">
      <p className="text-[17px]">GitHub's API said no: {error}</p>
      <p className="mt-1 text-[14px] text-ink2">GitHub allows 60 unauthenticated calls an hour from one address.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onRetry} className="hd btn-sketch bg-yellow px-3 py-1 text-[15px] text-[#1a2440]">
          try again
        </button>
        <button onClick={onOutside} className="hd-soft btn-sketch bg-paper2 px-3 py-1 text-[15px] text-ink">
          open github.com ↗
        </button>
      </div>
    </div>
  );
}

/* ---------------- lists ---------------- */

const TREND_LANGS = ["", "TypeScript", "Python", "Rust", "Go", "JavaScript", "C++"];

function Trending({ onOpen, onOpenOutside }: { onOpen: (href: string) => void; onOpenOutside: (href: string) => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [err, setErr] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [lang, setLang] = useState("");

  useEffect(() => {
    let dead = false;
    const ac = new AbortController();
    setRepos(null);
    setErr("");
    trendingRepos(ac.signal, lang || undefined)
      .then((r) => {
        if (!dead) setRepos(r);
      })
      .catch((e) => {
        if (!dead) setErr(e instanceof Error ? e.message : "couldn't reach GitHub");
      });
    return () => {
      dead = true;
      ac.abort();
    };
  }, [attempt, lang]);

  if (err) return <ErrorCard error={err} onRetry={() => setAttempt((a) => a + 1)} onOutside={() => onOpenOutside("https://github.com/trending")} />;
  if (!repos) return <p className="text-[17px] italic text-ink2">reading the week's most-starred repositories…</p>;
  if (!repos.length) return <p className="text-[17px] italic text-ink3">Nothing came back.</p>;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[24px] text-ink" style={HEAD}>
          most-starred this week
        </h2>
        {TREND_LANGS.map((l) => (
          <button
            key={l || "all"}
            onClick={() => setLang(l)}
            className={[
              "hd-soft px-2 py-[1px] text-[13.5px] transition",
              lang === l ? "bg-yellow font-bold text-[#1a2440]" : "bg-paper2 text-ink2 hover:bg-paper3",
            ].join(" ")}
          >
            {l || "all"}
          </button>
        ))}
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {repos.map((r) => (
          <RepoCard key={r.full_name} repo={r} onOpen={onOpen} />
        ))}
      </div>
      <p className="mt-3 text-[13.5px] italic text-ink3">
        github.com blocks proxies and frames, so this list is built from the API's newest repos sorted by stars.
      </p>
    </section>
  );
}

function Search({ q, onOpen }: { q: string; onOpen: (href: string) => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!q) {
      setRepos(null);
      return;
    }
    let dead = false;
    const ac = new AbortController();
    setRepos(null);
    setErr("");
    searchRepos(q, ac.signal)
      .then((r) => {
        if (!dead) {
          setRepos(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (!dead) setErr(e instanceof Error ? e.message : "search failed");
      });
    return () => {
      dead = true;
      ac.abort();
    };
  }, [q, attempt]);

  if (!q) return <p className="text-[17px] italic text-ink3">Type something above to search repositories.</p>;
  if (err) return <ErrorCard error={err} onRetry={() => setAttempt((a) => a + 1)} onOutside={() => window.open(searchUrl(q), "_blank", "noopener,noreferrer")} />;
  if (!repos) return <p className="text-[17px] italic text-ink2">searching repositories for “{q}”…</p>;
  if (!repos.length) return <p className="text-[17px] italic text-ink3">No repositories matched “{q}”.</p>;
  return (
    <section>
      <h2 className="mb-3 text-[24px] text-ink" style={HEAD}>
        {big(total)} repositories for “{q}”
      </h2>
      <div className="grid gap-2.5 md:grid-cols-2">
        {repos.map((r) => (
          <RepoCard key={r.full_name} repo={r} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function UserPage({ login, onOpen }: { login: string; onOpen: (href: string) => void }) {
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [err, setErr] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    const ac = new AbortController();
    setUser(null);
    setRepos(null);
    setErr("");
    Promise.all([userInfo(login, ac.signal), userRepos(login, ac.signal)])
      .then(([u, r]) => {
        if (!dead) {
          setUser(u);
          setRepos(r);
        }
      })
      .catch((e) => {
        if (!dead) setErr(e instanceof Error ? e.message : "couldn't read this profile");
      });
    return () => {
      dead = true;
      ac.abort();
    };
  }, [login, attempt]);

  if (err) return <ErrorCard error={err} onRetry={() => setAttempt((a) => a + 1)} onOutside={() => window.open(`https://github.com/${login}`, "_blank", "noopener,noreferrer")} />;
  if (!user || !repos) return <p className="text-[17px] italic text-ink2">reading {login}'s profile…</p>;
  return (
    <section>
      <div className="hd mb-4 flex flex-wrap items-start gap-4 bg-paper2 p-4 text-ink">
        <img
          src={user.avatar_url}
          alt=""
          className="h-[84px] w-[84px] shrink-0 rounded-full border-2 border-ink bg-paper3"
          referrerPolicy="no-referrer"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[28px] leading-tight" style={HEAD}>
            {user.name || user.login}
          </p>
          <p className="text-[15px] text-ink2">@{user.login}</p>
          {user.bio && <p className="mt-1.5 max-w-[560px] text-[15.5px] leading-snug text-ink2">{user.bio}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink3">
            {user.company && <span>🏢 {user.company}</span>}
            {user.location && <span>📍 {user.location}</span>}
            {user.blog && <span>🔗 {user.blog}</span>}
            <span>joined {when(user.created_at)}</span>
            <span>
              {big(user.followers)} followers · {big(user.following)} following
            </span>
            <span>{user.public_repos} public repos</span>
          </p>
        </div>
      </div>
      <h2 className="mb-3 text-[24px] text-ink" style={HEAD}>
        recently updated
      </h2>
      <div className="grid gap-2.5 md:grid-cols-2">
        {repos.map((r) => (
          <RepoCard key={r.full_name} repo={r} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

/* ---------------- repository page ---------------- */

type TabKey = "readme" | "files" | "issues";

function RepoPage({
  owner,
  repo,
  path,
  onOpen,
  onOpenOutside,
  onAsk,
}: {
  owner: string;
  repo: string;
  path?: string;
  onOpen: (href: string, newTab?: boolean) => void;
  onOpenOutside: (href: string) => void;
  onAsk?: (prompt: string, ctx: string) => void;
}) {
  const [info, setInfo] = useState<Repo | null>(null);
  const [readmeMd, setReadmeMd] = useState<Readme | null>(null);
  const [langs, setLangs] = useState<GhLang[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [tab, setTab] = useState<TabKey>(path ? "files" : "readme");
  const [err, setErr] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [viewFile, setViewFile] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const currentDir = path || "";
  const readmeRef = useRef<HTMLDivElement>(null);

  // README images with only a viewBox have no intrinsic width and would stretch.
  useEffect(() => {
    pinSizelessImages(readmeRef.current);
  }, [readmeMd, tab]);

  // Route README link clicks inside Quill: without this, a click would navigate
  // the whole app away. Anchors scroll within the README instead.
  const onReadmeClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) return; // let the browser scroll to the anchor
    e.preventDefault();
    if (/^https?:\/\//i.test(href)) {
      onOpen(href, e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1);
    }
  };

  useEffect(() => {
    let dead = false;
    const ac = new AbortController();
    setInfo(null);
    setReadmeMd(null);
    setLangs([]);
    setIssues(null);
    setFiles(null);
    setErr("");
    setViewFile(null);
    // Repo info first: the real default branch makes README links and raw files resolve.
    repoInfo(owner, repo, ac.signal)
      .then((i) => {
        if (dead) return null;
        setInfo(i);
        return Promise.all([
          readme(owner, repo, ac.signal, i.defaultBranch).catch(() => null),
          languages(owner, repo, ac.signal).catch(() => [] as GhLang[]),
          repoFiles(owner, repo, currentDir, ac.signal).catch(() => [] as FileEntry[]),
          repoIssues(owner, repo, ac.signal).catch(() => [] as Issue[]),
        ]);
      })
      .then((rest) => {
        if (dead || !rest) return;
        const [r, l, f, is] = rest;
        setReadmeMd(r);
        setLangs(l);
        setFiles(f);
        setIssues(is);
      })
      .catch((e) => {
        if (!dead) {
          if (e instanceof Error && e.name === "AbortError") return;
          setErr(e instanceof Error ? e.message : "couldn't read this repository");
        }
      });
    return () => {
      dead = true;
      ac.abort();
    };
  }, [owner, repo, currentDir, attempt]);

  if (err)
    return (
      <ErrorCard error={err} onRetry={() => setAttempt((a) => a + 1)} onOutside={() => onOpenOutside(repoUrl(owner, repo))} />
    );
  if (!info) return <p className="text-[17px] italic text-ink2">reading {owner}/{repo}…</p>;

  return (
    <section className="min-w-0">
      <div className="hd mb-4 bg-paper2 p-4 text-ink">
        <p className="break-words text-[30px] leading-tight [overflow-wrap:anywhere]" style={HEAD}>
          {owner}/<b>{repo}</b>
        </p>
        {info.description && <p className="mt-1.5 max-w-[680px] text-[16.5px] leading-snug text-ink2">{info.description}</p>}
        {info.homepage && <p className="mt-1 text-[14px] text-cyan">{info.homepage}</p>}
        <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink3">
          {info.language && (
            <span className="flex items-center gap-1">
              <span className="h-[9px] w-[9px] rounded-full border border-ink" style={{ background: langColor(info.language) }} />
              {info.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Icon name="star" size={12} /> {big(info.stars)}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="branch" size={12} /> {big(info.forks)}
          </span>
          <span>{big(info.issues)} open issues</span>
          {info.license && <span>⚖ {info.license}</span>}
          {info.updated && <span>pushed {when(info.updated)}</span>}
        </p>
        {langs.length > 0 && (
          <div className="mt-3">
            <LangBar langs={langs} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => onOpenOutside(repoUrl(owner, repo))} className="hd btn-sketch bg-yellow px-3 py-1 text-[15px] text-[#1a2440]">
            open on github ↗
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`git clone ${repoUrl(owner, repo)}.git`);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            className="hd-soft btn-sketch flex items-center gap-1.5 bg-paper3 px-3 py-1 text-[15px] text-ink"
            title="Copy: git clone …"
          >
            <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "copied!" : "clone"}
          </button>
          <button
            onClick={() => onOpenOutside(`https://github.com/${owner}/${repo}/archive/${encodeURIComponent(info.defaultBranch)}.zip`)}
            className="hd-soft btn-sketch bg-paper3 px-3 py-1 text-[15px] text-ink"
          >
            <Icon name="download" size={13} /> download zip
          </button>
          {onAsk && (
            <button
              onClick={() =>
                onAsk(
                  `Explain what the ${owner}/${repo} repository does and how to get started with it.`,
                  `${owner}/${repo} — ${info.description || "no description"}\nLanguage: ${info.language || "mixed"} · ★${info.stars} · Updated ${info.updated}\n\nREADME:\n${(readmeMd?.raw || "no README").slice(0, 8000)}`,
                )
              }
              className="hd-soft btn-sketch flex items-center gap-1.5 bg-pink/20 px-3 py-1 text-[15px] text-ink hover:bg-pink hover:text-white"
              title="Send the repo summary + README to the AI margin"
            >
              <Icon name="spark" size={13} /> ask AI about this repo
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["readme", "README", "book"],
            ["files", "files", "layers"],
            ["issues", `issues (${info.issues})`, "note"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              "hd-soft btn-sketch flex items-center gap-1 px-2.5 py-1 text-[15px]",
              tab === id ? "bg-yellow font-bold text-[#1a2440]" : "bg-paper2 text-ink2 hover:bg-paper3",
            ].join(" ")}
          >
            <Icon name={icon} size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "readme" &&
        (readmeMd ? (
          <div className="min-w-0">
            {currentDir && (
              <div className="hd-soft mb-3 flex items-center gap-1 bg-paper3/60 px-2.5 py-1 text-[14px] text-ink2">
                <Icon name="layers" size={13} /> {currentDir}/
              </div>
            )}
            {/* GitHub's own README HTML, re-sanitised by Quill. Clicks stay inside Quill. */}
            <div
              ref={readmeRef}
              onClick={onReadmeClick}
              onAuxClick={(e) => {
                if (e.button !== 1) return;
                const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
                const href = a?.getAttribute("href") || "";
                if (a && /^https?:\/\//i.test(href)) {
                  e.preventDefault();
                  onOpen(href, true);
                }
              }}
              className="quill-md min-w-0 break-words rounded-[18px] border-2 border-ink bg-paper2 p-5 text-[16px] leading-relaxed text-ink"
              dangerouslySetInnerHTML={{ __html: readmeMd.html }}
            />
          </div>
        ) : (
          <p className="text-[16px] italic text-ink3">This repository has no README.</p>
        ))}

      {tab === "files" &&
        (viewFile ? (
          <FileViewer owner={owner} repo={repo} branch={info.defaultBranch} path={viewFile} onBack={() => setViewFile(null)} onOpenOutside={onOpenOutside} />
        ) : files && files.length ? (
          <div className="min-w-0 overflow-hidden rounded-[16px] border-2 border-ink bg-paper2">
            <div className="flex items-center gap-2 border-b-2 border-ink bg-paper3/60 px-3 py-2 text-[14.5px] text-ink">
              <Icon name="layers" size={14} />
              <span className="truncate">
                {owner}/{repo}
                {currentDir ? `/${currentDir}` : ""}
              </span>
              <button
                onClick={() => currentDir && onOpen(repoUrl(owner, repo))}
                disabled={!currentDir}
                className={["ml-auto flex items-center gap-1", currentDir ? "text-ink2 hover:text-ink" : "invisible"].join(" ")}
              >
                <Icon name="back" size={13} /> up
              </button>
            </div>
            <ul>
              {files.map((f) => (
                <li key={f.path} className="border-b border-dashed border-ink/20 last:border-0">
                  <button
                    onClick={() =>
                      f.type === "dir"
                        ? onOpen(`https://github.com/${owner}/${repo}/tree/HEAD/${f.path.split("/").map(encodeURIComponent).join("/")}`)
                        : f.size > 600_000
                          ? onOpenOutside(fileUrl({ kind: "repo", owner, repo, path: f.path }))
                          : setViewFile(f.path)
                    }
                    title={f.type === "file" ? (f.size > 600_000 ? "Too big to print — opens on github.com" : "Read this file inside Quill") : "Open folder"}
                    className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-ink hover:bg-yellow/25"
                  >
                    <Icon name={f.type === "dir" ? "layers" : "note"} size={14} className="shrink-0 text-ink2" />
                    <span className="min-w-0 flex-1 truncate text-[15.5px]">{f.name}</span>
                    {f.type === "file" && <span className="shrink-0 text-[12.5px] text-ink3">{bytes(f.size)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[16px] italic text-ink3">No files here, or the default branch is empty.</p>
        ))}

      {tab === "issues" &&
        (issues && issues.length ? (
          <ul className="min-w-0 space-y-2">
            {issues
              .filter((i) => !i.pr)
              .slice(0, 12)
              .map((i) => (
                <li key={i.number} className="hd bg-paper2 p-3 text-ink">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon name="note" size={15} className="mt-[3px] shrink-0 text-green" />
                    <div className="min-w-0 flex-1">
                      <button onClick={() => onOpenOutside(issuesUrl(owner, repo) + `/${i.number}`)} className="block break-words text-left text-[16.5px] leading-snug hover:underline [overflow-wrap:anywhere]">
                        {i.title}
                      </button>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-ink3">
                        <span>#{i.number}</span>
                        <span>by {i.user}</span>
                        <span>opened {when(i.created)}</span>
                        {i.comments > 0 && <span>{i.comments} comments</span>}
                      </p>
                      {i.labels.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-1">
                          {i.labels.map((l) => (
                            <span key={l} className="hd-soft bg-paper3 px-1.5 text-[12px] text-ink2">
                              {l}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-[16px] italic text-ink3">No open issues. Enjoy the quiet.</p>
        ))}
    </section>
  );
}
