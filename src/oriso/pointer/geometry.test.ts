/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  containedFrame,
  fromVideoPoint,
  layoutScale,
  localBox,
  localPoint,
  toVideoPoint,
} from "./geometry";

describe("containedFrame", () => {
  it("fills the box when the aspect ratios match", () => {
    expect(containedFrame(1600, 900, 1920, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
    });
  });

  it("letterboxes a wide video in a tall box (bars top and bottom)", () => {
    // 16:9 into 800×800: 800 wide, 450 tall, 175 above and below.
    expect(containedFrame(800, 800, 1920, 1080)).toEqual({
      left: 0,
      top: 175,
      width: 800,
      height: 450,
    });
  });

  it("pillarboxes a tall video in a wide box (bars left and right)", () => {
    // 3:4 into 1000×600: 450 wide, 275 either side.
    expect(containedFrame(1000, 600, 900, 1200)).toEqual({
      left: 275,
      top: 0,
      width: 450,
      height: 600,
    });
  });

  it("treats a video without known size as filling the box", () => {
    expect(containedFrame(640, 480, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: 640,
      height: 480,
    });
  });
});

describe("toVideoPoint", () => {
  it("maps the frame's corners to 0 and 1", () => {
    // Letterboxed: frame from y=175 to y=625 in an 800×800 box.
    expect(toVideoPoint(0, 175, 800, 800, 1920, 1080)).toEqual({ x: 0, y: 0 });
    expect(toVideoPoint(800, 625, 800, 800, 1920, 1080)).toEqual({
      x: 1,
      y: 1,
    });
    expect(toVideoPoint(400, 400, 800, 800, 1920, 1080)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("returns null over the black bars, where there is nothing to point at", () => {
    expect(toVideoPoint(400, 100, 800, 800, 1920, 1080)).toBeNull();
    expect(toVideoPoint(400, 700, 800, 800, 1920, 1080)).toBeNull();
    expect(toVideoPoint(100, 300, 1000, 600, 900, 1200)).toBeNull();
  });

  it("returns null for an empty box", () => {
    expect(toVideoPoint(0, 0, 0, 0, 1920, 1080)).toBeNull();
  });
});

describe("fromVideoPoint", () => {
  it("is the inverse of toVideoPoint at any tile size", () => {
    const sizes: [number, number][] = [
      [320, 180],
      [800, 800],
      [1440, 600],
      [375, 812],
    ];
    for (const [w, h] of sizes) {
      const { left, top } = fromVideoPoint(
        { x: 0.3, y: 0.8 },
        w,
        h,
        1920,
        1080,
      );
      const p = toVideoPoint(left, top, w, h, 1920, 1080);
      expect(p?.x).toBeCloseTo(0.3, 6);
      expect(p?.y).toBeCloseTo(0.8, 6);
    }
  });

  it("lands on the same spot of the picture in a small and a maximised tile", () => {
    // The pointer at the screen's centre-right: 75% across, 50% down.
    const small = fromVideoPoint({ x: 0.75, y: 0.5 }, 400, 400, 1920, 1080);
    const big = fromVideoPoint({ x: 0.75, y: 0.5 }, 1600, 900, 1920, 1080);
    expect(small).toEqual({ left: 300, top: 200 });
    expect(big).toEqual({ left: 1200, top: 450 });
  });
});

describe("layoutScale / localBox / localPoint", () => {
  it("is 1 for an unscaled layer and for one not laid out yet", () => {
    expect(layoutScale(404, 404)).toBe(1);
    expect(layoutScale(404, 0)).toBe(1);
    expect(layoutScale(0, 404)).toBe(1);
  });

  it("puts the centre of a scaled tile at the centre, not at scale × centre", () => {
    // The Dev live test (16 Nov): a 404×233 preview measured while the tile
    // was at scale 0.146 of its entrance. Before the fix the box stayed at
    // the measured 59×34 and the centre was drawn at (29, 17).
    const s = 0.146;
    const layer = { left: 1000, top: 500, width: 404 * s, height: 233 * s };
    const scale = layoutScale(layer.width, 404);
    expect(scale).toBeCloseTo(s);
    const box = localBox(layer, layer, scale);
    expect(box.width).toBeCloseTo(404);
    expect(box.height).toBeCloseTo(233);
    const { left, top } = fromVideoPoint(
      { x: 0.5, y: 0.5 },
      box.width,
      box.height,
      0,
      0,
    );
    expect(left).toBeCloseTo(202);
    expect(top).toBeCloseTo(116.5);
  });

  it("maps a client point on a scaled layer back to the same video point", () => {
    const scale = 0.5;
    const layer = { left: 100, top: 50, width: 400, height: 400 };
    // The video fills the layer; 16:9 in a square box is letterboxed.
    const box = localBox(layer, layer, scale);
    // The visual centre of the layer is the centre of the picture.
    const at = localPoint(layer, 300, 250, scale);
    expect(at).toEqual({ x: 400, y: 400 });
    expect(
      toVideoPoint(
        at.x - box.left,
        at.y - box.top,
        box.width,
        box.height,
        1920,
        1080,
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps a video's offset inside the layer in the layer's own pixels", () => {
    const box = localBox(
      { left: 0, top: 0, width: 200, height: 200 },
      { left: 20, top: 10, width: 100, height: 50 },
      0.5,
    );
    expect(box).toEqual({ left: 40, top: 20, width: 200, height: 100 });
  });
});
