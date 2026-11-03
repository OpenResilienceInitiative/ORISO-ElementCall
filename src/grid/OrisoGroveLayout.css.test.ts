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

import {
  SPOTLIGHT_ASPECT_RATIO,
  SPOTLIGHT_INLINE_INSET_PX,
  SPOTLIGHT_MAX_INLINE_PX,
} from "../oriso/spotlightRoom";

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

/**
 * The four sides of a `padding` shorthand, in CSS order.
 *
 * `var(--x)` holds no whitespace of its own, so splitting on it is enough
 * here — and the shorthand's fill-in rules are the whole point: a third
 * value is the BLOCK-END, which is the edge this sheet scrolls to.
 */
const paddingSides = (body: string): string[] => {
  const value = /padding:\s*([^;]+)/.exec(body)?.[1] ?? "";
  const [top, right = top, bottom = top, left = right] = value
    .split(/\s+/)
    .filter(Boolean);
  return [top, right, bottom, left];
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

  it("does not scroll on its own, because the tiles are not inside it", () => {
    /*
     * `Grid` puts the layout's slots and the visible `TileWrapper`s side by
     * side and positions the tiles from `offsetTop`, which a box scrolling
     * inside does not change. A scroll container here moved the measurement
     * slots and left the faces behind. Upstream's `.scrolling` has no
     * overflow either; the ancestor `.inRoom` is the one that scrolls.
     */
    expect(bodyOf(".sheet")).not.toMatch(/overflow/);
  });

  it("asks for a minimum height rather than a fixed one", () => {
    /*
     * The padding above only does its job inside a box that reaches the last
     * row. A fixed `block-size: 100%` says "one screenful" whatever the sheet
     * holds, and this sheet exists only for the counts that need more than
     * one: that it still grew in Chromium is an ancestor's automatic minimum
     * size doing the work (measured — `docs/evidence/scrollport`), which one
     * `min-height: 0` added upstairs for an unrelated reason would take away.
     * The floor belongs in the rule.
     */
    const body = bodyOf(".sheet");
    expect(body).toMatch(/min-block-size:\s*100%/);
    expect(body).not.toMatch(/(?<!min-)block-size:\s*100%/);
  });

  it("reserves that room on the edge it scrolls to, as well", () => {
    /*
     * The block-end is the edge where this stops being cosmetic.
     *
     * The first version wrote the field gutter as the shorthand's third
     * value, so above eight people — the only case this sheet exists for —
     * a form speaking in the last row had its shadow clipped at maximum
     * scroll, with nowhere further to scroll to. The other three sides were
     * the halo's room already, which is why it looked right.
     */
    const sides = paddingSides(bodyOf(".sheet"));
    expect(sides).toHaveLength(4);
    for (const side of sides) expect(side).toBe("var(--oriso-halo-room)");
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

  /*
   * The two copies of this box's size, held to each other.
   *
   * `spotlightRoom.ts` reserves the band the forms must keep clear, and it
   * cannot read this stylesheet — nor measure the box, because the box's
   * position depends on the very calculation that would be doing the
   * measuring. So it carries the numbers a second time, and the only thing
   * stopping the two from drifting is this test: change the slot's width,
   * its inset or its ratio here and the band goes wrong silently, which
   * shows up as the overlap this was built to remove.
   */
  it("is the box `spotlightRoom.ts` reserves room for", () => {
    const body = bodyOf(".fixed > .slot");
    expect(body).toContain(`min(${SPOTLIGHT_MAX_INLINE_PX}px`);
    expect(SPOTLIGHT_ASPECT_RATIO).toBe(404 / 233);
    // `--cpd-space-3x`, which the slot is inset by on both inline sides.
    expect(body).toMatch(/inset-inline:\s*var\(--cpd-space-3x\)/);
    expect(SPOTLIGHT_INLINE_INSET_PX).toBe(12);
  });
});

describe("the scrolling sheet, while a screen is shared", () => {
  /*
   * This branch has no rectangle to take the band out of — it is a flex wrap
   * that scrolls — so the room is added as padding on the edge the box is
   * pinned to. The halo's own room has to survive underneath it: these are
   * the same four sides the shorthand sets, and a longhand that replaced
   * rather than added would clip a speaking form in the first or last row.
   */
  it("adds the band to the halo's room rather than replacing it", () => {
    const body = bodyOf(".sheet");
    for (const edge of ["start", "end"]) {
      // Up to the semicolon: `[^)]*` inside the `calc()` stopped at the
      // first `)`, which belongs to the `var()` this is looking for.
      const rule = new RegExp(`padding-block-${edge}:([^;]*);`).exec(body)?.[1];
      expect(rule).toBeDefined();
      expect(rule).toContain("calc(");
      expect(rule).toContain("var(--oriso-halo-room)");
      expect(rule).toContain(`var(--oriso-spotlight-room-${edge}, 0px)`);
    }
  });

  it("reserves nothing when the layout sets no band", () => {
    // The fallback in the `var()` is what keeps a call with no shared screen
    // on the whole stage; without it the sheet would lose the padding
    // entirely and the halo room with it.
    expect(bodyOf(".sheet")).toContain("--oriso-spotlight-room-start, 0px");
  });
});
