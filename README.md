![Quill banner](build/banner.jpg)

# Quill

**the hand-written private browser**

> Reading the web should feel like reading. Not dodging cookie banners while
> an ad reshuffles the page under your cursor.

[**Download for Windows**](https://github.com/nimvorodev/quill-browser/releases/latest) · [website](https://nimvorodev.github.io/quill-browser/) · [screenshots](https://nimvorodev.github.io/quill-browser/#shots) · [release notes](https://github.com/nimvorodev/quill-browser/releases)

![release](https://img.shields.io/github/v/release/nimvorodev/quill-browser?style=flat-square&color=1a2440)
![downloads](https://img.shields.io/github/downloads/nimvorodev/quill-browser/total?style=flat-square&color=1a2440)
![license](https://img.shields.io/github/license/nimvorodev/quill-browser?style=flat-square&color=1a2440)
![platform](https://img.shields.io/badge/platform-windows%2010%2F11-blue?style=flat-square)
![stack](https://img.shields.io/badge/stack-Electron%20%C2%B7%20React%20%C2%B7%20Vite%20%C2%B7%20Tailwind-informational?style=flat-square)

## What it is

Quill is a desktop browser built around one idea: the web reads better on
paper. Click **re-ink** on any article and it is rebuilt as clean, ruled-paper
pages, no banners, pop-ups, autoplay, or sidebars. Split it beside the real
site or keep the quiet one; when you would rather stay on the live site, Quill
remembers that for the site.

Under the paper it is a normal Chromium browser with ads and trackers stopped
at the network layer, ghost tabs that leave no history, and an offline AI in
the margin. Everything lives on your machine. There is no account to create,
no cloud to sync to, and no telemetry.

## See it

|  |  |
| --- | --- |
| ![Wikipedia's main page re-inked as a ruled-paper notebook page](docs/img/reinked.png) | ![Quill's start page with a shelf of sites, sticky notes and today's blocked count](docs/img/homepage.png) |
| **re-ink** turns any article into paper, type, images, a table of contents and a tracker audit. | **the start page is a desk**, a shelf you arrange, a dog-eared read-later queue, sticky notes and today's blocked count. |
| ![Hand-drawn marker annotations over the original Wikipedia page](docs/img/scribble.png) | ![A YouTube video playing in Quill's tube desk with an up-next list](docs/img/tubedesk.png) |
| **write on the page** with the marker or highlighter, then save the doodle as a PNG. | **the tube desk**, YouTube with search, up next and a sleep timer, played through a privacy embed. |

More at [nimvorodev.github.io/quill-browser](https://nimvorodev.github.io/quill-browser/#shots).

## Why you'll want it

- **Read the web like paper.** Re-ink any article into clean type on ruled
  paper. Choose notebook, serif or typewriter, set the paper tone and type
  size, and keep or drop images. Split it beside the real page or go full
  notebook.
- **Write on what you read.** Highlight a passage and pin it as a note.
  Scribble with a marker and save the doodle as a PNG. Sticky notes float over
  the whole window and survive reloads. The web stops being something you
  watch and becomes something you use.
- **Give noisy sites a desk.** YouTube plays in the tube desk without the
  clutter, GitHub repositories render as clean paper, and search results open
  in Quill's own page instead of an ad-heavy SERP.
- **Keep what you find.** Ghost tabs browse without leaving a trace. The
  dog-eared queue holds good reads on the start page. Bookmarks, notes and
  session restore are all local.
- **A scribe in the margin, off the network.** Summarise or translate any page
  with the built-in extractive scribe — no account, no keys, no internet.
  Point it at Ollama or LM Studio for a real local model, or paste a key for
  an OpenAI-compatible provider.
- **Privacy that holds up.** Ads, trackers and social widgets are stopped at
  the network layer before they load, not hidden with CSS. The ledger shows
  every request that died, and any site is one click from forgiven.

## Privacy, concretely

- **Blocked before it loads.** The Electron main process filters requests
  through Chromium's `webRequest` API. In-page cosmetic rules only clean up
  what is left, and the ledger lists each blocked request so you can allow a
  host again.
- **Shields on by default.** HTTPS-only, tracking parameters stripped,
  no-referrer requests, autoplay blocked, webviews sandboxed. Social widgets
  and crypto miners are separate toggles.
- **Permissions are yours.** Camera, microphone, location, notifications, MIDI
  and screen capture prompt per site; grants are remembered per host.
- **Ghost tabs** leave no history entry and are not restored with your session.
- **Everything local.** Settings, history, bookmarks, notes and sessions live
  in local storage and Electron's `userData` directory
  (`%APPDATA%\Quill` on Windows). Downloads go to your Downloads folder. API
  keys, if you add any, stay in local storage.
- **No telemetry.** Quill has no analytics. It talks to GitHub only when you
  ask it to check for updates, and to your chosen search or AI endpoint when
  you use it.
- **One honest caveat:** re-ink fetches pages through public read-only relays
  (Jina, plus fallbacks), which see the URL and the page. If that matters for a
  page, open it in **original** mode instead. The built-in scribe never sends
  page text anywhere.

## Install

Download the latest installer from
[Releases](https://github.com/nimvorodev/quill-browser/releases/latest).
Windows 10/11, x64. The installer is about 120 MB.

**A note on Windows SmartScreen:** the build is not code-signed yet, so
Windows may show *"Windows protected your PC"* on first run. Choose **More
info → Run anyway**, or verify the download first:

<details>
<summary>SHA-256 for Quill-Setup-1.0.0.exe</summary>

```text
0ff17f33876f7cc41c71cd86dc258779bd3e2e5c1683a8a47f0666ed625e4883  Quill-Setup-1.0.0.exe
```

</details>

On first launch, Quill opens its start page. There is a short welcome, a
one-screen tour, and the shelf is yours to edit. The **check for updates** link
at the bottom of the start page compares your version against the latest GitHub
release.

## Build from source

Requires Node 20+ and npm. The app is plain Electron + React; there are no
native add-ons to compile.

```bash
npm install

# renderer only, in a browser (hot reload, no Electron bridge)
npm run dev

# desktop dev build (Electron + Vite)
npm run dev:desktop

# desktop, production build
npm run start:desktop

# Windows installer into release/
npm run dist:win
```

The web build is useful for UI work, but webviews, network filtering,
downloads, DoH and the native menus only exist in the Electron shell. macOS
and Linux packaging scripts (`dist:mac`, `dist:linux`) are configured but
currently untested; build on the target OS.

## Layout

```text
src/
  App.tsx            window shell: tabs, session, shortcuts, navigation
  components/        browser chrome, reader, scribble, sticky notes, panels
  lib/
    reader.ts        re-ink: fetch, extraction, paper render model
    filters.ts       host/path rules, tracking params, cosmetic selectors
    relay.ts         public text relays
    search.ts        in-app search results
    ai.ts            scribe + OpenAI-compatible provider clients
    github.ts        GitHub repository -> paper view
    video.ts         YouTube parsing and tube-desk helpers
    nav.ts           omnibox parsing, search engines, URL rules
    store.ts         local persistence, tab/session/note types
    settings.ts      settings schema and defaults
    updates.ts       GitHub release check
  index.css          paper/ink theme tokens
electron/
  main.cjs           windows, network filtering, downloads, permissions, DoH
  preload.cjs        allow-listed window.quill bridge
  scriptlets.cjs     in-page cosmetic/ad scriptlets
docs/                landing page + screenshots (GitHub Pages)
build/               icons, entitlements, README banner
release/             packaging output (gitignored)
```

## Status

[1.0.0](https://github.com/nimvorodev/quill-browser/releases/tag/v1.0.0) is the
first public release and works as a daily browser on Windows. Known gaps:

- No auto-update. The start page has a manual **check for updates**, then you
  install the new build yourself.
- The installer is unsigned, so SmartScreen warns on first run.
- No macOS or Linux builds yet.
- No extensions, no sync.

## Contributing

Bug reports and pull requests are welcome. For anything bigger than a fix,
open an issue first so the shape can be agreed on. There is no test suite yet
(`rollout-check.ts` and `rollout-check2.ts` at the repo root are one-off logic
checks). Please type-check with `npx tsc --noEmit` and say what you tested in
the PR.

## Security

Please do not open a public issue for a vulnerability. Use the repository's
**Security → Report a vulnerability** flow instead.

## License

[Mozilla Public License 2.0](LICENSE). You can read, modify and redistribute
Quill, including commercially, as long as changes to MPL-covered files stay
under the MPL.
