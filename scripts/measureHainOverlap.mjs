/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How much the grove's shapes actually overlap, at the counts in question.
 *
 * Open question 4 on the epic is "Hain overlap at 2, 3, 5 and 6" — raised
 * from looking at pictures. The packer is the prototype's own and the shapes
 * are MEANT to abut; the question is whether abutting has become covering.
 * This answers it with numbers instead of an impression.
 *
 * The shapes are organic, so a circle is the honest approximation of each:
 * the packer itself treats them as circles of radius size/2 and pushes them
 * apart until they just touch at `pad = 0.99`. Overlap is reported as a share
 * of the SMALLER shape's area, because that is the one at risk of
 * disappearing.
 */
import { packShapes } from "../src/oriso/layout.ts";

const BOX = 640;
const NAMES = [
  "ruhiger Fuchs 432",
  "naher Otter 303",
  "helle Eule 118",
  "weiche Katze 870",
  "feiner Dachs 255",
  "klare Biene 641",
  "stiller Igel 507",
  "warmer Hase 962",
  "leiser Delfin 774",
];

/** Area of the lens where two circles meet, as a share of the smaller one. */
function overlapShare(a, b) {
  const ar = a.size / 2;
  const br = b.size / 2;
  const d = Math.hypot(a.x + ar - (b.x + br), a.y + ar - (b.y + br));
  if (d >= ar + br) return 0;
  if (d <= Math.abs(ar - br)) return 1;
  const lens =
    ar * ar * Math.acos((d * d + ar * ar - br * br) / (2 * d * ar)) +
    br * br * Math.acos((d * d + br * br - ar * ar) / (2 * d * br)) -
    0.5 *
      Math.sqrt((-d + ar + br) * (d + ar - br) * (d - ar + br) * (d + ar + br));
  return lens / (Math.PI * Math.min(ar, br) ** 2);
}

const rows = [];
for (const count of [2, 3, 4, 5, 6, 7, 8, 9]) {
  for (const speaking of [null, 0]) {
    const spots = packShapes(
      NAMES.slice(0, count),
      BOX,
      NAMES.slice(0, count).map((_, i) => (i === speaking ? 1.6 : 1)),
    );
    let worst = 0;
    let pairs = 0;
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const share = overlapShare(spots[i], spots[j]);
        if (share > 0.001) pairs += 1;
        worst = Math.max(worst, share);
      }
    rows.push({
      count,
      speaking: speaking === null ? "silent" : "one speaks",
      smallest: Math.min(...spots.map((s) => s.size)),
      largest: Math.max(...spots.map((s) => s.size)),
      touchingPairs: pairs,
      worstOverlap: `${(worst * 100).toFixed(1)}%`,
    });
  }
}
console.table(rows);

/*
 * Two people never see the grove.
 *
 * `layoutMedia$` reaches for `oneOnOneLayoutMedia$` first in grid mode and it
 * matches whenever there are exactly two media items, so at two the
 * arrangement is the Einzelgespräch whichever view the switcher is on. The
 * worst row in the table is therefore unreachable, and the counts that
 * matter start at three.
 */
const reachable = rows.filter((row) => row.count >= 3);
const worst = Math.max(
  ...reachable.map((row) => Number.parseFloat(row.worstOverlap)),
);
console.log(
  `\nWorst overlap at a count the grove can actually be shown at ` +
    `(3 and up): ${worst.toFixed(1)}% of the smaller shape.`,
);
console.log(
  "Two is excluded: layoutMedia$ gives exactly two people the " +
    "Einzelgespräch whichever view is selected.",
);

/*
 * A ceiling, so this stops being a question somebody has to look at again.
 *
 * The shapes are MEANT to abut — the packer pushes them to `pad = 0.99` of
 * touching on purpose, because that is how a group actually stands together.
 * A fifth of the smaller shape is where abutting turns into covering: past
 * that the animal underneath starts to disappear.
 */
const CEILING = 20;
if (worst > CEILING) {
  console.error(
    `\nShapes are covering each other rather than abutting: ` +
      `${worst.toFixed(1)}% exceeds the ${CEILING}% ceiling.`,
  );
  process.exit(1);
}
