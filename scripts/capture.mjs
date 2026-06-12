#!/usr/bin/env node
// Scenario engine: deterministic screenshots + demo recording for a deployed
// web project, driven by a showcase.scenario.json (see references/scenario-schema.md).
//
// Usage:
//   node capture.mjs <scenario.json> [--only screenshots|demo] [--page <label>]
//                    [--headed] [--work <dir>]
//
// Outputs (all intermediates — never commit these):
//   <work>/<label>.png        one per scenario page
//   <work>/demo-source.webm   the recorded demo
//   <work>/manifest.json      what was captured, for media.mjs
//
// Exit code 1 on any non-optional action failure; stderr names the failing
// step so the scenario can be fixed and re-run with --only / --page.

import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { runActions, gotoWithFallback, settle, resolveUrl } from "./lib/actions.mjs";

// ---------- args ----------
const args = process.argv.slice(2);
const scenarioPath = args.find((a) => !a.startsWith("--"));
if (!scenarioPath) {
  console.error("Usage: node capture.mjs <scenario.json> [--only screenshots|demo] [--page <label>] [--headed] [--work <dir>]");
  process.exit(2);
}
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const only = flag("only");
const onlyPage = flag("page");
const headed = args.includes("--headed");

const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const work = path.resolve(flag("work") ?? path.join(os.tmpdir(), "readme-showcase", scenario.project ?? "untitled"));
mkdirSync(work, { recursive: true });

const VIEWPORT_DEFAULTS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 2 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
};
const viewports = { ...VIEWPORT_DEFAULTS, ...(scenario.viewports ?? {}) };

// ---------- helpers ----------
async function preparePage(context) {
  const page = await context.newPage();
  return page;
}

// Force lazy content in before a fullPage shot: step to the bottom in
// viewport-sized increments, flip loading=lazy to eager, return to top.
async function preScroll(page) {
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
  });
  await page.evaluate(async () => {
    const docHeight = () =>
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const step = window.innerHeight;
    for (let y = 0; y < docHeight(); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

// ---------- screenshot pass ----------
async function captureScreenshots(browser, manifest) {
  const pages = (scenario.pages ?? []).filter((p) => !onlyPage || p.label === onlyPage);
  for (const spec of pages) {
    const vp = viewports[spec.viewport ?? "desktop"];
    if (!vp) throw new Error(`Page "${spec.label}": unknown viewport "${spec.viewport}"`);

    // fullPage shots use 1x — a 2x PNG of a long page is tens of MB for no
    // README benefit, and GitHub scales it down anyway.
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: spec.fullPage ? 1 : (vp.deviceScaleFactor ?? 1),
      isMobile: vp.isMobile ?? false,
      hasTouch: vp.isMobile ?? false,
      reducedMotion: scenario.reducedMotion ?? "reduce",
    });
    const page = await preparePage(context);
    try {
      await gotoWithFallback(page, resolveUrl(scenario.baseUrl, spec.url));
      await settle(page);
      await runActions(page, scenario.setup ?? [], { baseUrl: scenario.baseUrl, label: "setup" });
      await runActions(page, spec.before ?? [], { baseUrl: scenario.baseUrl, label: `pages.${spec.label}.before` });

      const file = path.join(work, `${spec.label}.png`);
      if (spec.fullPage) {
        await preScroll(page);
        const fullHeight = await page.evaluate(() =>
          Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        );
        const maxHeight = spec.maxHeight ?? 6000;
        if (fullHeight > maxHeight) {
          await page.screenshot({ path: file, clip: { x: 0, y: 0, width: vp.width, height: maxHeight } });
        } else {
          await page.screenshot({ path: file, fullPage: true });
        }
      } else {
        await page.screenshot({ path: file });
      }
      manifest.screenshots.push({ label: spec.label, file: `${spec.label}.png`, viewport: spec.viewport ?? "desktop", fullPage: !!spec.fullPage });
      console.log(`  ✓ ${spec.label}.png (${spec.viewport ?? "desktop"}${spec.fullPage ? ", fullPage" : ""})`);
    } finally {
      await context.close();
    }
  }
}

// ---------- demo recording pass ----------
async function captureDemo(browser, manifest) {
  const demo = scenario.demo;
  if (!demo?.steps?.length) return;
  const size = demo.size ?? { width: 1280, height: 720 };

  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: work, size },
    // recordings want real animations — the demo is the product in motion
    reducedMotion: "no-preference",
  });
  const page = await preparePage(context);
  let video;
  try {
    await gotoWithFallback(page, scenario.baseUrl);
    await settle(page);
    await runActions(page, scenario.setup ?? [], { baseUrl: scenario.baseUrl, label: "setup" });
    await page.waitForTimeout(800); // opening beat before the action starts
    await runActions(page, demo.steps, {
      baseUrl: scenario.baseUrl,
      stepPauseMs: demo.stepPauseMs ?? 600,
      label: "demo.steps",
    });
    await page.waitForTimeout(1200); // closing beat so the GIF doesn't cut hard
  } finally {
    video = page.video();
    await context.close(); // flushes the webm to disk
  }
  const recorded = await video.path();
  const out = path.join(work, "demo-source.webm");
  renameSync(recorded, out);
  manifest.demo = { file: "demo-source.webm", size };
  console.log(`  ✓ demo-source.webm (${size.width}x${size.height})`);
}

// ---------- main ----------
const browser = await launchBrowser({ headed });
const manifest = { project: scenario.project, baseUrl: scenario.baseUrl, screenshots: [], demo: null };
try {
  if (only !== "demo") {
    console.log("Screenshots:");
    await captureScreenshots(browser, manifest);
  }
  if (only !== "screenshots" && !onlyPage) {
    console.log("Demo recording:");
    await captureDemo(browser, manifest);
  }
} catch (err) {
  console.error(`\nCapture failed: ${err.message}`);
  await browser.close();
  process.exit(1);
}
await browser.close();

// merge with an existing manifest so --only/--page partial runs don't lose entries
const manifestPath = path.join(work, "manifest.json");
let merged = manifest;
try {
  const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
  const labels = new Set(manifest.screenshots.map((s) => s.label));
  merged = {
    ...prev,
    ...manifest,
    screenshots: [...prev.screenshots.filter((s) => !labels.has(s.label)), ...manifest.screenshots],
    demo: manifest.demo ?? prev.demo,
  };
} catch {
  /* first run */
}
writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
console.log(`\nWork dir: ${work}`);
