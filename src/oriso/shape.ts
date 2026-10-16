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
   * Whether this form carries its own lift.
   *
   * False for the Einzelgespräch's halves. A clip path clips a box shadow
   * too, so a lift on each half would be cut along the seam — tracing the one
   * line in that view which has to read as a boundary inside a body rather
   * than an edge. The layout draws the circle's lift once, behind them.
   */
  lifted?: boolean;
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
