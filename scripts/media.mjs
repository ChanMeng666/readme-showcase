#!/usr/bin/env node
// Turn capture.mjs intermediates into README-ready assets:
//
//   <work>/<label>.png       -> <out>/<label>.webp   (PNG kept only if it wins)
//   <work>/demo-source.webm  -> <out>/demo.mp4       (for manual drag-upload)
//                            -> <out>/demo.gif       (<= 7.5 MB, the only video
//                                                     format GitHub READMEs
//                                                     auto-embed)
//
// Usage: node media.mjs --work <dir> --out <dir>
//
// GIF strategy: two-pass palette (palettegen/paletteuse) walked down a quality
// ladder until the file fits. If the smallest rung still doesn't fit, we stop
// and say so — the right fix is a shorter demo, not a mud-quality GIF.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const work = flag("work");
const out = flag("out");
if (!work || !out) {
  console.error("Usage: node media.mjs --work <dir> --out <dir>");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const GIF_TARGET_BYTES = 7.5 * 1024 * 1024; // 0.5 MB headroom under GitHub's 8 MB render cap
const WEBP_MAX_BYTES = 1.5 * 1024 * 1024;

function run(cmd, cmdArgs, { allowFail = false } = {}) {
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    if (allowFail) return null;
    throw new Error(`${cmd} ${cmdArgs.join(" ")}\n${res.stderr || res.error?.message}`);
  }
  return res;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

// ---------- screenshots -> WebP ----------
const hasSharp = !!run("sharp", ["--version"], { allowFail: true });

function encodeWebp(src, dest, quality) {
  if (hasSharp) {
    // sharp-cli writes <basename>.webp into -o <dir>; encode via a temp dir
    // so quality retries don't clobber each other.
    const tmp = path.join(os.tmpdir(), `readme-showcase-webp-${quality}`);
    mkdirSync(tmp, { recursive: true });
    run("sharp", ["-i", src, "-o", tmp, "-f", "webp", "-q", String(quality)]);
    const produced = path.join(tmp, path.basename(src, ".png") + ".webp");
    copyFileSync(produced, dest);
    unlinkSync(produced);
  } else {
    run("ffmpeg", ["-y", "-v", "error", "-i", src, "-c:v", "libwebp", "-quality", String(quality), dest]);
  }
}

const manifest = JSON.parse(readFileSync(path.join(work, "manifest.json"), "utf8"));
const produced = [];

for (const shot of manifest.screenshots ?? []) {
  const src = path.join(work, shot.file);
  if (!existsSync(src)) {
    console.warn(`  ~ missing ${shot.file}, skipped (re-run capture.mjs?)`);
    continue;
  }
  const dest = path.join(out, `${shot.label}.webp`);
  const pngSize = statSync(src).size;

  encodeWebp(src, dest, 82);
  if (statSync(dest).size > WEBP_MAX_BYTES || statSync(dest).size > pngSize) {
    encodeWebp(src, dest, 70);
  }
  if (statSync(dest).size > pngSize) {
    // Rare flat-color case where PNG wins — ship the PNG instead.
    unlinkSync(dest);
    const pngDest = path.join(out, `${shot.label}.png`);
    copyFileSync(src, pngDest);
    produced.push({ file: `${shot.label}.png`, size: pngSize });
    console.log(`  ✓ ${shot.label}.png (${kb(pngSize)}, PNG kept — smaller than WebP)`);
  } else {
    produced.push({ file: `${shot.label}.webp`, size: statSync(dest).size });
    console.log(`  ✓ ${shot.label}.webp (${kb(statSync(dest).size)})`);
  }
}

// ---------- demo -> MP4 + GIF ----------
const webm = path.join(work, "demo-source.webm");
if (manifest.demo && existsSync(webm)) {
  const mp4 = path.join(out, "demo.mp4");
  run("ffmpeg", [
    "-y", "-v", "error", "-i", webm,
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-crf", "23", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    mp4,
  ]);
  produced.push({ file: "demo.mp4", size: statSync(mp4).size });
  console.log(`  ✓ demo.mp4 (${mb(statSync(mp4).size)})`);

  const LADDER = [
    { fps: 12, width: 900, colors: 128, dither: "sierra2_4a" },
    { fps: 12, width: 800, colors: 128, dither: "sierra2_4a" },
    { fps: 10, width: 800, colors: 96, dither: "sierra2_4a" },
    { fps: 10, width: 720, colors: 96, dither: "bayer:bayer_scale=5" },
    { fps: 8, width: 640, colors: 64, dither: "bayer:bayer_scale=5" },
  ];
  const gif = path.join(out, "demo.gif");
  const palette = path.join(work, "palette.png");
  let fitted = false;
  for (const { fps, width, colors, dither } of LADDER) {
    run("ffmpeg", [
      "-y", "-v", "error", "-i", webm,
      "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=max_colors=${colors}:stats_mode=diff`,
      palette,
    ]);
    run("ffmpeg", [
      "-y", "-v", "error", "-i", webm, "-i", palette,
      "-lavfi", `fps=${fps},scale=${width}:-1:flags=lanczos,paletteuse=dither=${dither}:diff_mode=rectangle`,
      gif,
    ]);
    const size = statSync(gif).size;
    if (size <= GIF_TARGET_BYTES) {
      produced.push({ file: "demo.gif", size });
      console.log(`  ✓ demo.gif (${mb(size)} @ fps=${fps} w=${width} colors=${colors})`);
      fitted = true;
      break;
    }
    console.log(`  … demo.gif ${mb(size)} > ${mb(GIF_TARGET_BYTES)} @ fps=${fps} w=${width}, stepping down`);
  }
  if (!fitted) {
    console.error(
      "\ndemo.gif won't fit under 7.5 MB even at the lowest quality rung.\n" +
        "Shorten the demo (fewer steps / shorter waits in the scenario) and re-run\n" +
        "capture.mjs --only demo — don't degrade quality further.",
    );
    process.exit(1);
  }
} else {
  console.log("  (no demo recording in manifest — skipping MP4/GIF)");
}

const total = produced.reduce((s, p) => s + p.size, 0);
console.log(`\nOut dir: ${out} (${produced.length} files, ${mb(total)} total)`);
