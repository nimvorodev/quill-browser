# Quill — the hand-written private browser

A desktop browser that looks like a paper notebook. Electron + React, with
network-level ad/tracker blocking, a re-inked reader mode, special desks for
YouTube and GitHub, and an offline-first AI side panel.

![platform](https://img.shields.io/badge/platform-windows-blue) ![stack](https://img.shields.io/badge/stack-Electron%20%C2%B7%20React%2019%20%C2%B7%20Vite%207%20%C2%B7%20Tailwind%204-informational)

## What it does

- **The real site first** — pages open as themselves, with ads, trackers and
  social widgets stripped at the network layer from a filter list of hosts.
  Tap **re-ink** for a clean, notebook-styled reader copy, or split the two
  side by side.
- **Webview scriptlets at document-start** — the popup gate and YouTube
  ad scrub (incl. display-ad hiding) are injected into the page's main world
  via the DevTools protocol before the site's own scripts run. The injected
  code is pure JS holding zero authority; every real rule (network blocking,
  popup filtering) is enforced in the main process.
- **Search your way** — DuckDuckGo, Google, Bing, Brave, Startpage, Mojeek
  and Ecosia open their real results pages inside Quill, shielded. Wikipedia
  and Mwmbl render in-app from their public APIs. Bang shortcuts work
  everywhere: `!yt lofi`, `!w rust`, `!gh tokio`, `!mdn fetch`.
- **The tube desk** — YouTube plays through a privacy embed that keeps
  playing while you switch tabs, with related videos, autoplay and its own
  desk UI. The real YouTube page gets ad placements stripped, too.
- **The GitHub desk** — repos, READMEs and issues re-rendered from the
  public API.
- **AI margin** — a built-in offline Scribe summarises any page with zero
  setup and zero network. Or point it at Ollama / LM Studio / any
  OpenAI-compatible endpoint; the key never leaves localStorage.
- **Paper-desk tools** — scribble over any page with a marker and save the
  result as a PNG, sticky notes that float over the whole window, ghost tabs
  that leave no history, a command palette (Ctrl+K), and a downloads drawer
  with live progress.
- **PDFs and images** open natively in the viewer, no relay round-trip.

## Getting started

```bash
npm install

# web dev build (hot reload, no Electron)
npm run dev

# desktop dev build (Electron + Vite)
npm run dev:desktop

# desktop, production build
npm run start:desktop

# Windows installer -> release/Quill-Setup-1.0.0.exe
npm run dist:win
```

Requires Node 20+.

## Security posture

- Web content never runs in the app renderer. Every page goes into a
  sandboxed `<webview>` in its own persisted partition (`persist:quill-web`),
  hardened in `will-attach-webview`: `nodeIntegration` off,
  `contextIsolation` on, `sandbox` on, insecure content blocked.
- The app window itself only ever loads the bundled app; `window.open` from
  web content goes to the system browser.
- Ad/tracker hosts are blocked at the network layer for the webview
  partition, not with cosmetic rules.
- The renderer exposes a small allow-listed bridge (`window.quill`) —
  window controls, downloads, screenshots — validated in the main process.
  No raw IPC, no filesystem, no Node from pages.

## Layout

```
src/            React app (components, lib: filters, reader, relay, search, ai)
electron/       main process + preload bridge
build/          icons, entitlements
```

## Notes

- Relay-based reader mode depends on public services (r.jina.ai and
  fallbacks); when they rate-limit, the reader falls back and the live page
  is always one click away.
- YouTube ad blocking uses a param-level request filter plus a
  JSON-patching scriptlet in the real page. It is not uBlock-grade; some ads
  can slip through.

## License

All rights reserved for now — a proper LICENSE file is on the to-do list.
