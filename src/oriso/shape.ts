/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * What a layout tells a tile about the form it is standing in.
 *
 * The tile knows its own box — the grid springs that in — but not whether
 * that box is a grove blob, a field, or one half of a shared circle. This is
 * the one thing the layout has to hand over.
 */
export interface TileShape {
  /** CSS `border-radius`. The Hain's eight-value blob, or a field's corner. */
  radius: string;
  /** Degrees the form leans by. The artwork inside is counter-rotated. */
  tilt: number;
  /**
   * A `clip-path`, for a form a radius cannot describe — the Einzelgespräch's
   * bowed half. Applied on top of the radius, not instead of it.
   */
  clipPath?: string;
  /**
   * Where the face sits inside the box, 0–1, when the form is not centred on
   * it. The Einzelgespräch's halves share one box and each wants its own
   * centre; everything else leaves this alone.
   */
  focusX?: number;
  /**
   * How speaking is drawn on this form.
   *
   * `halo` is the grove's and the fields': the person's own colour blooming
   * outwards. `rim` is the Einzelgespräch's: an inset ring and an inward
   * glow in the carrier's red. The difference is not taste — a halo around
   * one half of a shared circle would glow around the whole circle, since
   * the two halves occupy the same box.
   */
  speakingAs?: "halo" | "rim";
  /**
   * What the face inside should be sized against, as a share of the box.
   *
   * Only the Einzelgespräch sets it: both halves occupy the whole circle, so
   * an animal sized off the box is nearly as wide as the circle — clipped at
   * the seam on one side and running off the rim on the other.
   */
  contentShare?: number;
  /**
   * Whether the form is shaded like a body.
   *
   * On for the grove's blobs and the Einzelgespräch's circle: two radial
   * gradients and two inset shadows, verbatim from the prototype, which are
   * what turn a flat disc into something with a form. Off for the fields —
   * they are rectangles, and the same shading makes them read as glossy
   * plastic buttons rather than as surfaces. Seen in a screenshot; no test
   * would have said a word.
   */
  body?: boolean;
  /**
   * Whether this form carries its own lift.
   *
   * False for the Einzelgespräch's halves. A clip path clips a box shadow
   * too, so a lift on each half would be cut along the seam — tracing the one
   * line in that view which has to read as a boundary inside a body rather
   * than an edge. The layout draws the circle's lift once, behind them.
   */
  lifted?: boolean;
  /**
   * Where the name capsule hangs on the form.
   *
   * The capsule may be wider than its form — a 24-character pseudonym is
   * wider than a listener's blob — so it is centred on the form and spills
   * over both sides evenly, as the design's capsules do. A form too close to
   * the stage's edge for that hangs it from its start or end instead, so it
   * grows inward rather than off the stage. Absent: the start.
   */
  nameSide?: "start" | "centre" | "end";
}

/**
 * How a name is cut when it does not fit.
 *
 * An ORISO pseudonym is "ruhiger Fuchs 432", and the number at the end is
 * what tells two foxes apart. A plain ellipsis takes the end off — "naher
 * O…" — which removes exactly the identifying part and leaves two people
 * in a room looking identical. The tail is kept instead and the middle
 * goes, so "naher Otter 303" becomes "naher…303".
 *
 * How many characters of the tail are worth keeping: enough for a
 * three-digit number and the space before it.
 */
export const NAME_TAIL_CHARS = 4;

/**
 * Half the widest capsule a form expects to carry, in pixels: a name at its
 * cap (`--oriso-name-max`, 184px; 112px on a phone) with its padding and the
 * raised hand beside it. Used to decide whether a centred capsule still fits
 * between a form and the stage's edge.
 */
export const NAME_CAPSULE_HALF = 130;
export const NAME_CAPSULE_HALF_PHONE = 94;

/** Where a form of this box hangs its name on a stage this wide. */
export function nameSideFor(
  x: number,
  width: number,
  stageWidth: number,
  phone = false,
): "start" | "centre" | "end" {
  const half = phone ? NAME_CAPSULE_HALF_PHONE : NAME_CAPSULE_HALF;
  const mid = x + width / 2;
  if (mid - half < 0) return "start";
  if (mid + half > stageWidth) return "end";
  return "centre";
}

/** A display name split into the part that may be cut and the part that may not. */
export function splitName(name: string): { head: string; tail: string } {
  const trimmed = name.trim();
  /*
   * Counted and cut in CODE POINTS, not UTF-16 units.
   *
   * `slice` cuts between the halves of a surrogate pair, and the two pieces
   * are rendered in separate spans — so a name whose fourth character from
   * the end is outside the BMP came apart into two replacement glyphs. A
   * pseudonym is somebody's name on a counselling platform; mangling it is
   * not a cosmetic bug.
   */
  const points = [...trimmed];
  // Nothing to protect in a name shorter than the tail itself.
  if (points.length <= NAME_TAIL_CHARS + 1) return { head: trimmed, tail: "" };
  return {
    head: points.slice(0, points.length - NAME_TAIL_CHARS).join(""),
    tail: points.slice(points.length - NAME_TAIL_CHARS).join(""),
  };
}

/** The field view's corner, the one number the handoff gives for it. */
export const FIELD_RADIUS = "22px";

/**
 * How much a counter-rotated picture must grow to still cover its frame.
 *
 * A square rotated by θ needs |cos θ| + |sin θ| of the original side to stay
 * covered. The artwork does not care — it is line art on a coloured plate and
 * has room around it — but a camera frame does: at 11 degrees, the design's
 * widest lean, an un-scaled video shows four wedges of background in the
 * corners.
 */
export function coverScale(tiltDeg: number): number {
  const t = (Math.abs(tiltDeg) * Math.PI) / 180;
  return Math.cos(t) + Math.sin(t);
}
