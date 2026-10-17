/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { coverScale, splitName, NAME_TAIL_CHARS } from "./shape";

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
