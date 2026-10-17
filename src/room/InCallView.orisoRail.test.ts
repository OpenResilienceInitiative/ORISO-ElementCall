/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The view rail survives a phone — checked against the stylesheet itself.
 *
 * This reads CSS text, which is not how one would normally test a component.
 * It is here because the bug it pins was invisible to every other kind of
 * test in this repository: `@media (max-width: 660px) { .layout { display:
 * none !important } }` hid the whole ORISO rail on a portrait phone, and the
 * rendering tests could not see it because jsdom applies no media queries and
 * stubs CSS-module class names to opaque strings. The browser harness cannot
 * see it either: it mounts `ViewSwitcher` on its own rather than inside
 * `InCallView`'s footer.
 *
 * So the invariant is asserted where it actually lives. The handoff draws
 * every arrangement at phone size — `Hain-Handy`, `Felder-Handy`,
 * `Einzel-handy` — so a phone must be able to choose one.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from the repository root: vitest runs there, and `import.meta.url`
// is not a file URL once Vite has transformed this module.
// Comments are stripped first: these rules document the selectors they
// REPLACED, so a naive parse reads "`> *` was wrong here" as part of a
// selector and the assertions below fail on their own prose.
const css = readFileSync("src/room/InCallView.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Every rule whose selector mentions the given class. */
function rulesFor(className: string): string[] {
  const rules: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    if (match[1].includes(`.${className}`)) rules.push(match[2]);
  }
  return rules;
}

describe("the ORISO view rail on a narrow screen", () => {
  it("is not the same class as upstream's layout toggle", () => {
    // The toggle is hidden below 660px on purpose — a two-way grid/spotlight
    // switch is not worth the width. Sharing the class took the ORISO rail
    // with it.
    expect(css).toContain(".orisoLayout");
    const hidden = rulesFor("layout").filter((body) =>
      /display:\s*none/.test(body),
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("is never hidden", () => {
    const rules = rulesFor("orisoLayout");
    // Without this the loop below would pass by having nothing to check,
    // which is exactly the state the bug was in.
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      expect(body).not.toMatch(/display:\s*none/);
    }
  });

  it("is given a place to sit when the footer reflows", () => {
    /*
     * Below 660px the footer's areas become `". buttons buttons buttons ."`,
     * which has no `layout` column at all — so a rail left in `grid-area:
     * layout` would be auto-placed into whatever was free. The ORISO footer
     * declares its own row instead, because at 390px the call buttons
     * already fill two thirds of theirs.
     */
    const narrow = css.slice(css.indexOf("@media (max-width: 660px)"));
    expect(narrow).toContain("orisoFooter");
    expect(narrow).toMatch(/grid-template-areas:[^;]*oriso/);
    expect(
      rulesFor("orisoLayout").some((body) => /grid-area:\s*oriso/.test(body)),
    ).toBe(true);
  });
});
