/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from "vitest";

import {
  EVEN_SHARE,
  MAX_SHARE,
  SEAM_EASING,
  SEAM_CAPSULE,
  SEAM_TWEEN,
  capsulePathFor,
  seamAt,
  seamFor,
  seamMiddleFor,
  shareFor,
} from "./einzelgespraech";

/*
 * SPECIFICATION — Einzelgespräch, ticket 04
 *
 * "The most common ORISO call: one advice seeker, one counsellor. A single
 * circle divided into two halves along a soft seam."
 *
 * The acceptance list is about MOTION and BALANCE rather than pixels:
 *
 *   - Silence: an even split, neither half favoured.
 *   - The speaking half's share grows past 50% and the seam bows toward the
 *     quiet side.
 *   - Turn-taking reads as one continuous motion — never a snap.
 *
 * "Neither half favoured" is the one a careless implementation breaks: it is
 * tempting to treat the counsellor, or the local participant, as the default
 * speaker. In a counselling call that would quietly give the professional
 * more room than the person who came for help.
 */

describe("shareFor", () => {
  it("splits evenly when nobody is speaking", () => {
    // Not 50.1%. In this room an unearned advantage to either side is a
    // statement, and silence is not a statement.
    expect(shareFor("none")).toBe(EVEN_SHARE);
    expect(EVEN_SHARE).toBe(0.5);
  });

  it("splits evenly when both are speaking", () => {
    expect(shareFor("both")).toBe(EVEN_SHARE);
  });

  it("gives the speaking side more than half", () => {
    expect(shareFor("first")).toBeGreaterThan(EVEN_SHARE);
    expect(shareFor("second")).toBeLessThan(EVEN_SHARE);
  });

  it("is symmetric — neither side is the favoured one", () => {
    // The counsellor is not the default. Mirror the input, mirror the
    // output exactly.
    expect(shareFor("first") + shareFor("second")).toBeCloseTo(1, 10);
  });

  it("never takes the whole circle", () => {
    // The quiet person is still in the conversation and must stay visible.
    for (const who of ["first", "second"] as const) {
      expect(shareFor(who)).toBeLessThanOrEqual(MAX_SHARE);
      expect(shareFor(who)).toBeGreaterThanOrEqual(1 - MAX_SHARE);
    }
  });
});

describe("seamFor", () => {
  it("is straight when the split is even", () => {
    expect(seamFor(EVEN_SHARE)).toBe(0);
  });

  it("bows toward the quiet side", () => {
    // The seam bulges into whoever is NOT speaking, which is what makes
    // the growth read as one body pressing against another rather than a
    // bar chart.
    expect(seamFor(0.62)).toBeGreaterThan(0);
    expect(seamFor(0.38)).toBeLessThan(0);
  });

  it("bows further the more lopsided the split", () => {
    expect(seamFor(0.62)).toBeGreaterThan(seamFor(0.55));
  });

  it("moves continuously, with no jump at the midpoint", () => {
    // Turn-taking has to read as one motion. A discontinuity here would
    // show up as a flick exactly when the turn passes.
    const step = (a: number, b: number) => Math.abs(seamFor(a) - seamFor(b));
    expect(step(0.499, 0.501)).toBeLessThan(0.02);
  });
});

describe("the transition", () => {
  it("is the easing the ticket names, and never a snap", () => {
    expect(SEAM_EASING).toContain("0.45s");
    expect(SEAM_EASING).toContain("cubic-bezier(0.2, 0, 0, 1)");
  });
});

describe("the curve the seam travels on", () => {
  /*
   * The spring's easing has to BE the CSS curve the ticket names, not
   * something that looks like it — the seam moves by a spring because no CSS
   * transition can animate the `d` of a referenced clip path, and the two
   * must not drift apart.
   *
   * These values are `cubic-bezier(0.2, 0, 0, 1)` solved by bisection on its
   * own x polynomial, not read off this implementation.
   */
  it("is cubic-bezier(0.2, 0, 0, 1), to four decimals", () => {
    expect(SEAM_EASING).toContain("cubic-bezier(0.2, 0, 0, 1)");
    for (const [t, expected] of [
      [0, 0],
      [0.25, 0.60722],
      [0.5, 0.877834],
      [0.75, 0.97548],
      [1, 1],
    ] as const)
      expect(SEAM_TWEEN.easing(t)).toBeCloseTo(expected, 4);
  });

  it("holds still outside the ride, rather than overshooting", () => {
    expect(SEAM_TWEEN.easing(-1)).toBe(0);
    expect(SEAM_TWEEN.easing(2)).toBe(1);
  });

  it("only ever moves forwards", () => {
    // A seam that went backwards mid-ease would read as a wobble.
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const value = SEAM_TWEEN.easing(i / 100);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });

  it("runs for the ticket's 450ms", () => {
    expect(SEAM_TWEEN.duration).toBe(450);
    expect(SEAM_EASING).toContain("0.45s");
  });
});

describe("the microphone capsule on a bowing seam", () => {
  /*
   * Frank, 28 Oct: a straight pill on a curved seam looks pasted on. The
   * capsule bends with the seam, whichever side it bows to, and every bar
   * turns to stay across the line it sits on.
   */
  const CIRCLE = 400;

  it("finds the seam where the clip path draws it", () => {
    for (const share of [EVEN_SHARE, MAX_SHARE, 1 - MAX_SHARE]) {
      // The clip path's quadratic runs from (share, 0) to (share, 1).
      expect(seamAt(share, 0).x).toBeCloseTo(share, 10);
      expect(seamAt(share, 1).x).toBeCloseTo(share, 10);
      expect(seamAt(share, 0.5).x).toBeCloseTo(seamMiddleFor(share), 10);
    }
  });

  it("keeps every bar level while the seam is straight", () => {
    for (const y of [0.2, 0.5, 0.8])
      expect(seamAt(EVEN_SHARE, y).angle).toBe(0);
  });

  it("turns the bars with the seam, mirrored for either speaker", () => {
    // First speaks: the seam bows right, so above the middle it leans one
    // way and below it the other; the second speaker mirrors that.
    const upper = seamAt(MAX_SHARE, 0.3).angle;
    const lower = seamAt(MAX_SHARE, 0.7).angle;
    expect(Math.abs(upper)).toBeGreaterThan(1);
    expect(lower).toBeCloseTo(-upper, 10);
    expect(seamAt(1 - MAX_SHARE, 0.3).angle).toBeCloseTo(-upper, 10);
    expect(seamAt(MAX_SHARE, 0.5).angle).toBeCloseTo(0, 10);
  });

  it("draws the capsule along the seam, bowing the same way", () => {
    const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

    const [x0, y0, cx, cy, x1, y1] = numbers(capsulePathFor(MAX_SHARE, CIRCLE));
    // The capsule's length is the design's 176px, the caps included.
    expect(y1 - y0 + SEAM_CAPSULE.width).toBeCloseTo(SEAM_CAPSULE.length, 0);
    expect(cy).toBeCloseTo(CIRCLE / 2, 6);
    // Both ends sit on the seam, and the middle bows into the quiet half.
    expect(x0).toBeCloseTo(seamAt(MAX_SHARE, y0 / CIRCLE).x * CIRCLE, 3);
    expect(x1).toBeCloseTo(x0, 6);
    expect(cx).toBeGreaterThan(x0);
    const [m0, , mcx] = numbers(capsulePathFor(1 - MAX_SHARE, CIRCLE));
    expect(mcx).toBeLessThan(m0);
  });

  it("stays a straight capsule while nobody speaks", () => {
    const [x0, , cx, , x1] = capsulePathFor(EVEN_SHARE, CIRCLE)
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    expect(cx).toBeCloseTo(x0, 6);
    expect(x1).toBeCloseTo(x0, 6);
  });

  it("shrinks with a small circle, and draws nothing without one", () => {
    const [, y0, , , , y1] = capsulePathFor(EVEN_SHARE, 200)
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    expect(y1 - y0 + SEAM_CAPSULE.width).toBeCloseTo(200 * 0.63, 0);
    expect(capsulePathFor(EVEN_SHARE, 0)).toBe("");
  });
});
