# Troubleshooting

## Cookie / consent banners
Add an `optional` click to `setup` (runs once per context). Never make it
required — the banner may be region- or first-visit-only. If the banner still
sneaks into a shot, the click selector is wrong; probe the live DOM for the
real button.

## Carousels and CSS animations
Screenshot contexts default to `reducedMotion: "reduce"`, which freezes most
CSS animation mid-state. For sites where motion IS the product (gradient
generators, animation studios), set `"reducedMotion": "no-preference"` and add
a `wait` so the shot lands on a good frame. Stubborn JS carousels: `wait` for
the slide you want, or click its dot indicator in `before`.

## Fonts flash / FOUT in shots
The engine already waits for `document.fonts.ready` + a settle. If a shot still
catches fallback fonts, the site loads fonts late (e.g. after a client-side
render) — add `{ "action": "wait", "ms": 1500 }` to that page's `before`.

## Lazy-loaded images missing in fullPage shots
The engine pre-scrolls the page and flips `loading="lazy"` to eager before a
fullPage shot. If images are still missing, the site uses IntersectionObserver
with its own placeholder logic — increase the implicit settle by adding a
`before` wait, or capture a viewport shot after a `scroll` action instead.

## fullPage captured only one viewport of height
The page scrolls inside an inner container (common with editor/gallery
layouts), so the document itself is viewport-height and fullPage has nothing
more to capture. Use viewport shots instead: one at the top, optionally another
after `{ "action": "scroll", "by": 800 }` in `before`.

## fullPage shot duplicates a sticky header
Playwright stitches scrolled segments, so `position: sticky` headers repeat.
Options: accept it, capture hero-only, or hide the header via a `before` click
if the site has a collapse control.

## networkidle never fires
Sites with analytics beacons or websockets keep the network busy forever. The
engine already falls back to `domcontentloaded` + 1.5s after a 30s timeout. If
captures feel slow, that's why — nothing to fix, but you can lower the wait by
giving the page a `wait`-for-selector instead.

## GIF too large / media.mjs exits non-zero
The quality ladder bottomed out. Shorten the demo: fewer steps, shorter `wait`s,
smaller `stepPauseMs`. Twenty seconds of 1280×720 UI motion fits comfortably;
forty rarely does. Don't add lower rungs — a muddy GIF reads worse than a
shorter one.

## GIF color banding on gradients
`palettegen` already runs with `stats_mode=diff` and sierra dithering, which
handles most gradient banding. If banding is still ugly, keep the clip ≤ 20s so
the ladder stays on the high-quality rungs (128 colors, 900px). The pilot
project (a gradient generator!) fits rung 1 at ~5MB for a 20s clip.

## "Could not find playwright-core"
Resolution order: local dep of cwd → `PLAYWRIGHT_CORE_PATH` env var → global
npm root (`playwright-core`, `@playwright/cli`, or `playwright`). Install any
of those, or point the env var at an existing playwright-core directory.

## "No chromium-* build" / version drift
The scripts pick the newest `chromium-<rev>` in the ms-playwright cache that
actually contains an executable — multiple revisions coexisting is fine. If the
cache is empty: `playwright install chromium`. Non-default cache location:
set `PLAYWRIGHT_BROWSERS_PATH`.

## Demo recording is black or empty
`recordVideo` only captures after navigation — make the first demo step a
`goto`. If a specific step fails, stderr names its index; fix and re-run with
`--only demo` (screenshots are kept via the merged manifest).
