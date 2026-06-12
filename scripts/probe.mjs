#!/usr/bin/env node
// Survey a deployed site before writing a scenario: what pages exist, is there
// a login wall, what does it look like at a glance. Output feeds the scenario-
// writing step — probe shots are working material, never published.
//
// Usage: node probe.mjs --url <liveUrl> [--work <dir>]
//
// Emits into <work>:
//   survey.json          title/description, final URL, login-wall verdict,
//                        same-origin links grouped by path, console errors
//   probe-desktop.png    1280x720 top of page
//   probe-scrolled.png   one viewport down (what's below the fold)
//   probe-mobile.png     390x844 top of page

import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { gotoWithFallback, settle } from "./lib/actions.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const url = flag("url");
if (!url) {
  console.error("Usage: node probe.mjs --url <liveUrl> [--work <dir>]");
  process.exit(2);
}
const work = path.resolve(flag("work") ?? path.join(os.tmpdir(), "readme-showcase", "probe"));
mkdirSync(work, { recursive: true });

const browser = await launchBrowser();
const consoleErrors = [];

// ---------- desktop pass ----------
const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await desktop.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
});

await gotoWithFallback(page, url);
await settle(page, 800);

const finalUrl = page.url();
const survey = await page.evaluate(() => {
  const origin = location.origin;
  const groups = {};
  for (const a of document.querySelectorAll("a[href]")) {
    let u;
    try {
      u = new URL(a.getAttribute("href"), location.href);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    const key = u.pathname;
    if (!groups[key]) groups[key] = { path: key, count: 0, texts: new Set() };
    groups[key].count++;
    const t = (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 40);
    if (t) groups[key].texts.add(t);
  }
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content ?? null,
    hasPasswordInput: !!document.querySelector('input[type="password"]'),
    links: Object.values(groups)
      .map((g) => ({ path: g.path, count: g.count, texts: [...g.texts].slice(0, 3) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
  };
});

const loginWall =
  /\/(login|signin|sign-in|auth)\b/i.test(new URL(finalUrl).pathname) || survey.hasPasswordInput;

await page.screenshot({ path: path.join(work, "probe-desktop.png") });
await page.evaluate(() => window.scrollBy(0, window.innerHeight));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(work, "probe-scrolled.png") });
await desktop.close();

// ---------- mobile pass ----------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mPage = await mobile.newPage();
await gotoWithFallback(mPage, url);
await settle(mPage, 800);
await mPage.screenshot({ path: path.join(work, "probe-mobile.png") });
await mobile.close();
await browser.close();

const result = {
  url,
  finalUrl,
  redirected: finalUrl.replace(/\/$/, "") !== url.replace(/\/$/, ""),
  loginWall,
  title: survey.title,
  description: survey.description,
  links: survey.links,
  consoleErrors: consoleErrors.slice(0, 10),
};
writeFileSync(path.join(work, "survey.json"), JSON.stringify(result, null, 2));

console.log(`title:      ${result.title}`);
console.log(`finalUrl:   ${finalUrl}${result.redirected ? "  (redirected!)" : ""}`);
console.log(`loginWall:  ${loginWall}`);
console.log(`paths:      ${result.links.map((l) => l.path).slice(0, 12).join("  ")}`);
if (consoleErrors.length) console.log(`console:    ${consoleErrors.length} error(s) — see survey.json`);
console.log(`\nWork dir: ${work} (survey.json + 3 probe shots)`);
