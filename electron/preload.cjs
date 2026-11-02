/* eslint-disable @typescript-eslint/no-require-imports */
// Quill desktop — preload. Exposes a small, allow-listed bridge on window.quill.
// Nothing here hands the page Node, the filesystem, or raw ipcRenderer.

const { contextBridge, ipcRenderer } = require("electron");

/** Subscribe helper that returns an unsubscribe function and never leaks the raw event. */
function on(channel, map) {
  return (cb) => {
    const handler = (_e, payload) => cb(map ? map(payload) : payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("quill", {
  platform: process.platform,
  version: process.env.npm_package_version || "",
  partition: "persist:quill-web",

  minimize: () => ipcRenderer.send("quill:win", "minimize"),
  maximize: () => ipcRenderer.send("quill:win", "maximize"),
  close: () => ipcRenderer.send("quill:win", "close"),
  isMaximized: () => ipcRenderer.invoke("quill:is-maximized"),
  onMaximizeChange: on("quill:maximized", (v) => Boolean(v)),

  openExternal: (url) => ipcRenderer.invoke("quill:open-external", String(url || "")),
  setBlockRules: (hosts, enabled) => ipcRenderer.invoke("quill:set-block-rules", Array.isArray(hosts) ? hosts : [], enabled !== false),
  onBlocked: on("quill:blocked"),
  clearBrowsingData: () => ipcRenderer.invoke("quill:clear-browsing-data"),
  capturePage: () => ipcRenderer.invoke("quill:capture-page"),
  showItem: (p) => ipcRenderer.invoke("quill:show-item", String(p || "")),
  onDownload: on("quill:download"),

  /** Menu accelerators & popups from web content arrive here. */
  onCommand: on("quill:cmd", (v) => String(v || "")),
  onOpenUrl: on("quill:open-url", (v) => String(v || "")),
});
