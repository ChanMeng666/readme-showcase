// Shared interpreter for the six scenario actions: goto, click, fill, scroll,
// hover, wait. Kept deliberately small — a scenario file is meant to be
// readable and hand-editable, so the vocabulary stays flat and predictable.
//
// Every action accepts:
//   optional   - selector misses warn instead of aborting (cookie banners)
//   timeoutMs  - per-action timeout, default 10s

const DEFAULT_TIMEOUT = 10_000;

export function resolveUrl(baseUrl, url) {
  return new URL(url, baseUrl).toString();
}

// networkidle is the best capture signal but never fires on sites with
// analytics beacons / websockets — fall back to domcontentloaded + settle.
export async function gotoWithFallback(page, url, { timeoutMs = 30_000 } = {}) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1500);
  }
}

// Wait for web fonts so screenshots/recordings don't catch FOUT.
export async function settle(page, ms = 500) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

async function runOne(page, step, baseUrl) {
  const timeout = step.timeoutMs ?? DEFAULT_TIMEOUT;
  switch (step.action) {
    case "goto":
      await gotoWithFallback(page, resolveUrl(baseUrl, step.url), { timeoutMs: timeout });
      await settle(page);
      break;
    case "click":
      await page.click(step.selector, { timeout });
      break;
    case "fill":
      if (step.delayMs) {
        // Per-character typing so demo recordings look human.
        const loc = page.locator(step.selector).first();
        await loc.click({ timeout });
        await loc.fill("", { timeout });
        await loc.pressSequentially(step.value, { delay: step.delayMs, timeout: timeout + step.value.length * step.delayMs });
      } else {
        await page.fill(step.selector, step.value, { timeout });
      }
      break;
    case "hover":
      await page.hover(step.selector, { timeout });
      break;
    case "scroll":
      if (step.to === "selector" || (step.selector && !step.to && !step.by)) {
        await page.locator(step.selector).first().scrollIntoViewIfNeeded({ timeout });
      } else if (step.to === "bottom") {
        await page.evaluate(() =>
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
        );
      } else if (step.to === "top") {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      } else if (step.by) {
        await page.evaluate((px) => window.scrollBy({ top: px, behavior: "smooth" }), step.by);
      }
      // smooth scrolling needs a beat to finish before the next step/frame
      await page.waitForTimeout(600);
      break;
    case "wait":
      if (step.selector) {
        await page.waitForSelector(step.selector, { timeout: step.ms ?? timeout });
      } else {
        await page.waitForTimeout(step.ms ?? 1000);
      }
      break;
    default:
      throw new Error(`Unknown action "${step.action}"`);
  }
}

/**
 * Run a list of scenario steps on a page.
 * Throws on the first failing non-optional step, tagging the step index so the
 * caller can report exactly which line of the scenario to fix.
 */
export async function runActions(page, steps = [], { baseUrl, stepPauseMs = 0, label = "steps" } = {}) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      await runOne(page, step, baseUrl);
    } catch (err) {
      if (step.optional) {
        console.warn(`  ~ ${label}[${i}] (${step.action}) optional, skipped: ${err.message.split("\n")[0]}`);
        continue;
      }
      err.message = `${label}[${i}] (${step.action} ${step.selector ?? step.url ?? ""}) failed: ${err.message}`;
      err.stepIndex = i;
      throw err;
    }
    if (stepPauseMs) await page.waitForTimeout(stepPauseMs);
  }
}
