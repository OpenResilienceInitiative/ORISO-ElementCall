/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The call note's card, asserted against the stylesheet: jsdom lays nothing
 * out, so it cannot see what gets clipped.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/oriso/OrisoNotes.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const rule = (selector: string): string =>
  new RegExp(`(?:^|\\})\\s*\\.${selector}\\s*\\{([^{}]*)\\}`).exec(css)?.[1] ??
  "";

describe("the call note's card (#112)", () => {
  it("lets the type menu reach past an empty card", () => {
    // An empty card in the view is only header and field high; the ⋮ menu
    // opens upward from the field and must not be cut off at the card.
    expect(rule("card")).not.toMatch(/overflow\s*:\s*hidden/);
    // The list scrolls on its own, so long notes still stay inside.
    expect(rule("list")).toMatch(/overflow\s*:\s*auto/);
  });

  it("stays below the control bar, so the call menu opens over it", () => {
    // The card comes after the footer in the DOM; on the toolbar's own level
    // it would paint over the ⋮ menu that opens upward from the bar.
    expect(rule("card")).toMatch(/z-index\s*:\s*var\(--oriso-z-notes/);
    const scale = readFileSync("src/room/InCallView.module.css", "utf8");
    const level = (name: string): number =>
      Number(new RegExp(`--oriso-z-${name}:\\s*(\\d+)`).exec(scale)?.[1]);
    expect(level("notes")).toBeGreaterThan(level("names"));
    expect(level("notes")).toBeLessThan(level("toolbar"));
  });
});
