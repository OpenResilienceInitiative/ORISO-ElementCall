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
// A phone (#2233): from three tiles in a row upwards, a tile is this wide.
export const KACHEL_MIN_WIDTH_PHONE = 150;
const PHONE_STAGE = 520;
/**
 * A phone always shows two tiles side by side when there are two people.
 * After the halo's room on both sides a 360px phone leaves about 300px, too
 * little for two tiles at the minimum: one column of huge tiles would follow.
 */
const PHONE_MIN_COLUMNS = 2;
// …as long as a tile stays big enough for a face and a name.
const PHONE_TILE_FLOOR = 120;
// Square tiles (#2233, T12): a face fills a square, and more rows fit.
export const KACHEL_MAX_WIDTH = 280;
export const KACHEL_ASPECT = 1;

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
  const min = width < PHONE_STAGE ? KACHEL_MIN_WIDTH_PHONE : KACHEL_MIN_WIDTH;
  const fitting = Math.floor((width + gutter) / (min + gutter));
  const twoFit =
    width >= PHONE_MIN_COLUMNS * PHONE_TILE_FLOOR + gutter;
  const fits =
    width < PHONE_STAGE && twoFit
      ? Math.max(PHONE_MIN_COLUMNS, fitting)
      : fitting;
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

export interface KachelnRange {
  /** 1-based place in the sheet of the first person fully in sight. */
  first: number;
  last: number;
}

/**
 * Who is in sight (#2233, T12): the first and the last tile that lie fully
 * inside the stage, by their place in the sheet. A pixel of rounding either
 * way still counts as inside. Nobody in sight, no range.
 */
export function kachelnRange(
  slots: readonly { top: number; bottom: number }[],
  view: { top: number; bottom: number },
): KachelnRange | null {
  let first = -1;
  let last = -1;
  slots.forEach((slot, i) => {
    if (slot.top >= view.top - 1 && slot.bottom <= view.bottom + 1) {
      if (first === -1) first = i;
      last = i;
    }
  });
  return first === -1 ? null : { first: first + 1, last: last + 1 };
}
