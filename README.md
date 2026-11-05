![Quill banner](build/banner.jpg)

# Quill

### the hand-written private browser

> Reading the web should feel like reading. Not dodging cookie banners while
> an ad reshuffles the page under your cursor.

![platform](https://img.shields.io/badge/platform-windows-blue) ![stack](https://img.shields.io/badge/stack-Electron%20%C2%B7%20React%2019%20%C2%B7%20Vite%207%20%C2%B7%20Tailwind%204-informational) ![privacy](https://img.shields.io/badge/telemetry-none-success)

**Download:** [Quill 1.0 for Windows](https://github.com/nimvorodev/quill-browser/releases/download/v1.0.0/Quill-Setup-1.0.0.exe) (Windows 10/11, x64).

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

# Windows installer
npm run dist:win
```

Requires Node 20+.

## Layout

```
src/            React app (components, lib: filters, reader, relay, search, ai)
electron/       main process + preload bridge
build/          icons, entitlements
```

## License

[Mozilla Public License 2.0](LICENSE)
