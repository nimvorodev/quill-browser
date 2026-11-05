/* eslint-disable @typescript-eslint/no-require-imports */
// Quill desktop — Electron main process.
//
// Security posture:
//  - The renderer is a sandboxed, context-isolated page with no Node access.
//  - Web content never runs in the renderer; it runs in <webview> tags inside
//    their own persisted partition, each with sandbox + contextIsolation.
//  - Navigation of the app window itself is pinned to the bundled index.html.
//  - window.open from any web content is routed to the system browser.
//  - Ad/tracker hosts are blocked at the network layer for the web partition.

const { app, BrowserWindow, ipcMain, shell, session, nativeTheme, Menu, webContents, clipboard, nativeImage, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const isMac = process.platform === "darwin";
const isDev = !app.isPackaged && !!process.env.VITE_DEV_SERVER_URL;
const WEB_PARTITION = "persist:quill-web";
const APP_PARTITION = "persist:quill-app";

// Encrypted DNS (DoH). Chromium only accepts these as startup switches, so the
// setting is persisted to disk and applied on the next launch.
const DOH_TEMPLATE = "https://cloudflare-dns.com/dns-query";
function dohEnabled() {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "doh.json"), "utf8")).enabled === true;
  } catch {
    return false;
  }
}
if (dohEnabled()) {
  app.commandLine.appendSwitch("enable-features", "DnsOverHttps");
  // automatic = upgrade to DoH when the resolver answers; fall back to system DNS otherwise.
  app.commandLine.appendSwitch("dns-over-https-mode", "automatic");
  app.commandLine.appendSwitch("dns-over-https-templates", DOH_TEMPLATE);
}

/** @type {BrowserWindow | null} */
let win = null;
/** Every live app window — downloads and saves broadcast to all of them. */
const wins = new Set();
// Permissions granted per host: host -> Set(permission). Persisted by the
// renderer; pushed here on boot and on every change.
const permRules = new Map();
// Unanswered permission prompts: id -> { cb, timer }.
const pendingPerms = new Map();
const PERM_AUTO = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock"]);
// Only these ever prompt — everything else is denied without asking.
const PERM_PROMPTABLE = new Set(["media", "geolocation", "notifications", "midi", "display-capture", "clipboard-read"]);
function sendAll(channel, payload) {
  for (const w of wins) {
    try {
      w.webContents.send(channel, payload);
    } catch {
      /* window closing */
    }
  }
}
/** The window a menu accelerator should act on. */
const focusedWin = () => BrowserWindow.getFocusedWindow() || win;
/** @type {Set<string>} */
let blockHosts = new Set();
let blockEnabled = true;
let blockedCount = 0;
// Ask where to save each download (the settings panel drives this).
let askSave = true;

/** Hostname-suffix match: "doubleclick.net" blocks "ad.doubleclick.net" too. */
function hostBlocked(hostname) {
  if (!blockEnabled || !hostname) return false;
  const parts = hostname.toLowerCase().split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (blockHosts.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

// ponytail: param-level YouTube ad heuristic — kills most pre/mid-rolls in the real
// YouTube page. uBlock-grade blocking needs per-URL regex rules over googlevideo params.
const YT_AD = /googlevideo\.com\/videoplayback\?[\s\S]*(?:[?&])(adformat|ad_type|adidx|ctier|oad)=|youtube\.com\/(?:api\/stats\/ads|pagead\/)/i;

// ponytail: path-level rules for the LIVE network layer — deliberately a short,
// ad-specific list. Generic patterns ("/ads/", "prebid") false-positive on real
// content, so those stay in the reader pipeline (src/lib/filters.ts) only.
const AD_PATHS = [/\/pagead\//i, /\/ptracking/i, /\/(vast\.xml|vpaid)/i, /\/show_ads\.js/i, /\/pubads\.impl/i];

// Page-world scriptlets (popup gate + YouTube ad scrub incl. display-ad hiding)
// live in electron/scriptlets.cjs, injected via the DevTools protocol's
// Page.addScriptToEvaluateOnNewDocument — DOCUMENT-START in the page's MAIN
// world, before YouTube's inline player fetch (what Puppeteer's addInitScript
// uses). A webview preload CANNOT do this: sandboxed preloads run in an
// isolated world and can never patch the page's JSON.parse/fetch — verified
// empirically on Electron 45.
const SCRIPTLETS = fs.readFileSync(path.join(__dirname, "scriptlets.cjs"), "utf8");

/* ---------------- downloads ---------------- */

/** Wire real downloads for a session: save into the user's Downloads folder, stream progress to the renderer. */
// Paths the download/PDF handlers themselves chose — the only files the
// renderer may reveal in Explorer. Persisted to disk so "reveal" survives
// app restarts, just like the drawer does. Capped, insertion order.
const KNOWN_DL_FILE = path.join(app.getPath("userData"), "known-downloads.json");
const loadKnown = () => {
  try {
    const list = JSON.parse(fs.readFileSync(KNOWN_DL_FILE, "utf8"));
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
};
const knownDownloads = loadKnown();
const rememberDownload = (p) => {
  knownDownloads.add(p);
  if (knownDownloads.size > 500) knownDownloads.delete(knownDownloads.values().next().value);
  try {
    fs.writeFileSync(KNOWN_DL_FILE, JSON.stringify([...knownDownloads]));
  } catch {
    /* best-effort — reveal still works this session */
  }
};

// URLs with a download still in flight (dialog open / not yet done): a second
// will-download for the same URL while the first is pending is a double-fire
// (seen from PDF-viewer download buttons) — it dies here instead of stacking
// a second save dialog.
const pendingDlUrls = new Set();

// Downloads currently in flight, keyed by drawer id — pause/resume/cancel.
const dlItems = new Map();

function wireDownloads(ses) {
  ses.on("will-download", (e, item) => {
    const dlUrl = item.getURL();
    try {
      const logFile = path.join(app.getPath("userData"), "downloads.log");
      // Keep the diagnostic log from growing forever — rotate at ~256 KB.
      try {
        const st = fs.statSync(logFile);
        if (st.size > 262144) fs.writeFileSync(logFile, "");
      } catch {
        /* not there yet */
      }
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${dlUrl} -> ${item.getFilename()}\n`);
    } catch {
      /* logging is best-effort */
    }
    if (pendingDlUrls.has(dlUrl)) {
      try {
        item.cancel();
      } catch {
        /* already gone */
      }
      return;
    }
    pendingDlUrls.add(dlUrl);
    // Safety valve: if a 'done' ever failed to fire, the guard would leak —
    // a cap clears stale entries long after any real dialog has closed.
    if (pendingDlUrls.size > 100) pendingDlUrls.clear();
    // Ask mode: we deliberately set NO save path — Electron's own save dialog
    // (the one titled with the URL) asks where to save, and cancelling it
    // cancels the item. Opening our own dialog on top of it was the double
    // window. We only track progress and register the final path on done.
    if (askSave) {
      void trackDownload(item, dlUrl);
      return;
    }
    // Auto mode sets the path synchronously — before this handler returns —
    // so Electron's default save dialog never appears.
    void placeDownload(item, dlUrl);
  });
}

/** Ask-mode tracker: Electron's dialog owns the path; we watch it land. */
async function trackDownload(item, dlUrl) {
  const file = path.basename(item.getFilename() || "download");
  const state = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename: file, path: "", received: 0, total: item.getTotalBytes(), state: "downloading" };
  const push = () => sendAll("quill:download", { ...state });
  dlItems.set(state.id, { item, mark: (s) => { state.state = s; push(); } });
  push();
  item.on("updated", () => {
    state.received = item.getReceivedBytes();
    push();
  });
  item.once("done", (_ev, s) => {
    dlItems.delete(state.id);
    state.received = item.getReceivedBytes();
    state.state = s === "completed" ? "completed" : s;
    try {
      state.path = item.getSavePath() || "";
      if (state.path) {
        rememberDownload(state.path);
        // The user may have renamed the file in the dialog — show what's on disk.
        state.filename = path.basename(state.path) || state.filename;
      }
    } catch {
      /* item gone */
    }
    push();
    // The dedupe guard lives until the dialog is fully resolved (done fires on
    // save AND on cancel) — releasing it any earlier would let a double-fire
    // opened while the dialog is up slip past and stack a second window.
    pendingDlUrls.delete(dlUrl);
  });
}

async function placeDownload(item, dlUrl) {
  try {
    // Auto mode: the filename is network-controlled — basename it so nothing
    // ever escapes the Downloads folder, whatever the server claims.
    const file = path.basename(item.getFilename() || "download");
    const dot = file.lastIndexOf(".");
    const base = dot > 0 ? file.slice(0, dot) : file;
    const ext = dot > 0 ? file.slice(dot) : "";
    let savePath = path.join(app.getPath("downloads"), file);
    for (let i = 1; fs.existsSync(savePath); i++) savePath = path.join(app.getPath("downloads"), `${base} (${i})${ext}`);
    // The dialog may have renamed the file — the drawer shows what's on disk.
    rememberDownload(savePath);
    const state = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename: path.basename(savePath), path: savePath, received: 0, total: item.getTotalBytes(), state: "downloading" };
    item.setSavePath(savePath);
    const push = () => sendAll("quill:download", { ...state });
    dlItems.set(state.id, { item, mark: (s) => { state.state = s; push(); } });
    push();
    item.on("updated", (_ev, s) => {
      state.received = item.getReceivedBytes();
      if (s === "interrupted") state.state = "interrupted";
      push();
    });
    item.once("done", (_ev, s) => {
      dlItems.delete(state.id);
      state.received = item.getReceivedBytes();
      state.state = s === "completed" ? "completed" : s;
      push();
    });
  } finally {
    // The dialog is resolved either way (picked or cancelled) — same-URL
    // double-fires land inside that window, later ones are new downloads.
    pendingDlUrls.delete(dlUrl);
  }
}

function installNetworkFilter() {
  const ses = session.fromPartition(WEB_PARTITION);
  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, cb) => {
    let host = "";
    try {
      host = new URL(details.url).hostname;
    } catch {
      /* ignore */
    }
    // Never block the top-level document the user asked for — only subresources.
    if (details.resourceType !== "mainFrame" && (hostBlocked(host) || (blockEnabled && (YT_AD.test(details.url) || AD_PATHS.some((re) => re.test(details.url)))))) {
      blockedCount += 1;
      win?.webContents.send("quill:blocked", { url: details.url, host });
      return cb({ cancel: true });
    }
    cb({});
  });

  // Do not leak the Electron UA fingerprint to web pages; present as plain Chrome.
  const chromeUA = ses.getUserAgent().replace(/\s?Electron\/\S+/, "").replace(/\s?quill\S*\/\S+/i, "");
  ses.setUserAgent(chromeUA);

  // Permission posture: a few safe things are auto-allowed, everything else
  // needs an explicit per-site grant — the renderer shows a prompt banner and
  // pushes the saved rules back here (it persists them in localStorage).
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    if (PERM_AUTO.has(permission)) return cb(true);
    if (!PERM_PROMPTABLE.has(permission)) return cb(false);
    let host = "";
    try {
      host = new URL(wc.getURL()).hostname;
    } catch {
      /* about:blank — no host, deny */
    }
    if (host && permRules.get(host)?.has(permission)) return cb(true);
    const w = BrowserWindow.fromWebContents(wc.hostWebContents || wc);
    if (!w || !host) return cb(false);
    const id = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Chrome-style: an unanswered prompt auto-denies after 30s.
    const timer = setTimeout(() => {
      if (pendingPerms.delete(id)) cb(false);
    }, 30000);
    pendingPerms.set(id, { cb, timer });
    w.webContents.send("quill:perm-request", { id, host, permission });
  });
  ses.setPermissionCheckHandler((wc, permission) => {
    if (PERM_AUTO.has(permission)) return true;
    try {
      const host = new URL(wc.getURL()).hostname;
      return Boolean(host && permRules.get(host)?.has(permission));
    } catch {
      return false;
    }
  });

  // YouTube's embed player (since July 2025) rejects requests that carry no HTTP
  // Referer with player error 153. The packaged app loads its renderer from
  // file://, and Chromium never sends a Referer from a file:// document — so
  // stamp one on. Only referrer-less requests are touched (dev has a real origin).
  const appSes = session.fromPartition(APP_PARTITION);
  appSes.webRequest.onBeforeSendHeaders({ urls: ["*://*.youtube-nocookie.com/*", "*://*.youtube.com/*"] }, (details, cb) => {
    const h = details.requestHeaders;
    if (!h.Referer && !h.referer) h.Referer = "https://app.quill.browser/";
    cb({ requestHeaders: h });
  });
}

function createWindow(fresh = false) {
  const w = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#12171f" : "#f7f4ea",
    // Taskbar/window icon for unpackaged runs; the packaged exe gets its icon from electron-builder.
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    // Frameless on Windows/Linux (in-app controls); native traffic lights on macOS.
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: APP_PARTITION,
      spellcheck: true,
    },
  });

  wins.add(w);
  // `win` stays "the last created window" — a fallback for legacy
  // single-window paths; everything user-facing uses the sender's window.
  win = w;

  w.once("ready-to-show", () => w.show());
  w.on("maximize", () => w.webContents.send("quill:maximized", true));
  w.on("unmaximize", () => w.webContents.send("quill:maximized", false));
  w.on("closed", () => {
    wins.delete(w);
    if (win === w) win = null;
  });

  // The app window may only ever show the bundled app.
  const appUrl = isDev ? process.env.VITE_DEV_SERVER_URL : `file://${path.join(__dirname, "..", "dist", "index.html")}`;
  w.webContents.on("will-navigate", (e, url) => {
    if (url !== appUrl && !url.startsWith(appUrl)) e.preventDefault();
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Harden every <webview> the renderer creates, regardless of its attributes.
  w.webContents.on("will-attach-webview", (_e, prefs, params) => {
    delete prefs.preload;
    delete prefs.preloadURL;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    params.partition = WEB_PARTITION;
    // http(s) plus the two schemes Quill itself navigates to on purpose:
    // view-source: (Ctrl+U) and file:// (Ctrl+O — user-picked files only).
    if (!/^(file:\/\/|(view-source:)?https?:\/\/)/i.test(params.src || "")) params.src = "about:blank";
  });
  w.webContents.on("did-attach-webview", (_e, wc) => {
    // Guest events go to the window that owns this webview — with multiple
    // windows, broadcasting tab commands would drive every window at once.
    const sendOwner = (ch, payload) => {
      try {
        BrowserWindow.fromWebContents(wc.hostWebContents || wc)?.webContents.send(ch, payload);
      } catch {
        /* window gone */
      }
    };
    // Document-start scriptlet injection into the page's MAIN world (see the
    // SCRIPTLETS note above). The debugger session stays attached for the
    // webview's lifetime so every new document gets the script.
    try {
      wc.debugger.attach("1.3");
      void wc.debugger.sendCommand("Page.enable").then(() =>
        wc.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: SCRIPTLETS })
      ).catch(() => { /* injection failed — network rules still hold */ });
    } catch {
      /* already debugging this webview (devtools open) — skip */
    }
    // Keys typed inside the guest never reach the host page's keydown
    // handler, so every renderer shortcut would be dead while browsing.
    // before-input-event is browser-level (a page cannot spoof it) and
    // preventDefault keeps the guest from also acting on the key.
    wc.on("before-input-event", (e, input) => {
      if (input.type !== "keyDown") return;
      const mod = input.control || input.meta;
      const key = input.key || "";
      let cmd = null;
      if (!mod) {
        if (key === "F5") cmd = "key:f5";
        else if (key === "F11") cmd = "key:f11";
        else if (key === "F12") cmd = "key:f12";
      } else if (!input.shift) {
        if (/^[1-9]$/.test(key)) cmd = `key:num-${key}`;
        else if (key === "0") cmd = "key:zoom-reset";
        else if (key === "=" || key === "+") cmd = "key:zoom-in";
        else if (key === "-") cmd = "key:zoom-out";
        else if (key.toLowerCase() === "s") cmd = "key:save-page";
        else if (key === "Tab") cmd = "key:next-tab";
      } else {
        if (key.toLowerCase() === "t") cmd = "key:reopen-tab";
        else if (key === "Tab") cmd = "key:prev-tab";
      }
      if (cmd) {
        e.preventDefault();
        sendOwner("quill:cmd", cmd);
      }
    });
    wc.setWindowOpenHandler(({ url }) => {
      // The popup blocker for webviews: pop-ups from web content become a new
      // Quill tab — unless the URL is an ad, in which case it dies here
      // instead of opening an ad page as a tab.
      if (/^https?:\/\//i.test(url)) {
        let ad = false;
        try {
          ad = hostBlocked(new URL(url).hostname) || AD_PATHS.some((re) => re.test(url)) || YT_AD.test(url);
        } catch {
          /* unparseable — treat as not-ad */
        }
        if (ad) {
          blockedCount += 1;
          let h = "";
          try {
            h = new URL(url).hostname;
          } catch {
            /* ignore */
          }
          sendOwner("quill:blocked", { url, host: h });
          return { action: "deny" };
        }
        sendOwner("quill:open-url", { url, from: wc.getURL() });
      }
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, url) => {
      if (!/^(file:\/\/|(view-source:)?https?:\/\/)/i.test(url)) e.preventDefault();
    });
    // Real page titles flow back so tabs and history show them, not just hostnames.
    wc.on("page-title-updated", (_e, title) => {
      try {
        const url = wc.getURL();
        if (url && title) sendOwner("quill:frame-title", { url, title: String(title).slice(0, 90) });
      } catch {
        /* window already gone */
      }
    });
    // The scriptlets run from the preload at document-start (see the top of
    // this file) — nothing to inject from here anymore.
    wc.on("dom-ready", () => {
      try {
        const url = wc.getURL();
        // Backup title push: covers cases page-title-updated misses.
        const t = wc.getTitle();
        if (url && t) sendOwner("quill:frame-title", { url, title: String(t).slice(0, 90) });
      } catch {
        /* not a page we care about */
      }
    });
  });

  if (isDev) {
    w.loadURL(fresh ? `${appUrl}#fresh` : appUrl);
    w.webContents.openDevTools({ mode: "detach" });
  } else {
    // #fresh: this window skips session restore (a second window must not
    // reopen the same tabs the first one is already showing).
    w.loadFile(path.join(__dirname, "..", "dist", "index.html"), fresh ? { hash: "fresh" } : undefined);
  }
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const cmd = (c) => () => focusedWin()?.webContents.send("quill:cmd", c);
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: cmd("new-tab") },
        { label: "New Window", accelerator: "CmdOrCtrl+N", click: () => createWindow(true) },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: cmd("close-tab") },
        { type: "separator" },
        { label: "Open File…", accelerator: "CmdOrCtrl+O", click: cmd("open-file") },
        { type: "separator" },
        { label: "Save as PDF…", accelerator: "CmdOrCtrl+P", click: cmd("save-pdf") },
        { label: "Print…", accelerator: "CmdOrCtrl+Alt+P", click: cmd("print-page") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, { type: "separator" }, { label: "Find…", accelerator: "CmdOrCtrl+F", click: cmd("find") }, { label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: cmd("focus-bar") }] },
    {
      label: "View",
      submenu: [
        { label: "Reload Page", accelerator: "CmdOrCtrl+R", click: cmd("reload") },
        { label: "View Page Source", accelerator: "CmdOrCtrl+U", click: cmd("view-source") },
        { label: "Command Palette", accelerator: "CmdOrCtrl+K", click: cmd("palette") },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC (allow-listed, validated) ---------------- */

ipcMain.on("quill:win", (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (action === "minimize") w.minimize();
  else if (action === "maximize") (w.isMaximized() ? w.unmaximize() : w.maximize());
  else if (action === "close") w.close();
});
ipcMain.handle("quill:is-maximized", (e) => Boolean(BrowserWindow.fromWebContents(e.sender)?.isMaximized()));
ipcMain.on("quill:new-window", () => createWindow(true));
ipcMain.on("quill:perm-rules", (_e, rules) => {
  permRules.clear();
  if (rules && typeof rules === "object" && !Array.isArray(rules)) {
    for (const [host, perms] of Object.entries(rules)) {
      if (typeof host === "string" && /^[a-z0-9.-]{1,253}$/i.test(host) && Array.isArray(perms)) {
        permRules.set(host.toLowerCase(), new Set(perms.filter((p) => typeof p === "string").slice(0, 6)));
      }
    }
  }
});
ipcMain.handle("quill:perm-respond", (_e, id, allow, always, host, permission) => {
  const p = pendingPerms.get(String(id));
  if (!p) return false;
  clearTimeout(p.timer);
  pendingPerms.delete(String(id));
  if (allow === true && always === true && typeof host === "string" && typeof permission === "string" && /^[a-z0-9.-]{1,253}$/i.test(host)) {
    const h = host.toLowerCase();
    const set = permRules.get(h) || new Set();
    set.add(permission);
    permRules.set(h, set);
  }
  p.cb(allow === true);
  return true;
});
ipcMain.on("quill:dl-control", (_e, id, action) => {
  const d = dlItems.get(String(id));
  if (!d || !["pause", "resume", "cancel"].includes(action)) return;
  try {
    d.item[action]();
    if (action === "pause") d.mark("paused");
    if (action === "resume") d.mark("downloading");
  } catch {
    /* item already gone */
  }
});
ipcMain.handle("quill:print", (_e, wcId) => {
  const wc = Number.isInteger(wcId) ? webContents.fromId(wcId) : null;
  if (!wc || wc.isDestroyed()) return false;
  // Electron's native print dialog (the OS printer list).
  wc.print({ printBackground: true }, () => {});
  return true;
});
ipcMain.handle("quill:open-file", async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const r = await dialog.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [{ name: "Pages, PDFs & images", extensions: ["html", "htm", "pdf", "svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "txt", "md"] }],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle("quill:open-external", async (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url) && url.length < 4096) await shell.openExternal(url);
});
ipcMain.handle("quill:set-block-rules", (_e, hosts, enabled) => {
  if (Array.isArray(hosts)) {
    blockHosts = new Set(hosts.filter((h) => typeof h === "string" && /^[a-z0-9.-]{1,253}$/i.test(h)).map((h) => h.toLowerCase()));
  }
  blockEnabled = enabled !== false;
});
ipcMain.handle("quill:set-ask-save", (_e, enabled) => {
  askSave = enabled === true;
});
ipcMain.handle("quill:clear-browsing-data", async () => {
  const ses = session.fromPartition(WEB_PARTITION);
  await ses.clearStorageData();
  await ses.clearCache();
  blockedCount = 0;
});
ipcMain.handle("quill:blocked-count", () => blockedCount);
/** Screenshot of the whole app window (page + scribble overlay) as a PNG data URL. */
ipcMain.handle("quill:capture-page", async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return "";
  const img = await w.webContents.capturePage();
  return img.isEmpty() ? "" : img.toDataURL();
});
/** Copy a PNG data URL (the scribble capture) to the system clipboard. */
ipcMain.handle("quill:copy-image", (_e, dataUrl) => {
  try {
    const img = nativeImage.createFromDataURL(String(dataUrl || ""));
    if (img.isEmpty()) return false;
    // Electron 45 dropped clipboard.writeImage — the generic write takes an image field.
    clipboard.write({ image: img });
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("quill:set-doh", (_e, enabled) => {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(path.join(app.getPath("userData"), "doh.json"), JSON.stringify({ enabled: enabled === true }));
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("quill:save-pdf", async (_e, wcId, name) => {
  // The renderer names the webContents to print; fromId validates the id, the
  // filename is re-sanitised, and the file never leaves the Downloads folder.
  try {
    const wc = Number.isInteger(wcId) ? webContents.fromId(wcId) : null;
    if (!wc || wc.isDestroyed()) return false;
    const data = await wc.printToPDF({ printBackground: true });
    const safe = (String(name || "").replace(/[^\w\- .]+/g, "").trim().slice(0, 80)) || "page";
    let savePath = path.join(app.getPath("downloads"), `${safe}.pdf`);
    for (let i = 1; fs.existsSync(savePath); i++) savePath = path.join(app.getPath("downloads"), `${safe} (${i}).pdf`);
    fs.writeFileSync(savePath, data);
    rememberDownload(savePath);
    // Reuse the downloads drawer: it lands there as a finished download.
    sendAll("quill:download", { id: `pdf-${Date.now()}`, filename: path.basename(savePath), path: savePath, received: data.length, total: data.length, state: "completed" });
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("quill:save-html", async (_e, html, name) => {
  // The renderer supplies the page HTML it already holds in memory; the
  // filename is re-sanitised and the file never leaves the Downloads folder.
  try {
    if (typeof html !== "string" || !html.trim()) return false;
    const safe = (String(name || "").replace(/[^\w\- .]+/g, "").trim().slice(0, 80)) || "page";
    let savePath = path.join(app.getPath("downloads"), `${safe}.html`);
    for (let i = 1; fs.existsSync(savePath); i++) savePath = path.join(app.getPath("downloads"), `${safe} (${i}).html`);
    fs.writeFileSync(savePath, html, "utf8");
    rememberDownload(savePath);
    sendAll("quill:download", { id: `html-${Date.now()}`, filename: path.basename(savePath), path: savePath, received: Buffer.byteLength(html), total: Buffer.byteLength(html), state: "completed" });
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("quill:toggle-fullscreen", (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender) || win;
    if (!w) return false;
    w.setFullScreen(!w.isFullScreen());
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("quill:show-item", (_e, p) => {
  // Only files Quill itself downloaded/saved may be revealed — the registry is
  // filled exclusively by the download and PDF handlers in this process.
  if (typeof p === "string" && knownDownloads.has(p) && fs.existsSync(p)) {
    shell.showItemInFolder(p);
    return true;
  }
  return false;
});

/* ---------------- lifecycle ---------------- */

// Single instance: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.whenReady().then(() => {
    // Keep the app's own storage separate from web content.
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    installNetworkFilter();
    // Webview pages and the renderer itself both save into the system Downloads folder.
    wireDownloads(session.fromPartition(WEB_PARTITION));
    wireDownloads(session.fromPartition(APP_PARTITION));
    buildMenu();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
}
