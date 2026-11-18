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

/** A rectangle as `getBoundingClientRect` reports it (viewport pixels). */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The factor between what the screen shows and the layer's own pixels.
 *
 * `getBoundingClientRect` reports the box AFTER every ancestor transform,
 * while a `translate()` inside the layer is in the layer's own, untransformed
 * pixels. They differ whenever a tile is scaled: the grid lets a tile grow in
 * from `scale(0)`, and a box measured during that entrance stayed small —
 * on Dev a sharer's 404×233 preview drew every pointer at ~0.146 of its
 * place, the centre landing at (29, 17) (#2233 live test, 16 Nov).
 * A layer of unknown layout size (not laid out yet) counts as unscaled.
 */
export function layoutScale(visual: number, layout: number): number {
  if (!(visual > 0) || !(layout > 0)) return 1;
  return visual / layout;
}

/**
 * Where the video sits inside the layer, in the layer's OWN pixels, and a
 * client point in the same pixels. Both rectangles come from
 * `getBoundingClientRect`; `scale` is `layoutScale` of the layer.
 */
export function localBox(
  layer: ClientRect,
  video: ClientRect,
  scale: number,
): ClientRect {
  return {
    left: (video.left - layer.left) / scale,
    top: (video.top - layer.top) / scale,
    width: video.width / scale,
    height: video.height / scale,
  };
}

/** A client (viewport) point in the layer's own pixels. */
export function localPoint(
  layer: ClientRect,
  clientX: number,
  clientY: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: (clientX - layer.left) / scale,
    y: (clientY - layer.top) / scale,
  };
}
