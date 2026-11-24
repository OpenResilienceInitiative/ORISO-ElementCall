/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Placement, ownShape } from "./layout";

/** The prototype's negative padding: forms abut rather than hover apart. */
const ABUT = 0.99;
/** The prototype keeps a form this far from its box. */
const EDGE = 3;
/** Orientations tried when the names decide how the three stand. */
const TURNS = 360;

interface Point {
  x: number;
  y: number;
}

/** Three circles, each touching the other two, A at the origin. */
function touching(r: readonly number[]): Point[] {
  const ab = (r[0] + r[1]) * ABUT;
  const ac = (r[0] + r[2]) * ABUT;
  const bc = (r[1] + r[2]) * ABUT;
  const cx = (ab * ab + ac * ac - bc * bc) / (2 * ab);
  const cy = -Math.sqrt(Math.max(0, ac * ac - cx * cx));
  return [
    { x: 0, y: 0 },
    { x: ab, y: 0 },
    { x: cx, y: cy },
  ];
}

const turn = (p: Point, a: number): Point => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});

const centred = (ps: readonly Point[]): Point[] => {
  const mx = ps.reduce((t, p) => t + p.x, 0) / ps.length;
  const my = ps.reduce((t, p) => t + p.y, 0) / ps.length;
  return ps.map((p) => ({ x: p.x - mx, y: p.y - my }));
};

/** `moving` turned about its centroid to lie closest to `fixed`. */
function aligned(moving: readonly Point[], fixed: readonly Point[]): Point[] {
  const m = centred(moving);
  const f = centred(fixed);
  let cross = 0;
  let dot = 0;
  for (let i = 0; i < m.length; i++) {
    cross += m[i].x * f[i].y - m[i].y * f[i].x;
    dot += m[i].x * f[i].x + m[i].y * f[i].y;
  }
  const a = Math.atan2(cross, dot);
  return m.map((p) => turn(p, a));
}

/** The square-ish extent of the three discs, turned by `a`. */
function extent(
  centres: readonly Point[],
  r: readonly number[],
  a: number,
): { left: number; top: number; width: number; height: number } {
  const turned = centres.map((c) => turn(c, a));
  const left = Math.min(...turned.map((c, i) => c.x - r[i]));
  const right = Math.max(...turned.map((c, i) => c.x + r[i]));
  const top = Math.min(...turned.map((c, i) => c.y - r[i]));
  const bottom = Math.max(...turned.map((c, i) => c.y + r[i]));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The grove at THREE people: three forms standing together, each touching
 * the other two.
 *
 * Like `pairShapes` for two, this routes one count around the prototype's
 * `packShapes`, which is left verbatim. Seventy per cent of a square cannot
 * hold three discs, so the packing buries 14.3% of a form while everybody
 * listens and 17.1% once somebody speaks — the measurement and its reasons
 * are pinned in `layout.test.ts`. Three is now the smallest group (two
 * people are always the Einzelgespräch), so it is the grove most people see
 * first. The count decides, not who is speaking: the stage does not switch
 * placement mid-sentence.
 *
 * What stays the prototype's: each person's own form and lean from
 * `ownShape`, the weights growing a speaker and displacing the others, the
 * 0.99 abutting and the 3px off the box. What is new is only the placement:
 * the three discs touch pairwise, the triangle is turned the way that fills
 * the square best — decided by the names alone, so the three keep their
 * corners when the turn passes on — and then scaled to the box and centred.
 */
export function trioShapes(
  names: readonly string[],
  box: number,
  weights: readonly number[],
): Placement[] {
  const shapes = names.map(ownShape);
  // The orientation comes from the quiet room, so it does not move with
  // whoever is speaking.
  const quiet = shapes.map((s) => s.wobble);
  const quietCentres = touching(quiet);
  let best = 0;
  let bestSide = Number.POSITIVE_INFINITY;
  for (let i = 0; i < TURNS; i++) {
    const a = (2 * Math.PI * i) / TURNS;
    const { width, height } = extent(quietCentres, quiet, a);
    const side = Math.max(width, height);
    // Strictly smaller, so the first of equal turns wins on every client.
    if (side < bestSide - 1e-9) {
      bestSide = side;
      best = a;
    }
  }

  /*
   * Then the room as it is, laid over the quiet one.
   *
   * Somebody speaking changes the triangle's shape, and built afresh from
   * its first corner it would swing round the stage. Turned to sit as close
   * as it can to the quiet triangle (least squares about the centroids),
   * everybody keeps their corner and only grows or gives way.
   */
  const r = weights.map((w, i) => w * shapes[i].wobble);
  const centres = aligned(touching(r), quietCentres);
  const { left, top, width, height } = extent(centres, r, best);
  const scale = Math.max(0, box - 2 * EDGE) / Math.max(width, height);
  const offsetX = (box - width * scale) / 2;
  const offsetY = (box - height * scale) / 2;
  return centres.map((c, i) => {
    const t = turn(c, best);
    const radius = r[i] * scale;
    const x = (t.x - left) * scale + offsetX;
    const y = (t.y - top) * scale + offsetY;
    return {
      size: Math.round(radius * 2),
      x: Math.round(x - radius),
      y: Math.round(y - radius),
      blob: shapes[i].blob,
      tilt: shapes[i].tilt,
    };
  });
}
