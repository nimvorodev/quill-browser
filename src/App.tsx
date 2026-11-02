import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Logo } from "./components/Icons";
import { TabStrip } from "./components/TabStrip";
import { Toolbar, BookmarkBar } from "./components/Toolbar";
import { StartPage } from "./components/StartPage";
import { LiveView } from "./components/LiveView";
import { ReaderView } from "./components/ReaderView";
import { AIPanel } from "./components/AIPanel";
import { PrivacyPanel } from "./components/PrivacyPanel";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { Scribble } from "./components/Scribble";
import { Drawer, HistoryPanel, BookmarksPanel, DownloadsPanel, NotesPanel, SettingsPanel, ShortcutsPanel } from "./components/Panels";
import { StatusBar } from "./components/StatusBar";
import { SearchView } from "./components/SearchView";
import { TubeView } from "./components/TubeView";
import { GitHubView } from "./components/GitHubView";
import { NotesLayer } from "./components/NotesLayer";
import type { DeskMode } from "./components/DeskHeader";
import { desktop, openOutside, type DownloadItem } from "./lib/platform";
import { KNOWN_HOSTS } from "./lib/filters";
import { ENGINES, HOME, SHELF, engineById, forceHttps, hostOf, isPdfUrl, isSafeWebUrl, isSearchSiteUrl, isSpaHost, isUrl, normalize, parseSearchUrl, prettyUrl, type SearchEngine } from "./lib/nav";
import { blockCheck, RULE_COUNT, stripTrackingParams, type BlockResult, type FilterOptions } from "./lib/filters";
import { readPage } from "./lib/reader";
import { DEFAULT_AI, type AIConfig } from "./lib/ai";
import { DEFAULT_SETTINGS, type DefaultPageView, type Settings } from "./lib/settings";
import { parseVideo } from "./lib/video";
import { parseGitHub } from "./lib/github";
import { pushRecent } from "./lib/search";
import {
  PREFIX,
  uid,
  useLocal,
  wipeStorage,
  NOTE_DEFAULT_H,
  NOTE_DEFAULT_W,
  type Bookmark,
  type HistoryEntry,
  type Note,
  type OriginalSubMode,
  type ShelfItem,
  type Tab,
  type ViewMode,
} from "./lib/store";

/** The default shelf, used only the first time (the user owns it after that). */
const DEFAULT_SHELF: ShelfItem[] = SHELF.map((t, i) => ({
  id: `shelf-${i}`,
  name: t.name,
  url: t.url,
  doodle: t.doodle,
  color: t.color,
  blurb: t.blurb,
}));

const newTab = (ghost: boolean, origSub: OriginalSubMode = "shielded"): Tab => ({
  id: uid(),
  title: "New page",
  url: HOME,
  stack: [HOME],
  idx: 0,
  view: "start",
  originalMode: origSub,
  loading: false,
  stage: null,
  stageNote: "",
  pinned: false,
  ghost,
  article: null,
  error: null,
  blocked: [],
  zoom: 100,
  allow: [],
  deny: [],
  nonce: 0,
});

const origFor = (v: DefaultPageView): OriginalSubMode => (v === "live" ? "live" : "shielded");

/** Pages that render inside Quill's own views instead of a relayed copy. */
const selfRenders = (url: string) => !!parseSearchUrl(url) || !!parseVideo(url) || !!parseGitHub(url);

function pageTitleFor(url: string): string {
  const s = parseSearchUrl(url);
  if (s) return s.query.slice(0, 70) || "search";
  if (parseVideo(url)) return "YouTube";
  const g = parseGitHub(url);
  if (g) {
    if (g.kind === "repo" && g.owner && g.repo) return `${g.owner}/${g.repo}`.slice(0, 70);
    if (g.kind === "trending") return "GitHub · trending";
    if (g.kind === "search") return `GitHub · ${g.query || "search"}`.slice(0, 70);
    if ((g.kind === "user" || g.kind === "org") && g.owner) return `GitHub · ${g.owner}`.slice(0, 70);
    return "GitHub";
  }
  return hostOf(url);
}

type Toast = { id: string; text: string; color: string; icon: string };

type SavedTab = {
  url: string;
  title: string;
  stack: string[];
  idx: number;
  view: ViewMode;
  originalMode: OriginalSubMode;
  pinned: boolean;
  zoom: number;
  allow: string[];
  deny: string[];
};

/** Brings back the tabs from last time. Ghost tabs are never saved, so they never come back. */
function restoreSession(enabled: boolean): { tabs: Tab[]; active: number } | null {
  if (!enabled) return null;
  try {
    const raw = localStorage.getItem(PREFIX + "session");
    if (!raw) return null;
    const saved = JSON.parse(raw) as { tabs?: SavedTab[]; active?: number };
    if (!Array.isArray(saved.tabs) || saved.tabs.length === 0) return null;
    // Stored data is untrusted (shared machine, extensions, corrupted writes):
    // only http(s) and quill:// URLs may come back, enums are whitelisted, numbers clamped.
    const cleanUrl = (u: unknown) => (typeof u === "string" && isSafeWebUrl(u) ? u : HOME);
    const cleanView = (v: unknown): ViewMode =>
      v === "reader" || v === "original" || v === "live" || v === "split" || v === "start" ? v : "start";
    const cleanSub = (v: unknown): OriginalSubMode => (v === "live" || v === "raw" || v === "shielded" ? v : "shielded");
    const cleanHosts = (a: unknown) =>
      Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && /^[a-z0-9.\-]{1,253}$/i.test(x)).slice(0, 100) : [];
    const tabs = saved.tabs.slice(0, 50).map((s) => {
      const url = cleanUrl(s.url);
      const stack = Array.isArray(s.stack) ? s.stack.filter((x) => typeof x === "string" && isSafeWebUrl(x)).slice(-100) : [];
      if (!stack.length) stack.push(url);
      return {
        ...newTab(false, cleanSub(s.originalMode)),
        url,
        title: typeof s.title === "string" ? s.title.slice(0, 90) : "New page",
        stack,
        idx: Math.min(Math.max(0, Number.isInteger(s.idx) ? (s.idx as number) : stack.length - 1), stack.length - 1),
        view: url === HOME ? ("start" as ViewMode) : cleanView(s.view),
        originalMode: cleanSub(s.originalMode),
        pinned: !!s.pinned,
        zoom: typeof s.zoom === "number" ? Math.min(160, Math.max(70, s.zoom)) : 100,
        allow: cleanHosts(s.allow),
        deny: cleanHosts(s.deny),
      };
    });
    return { tabs, active: Math.min(Math.max(0, saved.active ?? 0), tabs.length - 1) };
  } catch {
    return null;
  }
}

export default function App() {
  const [settings, setSettings] = useLocal<Settings>("settings", DEFAULT_SETTINGS);
  const [history, setHistory] = useLocal<HistoryEntry[]>("history", []);
  const [bookmarks, setBookmarks] = useLocal<Bookmark[]>("bookmarks", [
    { title: "DuckDuckGo", url: "https://duckduckgo.com", doodle: "duck" },
    { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page", doodle: "book" },
    { title: "Hacker News", url: "https://news.ycombinator.com", doodle: "news" },
    { title: "Gutenberg", url: "https://www.gutenberg.org", doodle: "quill" },
    { title: "arXiv cs.AI", url: "https://arxiv.org/list/cs.AI/recent", doodle: "atom" },
  ]);
  const [notes, setNotes] = useLocal<Note[]>("notes", [
    { id: uid(), text: "drag me anywhere ✦\ndrag the corner to resize\ndrag me off this board to float", color: "#fff2a8", x: 12, y: 14, rot: -2.5, at: Date.now(), w: NOTE_DEFAULT_W, h: NOTE_DEFAULT_H, place: "start" },
    { id: uid(), text: "read one long thing\ninstead of 40 short ones", color: "#bdf3fb", x: 96, y: 170, rot: 2, at: Date.now(), w: NOTE_DEFAULT_W, h: 120, place: "start" },
  ]);
  const [shelf, setShelf] = useLocal<ShelfItem[]>("shelf", DEFAULT_SHELF);
  /** Per-tab desk mode for GitHub / YouTube: Quill's desk, or the original site in a webview (desktop). */
  const [deskModes, setDeskModes] = useState<Record<string, DeskMode>>({});

  // Notes written before sizes existed: give them a size and a home, once.
  useEffect(() => {
    if (notes.some((n) => n.w == null || n.place == null)) {
      setNotes((p) => p.map((n) => ({ ...n, w: n.w ?? NOTE_DEFAULT_W, h: n.h ?? NOTE_DEFAULT_H, place: n.place ?? "start" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop: hand the ad/tracker host list to the main process so webview pages are filtered at the network layer.
  useEffect(() => {
    if (!desktop) return;
    void desktop.setBlockRules(KNOWN_HOSTS, settings.shields);
  }, [settings.shields]);
  // One-time: older installs saved defaultView "reader" (re-ink first); the shipped default is
  // "original" ("the real site first"), so a stale "reader" is reset once. Re-choosing reader sticks.
  useEffect(() => {
    if (localStorage.getItem(PREFIX + "viewfix2") === null) {
      localStorage.setItem(PREFIX + "viewfix2", "1");
      setSettings((s) => (s.defaultView === "reader" ? { ...s, defaultView: "original" } : s));
    }
  }, []);
  // One-time: Google is the default engine now; older saves kept "ddg". Re-picking another engine sticks.
  useEffect(() => {
    if (localStorage.getItem(PREFIX + "enginefix") === null) {
      localStorage.setItem(PREFIX + "enginefix", "1");
      setSettings((s) => (s.engine === "ddg" ? { ...s, engine: "google" } : s));
    }
  }, []);
  const [stats, setStats] = useLocal<{ total: number; byCat: Record<string, number>; since: number }>("stats", {
    total: 0,
    byCat: {},
    since: Date.now(),
  });
  const [aiCfg, setAiCfg] = useLocal<AIConfig>("ai.cfg", DEFAULT_AI);
  const [zaps, setZaps] = useLocal<Record<string, string[]>>("zaps", {});
  const [seenIntro, setSeenIntro] = useLocal<boolean>("seen.intro", false);

  const [boot] = useState(() => {
    const restored = restoreSession(settings.restoreSession);
    const list = restored?.tabs.length ? restored.tabs : [newTab(settings.ghostDefault, origFor(settings.defaultView))];
    return { tabs: list, active: list[restored?.active ?? 0]?.id ?? list[0].id };
  });
  const [tabs, setTabs] = useState<Tab[]>(boot.tabs);
  const [activeId, setActiveId] = useState<string>(boot.active);
  const [input, setInput] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQueued, setAiQueued] = useState<{ text: string; ctxOverride?: string; at: number } | null>(null);
  const [aiResetNonce, setAiResetNonce] = useState(0);
  const [aiReqTab, setAiReqTab] = useState<{ tab: "chat" | "setup"; at: number } | null>(null);
  const [palette, setPalette] = useState(false);
  const [scribble, setScribble] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Desktop: real downloads land in the system Downloads folder; every state change feeds the drawer.
  useEffect(() => {
    if (!desktop?.onDownload) return;
    return desktop.onDownload((d) => {
      setDownloads((ds) => {
        const i = ds.findIndex((x) => x.id === d.id);
        return i >= 0 ? ds.map((x) => (x.id === d.id ? d : x)) : [d, ...ds];
      });
      if (d.state === "completed") toast(`${d.filename} saved`, "var(--lime)", "download");
    });
  }, []);

  // Desktop: real <title> of every webview page flows back from the main process.
  // Sites redirect (reddit.com -> www.reddit.com), so matching is by exact URL first,
  // then by the newest same-host entry whose title is still the bare hostname.
  useEffect(() => {
    if (!desktop?.onFrameTitle) return;
    return desktop.onFrameTitle(({ url, title }) => {
      if (!title || !/^https?:\/\//i.test(url)) return;
      const host = hostOf(url);
      const generic = (t: string) => !t || t === host || t === pageTitleFor(url);
      setTabs((ts) => ts.map((t) => (t.url === url || (hostOf(t.url) === host && generic(t.title)) ? { ...t, title } : t)));
      setHistory((h) => {
        const i = h.findIndex((x) => x.url === url || (hostOf(x.url) === host && generic(x.title)));
        if (i < 0) return h;
        const next = [...h];
        next[i] = { ...h[i], title };
        return next;
      });
    });
  }, []);

  // Each tab owns its fetch. A slow page in one tab never cancels or freezes another.
  const abortsRef = useRef<Map<string, AbortController>>(new Map());
  const reqGenRef = useRef<Map<string, number>>(new Map());

  const tab = tabs.find((t) => t.id === activeId) || tabs[0];
  const engine = useMemo(() => engineById(settings.engine) ?? ENGINES[0], [settings.engine]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeId) && tabs.length) setActiveId(tabs[0].id);
  }, [activeId, tabs]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (tab) setInput(tab.url === HOME ? "" : tab.url);
  }, [activeId, tab?.url]);

  const toast = useCallback((text: string, color = "var(--yellow)", icon = "check") => {
    const id = uid();
    setToasts((t) => [...t, { id, text, color, icon }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const patch = useCallback((id: string, fn: (t: Tab) => Tab) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const addBlocked = useCallback(
    (list: BlockResult[]) => {
      if (!list.length) return;
      setStats((s) => {
        const byCat = { ...s.byCat };
        list.forEach((b) => (byCat[b.cat] = (byCat[b.cat] || 0) + 1));
        return { ...s, total: s.total + list.length, byCat };
      });
    },
    [setStats],
  );

  // Ghost tabs never write to history.
  const recordHistory = useCallback(
    (url: string, title: string, ghost: boolean) => {
      if (ghost || !settings.saveHistory || url.startsWith("quill://")) return;
      setHistory((h) => [{ url, title, at: Date.now() }, ...h.filter((x) => x.url !== url)].slice(0, 400));
    },
    [settings.saveHistory, setHistory],
  );

  const filtersFor = useCallback(
    (allow: string[] = [], deny: string[] = []): FilterOptions => ({
      shields: settings.shields,
      blockSocial: settings.blockSocial,
      blockMiners: settings.blockMiners,
      stripParams: settings.stripParams,
      allow,
      deny,
    }),
    [settings.shields, settings.blockSocial, settings.blockMiners, settings.stripParams],
  );

  const abortTabFetch = useCallback((id: string) => {
    const prev = abortsRef.current.get(id);
    if (prev) {
      prev.abort();
      abortsRef.current.delete(id);
    }
  }, []);

  const defaultNavMode = useCallback((): { view: ViewMode; origSub: OriginalSubMode } => {
    if (settings.defaultView === "reader") return { view: "reader", origSub: "shielded" };
    if (settings.defaultView === "live") return { view: "original", origSub: "live" };
    return { view: "original", origSub: "shielded" };
  }, [settings.defaultView]);

  const loadReader = useCallback(
    async (
      id: string,
      url: string,
      title: string,
      ghost: boolean,
      filters: FilterOptions,
      forceReload = false,
      preBlocked: BlockResult[] = [],
    ) => {
      abortTabFetch(id);
      const ac = new AbortController();
      abortsRef.current.set(id, ac);
      const gen = (reqGenRef.current.get(id) || 0) + 1;
      reqGenRef.current.set(id, gen);
      const current = () => reqGenRef.current.get(id) === gen;

      patch(id, (t) => ({
        ...t,
        loading: true,
        stage: "fetching",
        stageNote: "contacting relays…",
        error: null,
        article: forceReload ? null : t.article,
      }));

      try {
        const article = await readPage(url, ac.signal, {
          filters,
          forceReload,
          onStage: (stage, detail) => {
            if (current()) patch(id, (t) => ({ ...t, stage, stageNote: detail || "" }));
          },
        });
        if (!current()) return;
        const combined = [...preBlocked, ...article.blocked];
        addBlocked(article.blocked);
        patch(id, (t) => ({
          ...t,
          loading: false,
          stage: null,
          stageNote: "",
          article: { ...article, blocked: combined },
          blocked: combined,
          title: article.title.slice(0, 70) || title,
          error: null,
          // A page that only exists once its JavaScript runs opens as readable text, not a blank frame.
          view: article.shell && t.view === "original" && t.originalMode === "shielded" ? "reader" : t.view,
        }));
        recordHistory(url, article.title.slice(0, 90) || title, ghost);
        toast(
          article.shell
            ? "this page builds itself with JavaScript, so here's its readable text"
            : `${combined.length} trackers stripped · ${article.words.toLocaleString()} words`,
          article.shell ? "var(--orange)" : "var(--lime)",
          article.shell ? "bulb" : "scissors",
        );
      } catch (e) {
        if (ac.signal.aborted || !current()) return;
        patch(id, (t) => ({
          ...t,
          loading: false,
          stage: null,
          stageNote: "",
          error: e instanceof Error ? e.message : String(e),
        }));
      } finally {
        if (abortsRef.current.get(id) === ac) abortsRef.current.delete(id);
      }
    },
    [abortTabFetch, patch, addBlocked, recordHistory, toast],
  );

  /** Core navigation: resolve the input (URL, bang or search), shield it, and set the right view. */
  const navigate = useCallback(
    (target: Tab, raw: string, mode?: ViewMode, origSubOverride?: OriginalSubMode, engineId?: string) => {
      const chosen = engineById(engineId) ?? engine;
      let url = raw.startsWith("quill://") ? raw : normalize(raw, chosen);
      if (settings.httpsOnly) url = forceHttps(url);

      if (url.startsWith("quill://")) {
        const page = url.slice(8).toLowerCase();
        if (page === "start" || page === "" || page === "newtab") {
          abortTabFetch(target.id);
          patch(target.id, (t) => ({
            ...t,
            url: HOME,
            view: "start",
            title: "New page",
            article: null,
            error: null,
            loading: false,
            stage: null,
            stageNote: "",
            blocked: [],
            stack: t.stack[t.idx] === HOME ? t.stack : [...t.stack.slice(0, t.idx + 1), HOME],
            idx: t.stack[t.idx] === HOME ? t.idx : t.idx + 1,
          }));
        } else if (page === "notes") setDrawer("notes");
        else if (page === "shields" || page === "privacy") setDrawer("privacy");
        else if (page === "history") setDrawer("history");
        else if (page === "settings") setDrawer("settings");
        else if (page === "ai") setAiOpen(true);
        else toast(`quill://${page} isn't a page I know`, "var(--orange)", "bulb");
        return;
      }

      if (!isUrl(raw)) pushRecent(raw);

      const filters = filtersFor(target.allow, target.deny);
      const clean = stripTrackingParams(url, filters);
      url = clean.url;
      const paramBlocked = clean.stripped;
      const hit = blockCheck(url, filters, "navigation");
      const stack = target.stack[target.idx] === url ? target.stack : [...target.stack.slice(0, target.idx + 1), url];
      const def = defaultNavMode();
      const handled = selfRenders(url);
      // ponytail: raw files (PDFs, images) and real search-engine pages open as the live site —
      // a reader parse makes no sense for either, and the relays proved too flaky for SERPs.
      const imageFile = /\.(pdf|jpe?g|png|gif|webp|avif|bmp|svg)(?:[?#]|$)/i.test(url);
      const forceLive = !mode && !handled && (imageFile || isPdfUrl(url) || isSearchSiteUrl(url) || isSpaHost(url));
      const view: ViewMode = forceLive ? "original" : mode === "live" ? "original" : mode || (handled ? "reader" : def.view);
      const sub: OriginalSubMode = forceLive ? "live" : mode === "live" ? "live" : origSubOverride || (mode ? target.originalMode : def.origSub);
      const relay = !hit && !handled && (view === "reader" || view === "split" || (view === "original" && sub !== "live"));
      const title = pageTitleFor(url);

      if (paramBlocked.length) addBlocked(paramBlocked);
      // History covers every navigation, not only the relay-fetched ones.
      if (!hit) recordHistory(url, title, target.ghost);
      patch(target.id, (t) => ({
        ...t,
        url,
        stack,
        idx: stack.length - 1,
        view: hit ? "reader" : view,
        originalMode: sub,
        title,
        article: null,
        error: hit ? `BLOCKED:${hit.rule}` : null,
        loading: relay,
        stage: relay ? "fetching" : null,
        stageNote: relay ? "contacting relays…" : "",
        blocked: hit ? [hit, ...paramBlocked] : [...paramBlocked],
      }));
      setInput(url);

      if (hit) {
        abortTabFetch(target.id);
        addBlocked([hit]);
        toast(`blocked ${hostOf(url)} before it loaded`, "var(--red)", "shield");
        return;
      }
      recordHistory(url, title, target.ghost);
      if (relay) loadReader(target.id, url, title, target.ghost, filters, false, paramBlocked);
      else abortTabFetch(target.id);
    },
    [engine, settings.httpsOnly, filtersFor, defaultNavMode, abortTabFetch, patch, addBlocked, recordHistory, loadReader, toast],
  );

  const go = useCallback(
    (raw: string, mode?: ViewMode, tabId = activeId, origSub?: OriginalSubMode, engineId?: string) => {
      const target = tabs.find((t) => t.id === tabId) || tab;
      if (target) navigate(target, raw, mode, origSub, engineId);
    },
    [tabs, tab, activeId, navigate],
  );

  const openNew = useCallback(
    (url?: string, mode?: ViewMode) => {
      const fresh = newTab(settings.ghostDefault, origFor(settings.defaultView));
      setTabs((ts) => {
        const i = ts.findIndex((x) => x.id === activeId);
        const next = [...ts];
        next.splice(i < 0 ? next.length : i + 1, 0, fresh);
        return next;
      });
      setActiveId(fresh.id);
      setInput("");
      if (url) navigate(fresh, url, mode);
    },
    [activeId, settings.ghostDefault, settings.defaultView, navigate],
  );

  const closeTab = useCallback(
    (id: string) => {
      abortTabFetch(id);
      reqGenRef.current.delete(id);
      setTabs((ts) => {
        if (ts.length === 1) {
          const fresh = newTab(settings.ghostDefault, origFor(settings.defaultView));
          setActiveId(fresh.id);
          return [fresh];
        }
        const i = ts.findIndex((t) => t.id === id);
        const next = ts.filter((t) => t.id !== id);
        if (id === activeId) setActiveId(next[Math.max(0, i - 1)].id);
        return next;
      });
    },
    [activeId, settings.ghostDefault, settings.defaultView, abortTabFetch],
  );

  const travel = useCallback(
    (dir: -1 | 1) => {
      if (!tab) return;
      const idx = tab.idx + dir;
      if (idx < 0 || idx >= tab.stack.length) return;
      const raw = tab.stack[idx];
      // Stack entries come from storage across restarts — re-validate the scheme every hop.
      const url = typeof raw === "string" && isSafeWebUrl(raw) ? raw : HOME;
      const def = defaultNavMode();
      const handled = selfRenders(url);
      const view: ViewMode = url === HOME ? "start" : handled ? "reader" : tab.view === "start" ? def.view : tab.view;
      const relay = url !== HOME && !handled && (view === "reader" || view === "split" || (view === "original" && tab.originalMode !== "live"));
      const title = url === HOME ? "New page" : pageTitleFor(url);
      patch(tab.id, (t) => ({
        ...t,
        idx,
        url,
        view,
        article: null,
        error: null,
        blocked: [],
        title,
        loading: relay,
        stage: relay ? "fetching" : null,
        stageNote: "",
      }));
      setInput(url === HOME ? "" : url);
      if (relay) loadReader(tab.id, url, title, tab.ghost, filtersFor(tab.allow, tab.deny));
      else abortTabFetch(tab.id);
    },
    [tab, defaultNavMode, patch, loadReader, filtersFor, abortTabFetch],
  );

  /** A click inside a webview/iframe navigated the page itself — the back/forward stack and history must grow with it. */
  const frameNav = useCallback(
    (target: Tab, href: string) => {
      patch(target.id, (t) => {
        if (t.stack[t.idx] === href) return t.url === href ? t : { ...t, url: href };
        return { ...t, url: href, title: pageTitleFor(href), stack: [...t.stack.slice(0, t.idx + 1), href], idx: t.idx + 1 };
      });
      recordHistory(href, pageTitleFor(href), target.ghost);
    },
    [patch, recordHistory],
  );

  const reload = useCallback(() => {
    if (!tab) return;
    patch(tab.id, (t) => ({ ...t, nonce: t.nonce + 1 }));
    if (tab.url === HOME || selfRenders(tab.url)) {
      toast("refreshed", "var(--cyan)", "reload");
      return;
    }
    if (tab.view === "original" && tab.originalMode === "live") {
      toast("reloaded the direct frame", "var(--cyan)", "reload");
      return;
    }
    loadReader(tab.id, tab.url, tab.title, tab.ghost, filtersFor(tab.allow, tab.deny), true);
  }, [tab, patch, loadReader, filtersFor, toast]);

  /** Switch views on the current page. The lazy-load effect fetches a relay copy only when the view needs one. */
  const setTabView = useCallback(
    (nextView: ViewMode, origSub?: OriginalSubMode) => {
      if (!tab || tab.url === HOME) return;
      // In-app desks (search, tube, GitHub) have no relay copy to split — stay on the desk.
      const view: ViewMode = nextView === "live" ? "original" : nextView === "split" && selfRenders(tab.url) ? "reader" : nextView;
      const sub: OriginalSubMode = nextView === "live" ? "live" : origSub || tab.originalMode || "shielded";
      patch(tab.id, (t) => ({ ...t, view, originalMode: sub }));
    },
    [tab, patch],
  );

  const toggleBookmark = useCallback(() => {
    if (!tab || tab.url === HOME) return toast("nothing to dog-ear here", "var(--orange)", "star");
    const exists = bookmarks.some((b) => b.url === tab.url);
    if (exists) {
      setBookmarks((bs) => bs.filter((b) => b.url !== tab.url));
      toast("dog-ear removed", "var(--paper-3)", "star");
    } else {
      setBookmarks((bs) => [{ title: tab.title || hostOf(tab.url), url: tab.url, doodle: "star" }, ...bs]);
      toast("dog-eared ⭐", "var(--yellow)", "star");
    }
  }, [tab, bookmarks, setBookmarks, toast]);

  const askAI = useCallback(
    (text: string, ctxOverride?: string) => {
      let resolved = ctxOverride;
      if (resolved === undefined && !tab?.article) {
        const other = tabs.find((t) => t.article?.text);
        if (other?.article) {
          resolved = other.article.text;
        } else if (history.length) {
          resolved =
            "Recent pages in the Quill browsing log:\n" +
            history
              .slice(0, 12)
              .map((h) => `- ${h.title || hostOf(h.url)} (${h.url}) — ${new Date(h.at).toLocaleString()}`)
              .join("\n");
        }
      }
      setAiOpen(true);
      setAiQueued({ text, ctxOverride: resolved, at: Date.now() });
    },
    [tab, tabs, history],
  );

  const toggleGhost = useCallback(() => {
    if (!tab) return;
    patch(tab.id, (t) => ({ ...t, ghost: !t.ghost }));
    toast(tab.ghost ? "history writing resumed" : "ghost mode — this tab leaves no trace", "var(--violet)", "ghost");
  }, [tab, patch, toast]);

  const zapsFor = (url: string) => zaps[hostOf(url)] || [];
  const addZap = (url: string, selector: string) =>
    setZaps((z) => {
      const h = hostOf(url);
      const cur = z[h] || [];
      return cur.includes(selector) ? z : { ...z, [h]: [...cur, selector].slice(-200) };
    });
  const resetZaps = (url: string) => {
    setZaps((z) => {
      const next = { ...z };
      delete next[hostOf(url)];
      return next;
    });
    toast("zapped elements restored", "var(--lime)", "eraser");
  };

  /* ---------------- keyboard ---------------- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  // Desktop: native menu accelerators and popups from web content.
  const cmdRef = useRef<(cmd: string) => void>(() => {});
  const openUrlRef = useRef<(url: string) => void>(() => {});
  useEffect(() => {
    if (!desktop) return;
    const offCmd = desktop.onCommand((c) => cmdRef.current(c));
    const offUrl = desktop.onOpenUrl((u) => openUrlRef.current(u));
    return () => {
      offCmd();
      offUrl();
    };
  }, []);
  cmdRef.current = (cmd) => {
    if (cmd === "new-tab") openNew();
    else if (cmd === "close-tab" && tab) closeTab(tab.id);
    else if (cmd === "reload") reload();
    else if (cmd === "palette") setPalette((p) => !p);
  };
  openUrlRef.current = (url) => {
    if (/^https?:\/\//i.test(url)) openNew(url);
  };

  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName || "");
    if (!mod) {
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        travel(-1);
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        travel(1);
      }
      if (e.altKey && e.key === "Home") {
        e.preventDefault();
        go(HOME, "start");
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "k") {
      e.preventDefault();
      setPalette((p) => !p);
    } else if (k === "t") {
      e.preventDefault();
      openNew();
    } else if (k === "w") {
      e.preventDefault();
      if (tab) closeTab(tab.id);
    } else if (k === "r" && !e.shiftKey) {
      e.preventDefault();
      reload();
    } else if (k === "j") {
      e.preventDefault();
      setAiOpen((a) => !a);
    } else if (k === "d") {
      e.preventDefault();
      toggleBookmark();
    } else if (k === "b") {
      e.preventDefault();
      setDrawer((d) => (d === "bookmarks" ? null : "bookmarks"));
    } else if (k === "h") {
      e.preventDefault();
      setDrawer((d) => (d === "history" ? null : "history"));
    } else if (k === "e" && !typing) {
      e.preventDefault();
      if (tab && tab.url !== HOME) setTabView(tab.view === "reader" ? "original" : "reader");
    } else if (k === "s" && e.shiftKey) {
      e.preventDefault();
      setScribble((s) => !s);
    } else if (k === "g" && e.shiftKey) {
      e.preventDefault();
      toggleGhost();
    } else if (k === "p" && e.shiftKey) {
      e.preventDefault();
      setSettings((s) => ({ ...s, shields: !s.shields }));
    } else if (k === "x" && e.shiftKey) {
      e.preventDefault();
      window.dispatchEvent(new Event("quill:zap"));
    } else if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      if (tab) patch(tab.id, (t) => ({ ...t, zoom: Math.min(160, t.zoom + 10) }));
    } else if (e.key === "-") {
      e.preventDefault();
      if (tab) patch(tab.id, (t) => ({ ...t, zoom: Math.max(70, t.zoom - 10) }));
    }
  };

  // Tabs restored from last time load their page the first time you look at them.
  useEffect(() => {
    if (!tab || tab.loading || tab.article || tab.error) return;
    if (tab.url === HOME || selfRenders(tab.url)) return;
    const filters = filtersFor(tab.allow, tab.deny);
    if (blockCheck(tab.url, filters, "navigation")) return;
    const needs = tab.view === "reader" || tab.view === "split" || (tab.view === "original" && tab.originalMode !== "live");
    if (needs) loadReader(tab.id, tab.url, tab.title, tab.ghost, filters, false, tab.blocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tab?.url, tab?.view, tab?.originalMode]);

  // Keep the session on disk, without ghost tabs.
  useEffect(() => {
    if (!settings.restoreSession) return;
    const t = window.setTimeout(() => {
      try {
        const keep = tabs.filter((x) => !x.ghost);
        const active = Math.max(0, keep.findIndex((x) => x.id === activeId));
        const payload = {
          active,
          tabs: keep.map((x) => ({
            url: x.url,
            title: x.title,
            stack: x.stack,
            idx: x.idx,
            view: x.view,
            originalMode: x.originalMode,
            pinned: x.pinned,
            zoom: x.zoom,
            allow: x.allow,
            deny: x.deny,
          })),
        };
        localStorage.setItem(PREFIX + "session", JSON.stringify(payload));
      } catch {
        /* storage full */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [tabs, activeId, settings.restoreSession]);

  /* ---------------- command palette ---------------- */
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: "new", label: "New tab", section: "tabs", icon: "plus", hint: "Ctrl/⌘+T", run: () => openNew() },
      { id: "close", label: "Close this tab", section: "tabs", icon: "close", hint: "Ctrl/⌘+W", run: () => tab && closeTab(tab.id) },
      { id: "home", label: "Go home", section: "navigate", icon: "home", hint: "Alt+Home", run: () => go(HOME, "start") },
      { id: "tube", label: "Open the tube desk (YouTube)", section: "navigate", icon: "layers", keywords: "youtube video tube", run: () => go("https://www.youtube.com") },
      { id: "gh", label: "Open the GitHub desk", section: "navigate", icon: "branch", keywords: "github repos code", run: () => go("https://github.com/trending") },
      { id: "gh-search", label: "Search GitHub repositories", section: "navigate", icon: "search", keywords: "github repo search", run: () => go("https://github.com/search?q=&type=repositories") },
      {
        id: "reader",
        label: tab?.view === "reader" ? "Show the real site (original)" : "Re-ink this page (clean reading)",
        section: "page view",
        icon: "scissors",
        hint: "Ctrl/⌘+E",
        keywords: "reader reink clean original",
        run: () => tab && tab.url !== HOME && setTabView(tab.view === "reader" ? "original" : "reader"),
      },
      { id: "orig-shielded", label: "Original · shielded (trackers stripped)", section: "page view", icon: "shield", keywords: "original real site shielded", run: () => setTabView("original", "shielded") },
      { id: "orig-raw", label: "Original · interactive (site scripts sandboxed)", section: "page view", icon: "zap", keywords: "original interactive scripts", run: () => setTabView("original", "raw") },
      { id: "orig-live", label: "Original · direct live frame", section: "page view", icon: "antenna", keywords: "live iframe embed", run: () => setTabView("original", "live") },
      { id: "split", label: "Split view · re-inked beside the real site", section: "page view", icon: "split", keywords: "compare side by side", run: () => setTabView("split") },
      { id: "zap", label: "Zap an element on this page", section: "page view", icon: "eraser", hint: "Ctrl/⌘+⇧+X", keywords: "hide remove ad banner", run: () => window.dispatchEvent(new Event("quill:zap")) },
      {
        id: "dark-orig",
        label: settings.darkOriginal ? "Turn off dark original" : "Dark original pages",
        section: "page view",
        icon: "moon",
        keywords: "night dark invert",
        run: () => setSettings((s) => ({ ...s, darkOriginal: !s.darkOriginal })),
      },
      { id: "outside", label: "Open this page in a browser tab", section: "page view", icon: "external", run: () => tab && tab.url !== HOME && openOutside(tab.url) },
      { id: "back", label: "Go back", section: "navigate", icon: "back", run: () => travel(-1) },
      { id: "fwd", label: "Go forward", section: "navigate", icon: "forward", run: () => travel(1) },
      { id: "reload", label: "Reload & re-audit the page", section: "navigate", icon: "reload", hint: "Ctrl/⌘+R", run: reload },
      { id: "ghost", label: "Toggle ghost mode", section: "privacy", icon: "ghost", hint: "Ctrl/⌘+⇧+G", run: toggleGhost },
      {
        id: "shields",
        label: settings.shields ? "Turn shields off" : "Turn shields on",
        section: "privacy",
        icon: "shield",
        hint: "Ctrl/⌘+⇧+P",
        run: () => setSettings((s) => ({ ...s, shields: !s.shields })),
      },
      { id: "ledger", label: "Open the shield ledger", section: "privacy", icon: "filter", run: () => setDrawer("privacy") },
      {
        id: "restore",
        label: settings.restoreSession ? "Stop restoring sessions" : "Restore sessions on start",
        section: "privacy",
        icon: "history",
        run: () => setSettings((s) => ({ ...s, restoreSession: !s.restoreSession })),
      },
      {
        id: "erase-h",
        label: "Erase browsing history",
        section: "privacy",
        icon: "trash",
        run: () => {
          setHistory([]);
          toast("history erased", "var(--red)", "trash");
        },
      },
      {
        id: "erase-all",
        label: "Burn the whole notebook",
        section: "privacy",
        icon: "flame",
        hint: "history, notes, bookmarks, AI keys",
        run: () => {
          wipeStorage();
          toast("everything erased — reloading", "var(--red)", "flame");
          window.setTimeout(() => location.reload(), 900);
        },
      },
      { id: "ai", label: aiOpen ? "Close the AI margin" : "Open the AI margin", section: "AI", icon: "spark", hint: "Ctrl/⌘+J", run: () => setAiOpen((a) => !a) },
      { id: "ai-sum", label: "Ask AI to summarise this page", section: "AI", icon: "pen", run: () => askAI("Summarise this page in 5 tight bullet points.") },
      { id: "ai-facts", label: "Ask AI for the key facts", section: "AI", icon: "target", run: () => askAI("List every concrete fact, number, name and date on this page.") },
      {
        id: "ai-setup",
        label: "Change AI provider / model",
        section: "AI",
        icon: "gear",
        run: () => {
          setAiOpen(true);
          setAiQueued(null);
          setAiReqTab({ tab: "setup", at: Date.now() });
        },
      },
      { id: "scribe", label: "Use the offline Scribe", section: "AI", icon: "quill", run: () => setAiCfg((c) => ({ ...c, ...DEFAULT_AI })) },
      { id: "scribble", label: "Scribble on the page", section: "tools", icon: "marker", hint: "Ctrl/⌘+⇧+S", run: () => setScribble(true) },
      { id: "notes", label: "Margin notes", section: "tools", icon: "note", run: () => setDrawer("notes") },
      { id: "bm", label: "Bookmarks", section: "tools", icon: "book", hint: "Ctrl/⌘+B", run: () => setDrawer("bookmarks") },
      { id: "hist", label: "History", section: "tools", icon: "history", hint: "Ctrl/⌘+H", run: () => setDrawer("history") },
      { id: "settings", label: "Settings", section: "tools", icon: "gear", run: () => setDrawer("settings") },
      { id: "keys", label: "Keyboard shortcuts", section: "tools", icon: "keyboard", run: () => setDrawer("shortcuts") },
      {
        id: "theme",
        label: settings.theme === "night" ? "Daylight paper" : "Midnight ink",
        section: "tools",
        icon: settings.theme === "night" ? "sun" : "moon",
        run: () => setSettings((s) => ({ ...s, theme: s.theme === "night" ? "day" : "night" })),
      },
      { id: "focus", label: focus ? "Leave focus mode" : "Focus mode — hide the chrome", section: "tools", icon: "eyeOff", run: () => setFocus((f) => !f) },
      { id: "bm-this", label: "Bookmark this page", section: "tools", icon: "star", hint: "Ctrl/⌘+D", run: toggleBookmark },
      {
        id: "copy",
        label: "Copy this page's text",
        section: "tools",
        icon: "copy",
        run: async () => {
          await navigator.clipboard?.writeText(tab?.article?.text || "");
          toast("page text copied", "var(--lime)", "copy");
        },
      },
      ...bookmarks.slice(0, 8).map((b) => ({
        id: "bm-" + b.url,
        label: `Open ${b.title}`,
        section: "bookmarks",
        icon: b.doodle || "star",
        hint: prettyUrl(b.url),
        keywords: b.url,
        run: () => go(b.url),
      })),
      ...history.slice(0, 8).map((h) => ({
        id: "h-" + h.at,
        label: `Reopen ${h.title || hostOf(h.url)}`,
        section: "recent",
        icon: "history",
        hint: prettyUrl(h.url),
        keywords: h.url,
        run: () => go(h.url),
      })),
      ...SHELF.slice(0, 8).map((s) => ({
        id: "s-" + s.url,
        label: `${s.name} — ${s.blurb}`,
        section: "the shelf",
        icon: s.doodle,
        keywords: s.url,
        run: () => go(s.url),
      })),
      ...ENGINES.map((e) => ({
        id: "e-" + e.id,
        label: `Search with ${e.name}`,
        section: "search engine",
        icon: "search",
        hint: e.note,
        run: () => setSettings((s) => ({ ...s, engine: e.id })),
      })),
    ];
    return list.filter((c) => c.id);
  }, [
    tab,
    settings,
    bookmarks,
    history,
    aiOpen,
    focus,
    openNew,
    closeTab,
    go,
    setTabView,
    travel,
    reload,
    toggleGhost,
    toggleBookmark,
    askAI,
    setSettings,
    setHistory,
    setAiCfg,
    toast,
  ]);

  const page = useMemo(() => {
    if (!tab || !tab.article) return null;
    return { title: tab.article.title, url: tab.url, text: tab.article.text };
  }, [tab]);

  const aiChatCount = useMemo(() => {
    try {
      return (JSON.parse(localStorage.getItem(PREFIX + "ai.chat") || "[]") as unknown[]).length;
    } catch {
      return 0;
    }
  }, [aiOpen, aiQueued, drawer, aiResetNonce]);

  const blockedNav = tab?.error?.startsWith("BLOCKED:") ? tab.error.slice(8) : null;
  const secure = !!tab && (tab.url.startsWith("https://") || tab.url.startsWith("quill://"));
  // The top bar and each page's own controls already switch views, so the floating pill is retired.
  const showSwitcher = false;

  const statusView = !tab || tab.view === "start" ? "new page" : tab.view === "reader" ? (selfRenders(tab.url) ? "in-app" : "re-inked ✂") : tab.view === "split" ? "split ◫" : `original · ${tab.originalMode}`;

  const renderReaderPane = (compact = false) =>
    tab && (
      <ReaderView
        article={tab.article}
        loading={tab.loading}
        stage={tab.stage}
        stageNote={tab.stageNote}
        error={tab.error}
        url={tab.url}
        onRetry={() => loadReader(tab.id, tab.url, tab.title, tab.ghost, filtersFor(tab.allow, tab.deny), true)}
        onShowOriginal={() => setTabView("original", "shielded")}
        onLiveFrame={() => setTabView("original", "live")}
        onSplit={() => setTabView(tab.view === "split" ? "reader" : "split")}
        onOpenOutside={() => openOutside(tab.url)}
        onAsk={(p, passage) => askAI(p, passage)}
        onLink={(href, inNewTab) => (inNewTab ? openNew(href) : go(href))}
        shieldsOn={settings.shields}
        fontStep={settings.fontStep}
        setFontStep={(n) => setSettings((s) => ({ ...s, fontStep: n }))}
        reinkStyle={settings.reinkStyle}
        setReinkStyle={(s) => setSettings((p) => ({ ...p, reinkStyle: s }))}
        paperTone={settings.paperTone}
        setPaperTone={(tone) => setSettings((p) => ({ ...p, paperTone: tone }))}
        showImages={settings.showImages}
        setShowImages={(b) => setSettings((p) => ({ ...p, showImages: b }))}
        compact={compact}
      />
    );

  const renderOriginalPane = (compact = false) =>
    tab && (
      <LiveView
        tab={tab}
        subMode={tab.originalMode}
        onSubMode={(m) => setTabView(compact ? "split" : "original", m)}
        strict={settings.strictSandbox}
        autoplay={!settings.blockAutoplay}
        referrer={settings.noReferrer ? "no-referrer" : "strict-origin-when-cross-origin"}
        zoom={tab.zoom}
        onTitle={(t) => {
          // Real page title from the live frame: patch the tab AND its history entry
          // (tab.url tracks the webview, redirects included, so the match is exact).
          patch(tab.id, (x) => ({ ...x, title: t.slice(0, 70) }));
          setHistory((h) => {
            const i = h.findIndex((x) => x.url === tab.url);
            if (i < 0) return h;
            const next = [...h];
            next[i] = { ...h[i], title: t.slice(0, 70) };
            return next;
          });
        }}
        onReader={() => setTabView("reader")}
        onSplit={() => setTabView(tab.view === "split" ? "original" : "split")}
        onNavigate={(href, inNewTab) => (inNewTab ? openNew(href) : go(href))}
        onFrameNavigate={(href) => frameNav(tab, href)}
        onRetryHtml={() => loadReader(tab.id, tab.url, tab.title, tab.ghost, filtersFor(tab.allow, tab.deny), true)}
        onOpenShields={() => setDrawer("privacy")}
        dark={settings.darkOriginal}
        onToggleDark={() => setSettings((s) => ({ ...s, darkOriginal: !s.darkOriginal }))}
        zapped={zapsFor(tab.url)}
        onZapped={(sel) => addZap(tab.url, sel)}
        onResetZaps={() => resetZaps(tab.url)}
        compact={compact}
      />
    );

  return (
    <div className="paper-bg grain relative flex h-full flex-col overflow-hidden">
      {settings.ambient && <Ambient />}

      {/* ---------- chrome ---------- */}
      <div className={`relative z-40 shrink-0 transition-all duration-300 ${focus ? "pointer-events-none -translate-y-full opacity-0" : ""}`}>
        <TabStrip
          tabs={tabs}
          activeId={tab?.id || ""}
          onSelect={setActiveId}
          onClose={closeTab}
          onNew={() => openNew()}
          onPin={(id) => patch(id, (t) => ({ ...t, pinned: !t.pinned }))}
          onReorder={(from, to) =>
            setTabs((ts) => {
              const next = [...ts];
              const [m] = next.splice(from, 1);
              next.splice(to, 0, m);
              return next;
            })
          }
          onTheme={() => setSettings((s) => ({ ...s, theme: s.theme === "night" ? "day" : "night" }))}
          theme={settings.theme}
          onFocusMode={() => setFocus(true)}
        />

        {tab && (
          <Toolbar
            tab={tab}
            input={input}
            setInput={setInput}
            onSubmit={(mode, override) => go(override ?? input, mode)}
            onSetView={setTabView}
            onBack={() => travel(-1)}
            onForward={() => travel(1)}
            onReload={reload}
            onHome={() => go(HOME, "start")}
            onBookmark={toggleBookmark}
            bookmarked={bookmarks.some((b) => b.url === tab.url)}
            engine={engine}
            onEngine={(e: SearchEngine) => {
              setSettings((s) => ({ ...s, engine: e.id }));
              toast(`searching with ${e.name}`, "var(--cyan)", "search");
            }}
            ghost={tab.ghost}
            onGhost={toggleGhost}
            shieldsOn={settings.shields}
            onShields={() => setDrawer("privacy")}
            aiOpen={aiOpen}
            onAI={() => setAiOpen((a) => !a)}
            onPalette={() => setPalette(true)}
            onPanel={(p) => setDrawer(p)}
            onScribble={() => setScribble((s) => !s)}
            zoom={tab.zoom}
            setZoom={(z) => patch(tab.id, (t) => ({ ...t, zoom: z }))}
            history={history}
            bookmarks={bookmarks}
            shelf={SHELF}
          />
        )}

        {settings.showBookmarkBar && (
          <BookmarkBar bookmarks={bookmarks} onOpen={(u) => go(u)} onRemove={(u) => setBookmarks((bs) => bs.filter((b) => b.url !== u))} editing={false} />
        )}
      </div>

      {/* ---------- content ---------- */}
      <main className="relative z-20 flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {/* Every tab's tube desk stays mounted, so videos keep playing (and remember
              their spot) while you switch tabs — like any other browser. */}
          {tabs
            .filter((t) => t.view === "reader" && parseVideo(t.url) && !t.error?.startsWith("BLOCKED:"))
            .map((t) => (
              <div
                key={t.id}
                className="absolute inset-0"
                style={{ display: t.id === tab?.id ? "block" : "none" }}
                aria-hidden={t.id !== tab?.id}
              >
                <TubeView
                  url={t.url}
                  history={history}
                  onNavigate={(href) => go(href)}
                  onSearch={(text) => go(text, undefined, undefined, undefined, "youtube")}
                  onOpenOutside={openOutside}
                  onLive={() => {
                    if (t.id === activeId) setTabView("original", "live");
                  }}
                  mode={deskModes[t.id] ?? "desk"}
                  onMode={(m) => setDeskModes((d) => ({ ...d, [t.id]: m }))}
                  zoom={t.zoom}
                  nonce={t.nonce}
                  onFrameNavigate={(href) => frameNav(t, href)}
                  onTitle={(tt) => patch(t.id, (x) => ({ ...x, title: tt.slice(0, 70) }))}
                />
              </div>
            ))}
          {!tab || tab.view === "start" ? (
            <StartPage
              onOpen={(u) => go(u)}
              onSearch={(q, id) => go(q, undefined, undefined, undefined, id)}
              notes={notes}
              setNotes={setNotes}
              shelf={shelf}
              setShelf={setShelf}
              history={history}
              bookmarks={bookmarks}
              byCat={stats.byCat}
              blockedTotal={stats.total}
              shieldsOn={settings.shields}
              onShields={() => setSettings((s) => ({ ...s, shields: !s.shields }))}
              ghost={!!tab?.ghost}
              onGhost={toggleGhost}
              engine={engine}
              onEngine={(e) => setSettings((s) => ({ ...s, engine: e.id }))}
              onAsk={(p) => askAI(p)}
              onPalette={() => setPalette(true)}
            />
          ) : blockedNav ? (
            <BlockedCard
              rule={blockedNav}
              url={tab.url}
              onAllow={() => {
                const h = hostOf(tab.url);
                const nextAllow = [...new Set([...tab.allow, h])];
                const nextDeny = tab.deny.filter((d) => d !== h);
                patch(tab.id, (t) => ({ ...t, allow: nextAllow, deny: nextDeny, error: null, blocked: [], view: "reader" }));
                go(tab.url, "reader", tab.id);
                toast(`${h} added to this tab's allow-list`, "var(--lime)", "shield");
              }}
              onHome={() => go(HOME, "start")}
              onOutside={() => openOutside(tab.url)}
            />
          ) : tab.view === "split" && !selfRenders(tab.url) ? (
            <div className="grid h-full w-full grid-cols-1 divide-y-2 divide-ink lg:grid-cols-2 lg:divide-x-2 lg:divide-y-0">
              <div className="min-h-0 min-w-0 overflow-hidden">{renderReaderPane(true)}</div>
              <div className="min-h-0 min-w-0 overflow-hidden">{renderOriginalPane(true)}</div>
            </div>
          ) : tab.view === "reader" && parseGitHub(tab.url) ? (
            <GitHubView
              key={`gh-${tab.id}`}
              url={tab.url}
              onOpen={(href, inNewTab) => (inNewTab ? openNew(href) : go(href))}
              onSearch={(q) => go(`https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`)}
              onOpenOutside={openOutside}
              onAsk={(p, ctx) => askAI(p, ctx)}
              mode={deskModes[tab.id] ?? "desk"}
              onMode={(m) => setDeskModes((d) => ({ ...d, [tab.id]: m }))}
              zoom={tab.zoom}
              nonce={tab.nonce}
              onFrameNavigate={(href) => frameNav(tab, href)}
              onTitle={(t) => patch(tab.id, (x) => ({ ...x, title: t.slice(0, 70) }))}
            />
          ) : tab.view === "reader" && parseSearchUrl(tab.url) ? (
            <SearchView
              key={`search-${tab.nonce}`}
              url={tab.url}
              onSearch={(text, id) => go(text, undefined, undefined, undefined, id)}
              onOpen={(href, inNewTab) => (inNewTab ? openNew(href) : go(href))}
              onAsk={(p, ctx) => askAI(p, ctx)}
            />
          ) : tab.view === "reader" && parseVideo(tab.url) ? null : tab.view === "reader" ? (
            renderReaderPane(false)
          ) : (
            renderOriginalPane(false)
          )}

          {/* floating view switcher */}
          {showSwitcher && (
            <div
              className="absolute bottom-3 right-3 z-30 flex items-center gap-1 border-2 border-ink bg-paper2/95 p-1 text-ink ink-shadow-sm"
              style={{ borderRadius: "16px 5px 18px 5px / 5px 18px 5px 16px" }}
            >
              {(
                [
                  { id: "original" as const, label: "original", icon: "globe", tip: "The real site: shielded, interactive or direct" },
                  { id: "reader" as const, label: "re-ink", icon: "scissors", tip: "Clean, re-inked reading view" },
                  { id: "split" as const, label: "split", icon: "split", tip: "Re-inked beside the real site" },
                ] as const
              ).map((m) => {
                const active = m.id === "original" ? tab.view === "original" || tab.view === "live" : tab.view === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setTabView(m.id)}
                    title={m.tip}
                    className={[
                      "flex items-center gap-1 px-2 py-[2px] text-[14px] transition",
                      active ? "bg-yellow font-bold text-[#1a2440]" : "text-ink2 hover:bg-paper3/70 hover:text-ink",
                    ].join(" ")}
                    style={{ borderRadius: "10px 3px 10px 3px" }}
                  >
                    <Icon name={m.icon} size={13} />
                    {m.label}
                  </button>
                );
              })}
              <button
                onClick={() => openOutside(tab.url)}
                title="Open in a browser tab"
                className="px-1.5 py-[2px] text-ink3 transition hover:text-ink"
              >
                <Icon name="external" size={13} />
              </button>
            </div>
          )}
        </div>

        {/* notes let loose over the whole window */}
        <NotesLayer notes={notes} setNotes={setNotes} hidden={focus || scribble} />

        {/* AI margin */}
        <div className={aiOpen ? "no-drag absolute inset-0 z-[65] md:static md:z-auto md:w-[398px] md:shrink-0" : "hidden"}>
          <AIPanel
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            cfg={aiCfg}
            setCfg={setAiCfg}
            page={page}
            queued={aiQueued}
            consumeQueued={() => setAiQueued(null)}
            resetNonce={aiResetNonce}
            requestedTab={aiReqTab}
          />
        </div>
      </main>

      <div className={`relative z-30 shrink-0 transition-all duration-300 ${focus ? "pointer-events-none translate-y-full opacity-0" : ""}`}>
        <StatusBar
          blockedTotal={stats.total}
          tabBlocked={tab?.blocked.length || 0}
          ghost={!!tab?.ghost}
          shieldsOn={settings.shields}
          engine={engine}
          secure={secure}
          view={statusView}
          host={tab && tab.url !== HOME ? hostOf(tab.url) : "quill://start"}
          onOpenShields={() => setDrawer("privacy")}
          onToggleShields={() => setSettings((s) => ({ ...s, shields: !s.shields }))}
        />
      </div>

      {focus && (
        <button
          onClick={() => setFocus(false)}
          className="no-drag hd btn-sketch fixed right-3 top-3 z-[80] flex items-center gap-1.5 bg-paper2 px-3 py-1 text-[15px] text-ink ink-shadow"
        >
          <Icon name="eye" size={14} /> leave focus mode
        </button>
      )}

      {/* ---------- drawers ---------- */}
      <Drawer open={drawer === "history"} title="the log" icon="history" onClose={() => setDrawer(null)}>
        <HistoryPanel
          history={history}
          onOpen={(u) => {
            go(u);
            setDrawer(null);
          }}
          onClear={() => {
            setHistory([]);
            toast("history erased", "var(--red)", "trash");
          }}
          onForget={(at) => setHistory((h) => h.filter((x) => x.at !== at))}
        />
      </Drawer>
      <Drawer open={drawer === "bookmarks"} title="dog-ears" icon="book" onClose={() => setDrawer(null)}>
        <BookmarksPanel
          bookmarks={bookmarks}
          onOpen={(u) => {
            go(u);
            setDrawer(null);
          }}
          onRemove={(u) => setBookmarks((bs) => bs.filter((b) => b.url !== u))}
          onAdd={(b) => {
            setBookmarks((bs) => (bs.some((x) => x.url === b.url) ? bs : [b, ...bs]));
            toast("dog-eared ⭐", "var(--yellow)", "star");
          }}
          currentUrl={tab?.url || ""}
          currentTitle={tab?.title || ""}
        />
      </Drawer>
      <Drawer open={drawer === "notes"} title="margin notes" icon="note" onClose={() => setDrawer(null)}>
        <NotesPanel
          notes={notes}
          setNotes={setNotes}
          onGoStart={() => {
            go(HOME, "start");
            setDrawer(null);
          }}
        />
      </Drawer>
      <Drawer open={drawer === "privacy"} title="shields" icon="shield" onClose={() => setDrawer(null)} width={520}>
        <PrivacyPanel
          tab={tab}
          settings={settings}
          setSettings={setSettings}
          blockedTotal={stats.total}
          byCat={stats.byCat}
          allow={tab?.allow || []}
          deny={tab?.deny || []}
          onAllow={(h) => {
            if (!tab) return;
            patch(tab.id, (t) => ({
              ...t,
              allow: t.allow.includes(h) ? t.allow.filter((x) => x !== h) : [...t.allow, h],
              deny: t.deny.filter((x) => x !== h),
            }));
            toast(`allow-list updated for ${h}`, "var(--lime)", "shield");
          }}
          onDeny={(h) => {
            if (!tab) return;
            patch(tab.id, (t) => ({
              ...t,
              deny: t.deny.includes(h) ? t.deny.filter((x) => x !== h) : [...t.deny, h],
              allow: t.allow.filter((x) => x !== h),
            }));
            toast(`hard-block updated for ${h}`, "var(--red)", "shieldOff");
          }}
          onRefetch={
            tab && tab.url !== HOME && !selfRenders(tab.url)
              ? () => {
                  reload();
                  setDrawer(null);
                }
              : undefined
          }
          onClear={(what) => {
            if (what === "history") {
              setHistory([]);
              toast("history erased", "var(--red)", "trash");
            }
            if (what === "bookmarks") {
              setBookmarks([]);
              toast("bookmarks erased", "var(--red)", "trash");
            }
            if (what === "notes") {
              setNotes([]);
              toast("notes erased", "var(--red)", "trash");
            }
            if (what === "ai") {
              wipeStorage(["ai.chat", "ai.cfg", "ai.ctx"]);
              setAiCfg(DEFAULT_AI);
              setAiResetNonce((n) => n + 1);
              toast("AI chats & keys erased", "var(--red)", "trash");
            }
            if (what === "all") {
              wipeStorage();
              toast("everything erased — reloading", "var(--red)", "flame");
              window.setTimeout(() => location.reload(), 900);
            }
          }}
        />
      </Drawer>
      <Drawer open={drawer === "downloads"} title="downloads" icon="download" onClose={() => setDrawer(null)}>
        <DownloadsPanel items={downloads} />
      </Drawer>
      <Drawer open={drawer === "settings"} title="settings" icon="gear" onClose={() => setDrawer(null)}>
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          counts={{ history: history.length, bookmarks: bookmarks.length, notes: notes.length, chats: aiChatCount }}
          onWipe={() => {
            wipeStorage();
            toast("everything erased — reloading", "var(--red)", "flame");
            window.setTimeout(() => location.reload(), 900);
          }}
        />
      </Drawer>
      <Drawer open={drawer === "shortcuts"} title="two-key routes" icon="keyboard" onClose={() => setDrawer(null)}>
        <ShortcutsPanel />
      </Drawer>

      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
      <Scribble open={scribble} onClose={() => setScribble(false)} dark={settings.theme === "night"} />

      {/* ---------- first run ---------- */}
      {!seenIntro && (
        <Welcome
          onClose={() => setSeenIntro(true)}
          onTour={() => {
            setSeenIntro(true);
            setPalette(true);
          }}
          onRead={() => {
            setSeenIntro(true);
            go("https://en.wikipedia.org/wiki/Ad_blocking", "reader");
          }}
        />
      )}

      {/* ---------- toasts ---------- */}
      <div className="pointer-events-none fixed bottom-12 left-1/2 z-[99] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pop-in flex max-w-[92vw] items-center gap-2 border-2 border-ink px-3 py-1.5 text-[16px] text-[#1a2440] ink-shadow"
            style={{ background: t.color, borderRadius: "14px 4px 16px 4px / 4px 16px 4px 14px" }}
          >
            <Icon name={t.icon} size={15} />
            <span className="truncate">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- first-run card ---------------- */
function Welcome({ onClose, onTour, onRead }: { onClose: () => void; onTour: () => void; onRead: () => void }) {
  const rows = [
    {
      icon: "globe",
      color: "var(--cyan)",
      title: "The real site first",
      body: "Pages open as the site itself, with trackers, pixels and ad slots stripped. Tap ✂ re-ink for clean type, or split the screen to compare.",
    },
    {
      icon: "search",
      color: "var(--yellow)",
      title: "The engine you pick, for real",
      body: `Pick an engine, or type a bang: !yt for videos, !w for Wikipedia, !gh for GitHub. Web results open as the real, shielded page — YouTube plays right here (${RULE_COUNT} rules strip the trackers).`,
    },
    {
      icon: "ghost",
      color: "var(--violet)",
      title: "Private by construction",
      body: "No account, no telemetry, no cookies. History, notes and keys live only in this browser's localStorage, and one button burns all of it. Ghost tabs leave no trace.",
    },
    {
      icon: "spark",
      color: "var(--pink)",
      title: "AI is optional, and yours",
      body: "The built-in Scribe summarises pages offline with zero setup. Point the AI margin at Ollama or LM Studio on your own machine, or at any OpenAI-compatible endpoint.",
    },
  ];
  return (
    <div className="no-drag fixed inset-0 z-[100] grid place-items-center bg-ink/45 p-4 backdrop-blur-[3px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop-in hd no-scrollbar relative max-h-[88vh] w-full max-w-[640px] overflow-y-auto bg-paper2 p-6 text-ink ink-shadow-lg">
        <span className="tape" style={{ top: -13, left: 34, transform: "rotate(-5deg)" }} />
        <span className="tape" style={{ top: -11, right: 40, transform: "rotate(6deg)", background: "color-mix(in srgb, var(--pink) 55%, white)" }} />
        <button onClick={onClose} className="hd absolute right-3 top-3 grid h-[28px] w-[28px] place-items-center bg-paper2 text-ink hover:bg-red hover:text-white" title="Skip the intro">
          <Icon name="close" size={14} strokeWidth={2.4} />
        </button>
        <div className="mb-1 flex items-center gap-2">
          <Logo size={38} />
          <p className="text-[15px] uppercase tracking-[0.25em] text-ink3">welcome to</p>
        </div>
        <h2 className="mb-1 text-[clamp(2.8rem,8vw,4.2rem)] leading-[0.85]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Quill<span className="text-pink">.</span>
        </h2>
        <p className="mb-5 text-[18px] italic text-ink2">a hand-written browser for people who'd rather read than be advertised at</p>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.title} className="flex gap-3" style={{ transform: `rotate(${i % 2 ? 0.35 : -0.35}deg)` }}>
              <span
                className="grid h-[38px] w-[38px] shrink-0 place-items-center border-2 border-ink text-[#1a2440]"
                style={{ background: r.color, borderRadius: "48% 52% 55% 45% / 52% 48% 52% 48%" }}
              >
                <Icon name={r.icon} size={20} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <b className="block text-[22px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                  {i + 1}. {r.title}
                </b>
                <span className="block text-[15.5px] leading-snug text-ink2">{r.body}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t-2 border-dashed border-ink/25 pt-4">
          <button onClick={onRead} className="hd btn-sketch flex items-center gap-1.5 bg-yellow px-4 py-1.5 text-[18px] text-[#1a2440]">
            <Icon name="scissors" size={16} /> show me — re-ink an article
          </button>
          <button onClick={onTour} className="hd btn-sketch flex items-center gap-1.5 bg-cyan px-4 py-1.5 text-[18px] text-[#12171f]">
            <Icon name="zap" size={16} /> open the palette
          </button>
          <button onClick={onClose} className="hd-soft btn-sketch ml-auto px-3 py-1.5 text-[16px] text-ink2 hover:bg-paper3/60">
            just let me browse
          </button>
        </div>
        <p className="mt-3 text-[13.5px] italic text-ink3">⌘/Ctrl+K does everything · ⌘/Ctrl+E flips original and re-ink · ⌘/Ctrl+⇧+X zaps an element</p>
      </div>
    </div>
  );
}

/* ---------------- blocked interstitial ---------------- */
function BlockedCard({
  rule,
  url,
  onAllow,
  onHome,
  onOutside,
}: {
  rule: string;
  url: string;
  onAllow: () => void;
  onHome: () => void;
  onOutside: () => void;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="hd relative max-w-[560px] bg-paper2 p-6 text-ink ink-shadow-lg">
        <span className="tape" style={{ top: -13, left: "34%", transform: "rotate(-4deg)", background: "color-mix(in srgb, var(--red) 45%, white)" }} />
        <div className="mb-3 flex items-center gap-3">
          <span className="wiggle grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-ink bg-red text-white">
            <Icon name="shieldOff" size={24} />
          </span>
          <h2 className="text-[38px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            stopped at the door
          </h2>
        </div>
        <p className="reading mb-2 text-ink2">
          <b className="text-ink">{hostOf(url)}</b> matched blocking rule <code className="rounded bg-paper3 px-1 text-[14px]">{rule}</code>, so Quill never opened a connection.
        </p>
        <p className="mb-4 break-all text-[14px] italic text-ink3">{url}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onAllow} className="hd btn-sketch flex items-center gap-1.5 bg-lime px-3 py-1.5 text-[17px] text-[#12171f]">
            <Icon name="check" size={16} /> allow it on this tab
          </button>
          <button onClick={onHome} className="hd btn-sketch flex items-center gap-1.5 bg-yellow px-3 py-1.5 text-[17px] text-[#1a2440]">
            <Icon name="home" size={16} /> back home
          </button>
          <button onClick={onOutside} className="hd btn-sketch flex items-center gap-1.5 bg-paper3/70 px-3 py-1.5 text-[17px] text-ink">
            <Icon name="external" size={16} /> open outside
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ambient ink doodles ---------------- */
function Ambient() {
  const bits = [
    { d: "M4 30 C 14 6, 30 6, 40 24 S 62 40, 72 14", x: "4%", y: "16%", w: 120, c: "var(--pink)", r: -6, dur: "11s" },
    { d: "M10 10 L 34 34 M 34 34 L 22 32 M 34 34 L 32 22", x: "86%", y: "12%", w: 60, c: "var(--violet)", r: 8, dur: "9s" },
    { d: "M30 6 a24 24 0 1 1 -18 8 a18 18 0 1 0 12 -4", x: "78%", y: "72%", w: 90, c: "var(--cyan)", r: 0, dur: "13s" },
    { d: "M6 26 l10 -18 l10 18 l-10 -6 z", x: "14%", y: "74%", w: 54, c: "var(--orange)", r: -10, dur: "10s" },
    { d: "M4 14 h44 M4 26 h30 M4 38 h38", x: "44%", y: "86%", w: 110, c: "var(--ink)", r: 2, dur: "15s" },
    { d: "M20 4 a16 16 0 1 0 0.1 0 M20 12 a8 8 0 1 0 0.1 0", x: "92%", y: "44%", w: 70, c: "var(--yellow)", r: 4, dur: "12s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-[0.42]">
      {bits.map((b, i) => (
        <svg key={i} width={b.w} height={b.w * 0.6} viewBox={`0 0 ${b.w} ${b.w * 0.6}`} className="drift absolute" style={{ left: b.x, top: b.y, ["--r" as any]: `${b.r}deg`, ["--d" as any]: b.dur }}>
          <path d={b.d} stroke={b.c} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.55" />
        </svg>
      ))}
    </div>
  );
}
