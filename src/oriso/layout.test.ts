/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * SPECIFICATION — the call layout engine
 *
 * These are the acceptance criteria from Ticket 01 of the design handoff,
 * written as tests rather than paraphrased:
 *
 *   - Pure: no DOM, no React, no imports from the app.
 *   - Deterministic: same participant ids in the same order → identical
 *     output, every call.
 *   - packShapes with 2, 4, 9 and 14 names produces no overlap and no shape
 *     clipped by the box.
 *   - Raising one weight from 1 to 1.6 visibly displaces the neighbours
 *     rather than overlapping them.
 *   - Unit-tested at 2, 4, 9, 14 and 18 participants.
 *
 * The functions under test are a VERBATIM port. If one of these fails, the
 * finding belongs to the handoff, not to the port — do not "fix" the engine
 * to make a test pass without saying so out loud.
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from "vitest";

import { HALO_ROOM_MAX_SHARE, HALO_ROOM_PX } from "./halo";
import {
  type Placement,
  type Rect,
  organicSpots,
  ownShape,
  packShapes,
  pairShapes,
  seeded,
  splitCells,
  groveBox,
  haloRoomFor,
} from "./layout";

/** ORISO names, in the shape the engine is seeded with. */
const names = (n: number): string[] =>
  [
    "ruhiger Fuchs 432",
    "später Kauz 512",
    "wacher Igel 118",
    "klarer Schwan 77",
    "naher Otter 303",
    "stilles Pferd 907",
    "weiter Bär 651",
    "heitere Lerche 24",
    "warmer Dachs 260",
    "leiser Reiher 845",
    "offener Hase 391",
    "fester Steinbock 706",
    "milde Amsel 158",
    "heller Marder 523",
    "wacher Luchs 974",
    "sanftes Alpaka Mika",
    "freundliche Katze Mika",
    "absichtslose Schildkröte Andrea",
  ].slice(0, n);

const even = (n: number): number[] => Array.from({ length: n }, () => 1);

const BOX = 660;
const COUNTS = [2, 4, 9, 14, 18];

/** Centre-to-centre distance minus the two radii. Negative means overlap. */
const clearance = (a: Placement, b: Placement): number =>
  Math.hypot(
    a.x + a.size / 2 - (b.x + b.size / 2),
    a.y + a.size / 2 - (b.y + b.size / 2),
  ) -
  (a.size + b.size) / 2;

const worstClearance = (placed: readonly Placement[]): number => {
  let worst = Number.POSITIVE_INFINITY;
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      worst = Math.min(worst, clearance(placed[i], placed[j]));
  return worst;
};

describe("seeded", () => {
  it("gives the same stream for the same string", () => {
    const a = seeded("ruhiger Fuchs 432");
    const b = seeded("ruhiger Fuchs 432");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives different streams for different people", () => {
    expect(seeded("ruhiger Fuchs 432")()).not.toBe(seeded("später Kauz 512")());
  });
});

describe("ownShape", () => {
  it("is deterministic — the same person is the same form, always", () => {
    expect(ownShape("wacher Igel 118")).toEqual(ownShape("wacher Igel 118"));
  });

  it("gives two people different forms", () => {
    expect(ownShape("wacher Igel 118")).not.toEqual(
      ownShape("klarer Schwan 77"),
    );
  });

  it("renders a valid eight-value border-radius", () => {
    expect(ownShape("naher Otter 303").blob).toMatch(
      /^\d+% \d+% \d+% \d+% \/ \d+% \d+% \d+% \d+%$/,
    );
  });
});

describe("packShapes", () => {
  it.each(COUNTS)("is deterministic at %i participants", (n) => {
    expect(packShapes(names(n), BOX, even(n))).toEqual(
      packShapes(names(n), BOX, even(n)),
    );
  });

  it.each(COUNTS)("keeps every one of %i shapes inside the box", (n) => {
    for (const p of packShapes(names(n), BOX, even(n))) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.size).toBeLessThanOrEqual(BOX);
      expect(p.y + p.size).toBeLessThanOrEqual(BOX);
      expect(p.size).toBeGreaterThan(0);
    }
  });

  /*
   * Ticket 01's acceptance list says "no overlap" at 2, 4, 9 and 14. The
   * prototype it tells us to copy verbatim does not meet that, and the
   * measurement is the same whether you run the port or the original file —
   * so this is the handoff disagreeing with itself, not a porting error.
   *
   * Worst overlap as a share of the mean shape size, measured:
   *
   *    n= 2  -31.2%      n= 5  -14.2%      n=12   -3.6%
   *    n= 3  -12.4%      n= 6  -18.0%      n=14   -3.6%
   *    n= 4   -2.1%      n= 9   -4.9%      n=18   -5.3%
   *
   * There are plainly two different things in that table. A few per cent is
   * the `pad = 0.99` negative padding doing exactly what its comment says —
   * "so they genuinely abut rather than hover apart". A third of a shape is
   * somebody buried, which is what the Kreis looked like at two people.
   *
   * So the engine is left verbatim and the tests record both facts: the
   * abutting band is asserted, and the burying is pinned with `fails` so it
   * cannot be forgotten and breaks loudly the day it is fixed.
   */
  const ABUT_TOLERANCE = 0.06;

  const worstRelative = (n: number): number => {
    const placed = packShapes(names(n), BOX, even(n));
    const mean = placed.reduce((t, p) => t + p.size, 0) / placed.length;
    return worstClearance(placed) / mean;
  };

  it.each([4, 9, 12, 14, 18])(
    "lets %i shapes abut without burying one another",
    (n) => {
      expect(worstRelative(n)).toBeGreaterThan(-ABUT_TOLERANCE);
    },
  );

  /*
   * Known defect of the prototype. Two is pinned here as the REASON the
   * Kreis does not pack a pair any more — design chose the fields' division
   * for that count on 2026-10-17, see `pairShapes` below — and three, five
   * and six are still awaiting a decision of their own.
   */
  it.fails.each([2, 3, 5, 6])(
    "TICKET 01 UNMET — %i shapes bury one another",
    (n) => {
      expect(worstRelative(n)).toBeGreaterThan(-ABUT_TOLERANCE);
    },
  );

  // Ticket 01, acceptance: raising one weight displaces rather than overlaps.
  it("displaces the neighbours when one weight goes from 1 to 1.6", () => {
    const n = 9;
    const quiet = packShapes(names(n), BOX, even(n));
    const loud = packShapes(
      names(n),
      BOX,
      even(n).map((w, i) => (i === 4 ? 1.6 : w)),
    );

    expect(loud[4].size).toBeGreaterThan(quiet[4].size);

    // The others give up room rather than being painted over.
    const others = [0, 1, 2, 3, 5, 6, 7, 8];
    const area = (ps: Placement[]) =>
      others.reduce((t, i) => t + ps[i].size ** 2, 0);
    expect(area(loud)).toBeLessThan(area(quiet));

    // Displacement, not overlap — within the same abutting band as above.
    const mean = loud.reduce((t, p) => t + p.size, 0) / loud.length;
    expect(worstClearance(loud) / mean).toBeGreaterThan(-0.06);
  });
});

describe("organicSpots", () => {
  it.each(COUNTS)("is deterministic at %i participants", (n) => {
    expect(organicSpots(names(n), BOX, even(n))).toEqual(
      organicSpots(names(n), BOX, even(n)),
    );
  });

  it("gives a smaller group bigger shapes", () => {
    const mean = (ps: Placement[]) =>
      ps.reduce((t, p) => t + p.size, 0) / ps.length;
    expect(mean(organicSpots(names(4), BOX, even(4)))).toBeGreaterThan(
      mean(organicSpots(names(14), BOX, even(14))),
    );
  });
});

describe("splitCells", () => {
  const rect = { x: 0, y: 0, w: 960, h: 540 };

  it.each(COUNTS)("gives each of %i participants exactly one cell", (n) => {
    const cells = splitCells([...Array(n).keys()], rect, -1);
    expect(cells).toHaveLength(n);
    expect(new Set(cells.map((c) => c.i)).size).toBe(n);
  });

  it.each(COUNTS)("tiles the rectangle exactly at %i participants", (n) => {
    const cells = splitCells([...Array(n).keys()], rect, -1);
    const covered = cells.reduce((t, c) => t + c.w * c.h, 0);
    expect(covered).toBe(rect.w * rect.h);
  });

  it("gives the speaker more than the mean", () => {
    const n = 9;
    const cells = splitCells([...Array(n).keys()], rect, 4);
    const speaker = cells.find((c) => c.i === 4);
    const mean = (rect.w * rect.h) / n;
    expect(speaker).toBeDefined();
    expect(
      (speaker as (typeof cells)[number]).w *
        (speaker as (typeof cells)[number]).h,
    ).toBeGreaterThan(mean);
  });

  it("is deterministic", () => {
    expect(splitCells([0, 1, 2, 3], rect, 2)).toEqual(
      splitCells([0, 1, 2, 3], rect, 2),
    );
  });
});

describe("the room the grove leaves for a halo", () => {
  /*
   * `packShapes` may place a form within a few pixels of its box, a SPEAKING
   * form paints `HALO_ROOM_PX` past its own edge and rises further, and
   * `.inRoom` clips horizontal overflow. Packing into the whole stage
   * therefore cut most of the halo off an edge participant exactly when they
   * spoke, which is the one thing the halo is for.
   */
  it("insets the packing box on every side", () => {
    const { box, offsetX, offsetY } = groveBox(1000, 600);
    expect(box).toBe(600 - 2 * HALO_ROOM_PX);
    // Centred, so the room is there on all four sides rather than two.
    expect(offsetY).toBe(Math.round((600 - box) / 2));
    expect(offsetY).toBeGreaterThanOrEqual(HALO_ROOM_PX);
    expect(offsetX).toBe(Math.round((1000 - box) / 2));
  });

  it("is the same margin the fields divide inside", () => {
    /*
     * One function for both arrangements, because the reason is the same and
     * two copies of a margin drift apart. An edge cell in the fields is
     * otherwise half a gutter — three pixels — from the stage edge, while a
     * speaking form paints `HALO_ROOM_PX` past its tile and rises further.
     */
    const room = haloRoomFor(1000, 600);
    expect(room).toBe(HALO_ROOM_PX);
    // And the grove's box is that margin taken off both sides.
    expect(groveBox(1000, 600).box).toBe(600 - 2 * room);
  });

  it("asks a small stage for the chrome's share and no more", () => {
    expect(haloRoomFor(200, 200)).toBe(200 * HALO_ROOM_MAX_SHARE);
    expect(haloRoomFor(200, 200)).toBeLessThan(HALO_ROOM_PX);
  });

  it("asks nothing of a stage that has not measured itself", () => {
    expect(haloRoomFor(0, 0)).toBe(0);
    expect(haloRoomFor(Number.NaN, 400)).toBe(0);
  });

  it("stays square on a wide stage, so no form becomes an ellipse", () => {
    const wide = groveBox(1600, 500);
    const tall = groveBox(500, 1600);
    expect(wide.box).toBe(tall.box);
  });

  it("never gives away more of a small stage than the chrome does", () => {
    // Past the cap the margin would be eating the grove it protects, and a
    // clipped halo is the lesser loss. Same cap `shapelessFaceSide` uses.
    const small = groveBox(200, 200);
    expect(small.box).toBe(200 - 2 * Math.round(200 * HALO_ROOM_MAX_SHARE));
    expect(small.box).toBeGreaterThan(0);
  });

  it("answers a stage that has not measured itself yet", () => {
    for (const [w, h] of [
      [0, 0],
      [-10, 400],
      [Number.NaN, 400],
    ])
      expect(groveBox(w, h).box).toBeGreaterThan(0);
  });
});

describe("the Kreis at two people", () => {
  /*
   * The count `packShapes` cannot do: 31.2% of one form buried behind the
   * other, measured in the table above. A screen share takes the
   * Einzelgespräch away from a two-person call and the Kreis is what is left,
   * so this is not a corner case anybody can avoid.
   */
  const STAGE: Rect = { x: 36, y: 36, w: 888, h: 568 };
  const PAIR = ["ruhiger Fuchs 432", "naher Otter 303"];

  const overlap = (placed: Placement[]): number => {
    const [a, b] = placed;
    const dx = Math.max(a.x, b.x) - Math.min(a.x + a.size, b.x + b.size);
    const dy = Math.max(a.y, b.y) - Math.min(a.y + a.size, b.y + b.size);
    // Negative on BOTH axes is a genuine overlap of the boxes.
    return Math.max(dx, dy);
  };

  it.each([
    ["quiet", [1, 1]],
    ["one speaking", [1.6, 1]],
    ["the other speaking", [1, 1.6]],
  ] as const)("never buries one behind the other (%s)", (_name, weights) => {
    expect(overlap(pairShapes(PAIR, STAGE, weights))).toBeGreaterThan(0);
  });

  it("keeps both forms inside the rectangle it was given", () => {
    for (const spot of pairShapes(PAIR, STAGE, [1.6, 1])) {
      expect(spot.x).toBeGreaterThanOrEqual(STAGE.x);
      expect(spot.y).toBeGreaterThanOrEqual(STAGE.y);
      expect(spot.x + spot.size).toBeLessThanOrEqual(STAGE.x + STAGE.w);
      expect(spot.y + spot.size).toBeLessThanOrEqual(STAGE.y + STAGE.h);
    }
  });

  it("grows the speaker without demoting the listener", () => {
    const [speaking, listening] = pairShapes(PAIR, STAGE, [1.6, 1]);
    expect(speaking.size).toBeGreaterThan(listening.size);
    /*
     * The grove's own 1.6, not the fields' 2.6.
     *
     * `splitCells` gives a speaker 72% of the width, and a form inscribed in
     * the remaining 28% is a QUARTER of the speaker's size. Between two
     * people on a counselling stage that is not emphasis; the listener is
     * one of the two people in the conversation.
     */
    expect(listening.size).toBeGreaterThan(speaking.size * 0.45);
  });

  it("cuts the long axis, so a phone stacks them", () => {
    const tall: Rect = { x: 0, y: 0, w: 390, h: 760 };
    const [first, second] = pairShapes(PAIR, tall, [1, 1]);
    expect(second.y).toBeGreaterThan(first.y + first.size - 1);
    expect(overlap(pairShapes(PAIR, tall, [1.6, 1]))).toBeGreaterThan(0);
  });

  it("gives each person their own form, not a field", () => {
    const [fox, otter] = pairShapes(PAIR, STAGE, [1, 1]);
    // The blob is the person's, derived from their name, exactly as the
    // packing derives it — this is the grove, laid out differently.
    expect(fox.blob).not.toBe(otter.blob);
    expect(fox.blob).toMatch(/%/);
    expect(packShapes([PAIR[0]], 400, [1])[0].blob).toBe(fox.blob);
  });
});
