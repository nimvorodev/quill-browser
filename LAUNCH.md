# Quill — launch kit

Landing-page copy and the demo script, ready to hand to a page builder or
record. Voice rule: everything lowercase, everything says "paper" and "ink" —
the UI already talks like this ("the log", "dog-ears", "re-ink"); the page
must too.

## One-liner (use everywhere: title tag, tweet, store blurb)

> A private browser that reads like a paper notebook — re-ink any page, scribble on it, and nothing tracks you.

## Landing page

# Quill
### the hand-written private browser

Every page you open becomes a page worth reading. Tap **re-ink** and any
website — news, docs, Wikipedia, a 4,000-word essay — is rewritten in your
notebook: clean type on ruled paper, no clutter, no pop-ups, no ads.

**re-ink anything.** One tap turns any article into a paper page. Split it
side-by-side with the real site, or go full notebook. The choice sticks per
site — your favorite reads always open as paper.

**the web, minus the noise.** Ads, trackers and social widgets are stripped
before they load — at the network layer, not hidden with CSS. The ledger
shows every request that died, and any site is one click from forgiven.

**a desk for everything.** YouTube plays ad-free in its own desk while you
keep browsing. GitHub repos render as clean paper. And an offline AI sits in
the margin — it summarizes and translates any page with zero setup, zero
network, zero accounts.

**tools that feel like paper.** Scribble over any page with a marker and
save it as a PNG. Pin sticky notes to your screen. Tear off ghost tabs that
leave no history. Focus mode hides all the chrome until only the words are
left.

[ download for windows ] · no account · no telemetry · works offline

*Quill is free, and it stays that way. Your bookmarks, history and notes live
on your machine — in the app, nowhere else.*

---

Copy notes:
- Headline is the product name only — the subhead carries the category.
- Four blurbs, one job each: the hook (re-ink), the shield (privacy), the
  desks (breadth), the paper tools (delight). Don't add a fifth.
- "no account · no telemetry · works offline" under the button — trust is
  the purchase objection for a new browser; answer it before the fold.
- Screenshot instead of hero art: a split view (real site on the left, the
  same page re-inked on the right). The transformation IS the product.

## 15-second demo script (record at 1280×800, one take)

The whole point: watch a messy page become paper. No narration needed if
text callouts are burned in.

| t | action | on screen |
|---|--------|-----------|
| 0–2s | type `wikipedia.org/wiki/Chromaticity` in the address bar, Enter | the real, busy Wikipedia loads — callout: "the web" |
| 2–6s | click **re-ink** in the toolbar | the page redraws as ruled-paper notebook copy — callout: "your notebook" (this moment is the product; hold it) |
| 6–9s | drag the marker across a paragraph, tap save | a hand-drawn scribble appears over the text, PNG lands in downloads |
| 9–12s | select a sentence in the reader, click the note pin | a yellow sticky note appears with the passage |
| 12–15s | hit Ctrl+G on a tab, then focus mode (Esc hides chrome) | tab dims to ghost mode, chrome slides away — only the page remains; end on the Quill logo |

Callout style: hand-drawn arrows, ink color, one word each — match the app's
aesthetic; do not use corporate annotation styling.

Backup 6-second cut (for the tweet): rows 0–6 only. Type → re-ink → hold on
the transformation → logo.

## Launch checklist (pre-flight)

1. Code-sign the exe or SmartScreen will eat the funnel (Azure Trusted Signing or a ~$200/yr OV cert).
2. Auto-update doesn't exist yet — v1.0 ships without it; add a "check for updates" ping before v1.1.
3. Put the split-view screenshot and the 15s GIF above the fold; everything else can scroll.
