/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Room for the shared screen, so it stops standing on people.
 *
 * In the grove the shared screen is not a tile among the others: it is a
 * fixed box pinned to a corner of the stage, drawn in a layer above
 * everybody — upstream's arrangement, kept because a shared screen is a
 * rectangle and the design does not pretend otherwise. What was missing is
 * the other half of that bargain. The forms were packed across the whole
 * stage as though the corner were free, so the box landed on top of whoever
 * had been placed there: in the live test of 22 October it covered the
 * corner of the green form, and in a three- or four-person call it can cover
 * a face outright.
 *
 * So the people move and the screen stays. The band the box occupies comes
 * out of the rectangle the arrangements are given, before the halo's own
 * inset, and every arrangement in `OrisoGroveLayout` starts from the result.
 * Nothing here changes where the box is drawn — that is the stylesheet's,
 * and `OrisoGroveLayout.css.test.ts` holds the two to the same numbers.
 */

/**
 * The shared screen's box, as `OrisoGroveLayout.module.css` draws it.
 *
 * Duplicated from the stylesheet because this side cannot read it and must
 * not measure it: measuring a box whose position depends on this calculation
 * is a loop. The CSS test asserts the copies still agree, which is the only
 * thing that keeps them honest.
 */
export const SPOTLIGHT_MAX_INLINE_PX = 404;
export const SPOTLIGHT_ASPECT_RATIO = 404 / 233;
/** `--cpd-space-3x`, the slot's inline inset in the stylesheet. */
export const SPOTLIGHT_INLINE_INSET_PX = 12;

/**
 * How much of the stage the shared screen may claim.
 *
 * A short, wide window — a call docked at the bottom of a counsellor's
 * screen — would otherwise hand the whole height to the screen and leave the
 * forms a sliver. Past this the band stops growing and the box goes back to
 * overlapping, which is the lesser loss: a corner of a form behind the
 * shared screen is a blemish, a stage with no room for faces is not a call.
 */
export const SPOTLIGHT_ROOM_MAX_SHARE = 0.5;

/** Where the shared screen sits, or that there is none. */
export type SpotlightSide = "start" | "end" | null;

export interface StageRoom {
  /** The width the arrangements may use — unchanged; the band is horizontal. */
  width: number;
  /** The height left once the shared screen has its band. */
  height: number;
  /** How far down the remaining stage begins. */
  offsetY: number;
}

/**
 * The height the shared screen takes at a given stage width.
 *
 * `min(404px, 100% - 2 * inset)` wide, at 404/233 — the stylesheet's own
 * rule, in numbers.
 */
export function spotlightBlockSize(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  const inline = Math.min(
    SPOTLIGHT_MAX_INLINE_PX,
    Math.max(0, width - 2 * SPOTLIGHT_INLINE_INSET_PX),
  );
  return Math.round(inline / SPOTLIGHT_ASPECT_RATIO);
}

/**
 * The stage the forms get, once the shared screen has had its band.
 *
 * A full-width band rather than a corner cut-out, and deliberately: the box
 * can be DRAGGED between the four corners, so a cut-out would have to be
 * re-packed on every drag — a relaxation pass to follow a pointer — and a
 * form would hop across the stage as the box passed over it. The band
 * depends only on which half the box is in, so dragging it from one corner
 * to the other along the same edge moves nothing.
 */
export function stageBesideSpotlight(
  width: number,
  height: number,
  side: SpotlightSide,
): StageRoom {
  if (side === null || !Number.isFinite(height) || height <= 0)
    return { width, height, offsetY: 0 };
  const band = Math.min(
    spotlightBlockSize(width),
    Math.floor(height * SPOTLIGHT_ROOM_MAX_SHARE),
  );
  return {
    width,
    height: Math.max(0, height - band),
    offsetY: side === "start" ? band : 0,
  };
}
