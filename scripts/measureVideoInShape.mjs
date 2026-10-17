/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Runs the video-in-a-shape spike and prints the frame timings.
 *
 * Start the harness first:
 *   ORISO_ARTWORK_DIR=<oriso-frontend>/public/static/anon-animals \
 *     npx vite --config harness/vite.harness.config.ts
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.HARNESS_URL ?? "http://127.0.0.1:6007";
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  // Software rasterisation is the pessimistic case for compositing a clip
  // path, which is the thing in question. A machine with a GPU can only do
  // better.
  args: ["--use-gl=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 820 } });
page.on("pageerror", (error) => console.error("[pageerror]", error.message));
await page.goto(`${BASE}/harness/videoSpike.html`, { waitUntil: "load" });
await page.waitForFunction(() => document.title === "done", null, {
  timeout: 120000,
});
const results = await page.evaluate(() => window.__spike);
await browser.close();

await mkdir("_shots", { recursive: true });
await writeFile("_shots/video-in-shape.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

const slowest = Math.max(...Object.values(results).map((r) => r.p95));
const control = results.plain.p95;
if (slowest > control * 1.5) {
  console.error(
    `\nA shaped frame costs more than half again as much as a plain one ` +
      `(${slowest.toFixed(1)}ms vs ${control.toFixed(1)}ms at p95).`,
  );
  process.exit(1);
}
console.log("\nShaping a live frame costs nothing measurable here.");
