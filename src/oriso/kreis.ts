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
  /** Whether the indicator is drawn at all (`KREIS_CENTRE_MIN`). */
  indicator: boolean;
}

/** The indicator's share of the stage's shorter side. */
export const KREIS_CENTRE_SHARE = 0.3;
/**
 * Below this the indicator is left out.
 *
 * Under about 96px the disc cannot hold the speaker's name and "spricht"
 * (seen on a phone with the notes sheet open: "Susa…" under its own forms),
 * and the ring still had to keep room for it. Where the stage is that small
 * the wave band above it already names who speaks.
 */
export const KREIS_CENTRE_MIN = 96;
/** Below this the indicator shows its bars only, without name and status. */
export const KREIS_CENTRE_TEXT_MIN = 136;
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
  const share = Math.round(side * KREIS_CENTRE_SHARE);
  // A stage not measured yet (0) is not a small one.
  const indicator = side === 0 || share >= KREIS_CENTRE_MIN;
  const centreSize = indicator ? share : 0;
  const centre = {
    x: Math.round(cx - centreSize / 2),
    y: Math.round(cy - centreSize / 2),
    size: centreSize,
  };
  if (count <= 0 || side === 0) return { centre, seats: [], indicator };

  const room = haloRoomFor(stage.width, stage.height);
  const outer = side / 2 - room;
  // A first guess at the ring, then the forms sized to the gaps on it.
  const ring0 = outer * 0.68;
  const perSeat = (2 * Math.PI * ring0) / count;
  const base = Math.min(side * 0.25, perSeat * 0.72);
  const big = Math.min(base * KREIS_EMPHASIS, side * 0.3);
  const largest = emphasised.size > 0 ? big : base;
  // Never into the indicator, never off the stage. Without the indicator
  // the middle is empty and the forms take all the room there is.
  const ring = Math.max(
    centreSize / 2 + largest / 2 + 8,
    indicator ? Math.min(ring0, outer - largest / 2) : outer - largest / 2,
  );

  /*
   * Without the indicator the circle may become an oval.
   *
   * The indicator is a disc and the ring around it has to be round; with it
   * gone (`KREIS_CENTRE_MIN`), nothing holds the ring to the shorter side.
   * A phone's stage above its notes sheet is wide and low, and on a circle
   * its six forms and their names crowded into the middle third of it.
   */
  const stretch = (extent: number): number =>
    indicator
      ? ring
      : Math.max(
          ring,
          Math.min(extent / 2 - room - largest / 2, (ring * extent) / side),
        );
  const ringX = stretch(stage.width);
  const ringY = stretch(stage.height);

  const seats = Array.from({ length: count }, (_, i) => {
    const size = Math.round(emphasised.has(i) ? big : base);
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return {
      x: Math.round(cx + ringX * Math.cos(angle) - size / 2),
      y: Math.round(cy + ringY * Math.sin(angle) - size / 2),
      size,
    };
  });
  return { centre, seats, indicator };
}
