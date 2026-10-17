/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  AVATAR_COLORS,
  contrastRatio,
  fallbackIdentity,
  iconCandidates,
  initialsOf,
  pickIconColor,
  readIdentity,
  recolorSvg,
} from "./identity";

describe("the palette, as the other repo pins it", () => {
  it("carries all 52 curated colours", () => {
    expect(AVATAR_COLORS).toHaveLength(52);
    expect(new Set(AVATAR_COLORS).size).toBe(52);
  });

  it("offers every colour an ink that clears WCAG AA for graphics", () => {
    // This is the whole promise of the palette: muddy mid-tones where neither
    // near-black nor white is crisp were excluded on purpose. If a colour is
    // ever added that fails this, the animal on it stops being legible.
    for (const bg of AVATAR_COLORS) {
      expect(contrastRatio(bg, pickIconColor(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never offers an ink that fails against its own background", () => {
    for (const bg of AVATAR_COLORS) {
      for (const ink of iconCandidates(bg)) {
        expect(contrastRatio(bg, ink)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("agrees with the reference ratios", () => {
    // Three fixed points, so a "tidy-up" of the luminance maths shows up here
    // rather than in a screenshot six months later.
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Both from an implementation written separately from this one, not from
    // this one's output: JP Ai with white on it, JP Sakura with near-black.
    expect(contrastRatio("#165E83", "#ffffff")).toBeCloseTo(7.087567, 5);
    expect(contrastRatio("#FCE7E6", "#1a1a1a")).toBeCloseTo(14.679381, 5);
  });
});

describe("reading an identity off the wire", () => {
  const sound = {
    kind: "animal",
    file: "fox.svg",
    bg: "#165E83",
    ink: "#ffffff",
  };

  it("accepts a well-formed record", () => {
    expect(readIdentity(sound)).toEqual(sound);
  });

  it("accepts a motif, which is the counsellor's chosen one", () => {
    expect(readIdentity({ ...sound, kind: "motif" })?.kind).toBe("motif");
  });

  it("takes the letters it is given, without re-deriving them", () => {
    /*
     * The host sends initials it has already worked out from name parts
     * this side cannot see. An earlier version ran them back through
     * `initialsOf`, which reads "SP" as one word and returns "S" — the
     * counsellor lost a letter. Only the cross-repository contract test saw
     * it; this one agreed with the bug.
     */
    expect(
      readIdentity({
        kind: "initials",
        bg: "#FCE7E6",
        ink: "#1a1a1a",
        initials: "SP",
      }),
    ).toEqual({
      kind: "initials",
      bg: "#FCE7E6",
      ink: "#1a1a1a",
      initials: "SP",
    });
  });

  it("trims and upper-cases whatever it is given", () => {
    expect(
      readIdentity({
        kind: "initials",
        bg: "#FCE7E6",
        ink: "#1a1a1a",
        initials: "s. p. q. r.",
      })?.initials,
    ).toBe("SP");
  });

  it("refuses a record that says initials and carries none", () => {
    /*
     * An identity with no letters in it draws an empty coloured circle, which
     * looks like a person whose name failed to load rather than like a person
     * nobody published anything for. `null` means "we were not told", and the
     * tile then takes the letters from the display name it already has.
     */
    for (const initials of ["", "   ", "...", undefined])
      expect(
        readIdentity({
          kind: "initials",
          bg: "#FCE7E6",
          ink: "#1a1a1a",
          initials,
        }),
      ).toBeNull();
  });

  it.each([
    ["nothing at all", null],
    ["a string", "fox"],
    ["an unknown kind", { ...sound, kind: "hologram" }],
    ["a missing colour", { kind: "animal", file: "fox.svg", ink: "#fff" }],
    ["a colour that is not one", { ...sound, bg: "red" }],
    ["an ink that is not one", { ...sound, ink: "white" }],
    ["a missing file", { kind: "animal", bg: "#165E83", ink: "#ffffff" }],
  ])("refuses %s", (_what, content) => {
    expect(readIdentity(content)).toBeNull();
  });

  it.each([
    "../../../etc/passwd.svg",
    "/absolute.svg",
    "a/b.svg",
    "fox.svg?x=1",
    "http://elsewhere.invalid/fox.svg",
    "fox.png",
    "fox",
    "",
  ])("refuses the file name %o", (file) => {
    // The file name is joined onto a URL and fetched. A record from another
    // client must not be able to aim that fetch anywhere it likes.
    expect(readIdentity({ ...sound, file })).toBeNull();
  });
});

describe("initials", () => {
  it("takes the animal and the given name, not the adjective", () => {
    // "freundliche Katze Mika" is three words; "FK" would give every cat the
    // same mark, so the last two words are the useful pair.
    expect(initialsOf("freundliche Katze Mika")).toBe("KM");
  });

  it("copes with one word", () => {
    expect(initialsOf("Mika")).toBe("M");
  });

  it("copes with punctuation and double spaces", () => {
    expect(initialsOf("Susanne  P.")).toBe("SP");
  });

  it("copes with letters outside ASCII", () => {
    expect(initialsOf("Über Ärztin")).toBe("ÜÄ");
  });

  it("is empty for a name that is only punctuation", () => {
    expect(initialsOf("--- ...")).toBe("");
  });
});

describe("the fallback for somebody who published nothing", () => {
  it("is initials, never an invented animal", () => {
    const identity = fallbackIdentity("@abc:oriso.test", "ruhiger Fuchs Jonas");
    expect(identity.kind).toBe("initials");
    expect(identity.file).toBeUndefined();
    expect(identity.initials).toBe("FJ");
  });

  it("is stable for the same user", () => {
    expect(fallbackIdentity("@abc:oriso.test", "A B")).toEqual(
      fallbackIdentity("@abc:oriso.test", "A B"),
    );
  });

  it("takes its colour from the palette and an ink that passes on it", () => {
    for (const id of ["@a:x", "@bb:x", "@ccc:x", "@dddd:x", "@eeeee:x"]) {
      const identity = fallbackIdentity(id, "Katze Mika");
      expect(AVATAR_COLORS).toContain(identity.bg);
      expect(contrastRatio(identity.bg, identity.ink)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("falls back to the user id when there is no display name", () => {
    expect(fallbackIdentity("@jonas:oriso.test", "").initials).toBe("J");
  });
});

describe("recolouring the inherited artwork", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
    '<path d="M0 0h10v10H0z"/>' +
    '<circle cx="5" cy="5" r="2" fill="#ffffff"/>' +
    '<rect x="1" y="1" width="2" height="2" fill="none" stroke="#000"/>' +
    "</svg>";

  it("paints the artwork in the inherited ink", () => {
    expect(recolorSvg(svg, "#ff0000")).toContain('fill="#ff0000"');
  });

  it("leaves white and none alone, so highlights stay light", () => {
    const out = recolorSvg(svg, "#ff0000");
    expect(out).toContain('fill="#ffffff"');
    expect(out).toContain('fill="none"');
  });

  it("recolours a stroke that is not a highlight", () => {
    expect(recolorSvg(svg, "#ff0000")).toContain('stroke="#ff0000"');
  });

  it("makes the artwork fill whatever box it is put in", () => {
    const out = recolorSvg(svg, "#ff0000");
    expect(out).toContain('width="100%"');
    expect(out).toContain('height="100%"');
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"');
  });
});

it("keeps the letters to two even when upper-casing grows them", () => {
  /*
   * `ﬃ` upper-cases to `FFI` and `ß` to `SS`, so cutting the string before
   * upper-casing it returned three characters from a field that promises one
   * or two — enough to overflow the letters drawn on the form.
   */
  const base = { kind: "initials", bg: "#165E83", ink: "#ffffff" } as const;
  expect(readIdentity({ ...base, initials: "\uFB03" })?.initials).toBe("FF");
  expect(readIdentity({ ...base, initials: "\u00DFa" })?.initials).toBe("SS");
  // And the ordinary case is untouched.
  expect(readIdentity({ ...base, initials: "sp" })?.initials).toBe("SP");
});
