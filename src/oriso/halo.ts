/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How speaking looks in the Hain.
 *
 * The prototype gives both states outright, and gives the reason beside
 * them:
 *
 *   "The halo takes the person's own colour, so speaking reads as
 *    'she lights up' rather than 'the system marked her red'."
 *
 * That is the design, and it is the part most likely to be refactored away:
 * one shared accent colour is the obvious simplification and it is exactly
 * wrong. Marking somebody in a system colour reads as a flag on them. Their
 * own colour brightening reads as them.
 */

/** A palette hex at an alpha. Anything unparseable passes through. */
export function tint(colour: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!hex) return colour;

  const digits =
    hex[1].length === 3
      ? hex[1]
          .split("")
          .map((d) => d + d)
          .join("")
      : hex[1];
  const value = parseInt(digits, 16);
  // eslint-disable-next-line no-bitwise
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The quiet shape. The prototype's value, which does not scale. */
export const QUIET_SHADOW = "0 2px 6px rgba(0, 0, 0, 0.1)";

/** How far the speaking shape rises out of the field, in px. */
export const HALO_LIFT_PX = 4;

/** Alpha of the tight ring, then of the wide glow. */
const RING_ALPHA = 0.18;
const GLOW_ALPHA = 0.5;

/*
 * The three layers' geometry, named rather than written into the string.
 *
 * `HALO_ROOM_PX` below is computed from these, so the room a form reserves
 * for its halo cannot fall behind the halo itself. Written into the template
 * literal they drifted apart silently, which is how the halo came to be
 * clipped in the spotlight.
 */
const RING_SPREAD = 6;
const GLOW_BLUR = 40;
const GLOW_SPREAD = 12;
const DROP = { offset: 22, blur: 38, spread: -10 };

/**
 * The shadow stack for one shape.
 *
 * Three layers when speaking: a tight ring in the person's colour, a wide
 * glow in the same colour, and a deeper drop that puts the shape in front of
 * the others rather than merely brighter than them.
 */
export function haloFor(background: string, speaking: boolean): string {
  if (!speaking) return QUIET_SHADOW;
  return [
    `0 0 0 ${RING_SPREAD}px ${tint(background, RING_ALPHA)}`,
    `0 0 ${GLOW_BLUR}px ${GLOW_SPREAD}px ${tint(background, GLOW_ALPHA)}`,
    `0 ${DROP.offset}px ${DROP.blur}px ${DROP.spread}px rgba(0, 0, 0, 0.24)`,
  ].join(", ");
}

/**
 * How far the speaking stack paints outside the form, in px.
 *
 * A box shadow reaches `spread + blur / 2` past the box it belongs to — the
 * blur transition is centred on the shadow's edge — and the drop's vertical
 * offset carries it further down. The widest of the three is the glow, at
 * 12 + 20.
 *
 * This matters because a halo is an OUTER shadow and every box the design
 * puts a form in clips: `SpotlightTile`'s `.contents` carries `contain:
 * strict` together with `overflow-y: hidden`, and `Grid` carries `contain:
 * strict` as well. A form sized to the full shorter side of its tile touches
 * those edges, so the halo was cut along them — on both short edges of a
 * landscape spotlight and on all four of a square one, which is most of the
 * speaking signal. Relaxing the containment would not have been enough on its
 * own: `overflow-y: hidden` is there for the spotlight's horizontal
 * scroll-snap and clips regardless.
 */
export const HALO_ROOM_PX = Math.ceil(
  Math.max(
    RING_SPREAD,
    GLOW_SPREAD + GLOW_BLUR / 2,
    DROP.offset + DROP.blur / 2 + DROP.spread,
  ),
);

/**
 * The side of the square a form with NO shape of its own draws, inside a tile
 * this size.
 *
 * One function, because two places need the same number and they are in
 * different files: `MediaView` sizes the face with it and insets the chrome
 * layer to it. Computed twice they drift, and the drift is a name capsule
 * floating off the form it names — which is exactly the defect the chrome
 * inset was added to fix.
 *
 * The room for the halo is capped at the chrome's own 8%, so a small tile
 * gives away at most a sixth of its form. Past that the halo would be eating
 * the thing it is meant to light up, and a clipped halo is the lesser loss.
 */
export const HALO_ROOM_MAX_SHARE = 0.08;

export function shapelessFaceSide(width: number, height: number): number {
  const shorter = Math.min(width, height);
  if (!Number.isFinite(shorter) || shorter <= 0) return 0;
  const room = Math.min(HALO_ROOM_PX, shorter * HALO_ROOM_MAX_SHARE);
  return Math.max(1, Math.round(shorter - 2 * room));
}
