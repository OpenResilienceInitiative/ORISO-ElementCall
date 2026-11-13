/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  coverScale,
  nameSideFor,
  splitName,
  NAME_CAPSULE_HALF,
  NAME_CAPSULE_HALF_PHONE,
  NAME_TAIL_CHARS,
  SHARE_RADIUS,
  rectangularStage,
} from "./shape";

describe("cutting a name that does not fit", () => {
  it("keeps the number that tells two foxes apart", () => {
    // A plain ellipsis gives "naher O…", which removes the one part of a
    // pseudonym that identifies anybody.
    const { head, tail } = splitName("naher Otter 303");
    expect(head + tail).toBe("naher Otter 303");
    expect(tail).toBe(" 303");
  });

  it("protects exactly the tail it promises", () => {
    expect(splitName("ruhiger Fuchs 432").tail).toHaveLength(NAME_TAIL_CHARS);
  });

  it("never cuts a letter in half", () => {
    /*
     * The two pieces are rendered in separate spans, so a cut between the
     * halves of a surrogate pair comes out as two replacement glyphs. A
     * pseudonym is somebody's name here, and mangling it is not cosmetic.
     *
     * `\u{1D49C}` is a supplementary-plane letter: one code point, two
     * UTF-16 units. Fourth from the end, a UTF-16 slice splits it.
     */
    const name = "Fuchs \u{1D49C} 43";
    const { head, tail } = splitName(name);
    expect(head + tail).toBe(name);
    expect(head).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(tail).not.toMatch(/^[\uDC00-\uDFFF]/);
    // Four code points of tail, which is what `NAME_TAIL_CHARS` promises.
    expect([...tail]).toHaveLength(NAME_TAIL_CHARS);
  });

  it("leaves a short name whole, with nothing to protect", () => {
    expect(splitName("Mika")).toEqual({ head: "Mika", tail: "" });
    expect(splitName("Ida")).toEqual({ head: "Ida", tail: "" });
  });

  it("never loses or invents a character", () => {
    for (const name of [
      "a",
      "ab",
      "abcde",
      "ruhiger Fuchs 432",
      "   padded   ",
      "Übergroße Nachtigall 7",
    ]) {
      const { head, tail } = splitName(name);
      expect(head + tail).toBe(name.trim());
    }
  });
});

describe("covering a leaning frame", () => {
  it("needs no growth when the form is upright", () => {
    expect(coverScale(0)).toBe(1);
  });

  it("grows by cos + sin, which is what a rotated square needs", () => {
    // 11 degrees is the design's widest lean. Without this a camera shows
    // four wedges of background in the corners.
    expect(coverScale(11)).toBeCloseTo(
      Math.cos((11 * Math.PI) / 180) + Math.sin((11 * Math.PI) / 180),
      10,
    );
  });

  it("does not care which way the form leans", () => {
    expect(coverScale(-7.3)).toBeCloseTo(coverScale(7.3), 10);
  });
});

describe("where a form hangs its name", () => {
  it("centres the capsule where it fits between the form and both edges", () => {
    expect(nameSideFor(400, 100, 1000)).toBe("centre");
  });

  it("hangs it inward near either edge, so it does not run off the stage", () => {
    expect(nameSideFor(0, 100, 1000)).toBe("start");
    expect(nameSideFor(900, 100, 1000)).toBe("end");
    // Exactly at the edge still fits.
    expect(nameSideFor(NAME_CAPSULE_HALF - 50, 100, 1000)).toBe("centre");
  });

  it("allows for a phone's shorter capsule", () => {
    // The 5b circle: a 61px form at x 66 on a 375px stage.
    expect(nameSideFor(66, 61, 375)).toBe("start");
    expect(nameSideFor(66, 61, 375, true)).toBe("centre");
    expect(nameSideFor(375 - NAME_CAPSULE_HALF_PHONE - 31, 62, 375, true)).toBe(
      "centre",
    );
  });
});

describe("the spotlight's forms (#2233)", () => {
  it("draws people as rounded rectangles in every spotlight layout", () => {
    for (const type of [
      "spotlight-landscape",
      "spotlight-portrait",
      "spotlight-expanded",
    ])
      expect(rectangularStage(type, false)).toBe(true);
  });

  it("keeps the one-to-one video stage's rectangles", () => {
    expect(rectangularStage("one-on-one", true)).toBe(true);
  });

  it("leaves the grove, the Einzelgespräch and the minimised call alone", () => {
    for (const type of ["grid", "one-on-one", "pip"])
      expect(rectangularStage(type, false)).toBe(false);
  });

  it("gives a shared screen the design's slight 24px corner", () => {
    expect(SHARE_RADIUS).toBe("var(--cpd-space-6x)");
  });
});
