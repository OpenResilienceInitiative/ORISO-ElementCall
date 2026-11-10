/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { haloRoomFor } from "./layout";

/**
 * The Kreis (design 2a, the group's standard view): the room's sound
 * indicator in the middle, everybody on a circle around it.
 *
 * Pure, like the rest of the engine: the same room looks the same on every
 * client, and the tests can pin the geometry down.
 */
export interface KreisSpot {
  x: number;
  y: number;
  size: number;
}

export interface KreisPlan {
  /** The sound indicator in the middle, as a square box. */
  centre: KreisSpot;
  /** One per person, in the order given, as square boxes. */
  seats: KreisSpot[];
}

/** The indicator's share of the stage's shorter side. */
export const KREIS_CENTRE_SHARE = 0.3;
/** How much bigger a speaking or pinned form is than a listening one. */
export const KREIS_EMPHASIS = 1.3;

/**
 * Where everybody stands.
 *
 * The first person sits at twelve o'clock and the rest follow clockwise at
 * equal angles. A form is as big as its share of the circle allows, capped
 * at a quarter of the stage; somebody speaking or pinned ("Anheften: bleibt
 * groß") gets `KREIS_EMPHASIS` of that. The ring is pulled in so that the
 * biggest form, with the halo's room around it, still stays on the stage.
 */
export function kreisPlan(
  count: number,
  stage: { width: number; height: number; offsetY?: number },
  emphasised: ReadonlySet<number> = new Set(),
): KreisPlan {
  const offsetY = stage.offsetY ?? 0;
  const side = Math.max(0, Math.min(stage.width, stage.height));
  const cx = stage.width / 2;
  const cy = offsetY + stage.height / 2;
  const centreSize = Math.round(side * KREIS_CENTRE_SHARE);
  const centre = {
    x: Math.round(cx - centreSize / 2),
    y: Math.round(cy - centreSize / 2),
    size: centreSize,
  };
  if (count <= 0 || side === 0) return { centre, seats: [] };

  const room = haloRoomFor(stage.width, stage.height);
  const outer = side / 2 - room;
  // A first guess at the ring, then the forms sized to the gaps on it.
  const ring0 = outer * 0.68;
  const perSeat = (2 * Math.PI * ring0) / count;
  const base = Math.min(side * 0.25, perSeat * 0.72);
  const big = Math.min(base * KREIS_EMPHASIS, side * 0.3);
  const largest = emphasised.size > 0 ? big : base;
  // Never into the indicator, never off the stage.
  const ring = Math.max(
    centreSize / 2 + largest / 2 + 8,
    Math.min(ring0, outer - largest / 2),
  );

  const seats = Array.from({ length: count }, (_, i) => {
    const size = Math.round(emphasised.has(i) ? big : base);
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return {
      x: Math.round(cx + ring * Math.cos(angle) - size / 2),
      y: Math.round(cy + ring * Math.sin(angle) - size / 2),
      size,
    };
  });
  return { centre, seats };
}
