// Locate a usable playwright-core + Chromium without requiring any npm install
// in the target repo. Resolution is deliberately layered so the scripts work on
// any machine that has Playwright in *some* form:
//
//   playwright-core:  1. local dependency of cwd (a repo that ships playwright)
//                     2. PLAYWRIGHT_CORE_PATH env var
//                     3. global npm root (playwright-core itself, or bundled
//                        inside @playwright/cli / playwright)
//
//   chromium:         newest chromium-<rev> dir in the ms-playwright browser
//                     cache (PLAYWRIGHT_BROWSERS_PATH overrides the default
//                     per-OS location). We pass an explicit executablePath
//                     because the resolved playwright-core may pin a different
//                     browser revision than what's installed, and letting it
//                     auto-resolve would abort with a "run playwright install"
//                     prompt.

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

function tryRequire(spec, paths) {
  try {
    return require(require.resolve(spec, paths ? { paths } : undefined));
  } catch {
    return null;
  }
}

export function resolvePlaywrightCore() {
  // 1. Local dependency of the directory we're running against.
  for (const spec of ["playwright-core", "playwright"]) {
    const mod = tryRequire(spec, [process.cwd()]);
    if (mod?.chromium) return mod;
  }

  // 2. Explicit override.
  if (process.env.PLAYWRIGHT_CORE_PATH) {
    const mod = tryRequire(process.env.PLAYWRIGHT_CORE_PATH);
    if (mod?.chromium) return mod;
    throw new Error(
      `PLAYWRIGHT_CORE_PATH is set but not loadable: ${process.env.PLAYWRIGHT_CORE_PATH}`,
    );
  }

  // 3. Global npm root — playwright-core directly, or bundled in a CLI package.
  let globalRoot = "";
  try {
    globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  } catch {
    /* npm not on PATH; fall through to the error below */
  }
  if (globalRoot) {
    const candidates = [
      path.join(globalRoot, "playwright-core"),
      path.join(globalRoot, "@playwright", "cli", "node_modules", "playwright-core"),
      path.join(globalRoot, "playwright", "node_modules", "playwright-core"),
    ];
    for (const dir of candidates) {
      if (!existsSync(dir)) continue;
      const mod = tryRequire(dir);
      if (mod?.chromium) return mod;
    }
  }

  throw new Error(
    "Could not find playwright-core. Install it locally (npm i -D playwright-core), " +
      "globally (npm i -g @playwright/cli), or set PLAYWRIGHT_CORE_PATH.",
  );
}

function browsersCacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  switch (process.platform) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
    case "darwin":
      return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
    default:
      return path.join(os.homedir(), ".cache", "ms-playwright");
  }
}

const EXE_CANDIDATES = {
  win32: ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"],
  darwin: [
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: ["chrome-linux/chrome"],
};

export function findChromiumExecutable() {
  const cache = browsersCacheDir();
  if (!existsSync(cache)) {
    throw new Error(
      `Playwright browser cache not found at ${cache}. Run "playwright install chromium" first.`,
    );
  }
  const revisions = readdirSync(cache)
    .map((name) => /^chromium-(\d+)$/.exec(name))
    .filter(Boolean)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  for (const [dirName] of revisions) {
    for (const rel of EXE_CANDIDATES[process.platform] || EXE_CANDIDATES.linux) {
      const exe = path.join(cache, dirName, rel);
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error(
    `No chromium-* build with a usable executable under ${cache}. ` +
      'Run "playwright install chromium" first.',
  );
}

export async function launchBrowser({ headed = false } = {}) {
  const { chromium } = resolvePlaywrightCore();
  const executablePath = findChromiumExecutable();
  const browser = await chromium.launch({ executablePath, headless: !headed });
  return browser;
}
