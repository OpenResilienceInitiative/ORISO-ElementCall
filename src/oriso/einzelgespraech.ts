/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The geometry of the two-person circle, ticket 04.
 *
 * Pure functions. The component is the markup around them, and the motion is
 * a CSS transition over the values they return — not an animation loop.
 */

/** Who currently holds the floor. */
export type Speaking = "none" | "both" | "first" | "second";

/**
 * Silence is an even split.
 *
 * Not 50.1% to the counsellor, not a nudge toward the local participant. In a
 * counselling call an unearned advantage to either side is a statement, and
 * silence is not a statement. This is the value the acceptance list means by
 * "neither half favoured".
 */
export const EVEN_SHARE = 0.5;

/**
 * The most one side may take.
 *
 * The quiet person has not left the room. Letting the speaker swell to the
 * whole circle would say they had.
 */
export const MAX_SHARE = 0.62;

/** How far the seam bows at the widest split, as a share of the radius. */
const MAX_BOW = 0.18;

/** The ticket's transition, named so the component and the test agree. */
export const SEAM_EASING = "0.45s cubic-bezier(0.2, 0, 0, 1)";

/**
 * The same curve, for the spring that actually drives the seam.
 *
 * It cannot be a CSS transition. The rendered halves carry
 * `clip-path: url(#seam)`, and that string never changes — what changes is
 * the `d` of the path it points at, which a transition on `clip-path` does
 * not touch. (The first version put the transition on the invisible
 * measurement slot, which has no clip path at all, so the seam simply
 * jumped.) The share is tweened instead and the path is rebuilt from it, so
 * the bow and the two faces' focus all move together, which is what the
 * handoff draws.
 */
export const SEAM_TWEEN = {
  duration: 450,
  easing: (t: number): number => cubicBezier(0.2, 0, 0, 1, t),
} as const;

/**
 * `cubic-bezier(x1, y1, x2, y2)` at `t`, by Newton on the x polynomial.
 *
 * react-spring takes an easing as a function, and CSS's curve is the one the
 * ticket names; writing it out keeps the two the same thing rather than two
 * things that look alike.
 */
function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const curve = (a: number, b: number, u: number): number =>
    ((1 - u) ** 3 * 0 +
      3 * (1 - u) ** 2 * u * a +
      3 * (1 - u) * u ** 2 * b +
      u ** 3) as number;
  const slope = (a: number, b: number, u: number): number =>
    3 * (1 - u) ** 2 * a + 6 * (1 - u) * u * (b - a) + 3 * u ** 2 * (1 - b);
  let u = t;
  for (let i = 0; i < 8; i++) {
    const dx = curve(x1, x2, u) - t;
    if (Math.abs(dx) < 1e-5) break;
    const d = slope(x1, x2, u);
    if (Math.abs(d) < 1e-6) break;
    u -= dx / d;
  }
  return curve(y1, y2, Math.min(1, Math.max(0, u)));
}

/**
 * The first participant's share of the circle.
 *
 * Symmetric by construction: mirroring the input mirrors the output. Both
 * speaking is the same as neither — two people talking at once is not a
 * reason to award the circle to whoever the code happens to check first.
 */
export function shareFor(speaking: Speaking): number {
  if (speaking === "first") return MAX_SHARE;
  if (speaking === "second") return 1 - MAX_SHARE;
  return EVEN_SHARE;
}

/**
 * How far the seam bows, from -1 (into the first) to 1 (into the second).
 *
 * The seam bulges into whoever is NOT speaking. That is what makes the growth
 * read as one body pressing against another rather than as a bar filling up,
 * and it is continuous through the midpoint so turn-taking never flicks.
 */
export function seamFor(share: number): number {
  return ((share - EVEN_SHARE) / (MAX_SHARE - EVEN_SHARE)) * MAX_BOW;
}
