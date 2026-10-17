/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The shared screen stays inside the window — asserted against the
 * stylesheet, because nothing else here can see it.
 *
 * 404x233 is upstream's size for this slot and it is right on a desktop.
 * Upstream's grid can hard-code it because its narrow branch hands a screen
 * share to the portrait spotlight instead; this layout holds at every width
 * except picture-in-picture, so on a 320-390px phone a fixed 404px slot plus
 * its inset overflowed — and `.inRoom` hides horizontal overflow, so the
 * shared content was cut off rather than scrollable.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Comments are stripped first: this rule's comment names the number it
// replaced, which a naive parse would read as part of the declaration.
const css = readFileSync(
  "src/grid/OrisoGroveLayout.module.css",
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const bodyOf = (selector: string): string => {
  const match = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^{}]*)\\}`,
  ).exec(css);
  return match?.[1] ?? "";
};

describe("the scrolling fields sheet", () => {
  /*
   * The halo padding has to come OUT of the sheet's width.
   *
   * With content-box sizing, `inline-size: 100%` plus that padding made the
   * sheet `parent + 2 * room` wide: the centred rows shifted right and
   * `.inRoom` clipped the overflow, so at a width where a row nearly fills
   * the box the rightmost field — or the very halo the padding was added to
   * protect — was cut off.
   */
  it("keeps its halo padding inside its own width", () => {
    const body = bodyOf(".sheet");
    expect(body).toMatch(/inline-size:\s*100%/);
    expect(body).toMatch(/padding:/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
  });
});

describe("the fixed screen-share slot", () => {
  it("never asks for more width than the stage has", () => {
    const body = bodyOf(".fixed > .slot");
    expect(body).toMatch(/inline-size:\s*min\(/);
    expect(body).toMatch(/100%/);
    // A hard 404px inline size is what overflowed a phone.
    expect(body).not.toMatch(/inline-size:\s*404px/);
  });

  it("keeps the proportions it had", () => {
    // Clamping the width must not squash the shared screen.
    expect(bodyOf(".fixed > .slot")).toMatch(/aspect-ratio:\s*404\s*\/\s*233/);
  });
});
