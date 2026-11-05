# Quill

### the hand-written private browser

> A private browser that reads like a paper notebook. Re-ink any page,
> scribble on it, and nothing tracks you.

![platform](https://img.shields.io/badge/platform-windows-blue) ![stack](https://img.shields.io/badge/stack-Electron%20%C2%B7%20React%2019%20%C2%B7%20Vite%207%20%C2%B7%20Tailwind%204-informational) ![privacy](https://img.shields.io/badge/telemetry-none-success)

Every page you open becomes a page worth reading. Tap **re-ink** and any
website (news, docs, a 4,000-word essay) is rewritten in your notebook:
clean type on ruled paper, no clutter, no pop-ups, no ads.

## What it does

- **re-ink anything.** One tap turns any article into a paper page. Split it
  side-by-side with the real site, or go full notebook. The choice sticks per
  site, so your favorite reads always open as paper. Wikipedia and
  Mwmbl render in-app from their public APIs; the rest of the web opens as
  itself first.
- **the web, minus the noise.** Ads, trackers and social widgets are stripped
  before they load, at the network layer, not hidden with CSS. The ledger
  shows every request that died, and any site is one click from forgiven.
  Ghost tabs leave no history at all.
- **a desk for everything.** YouTube plays ad-free in its own desk while you
  keep browsing; GitHub repos render as clean paper; DuckDuckGo, Google,
  Bing, Brave, Startpage, Mojeek and Ecosia open their real results pages
  inside Quill, shielded, with bang shortcuts everywhere: `!yt lofi`,
  `!w rust`, `!gh tokio`, `!mdn fetch`.
- **an offline AI in the margin.** A built-in Scribe summarises and
  translates any page with no setup and no network. Or point
  it at Ollama / LM Studio / any OpenAI-compatible endpoint; the key never
  leaves localStorage.
- **tools that feel like paper.** Scribble over any page with a marker and
  save the result as a PNG. Sticky notes float over the whole window. Focus
  mode hides all the chrome until only the words are left. Command palette
  (Ctrl+K), downloads with pause/resume, read-later queue on the start page.
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
