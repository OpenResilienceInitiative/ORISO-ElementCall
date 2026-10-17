/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  HALO_LIFT_PX,
  HALO_ROOM_PX,
  haloFor,
  QUIET_SHADOW,
  shapelessFaceSide,
  tint,
} from "./halo";

/*
 * SPECIFICATION — how speaking looks in the Hain
 *
 * The prototype states both states outright, and states the intent in a
 * comment beside them:
 *
 *   "The halo takes the person's own colour, so speaking reads as
 *    'she lights up' rather than 'the system marked her red'."
 *
 * That sentence is the whole design, and it is the one thing a future
 * refactor is most likely to break — a shared accent colour is the obvious
 * simplification, and it is exactly wrong. So the test asserts the halo is
 * built from the participant's own background and from nothing else.
 */

describe("tint", () => {
  it("turns a palette hex into the same colour at an alpha", () => {
    expect(tint("#FCE7E6", 0.5)).toBe("rgba(252, 231, 230, 0.5)");
  });

  it("takes short hex too, because palettes are written both ways", () => {
    expect(tint("#1F3", 0.18)).toBe("rgba(17, 255, 51, 0.18)");
  });

  it("passes a colour it cannot parse straight through", () => {
    // A palette entry that is already `rgb()` or a CSS keyword should not
    // become `rgba(NaN, NaN, NaN)`.
    expect(tint("rebeccapurple", 0.5)).toBe("rebeccapurple");
  });
});

describe("haloFor", () => {
  it("is quiet and flat when nobody is speaking", () => {
    expect(haloFor("#FCE7E6", false)).toBe(QUIET_SHADOW);
  });

  it("lights up in the speaker's OWN colour, never a system accent", () => {
    const halo = haloFor("#FCE7E6", true);
    // Both coloured layers are the person's background.
    expect(halo).toContain("rgba(252, 231, 230, 0.18)");
    expect(halo).toContain("rgba(252, 231, 230, 0.5)");
    // And no ORISO red anywhere in it.
    expect(halo).not.toContain("165, 0, 10");
    expect(halo.toLowerCase()).not.toContain("#a5000a");
  });

  it("gives two different people two different halos", () => {
    expect(haloFor("#FCE7E6", true)).not.toBe(haloFor("#D6E9CA", true));
  });

  it("carries the deeper drop shadow that makes the shape sit forward", () => {
    expect(haloFor("#FCE7E6", true)).toContain(
      "0 22px 38px -10px rgba(0, 0, 0, 0.24)",
    );
  });

  it("lifts the speaking shape by the handoff four pixels", () => {
    expect(HALO_LIFT_PX).toBe(4);
  });
});

/*
 * The room the halo needs, and why anything depends on it.
 *
 * A halo is an OUTER shadow, and every box the design puts a form in clips:
 * `SpotlightTile`'s `.contents` carries `contain: strict` together with
 * `overflow-y: hidden`, and `Grid` carries `contain: strict`. A form sized to
 * the full shorter side of its tile touches those edges, so the halo was cut
 * along them — on both short edges of a landscape spotlight and on all four
 * of a square one, which is most of what speaking looks like.
 *
 * These tests do not re-measure the shadow; they pin the relationship, which
 * is the thing that can rot. The room is computed from the same numbers the
 * halo string is built from, so a change to the glow has to show up here.
 */
describe("the room a halo needs outside the form", () => {
  /**
   * How far each layer of a shadow string paints past its box.
   *
   * `max(|x|, |y|) + blur / 2 + spread`, per layer. A blur transition is
   * centred on the shadow's edge, so half of it falls outside; the offset
   * carries the whole shadow that way on one side.
   *
   * The lengths are read as CSS writes them, which includes unitless zeros —
   * the first version matched only `\d+px` and so read `0 0 40px 12px` as
   * x=40, y=12, reporting a reach of 40 for a layer that reaches 32.
   */
  const reachOf = (shadow: string): number => {
    const layers = shadow.split(/,(?![^(]*\))/).map((layer) => layer.trim());
    expect(layers.length).toBeGreaterThan(0);
    return Math.max(
      ...layers.map((layer) => {
        const lengths = layer
          // Drop `rgba(...)` and friends; what is left is the geometry.
          .replace(/[a-z-]+\([^)]*\)/gi, "")
          .trim()
          .split(/\s+/)
          .filter((token) => /^-?\d+(?:\.\d+)?(?:px)?$/.test(token))
          .map((token) => Number(token.replace("px", "")));
        expect(lengths.length).toBeGreaterThanOrEqual(2);
        const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
        return Math.max(Math.abs(x), Math.abs(y)) + blur / 2 + spread;
      }),
    );
  };

  it("covers how far the speaking stack actually reaches", () => {
    // Read off the string the component uses, so the constant cannot fall
    // behind the halo it is reserving room for.
    expect(HALO_ROOM_PX).toBeGreaterThanOrEqual(
      reachOf(haloFor("#FCE7E6", true)),
    );
  });

  it("covers the quiet shape too", () => {
    expect(HALO_ROOM_PX).toBeGreaterThanOrEqual(reachOf(QUIET_SHADOW));
  });

  it("takes the room off both sides of a shapeless form", () => {
    // 800x450: the shorter side is 450, the 8% cap does not bind, so the full
    // room comes off the top and the bottom.
    expect(shapelessFaceSide(800, 450)).toBe(450 - 2 * HALO_ROOM_PX);
    expect(shapelessFaceSide(450, 800)).toBe(450 - 2 * HALO_ROOM_PX);
  });

  it("never gives away more than the chrome's own inset", () => {
    // On a small tile the halo would be eating the thing it is meant to light
    // up. A clipped halo is the lesser loss, so the room is capped at 8% a
    // side — the same inset the name capsule uses.
    expect(shapelessFaceSide(300, 200)).toBe(168);
    expect(shapelessFaceSide(120, 120)).toBe(Math.round(120 * 0.84));
  });

  it("answers a tile that has not measured itself yet", () => {
    // A stage mid-animation can report zero, and a NaN side would take the
    // whole face with it.
    expect(shapelessFaceSide(0, 0)).toBe(0);
    expect(shapelessFaceSide(Number.NaN, 100)).toBe(0);
  });
});
