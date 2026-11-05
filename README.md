# Quill

### the hand-written private browser

> Reading the web should feel like reading. Not dodging cookie banners while
> an ad reshuffles the page under your cursor.

![platform](https://img.shields.io/badge/platform-windows-blue) ![stack](https://img.shields.io/badge/stack-Electron%20%C2%B7%20React%2019%20%C2%B7%20Vite%207%20%C2%B7%20Tailwind%204-informational) ![privacy](https://img.shields.io/badge/telemetry-none-success)

One click turns any article into a quiet paper page you can actually read.
Mark it up, pin the good parts, and let a scribe in the margin do the heavy
lifting. No account. Nothing tracks you.

## Why you'll want it

- **Read the web like it's paper.** Click **re-ink** and the pop-ups, banners
  and autoplay videos fall away. What's left is clean type on ruled paper.
  Split it beside the real page or keep the quiet one; Quill remembers your
  pick for every site.
- **Write on what you read.** Highlight a passage and pin it as a note.
  Scribble with a marker and keep the doodle. Sticky notes float over the
  whole window. The web stops being something you watch and becomes
  something you use.
- **Keep what you find.** Ghost tabs browse without leaving a trace, and a
  read-later queue holds the good stuff on your start page. Pinned passages
  and sticky notes stay put. Everything lives on your machine, because
  there's no cloud to lose it in.
- **A scribe in the margin, off the network.** Summarize or translate any
  page with no account and no internet. Point it at Ollama or any
  compatible model; your text never leaves your machine.
- **Privacy that holds up.** Ads, trackers and social widgets are stopped at
  the network layer before they load, not hidden with CSS. Ghost tabs leave
  no history at all.

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
- The renderer exposes a small allow-listed bridge (`window.quill`):
  window controls, downloads, screenshots, validated in the main process.
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

[Mozilla Public License 2.0](LICENSE) (MPL-2.0), file-level copyleft, the same
license Firefox and Brave use. Open source, permits commercial use and a
future paid tier; modifications to Quill's own files must stay MPL-2.0.
Electron and its dependencies keep their own (MIT/BSD/etc.) licenses.
