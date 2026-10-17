/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Shoots the visual-proof harness in real Chromium, one PNG per plate.
 *
 * It also MEASURES, because a picture on its own proves only that something
 * rendered. For every plate it reads back the computed geometry and checks the
 * handoff's numbers, and it fails loudly rather than producing a pretty
 * screenshot of something wrong.
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.HARNESS_URL ?? "http://127.0.0.1:6007";
const OUT = process.env.SHOT_DIR ?? "_shots";

const problems = [];
const note = (what) => problems.push(what);

/*
 * The environment ships a Chromium that this Playwright build does not expect
 * by name, so point at it rather than downloading a second one.
 */
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({
  viewport: { width: 1040, height: 900 },
  deviceScaleFactor: 2,
});
await page.goto(`${BASE}/harness/orisoStage.html`, { waitUntil: "load" });

// The artwork arrives over the network and the backdrop paints on a clock.
await page.waitForSelector('[data-shot="hain-9"] [data-testid="oriso-artwork"]', {
  timeout: 15000,
});
await page.waitForTimeout(1200);

await mkdir(OUT, { recursive: true });

const plates = await page.$$eval("[data-shot]", (nodes) =>
  nodes.map((node) => node.getAttribute("data-shot")),
);

for (const id of plates) {
  const element = await page.$(`[data-shot="${id}"]`);
  await element.screenshot({ path: join(OUT, `${id}.png`) });
}

/* ----------------------------------------------------------------------- *
 * The measurements
 * ----------------------------------------------------------------------- */

const measured = await page.evaluate(() => {
  const read = (id) => {
    const plate = document.querySelector(`[data-shot="${id}"]`);
    const faces = [...plate.querySelectorAll('[data-testid="oriso-face"]')];
    return {
      count: faces.length,
      faces: faces.map((face) => {
        const box = face.getBoundingClientRect();
        const style = getComputedStyle(face);
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          radius: style.borderRadius,
          transform: style.transform,
          shadow: style.boxShadow,
          speaking: face.dataset.speaking,
          clip: style.clipPath,
        };
      }),
      artwork: plate.querySelectorAll('[data-testid="oriso-artwork"]').length,
      /*
       * How big the drawing actually comes out, as a share of the form it
       * sits in. The handoff gives a number for this in the fields (0.56 of
       * the smaller side) and in the Einzelgespräch (0.22 of the stage), and
       * applying the per-motif padding ON TOP of the layout's share quietly
       * halved both — nothing here measured it, so nothing caught it.
       */
      artworkShare: [...plate.querySelectorAll('[data-testid="oriso-face"]')]
        .map((face) => {
          const drawing = face.querySelector('[data-testid="oriso-artwork"]');
          if (drawing === null) return null;
          const form = face.getBoundingClientRect();
          const shorter = Math.min(form.width, form.height);
          return shorter === 0
            ? null
            : Number(
                (
                  drawing.getBoundingClientRect().width / shorter
                ).toFixed(3),
              );
        })
        .filter((value) => value !== null),
      initials: plate.querySelectorAll('[data-testid="oriso-initials"]').length,
      spheres: plate.querySelectorAll('[data-testid="oriso-sphere"]').length,
      rims: plate.querySelectorAll('[data-testid="oriso-rim"]').length,
      /*
       * Through the shadow root, which is where the backdrop's canvas lives.
       * Querying `oriso-pond canvas` finds nothing and reads as "the backdrop
       * is not rendering" — it said so once, and the backdrop was fine.
       */
      pond: [...plate.querySelectorAll("oriso-pond")].filter((element) => {
        const canvas = element.shadowRoot?.querySelector("canvas");
        return canvas !== null && canvas !== undefined && canvas.width > 0;
      }).length,
    };
  };
  const switcher = [...document.querySelectorAll('[data-testid="view-switcher"]')].map(
    (rail) => {
      const style = getComputedStyle(rail);
      const active = rail.querySelector('[aria-checked="true"]');
      return {
        height: Math.round(rail.getBoundingClientRect().height),
        radius: style.borderRadius,
        active: active?.getAttribute("data-view"),
        activeLabelled: (active?.textContent ?? "").trim().length > 0,
        others: [...rail.querySelectorAll('[aria-checked="false"]')].map((button) =>
          (button.textContent ?? "").trim(),
        ),
        buttonHeight: Math.round(
          rail.querySelector("button").getBoundingClientRect().height,
        ),
      };
    },
  );
  return {
    hain2: read("hain-2"),
    hain3: read("hain-3"),
    hain5: read("hain-5"),
    hain9: read("hain-9"),
    felder4: read("felder-4"),
    felder8: read("felder-8"),
    still: read("einzel-still"),
    first: read("einzel-first"),
    second: read("einzel-second"),
    switcher,
  };
});

// Everybody gets a face, and every face gets inherited artwork.
for (const [name, expected] of [
  ["hain2", 2],
  ["hain3", 3],
  ["hain5", 5],
  ["hain9", 9],
  ["felder4", 4],
  ["felder8", 8],
]) {
  const plate = measured[name];
  if (plate.count !== expected)
    note(`${name}: ${plate.count} faces, expected ${expected}`);
  if (plate.artwork !== expected)
    note(`${name}: ${plate.artwork} of ${expected} faces inherited artwork`);
  if (plate.initials !== 0)
    note(`${name}: ${plate.initials} faces fell back to initials`);
}

/*
 * The drawing is the size the handoff says, not a fraction of it.
 *
 * The fields give the animal 0.56 of the field's smaller side and the
 * Einzelgespräch 0.22 of the stage, which is 0.2558 of the circle. Those are
 * the layout's own `contentShare`, so applying the per-motif padding on top of
 * them halved both and nothing here noticed. The window is wide enough for the
 * flat motifs, which legitimately get up to 12.5% more.
 */
for (const [name, target] of [
  ["felder4", 0.56],
  ["felder8", 0.56],
  ["still", 0.22 / 0.86],
  ["first", 0.22 / 0.86],
  ["second", 0.22 / 0.86],
]) {
  const shares = measured[name].artworkShare;
  if (shares.length === 0) {
    note(`${name}: no drawing to measure`);
    continue;
  }
  const low = target * 0.9;
  const high = target * 1.2;
  const strays = shares.filter((share) => share < low || share > high);
  if (strays.length > 0)
    note(
      `${name}: artwork at ${strays.join(", ")} of the form, ` +
        `outside ${low.toFixed(3)}–${high.toFixed(3)} (handoff ${target.toFixed(3)})`,
    );
  process.stdout.write(
    `${name.padEnd(8)} artwork ${shares.join(", ")} of the form ` +
      `(handoff ${target.toFixed(3)})\n`,
  );
}

// The grove's forms are organic and individual: eight-value radii, a lean, and
// no two people alike. A round bubble here means the engine was rewritten.
{
  const radii = new Set(measured.hain9.faces.map((face) => face.radius));
  if (radii.size < 9) note(`hain9: only ${radii.size} distinct radii among 9 shapes`);
  const plain = measured.hain9.faces.filter(
    (face) => face.radius === "50%" || !face.radius.includes("/"),
  );
  if (plain.length > 0)
    note(`hain9: ${plain.length} shapes are plain circles, not blobs`);
  const upright = measured.hain9.faces.filter((face) => face.transform === "none");
  if (upright.length > 2)
    note(`hain9: ${upright.length} shapes have no lean at all`);
}

// Speaking is the person's own colour, never one shared accent.
for (const name of ["hain3", "hain5", "hain9"]) {
  const speaker = measured[name].faces.find((face) => face.speaking === "true");
  if (!speaker) {
    note(`${name}: nobody is marked as speaking`);
    continue;
  }
  if (!/rgba?\([^)]*\)[^,]*0 0 0 6px|0px 0px 0px 6px/.test(speaker.shadow))
    note(`${name}: the speaker has no tight ring (${speaker.shadow.slice(0, 60)})`);
  if (speaker.shadow.includes("rgb(0, 0, 0) 0px 0px"))
    note(`${name}: the speaker's halo is black, not their own colour`);
}

// The fields are rectilinear: one corner radius, no lean, and no sphere
// shading — with it they read as glossy plastic buttons rather than surfaces.
for (const name of ["felder4", "felder8"]) {
  for (const face of measured[name].faces) {
    if (face.radius !== "22px") note(`${name}: field radius ${face.radius}, expected 22px`);
    if (face.transform !== "none") note(`${name}: a field is leaning (${face.transform})`);
  }
  if (measured[name].spheres !== 0)
    note(`${name}: ${measured[name].spheres} fields are shaded like bodies`);
}

// The grove's blobs and the circle's halves ARE bodies, and say so.
for (const name of ["hain9", "still"]) {
  if (measured[name].spheres !== measured[name].count)
    note(
      `${name}: ${measured[name].spheres} of ${measured[name].count} forms are shaded`,
    );
}

// The Einzelgespräch is two halves of ONE circle: same box, two clips, one
// sphere each so the two reassemble, and a rim only on whoever speaks.
for (const [name, rims] of [
  ["still", 0],
  ["first", 1],
  ["second", 1],
]) {
  const plate = measured[name];
  if (plate.count !== 2) note(`${name}: ${plate.count} halves, expected 2`);
  if (plate.rims !== rims) note(`${name}: ${plate.rims} rim lights, expected ${rims}`);
  const [a, b] = plate.faces;
  if (a.width !== b.width || a.height !== b.height)
    note(`${name}: the halves do not share one box (${a.width}×${a.height} vs ${b.width}×${b.height})`);
  if (a.width !== a.height) note(`${name}: the circle is an ellipse (${a.width}×${a.height})`);
  if (plate.faces.some((face) => face.clip === "none"))
    note(`${name}: a half is not clipped by the seam`);
  if (plate.faces.some((face) => face.shadow !== "none"))
    note(`${name}: a half carries its own lift, which the seam would cut`);
}

// The view switcher: a 44px rail of 36px buttons, and only the active entry
// spells out its name.
for (const rail of measured.switcher) {
  if (rail.height !== 44) note(`switcher: rail ${rail.height}px, expected 44`);
  if (rail.buttonHeight !== 36) note(`switcher: button ${rail.buttonHeight}px, expected 36`);
  if (rail.radius !== "22px") note(`switcher: radius ${rail.radius}, expected 22px`);
  if (!rail.activeLabelled) note(`switcher: the active view carries no word`);
  if (rail.others.some((text) => text.length > 0))
    note(`switcher: an inactive view is spelling out its name`);
}

// The backdrop is a real rendered surface, not a gradient.
if (measured.hain9.pond !== 1) note(`hain9: ${measured.hain9.pond} pond canvases, expected 1`);

await writeFile(join(OUT, "measurements.json"), JSON.stringify(measured, null, 2));
await browser.close();

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`${plates.length} plates shot into ${OUT}, every measurement holds.`);
