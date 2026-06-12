# Scenario schema

The scenario is the single source of truth for a project's showcase. It lives
in the target repo (default `docs/showcase/showcase.scenario.json`) so a
capture can be reproduced — and tweaked — months later.

## Annotated example

```jsonc
{
  "project": "gradient-svg-generator",     // project id / repo name
  "baseUrl": "https://gradient-svg-generator.vercel.app",
  "outDir": "docs/showcase",               // asset dir, relative to repo root
  "loginWall": false,                      // true => public-surface-only capture

  // Optional. Defaults shown; add custom named viewports if needed.
  "viewports": {
    "desktop": { "width": 1920, "height": 1080, "deviceScaleFactor": 2 },
    "mobile":  { "width": 390,  "height": 844,  "deviceScaleFactor": 3, "isMobile": true }
  },

  // "reduce" (default) freezes CSS animations for crisp screenshots.
  // Use "no-preference" when animation IS the product (the demo recording
  // always runs with animations on regardless).
  "reducedMotion": "reduce",

  // Run once per browser context before anything else — cookie banners etc.
  // Always mark these optional: the banner may not appear.
  "setup": [
    { "action": "click", "selector": "#cookie-accept", "optional": true }
  ],

  "pages": [
    {
      "label": "hero",                     // output: hero.webp
      "url": "/",                          // resolved against baseUrl
      "viewport": "desktop",
      "fullPage": false,
      "before": [                          // optional actions before the shot
        { "action": "wait", "ms": 800 }
      ]
    },
    {
      "label": "templates-full",
      "url": "/templates",
      "viewport": "desktop",
      "fullPage": true,                    // pre-scrolls for lazy content; 1x scale
      "maxHeight": 5000                    // clip cap for very long pages (default 6000)
    },
    { "label": "mobile-home", "url": "/", "viewport": "mobile", "fullPage": false }
  ],

  "demo": {
    "size": { "width": 1280, "height": 720 },  // recording resolution
    "stepPauseMs": 600,                        // human pacing between steps
    "steps": [ /* see action vocabulary */ ]
  }
}
```

## Action vocabulary (exactly six)

Every action accepts `optional: true` (failure → warn + continue) and
`timeoutMs` (default 10000).

| action | fields | notes |
|---|---|---|
| `goto` | `url` | resolved against `baseUrl`; networkidle with domcontentloaded fallback |
| `click` | `selector` | any Playwright selector incl. `text=`, `:has-text()` |
| `fill` | `selector`, `value`, `delayMs?` | with `delayMs`, types per-character — use ~60–90ms in demos so typing reads as human |
| `hover` | `selector` | |
| `scroll` | `to: "bottom"\|"top"\|"selector"`, `selector?`, `by?` | smooth-scrolls, then settles 600ms |
| `wait` | `ms` or `selector` | selector form waits for the element to appear |

## Site-type recipes

**Multi-page app** (SaaS, community site): hero + 1–2 most product-defining
inner pages + one mobile shot. Demo = the core loop: navigate → input → result.

**Single-purpose tool** (generator, converter, playground): one or two pages.
Demo = tweak parameters and let the output visibly change. This is the most
GIF-friendly shape — make the output area prominent in the recording viewport.

**Content/docs site**: hero + one article/section page (fullPage often shines
here). Demo can be search or nav — or skip the demo if nothing moves.

**API service**: screenshot the docs page and/or a rendered response URL
directly (a `goto` to the API URL renders JSON/SVG in-browser). Demo usually
skipped.

**Login-walled app**: `loginWall: true`, landing + login screen only, no demo
unless the public surface has one. State the limitation in the final report.

## Demo storyline guidance

15–25 seconds. One coherent thread, not a tour: a first-time visitor should
finish the GIF knowing what the product does. Start where the action is (often
`goto` straight to the editor/tool page), end on a visible result, and leave
the closing `wait` so the loop doesn't cut hard. The engine adds an opening
beat (800ms) and closing beat (1200ms) automatically.
