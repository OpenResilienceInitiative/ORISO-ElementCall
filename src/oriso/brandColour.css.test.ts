/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The call's brand colour has one source: `--oriso-primary` and
 * `--oriso-primary-hover`, generated from the seeds in the call address (see
 * src/oriso/theme). A literal ORISO red in a stylesheet does not follow a
 * Träger's colour, so it would stay red in a green call. Asserted against the
 * stylesheets: jsdom paints nothing.
 *
 * The only place a literal may stand is the fallback of a variable that
 * follows the brand, for the moment before the generated set is there:
 * `var(--oriso-primary, #a5000a)`.
 * `src/oriso-theme.css` is the generated default itself and is skipped, and
 * so are fixtures copied from the app.
 * (`pond.js`, the backdrop presets, is not CSS and a separate decision.)
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STRIP_COMMENTS = /\/\*[\s\S]*?\*\//g;

/**
 * Variables that follow the brand, so a literal as their fallback is never
 * what gets drawn. `--oriso-*` is the generated pair; the others are the
 * Compound role the generator fills and the local aliases of it that the
 * notes panel and the chat menu use (ORISO-ElementCall#132).
 */
const FOLLOWS_BRAND = {
  "#a5000a": [
    "--oriso-primary",
    "--m3-primary",
    "--cpd-color-bg-action-primary-rest",
  ],
  "#820006": [
    "--oriso-primary-hover",
    "--m3-primary-hover",
    "--cpd-color-bg-action-primary-hovered",
  ],
};

const ALLOWED_FALLBACK = new RegExp(
  Object.entries(FOLLOWS_BRAND)
    .flatMap(([literal, names]) =>
      names.map((name) => `var\\(\\s*${name}\\s*,\\s*${literal}\\s*\\)`),
    )
    .join("|"),
  "gi",
);

const LITERAL_RED = /#a5000a|#820006|rgba?\(\s*165[\s,]+0[\s,]+10\s*[\s,/)]/gi;

/** Literal brand reds left in a stylesheet once the allowed fallbacks are out. */
const brandLiterals = (css: string): string[] =>
  css
    .replace(STRIP_COMMENTS, "")
    .replace(ALLOWED_FALLBACK, "")
    .match(LITERAL_RED) ?? [];

const stylesheets = (readdirSync("src", { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".css") &&
      file !== "oriso-theme.css" &&
      !file.includes("__fixtures__"),
  )
  .map((file) => `src/${file}`);

describe("the guard itself", () => {
  it("flags a bare brand red", () => {
    expect(brandLiterals(".a { background: #a5000a; }")).toHaveLength(1);
    expect(brandLiterals(".a { background: #A5000A; }")).toHaveLength(1);
    expect(brandLiterals(".a { color: #820006; }")).toHaveLength(1);
  });

  it("flags the rgb forms of it, with a space, commas or an alpha", () => {
    expect(brandLiterals("a { b: rgb(165 0 10 / 44%); }")).toHaveLength(1);
    expect(brandLiterals("a { b: rgb(165, 0, 10); }")).toHaveLength(1);
    expect(brandLiterals("a { b: rgba(165,0,10,0.4); }")).toHaveLength(1);
  });

  it("lets the variable's own fallback stand", () => {
    expect(brandLiterals("a { b: var(--oriso-primary, #a5000a); }")).toEqual(
      [],
    );
    expect(
      brandLiterals("a { b: var(--oriso-primary-hover, #820006); }"),
    ).toEqual([]);
    expect(
      brandLiterals(
        "a { b: color-mix(in srgb, var(--oriso-primary, #a5000a) 44%, transparent); }",
      ),
    ).toEqual([]);
  });

  it("lets the fallback of the other brand-following variables stand", () => {
    expect(
      brandLiterals(
        "a { --m3-primary: var(--cpd-color-bg-action-primary-rest, #a5000a); }",
      ),
    ).toEqual([]);
    expect(brandLiterals("a { b: var(--m3-primary-hover, #820006); }")).toEqual(
      [],
    );
  });

  it("does not take a fallback for a variable that does not follow the brand", () => {
    expect(brandLiterals("a { b: var(--other, #a5000a); }")).toHaveLength(1);
    // The hover red is not the primary's fallback, and the other way round.
    expect(
      brandLiterals("a { b: var(--oriso-primary, #820006); }"),
    ).toHaveLength(1);
  });

  it("ignores a comment that names the colour", () => {
    expect(brandLiterals("/* the default is #a5000a */ a { b: red; }")).toEqual(
      [],
    );
  });

  it("does not mistake other colours for it", () => {
    expect(brandLiterals("a { b: rgb(165 100 10); c: #a5000b; }")).toEqual([]);
  });
});

describe("the call's stylesheets", () => {
  it("are found", () => {
    expect(stylesheets.length).toBeGreaterThan(20);
    expect(stylesheets).toContain("src/oriso/OrisoNotes.module.css");
    expect(stylesheets).not.toContain("src/oriso-theme.css");
  });

  it.each(stylesheets)(
    "%s has no literal brand red outside the fallback",
    (file) => {
      expect(brandLiterals(readFileSync(file, "utf8")), file).toEqual([]);
    },
  );

  it("do not fix the brand variable to a value in the call itself", () => {
    const callView = readFileSync(
      "src/room/InCallView.module.css",
      "utf8",
    ).replace(STRIP_COMMENTS, "");
    expect(callView).not.toMatch(/--oriso-primary(?:-hover)?\s*:/);
  });
});
