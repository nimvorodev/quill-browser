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
function wireDownloads(ses) {
  ses.on("will-download", async (_e, item) => {
    // The filename is network-controlled — basename it so nothing ever escapes
    // the Downloads folder, whatever the server claims.
    const file = path.basename(item.getFilename() || "download");
    const dot = file.lastIndexOf(".");
    const base = dot > 0 ? file.slice(0, dot) : file;
    const ext = dot > 0 ? file.slice(dot) : "";
    let savePath = path.join(app.getPath("downloads"), file);
    if (askSave) {
      // The user picks the destination; the OS dialog owns overwrite checks.
      const picked = await dialog.showSaveDialog(win, { defaultPath: savePath });
      if (picked.canceled || !picked.filePath) {
        item.cancel();
        return;
      }
      savePath = picked.filePath;
    } else {
      for (let i = 1; fs.existsSync(savePath); i++) savePath = path.join(app.getPath("downloads"), `${base} (${i})${ext}`);
    }
    const state = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename: file, path: savePath, received: 0, total: item.getTotalBytes(), state: "downloading" };
    item.setSavePath(savePath);
    const push = () => win?.webContents.send("quill:download", { ...state });
    push();
    item.on("updated", (_ev, s) => {
      state.received = item.getReceivedBytes();
      if (s === "interrupted") state.state = "interrupted";
      push();
    });
    item.once("done", (_ev, s) => {
      state.received = item.getReceivedBytes();
      state.state = s === "completed" ? "completed" : s;
      push();
    });
  });
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

  // Permission prompts default to deny for web content; no silent camera/mic/geo.
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    const allow = permission === "fullscreen" || permission === "clipboard-sanitized-write";
    cb(allow);
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === "fullscreen" || permission === "clipboard-sanitized-write");

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

function createWindow() {
  win = new BrowserWindow({
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

  win.once("ready-to-show", () => win?.show());
  win.on("maximize", () => win?.webContents.send("quill:maximized", true));
  win.on("unmaximize", () => win?.webContents.send("quill:maximized", false));
  win.on("closed", () => {
    win = null;
  });

  // The app window may only ever show the bundled app.
  const appUrl = isDev ? process.env.VITE_DEV_SERVER_URL : `file://${path.join(__dirname, "..", "dist", "index.html")}`;
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== appUrl && !url.startsWith(appUrl)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Harden every <webview> the renderer creates, regardless of its attributes.
  win.webContents.on("will-attach-webview", (_e, prefs, params) => {
    delete prefs.preload;
    delete prefs.preloadURL;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    params.partition = WEB_PARTITION;
    // Only http(s) may load in a webview.
    if (!/^https?:\/\//i.test(params.src || "")) params.src = "about:blank";
  });
  win.webContents.on("did-attach-webview", (_e, wc) => {
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
          win?.webContents.send("quill:blocked", { url, host: h });
          return { action: "deny" };
        }
        win?.webContents.send("quill:open-url", { url, from: wc.getURL() });
      }
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, url) => {
      if (!/^https?:\/\//i.test(url)) e.preventDefault();
    });
    // Real page titles flow back so tabs and history show them, not just hostnames.
    wc.on("page-title-updated", (_e, title) => {
      try {
        const url = wc.getURL();
        if (url && title) win?.webContents.send("quill:frame-title", { url, title: String(title).slice(0, 90) });
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
        if (url && t) win?.webContents.send("quill:frame-title", { url, title: String(t).slice(0, 90) });
      } catch {
        /* not a page we care about */
      }
    });
  });

  if (isDev) {
    win.loadURL(appUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
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
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => win?.webContents.send("quill:cmd", "new-tab") },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => win?.webContents.send("quill:cmd", "close-tab") },
        { type: "separator" },
        { label: "Save as PDF…", accelerator: "CmdOrCtrl+P", click: () => win?.webContents.send("quill:cmd", "save-pdf") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, { type: "separator" }, { label: "Find…", accelerator: "CmdOrCtrl+F", click: () => win?.webContents.send("quill:cmd", "find") }] },
    {
      label: "View",
      submenu: [
        { label: "Reload Page", accelerator: "CmdOrCtrl+R", click: () => win?.webContents.send("quill:cmd", "reload") },
        { label: "Command Palette", accelerator: "CmdOrCtrl+K", click: () => win?.webContents.send("quill:cmd", "palette") },
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

ipcMain.on("quill:win", (_e, action) => {
  if (!win) return;
  if (action === "minimize") win.minimize();
  else if (action === "maximize") (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === "close") win.close();
});
ipcMain.handle("quill:is-maximized", () => Boolean(win?.isMaximized()));
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
ipcMain.handle("quill:capture-page", async () => {
  if (!win) return "";
  const img = await win.webContents.capturePage();
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
    // Reuse the downloads drawer: it lands there as a finished download.
    win?.webContents.send("quill:download", { id: `pdf-${Date.now()}`, filename: path.basename(savePath), path: savePath, received: data.length, total: data.length, state: "completed" });
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("quill:show-item", (_e, p) => {
  // Only files the download handler itself chose may be revealed.
  if (typeof p === "string" && p.startsWith(app.getPath("downloads")) && fs.existsSync(p)) shell.showItemInFolder(p);
});

/* ---------------- lifecycle ---------------- */

// Single instance: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
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
