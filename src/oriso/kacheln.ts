/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The Kacheln (design 2a): everybody in an equal tile, as many per row as
 * fit, and the stage scrolls when there are more rows than room.
 *
 * Unlike the Felder, nobody's tile grows when they speak — that is the
 * difference between the two views. Pinned people ("Anheften") come first,
 * so they stay in sight when the sheet scrolls.
 */
export const KACHEL_MIN_WIDTH = 200;
export const KACHEL_MAX_WIDTH = 360;
export const KACHEL_ASPECT = 4 / 3;

export interface KachelSize {
  columns: number;
  width: number;
  height: number;
}

/** How many tiles per row, and how big each one is. */
export function kachelSize(
  count: number,
  width: number,
  gutter: number,
): KachelSize {
  const fits = Math.floor((width + gutter) / (KACHEL_MIN_WIDTH + gutter));
  const columns = Math.max(1, Math.min(Math.max(1, count), fits));
  const tile = Math.min(
    KACHEL_MAX_WIDTH,
    Math.max(1, (width - gutter * (columns - 1)) / columns),
  );
  const w = Math.floor(tile);
  return { columns, width: w, height: Math.round(w / KACHEL_ASPECT) };
}

/** The order of the sheet: pinned people first, everybody else as they are. */
export function orderForKacheln<T>(
  seats: readonly T[],
  pinned: (seat: T) => boolean,
): T[] {
  return [...seats.filter(pinned), ...seats.filter((s) => !pinned(s))];
}
