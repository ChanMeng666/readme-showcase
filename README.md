# readme-showcase

A [Claude Code](https://claude.com/claude-code) skill that captures polished
screenshots and a short demo recording of any deployed web project, then embeds
them into that project's GitHub README — so visitors see the real product
without opening the live link.

```
"add a showcase to gradient-svg-generator's README"
        │
        ▼
probe the live site ──► write showcase.scenario.json ──► capture ──► encode ──► README block
   (survey + shots)        (committed to the repo,        Playwright   ffmpeg     idempotent
                            reproducible, diffable)       headless     GIF/MP4/    markers
                                                          shots+video  WebP
```

## What you get per project

| File | What it is |
|---|---|
| `docs/showcase/hero.webp` | 2× desktop hero shot, linked to the live site |
| `docs/showcase/*-full.webp` | full-page / inner-page shots |
| `docs/showcase/mobile-*.webp` | 3× mobile shot |
| `docs/showcase/demo.gif` | ≤ 7.5 MB interaction demo — the only video format GitHub READMEs auto-play |
| `docs/showcase/demo.mp4` | same demo, higher quality, for manual drag-upload into releases/comments |
| `docs/showcase/showcase.scenario.json` | the capture script itself — edit + re-run to refresh |

The README gets an idempotent `<!-- SHOWCASE:START/END -->` block: re-running
the skill replaces the block contents instead of duplicating them.

## Design choices

- **Headless Playwright, not OS screen capture** — clean frames (no cursor,
  taskbar, or notifications), deterministic viewports, device scaling, and
  native context-level video recording.
- **Scenario file committed to the target repo** — captures are reproducible
  state snapshots, not one-off artifacts.
- **GIF quality ladder** — two-pass palette encoding stepped down
  (fps/width/colors/dither) until the file fits under GitHub's render cap;
  if the bottom rung doesn't fit, the fix is a shorter demo, not a muddier GIF.
- **Human review gate** — the skill always stops to show assets + README diff
  before committing, and never pushes on its own.
- **Zero install in target repos** — `playwright-core` is resolved from your
  machine (local dep → `PLAYWRIGHT_CORE_PATH` → global npm root) and the newest
  cached Chromium build is discovered dynamically.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- Node 18+
- Playwright in some form (`npm i -g @playwright/cli` + `playwright install chromium` is enough)
- `ffmpeg` on PATH
- optional: `sharp-cli` for slightly better WebP encoding (falls back to ffmpeg)

## Install

```bash
git clone https://github.com/ChanMeng666/readme-showcase.git
# symlink (or copy) into your personal skills directory:
#   macOS/Linux
ln -s "$(pwd)/readme-showcase" ~/.claude/skills/readme-showcase
#   Windows (PowerShell)
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.claude\skills\readme-showcase" -Target "D:\path\to\readme-showcase"
```

Then ask Claude Code things like:

- *"add screenshots and a demo GIF to my-project's README"*
- *"showcase https://my-app.vercel.app in ~/code/my-app"*
- *"refresh the showcase for my-project"* (after a redesign)

## Repo layout

```
SKILL.md                    workflow Claude follows (the skill itself)
scripts/probe.mjs           survey a live URL → survey.json + probe shots
scripts/capture.mjs         scenario engine → PNG shots + webm recording
scripts/media.mjs           ffmpeg/sharp → WebP + MP4 + size-capped GIF
scripts/lib/browser.mjs     playwright-core + Chromium discovery
scripts/lib/actions.mjs     the 6-action scenario interpreter
references/                 schema, README block templates, troubleshooting
examples/                   a real scenario from the pilot project
```

## Scenario format

Six actions — `goto, click, fill, scroll, hover, wait` — plus per-page
viewport/fullPage settings. See
[`references/scenario-schema.md`](references/scenario-schema.md) and the
[pilot example](examples/gradient-svg-generator.scenario.json).

## License

[MIT](LICENSE) © Chan Meng
