/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Where a pointer lands on a shared screen, whatever size the tile is.
 *
 * A position travels as a fraction of the shared VIDEO frame (0..1 across and
 * down), never in pixels and never as a fraction of the tile. The tile draws
 * the screen with `object-fit: contain`, so a tile whose shape differs from
 * the screen's has black bars, and a fraction of the tile would put the dot
 * somewhere else for every viewer with a differently shaped tile — the grove
 * share band, the spotlight and the maximised view are three such shapes.
 */

export interface VideoPoint {
  /** 0 = the shared screen's left edge, 1 = its right edge. */
  x: number;
  /** 0 = top edge, 1 = bottom edge. */
  y: number;
}

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The rectangle a `contain`-fitted video actually occupies inside its box.
 * A video of unknown size (metadata not loaded yet) is taken to fill it.
 */
export function containedFrame(
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number,
): Frame {
  if (videoWidth <= 0 || videoHeight <= 0 || boxWidth <= 0 || boxHeight <= 0)
    return { left: 0, top: 0, width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (boxWidth - width) / 2,
    top: (boxHeight - height) / 2,
    width,
    height,
  };
}

/**
 * A point in the box (pixels from its top-left) as a point on the video, or
 * null when it is over the bars or the box has no size — there is nothing to
 * point at there, so nothing is sent.
 */
export function toVideoPoint(
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number,
): VideoPoint | null {
  const f = containedFrame(boxWidth, boxHeight, videoWidth, videoHeight);
  if (f.width <= 0 || f.height <= 0) return null;
  const x = (boxX - f.left) / f.width;
  const y = (boxY - f.top) / f.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** A point on the video as pixels from the box's top-left. */
export function fromVideoPoint(
  p: VideoPoint,
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number,
): { left: number; top: number } {
  const f = containedFrame(boxWidth, boxHeight, videoWidth, videoHeight);
  return { left: f.left + p.x * f.width, top: f.top + p.y * f.height };
}
