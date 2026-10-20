/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * What the stage looks like at the bottom of a scrolled call.
 *
 * Two review findings, both about the same thing — the scrollport. Above
 * eight people the fields stop subdividing and `.inRoom` scrolls, and the
 * question for each is whether something sized to the FIRST screenful is
 * still right at the last:
 *
 *   1. the sheet: does its own box, and the halo room it pads with, reach
 *      the last row, or stop at the fold?
 *   2. the pond: is it still behind the stage at maximum scroll, or has it
 *      scrolled away with the content?
 *
 * jsdom has no layout and the Storybook harness mounts stages rather than a
 * call view, so neither can see either. This builds the real ancestor chain
 * — `.inRoom` > `.scrollingGrid` (`Grid`'s own root) > the layout root, with
 * the slots as its flow children — out of the SHIPPED rule bodies, read from
 * the stylesheets rather than retyped, and measures it in Chromium.
 *
 * The "before" column re-applies the two declarations this change replaced,
 * so the counterfactual is taken in the same browser, on the same page, the
 * same way as the real run.
 *
 * Usage:   node scripts/measureScrollport.mjs           # 900x620
 *          W=390 H=640 SUFFIX=-phone node scripts/...   # a phone
 * Writes numbers to stdout and plates to docs/evidence/scrollport.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

// Run from the repository root, as the other measurement scripts are.
const repo = process.cwd();
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const bodyOf = (css, sel) =>
  new RegExp(`\\${sel}\\s*\\{([^{}]*)\\}`).exec(strip(css))?.[1] ?? "";

const gridCss = readFileSync(
  `${repo}/src/grid/OrisoGroveLayout.module.css`,
  "utf8",
);
const baseCss = readFileSync(`${repo}/src/grid/Grid.module.css`, "utf8");
// `haloRoomFor` — min(HALO_ROOM_PX, shorter side * HALO_ROOM_MAX_SHARE).
const VIEWPORT = {
  width: Number(process.env.W ?? 900),
  height: Number(process.env.H ?? 620),
};
const HALO = Math.round(
  Math.min(28, Math.min(VIEWPORT.width, VIEWPORT.height) * 0.08),
);
const roomCss = readFileSync(`${repo}/src/room/InCallView.module.css`, "utf8");

const sheetAfter = bodyOf(gridCss, ".sheet");
const backdropAfter = bodyOf(roomCss, ".orisoBackdrop");
if (!/min-block-size:\s*100%/.test(sheetAfter))
  throw new Error("sheet rule not found");
if (!/position:\s*fixed/.test(backdropAfter))
  throw new Error("backdrop rule not found");

const sheetBefore = sheetAfter.replace(
  /min-block-size:\s*100%/,
  "block-size: 100%",
);
const backdropBefore = backdropAfter.replace(
  /position:\s*fixed/,
  "position: absolute",
);

const page = (sheet, backdrop) => `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: #0b0f14; }
  .inRoom { ${bodyOf(roomCss, ".inRoom")} position: relative; isolation: isolate; }
  .orisoBackdrop { ${backdrop} }
  .pond { position: absolute; inset: 0; background:
      radial-gradient(circle at 30% 20%, #1d4e5f, #0b1b24 70%); }
  .header { position: sticky; inset-block-start: 0; flex-shrink: 0;
            block-size: 40px; background: #000; z-index: 2; }
  /* The real chain: .inRoom > .scrollingGrid (which is Grid's own root) >
     the layout root, with the slots as its flow children. */
  .scrollingGrid { ${bodyOf(roomCss, ".scrollingGrid")} ${bodyOf(baseCss, ".grid")} }
  .sheet { ${sheet} }
  .slot { ${bodyOf(baseCss, ".slot")} background: #cfe8ef; border-radius: 42%; }
  .slot.speaking { box-shadow: 0 0 0 ${HALO}px rgba(207,232,239,.3); }
</style>
<div class="inRoom" data-oriso="true">
  <div class="orisoBackdrop" aria-hidden="true"><div class="pond"></div></div>
  <div class="header"></div>
  <div class="scrollingGrid">
    <div class="sheet" data-testid="oriso-grove" data-view="felder" data-mode="scroll"
         style="--oriso-field-gutter: 6px; --oriso-halo-room: ${HALO}px">
      ${Array.from(
        { length: 14 },
        (_, i) =>
          `<div class="slot${i === 13 ? " speaking" : ""}" style="inline-size: 220px; block-size: 165px"></div>`,
      ).join("\n      ")}
    </div>
  </div>
</div>`;

const measure = () => {
  const room = document.querySelector(".inRoom");
  const sheet = document.querySelector(".sheet");
  const fields = [...document.querySelectorAll(".slot")];
  const last = fields.at(-1).getBoundingClientRect();
  const sheetBox = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const back = document.querySelector(".orisoBackdrop").getBoundingClientRect();
  return {
    scrolledTo: Math.round(room.scrollTop),
    maxScroll: Math.round(room.scrollHeight - room.clientHeight),
    // Room left after the last row, inside the sheet's own padding box.
    roomAfterLastRow: Math.round(
      sheetBox.bottom - parseFloat(style.paddingBottom) - last.bottom,
    ),
    // How much of the last row sits outside the sheet's border box at all.
    lastRowBelowSheet: Math.round(last.bottom - sheetBox.bottom),
    backdropTop: Math.round(back.top),
    backdropBottom: Math.round(back.bottom),
    viewport: Math.round(room.clientHeight),
  };
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const out = `${repo}/docs/evidence/scrollport`;
mkdirSync(out, { recursive: true });
const results = {};
for (const [name, sheet, backdrop] of [
  ["before", sheetBefore, backdropBefore],
  ["after", sheetAfter, backdropAfter],
]) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const p = await ctx.newPage();
  await p.setContent(page(sheet, backdrop));
  await p.waitForSelector(".slot");
  results[name] = { top: await p.evaluate(measure) };
  await p.screenshot({
    path: `${out}/01-${name}-top${process.env.SUFFIX ?? ""}.png`,
  });
  await p.evaluate(() => {
    const room = document.querySelector(".inRoom");
    room.scrollTop = room.scrollHeight;
  });
  await p.waitForTimeout(80);
  results[name].bottom = await p.evaluate(measure);
  await p.screenshot({
    path: `${out}/02-${name}-max-scroll${process.env.SUFFIX ?? ""}.png`,
  });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
