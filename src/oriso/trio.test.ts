/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { type Placement, ownShape, packShapes } from "./layout";
import { trioShapes } from "./trio";

const NAMES = [
  "ruhiger Fuchs 432",
  "Susanne P. · Beraterin",
  "wacher Igel 118",
];
const BOX = 612;

const clearance = (a: Placement, b: Placement): number =>
  Math.hypot(
    a.x + a.size / 2 - (b.x + b.size / 2),
    a.y + a.size / 2 - (b.y + b.size / 2),
  ) -
  (a.size + b.size) / 2;

const worst = (placed: readonly Placement[]): number =>
  Math.min(
    clearance(placed[0], placed[1]),
    clearance(placed[0], placed[2]),
    clearance(placed[1], placed[2]),
  );

const mean = (placed: readonly Placement[]): number =>
  placed.reduce((t, p) => t + p.size, 0) / placed.length;

describe("the Hain at three (T4)", () => {
  it.each([
    ["nobody speaks", [1, 1, 1]],
    ["one speaks", [1.6, 1, 1]],
    ["another speaks", [1, 1, 1.6]],
  ])("lets three forms abut without burying one (%s)", (_, weights) => {
    const placed = trioShapes(NAMES, BOX, weights);
    // The prototype's own band for "abutting": its 0.99 negative padding.
    expect(worst(placed) / mean(placed)).toBeGreaterThan(-0.02);
    // And they do touch: a group standing together, not three islands.
    expect(worst(placed) / mean(placed)).toBeLessThan(0.02);
  });

  it("does better than the packing it replaces at three", () => {
    // `packShapes` buries 14.3% of a form at three (pinned in layout.test.ts).
    const packed = packShapes(NAMES, BOX, [1, 1, 1]);
    expect(worst(packed) / mean(packed)).toBeLessThan(-0.1);
    const trio = trioShapes(NAMES, BOX, [1, 1, 1]);
    expect(worst(trio)).toBeGreaterThan(worst(packed));
  });

  it("stays inside its box and fills it", () => {
    for (const weights of [
      [1, 1, 1],
      [1.6, 1, 1],
      [1, 1.6, 1],
    ]) {
      const placed = trioShapes(NAMES, BOX, weights);
      const left = Math.min(...placed.map((p) => p.x));
      const top = Math.min(...placed.map((p) => p.y));
      const right = Math.max(...placed.map((p) => p.x + p.size));
      const bottom = Math.max(...placed.map((p) => p.y + p.size));
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(BOX);
      expect(bottom).toBeLessThanOrEqual(BOX);
      // Fills it along its longer side, and is centred in it.
      expect(Math.max(right - left, bottom - top)).toBeGreaterThan(BOX * 0.96);
      expect(Math.abs(left - (BOX - right))).toBeLessThanOrEqual(2);
      expect(Math.abs(top - (BOX - bottom))).toBeLessThanOrEqual(2);
    }
  });

  it("makes whoever speaks the biggest form, and keeps everybody's own shape", () => {
    const placed = trioShapes(NAMES, BOX, [1, 1.6, 1]);
    expect(placed[1].size).toBeGreaterThan(placed[0].size);
    expect(placed[1].size).toBeGreaterThan(placed[2].size);
    placed.forEach((p, i) => {
      expect(p.blob).toBe(ownShape(NAMES[i]).blob);
      expect(p.tilt).toBe(ownShape(NAMES[i]).tilt);
    });
  });

  it("is the same room on every client", () => {
    expect(trioShapes(NAMES, BOX, [1, 1.6, 1])).toEqual(
      trioShapes(NAMES, BOX, [1, 1.6, 1]),
    );
  });

  it("keeps everybody in their corner when the turn passes on", () => {
    // The orientation is the names', not the speaker's: the three do not
    // swap corners mid-sentence, they only grow and give way.
    const directions = (placed: Placement[]): number[] => {
      const cs = placed.map((p) => [p.x + p.size / 2, p.y + p.size / 2]);
      const mx = (cs[0][0] + cs[1][0] + cs[2][0]) / 3;
      const my = (cs[0][1] + cs[1][1] + cs[2][1]) / 3;
      return cs.map(([x, y]) => Math.atan2(y - my, x - mx));
    };
    const quiet = directions(trioShapes(NAMES, BOX, [1, 1, 1]));
    for (const weights of [
      [1.6, 1, 1],
      [1, 1.6, 1],
      [1, 1, 1.6],
    ]) {
      const loud = directions(trioShapes(NAMES, BOX, weights));
      for (let i = 0; i < 3; i++) {
        const turned = Math.abs(
          Math.atan2(
            Math.sin(loud[i] - quiet[i]),
            Math.cos(loud[i] - quiet[i]),
          ),
        );
        expect(turned).toBeLessThan(Math.PI / 6);
      }
    }
  });
});
