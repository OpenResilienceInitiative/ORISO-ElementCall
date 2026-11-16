/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { KREIS_NAME_MIN, kreisNames, kreisPlan } from "./kreis";
import { nameSideFor } from "./shape";

describe("kreisNames (#2233: 18 people in the Storybook)", () => {
  const STAGE = { width: 1440, height: 760 };
  const NAMES = [
    "ruhiger Fuchs 432",
    "Susanne P. · Beraterin",
    "wacher Igel 118",
    "stilles Pferd 907",
    "heitere Lerche 24",
    "weiter Bär 651",
    "klarer Schwan 77",
    "naher Otter 303",
    "später Kauz 512",
    "feiner Dachs 255",
    "klare Biene 641",
    "warmer Hase 962",
    "munterer Frosch 88",
    "stiller Hirsch 219",
    "kleiner Käfer 730",
    "flinkes Eichhorn 46",
    "ruhiger Pinguin 377",
    "sanfter Panda 590",
  ];
  const side = (x: number, w: number): "start" | "centre" | "end" =>
    nameSideFor(x, w, STAGE.width);
  // The capsule as `kreisNames` plans it: the name at its guessed width.
  const capsule = (
    f: { x: number; y: number; size: number },
    n: { side: string; max: number },
    name: string,
  ): { l: number; r: number; t: number } => {
    const w = Math.min(n.max, [...name].length * 7) + 24;
    const l =
      n.side === "start"
        ? f.x
        : n.side === "end"
          ? f.x + f.size - w
          : f.x + f.size / 2 - w / 2;
    return { l, r: l + w, t: f.y };
  };
  const overlaps = (count: number): number => {
    const forms = kreisPlan(count, STAGE).seats;
    const names = NAMES.slice(0, count);
    const laid = kreisNames(forms, names, STAGE.width, 184, side);
    const caps = forms.map((f, i) => capsule(f, laid[i], names[i]));
    let n = 0;
    for (let i = 0; i < caps.length; i++)
      for (let j = i + 1; j < caps.length; j++)
        if (
          Math.abs(caps[i].t - caps[j].t) < 26 &&
          Math.min(caps[i].r, caps[j].r) > Math.max(caps[i].l, caps[j].l)
        )
          n++;
    return n;
  };

  it("leaves a small circle as it was: the usual side, the full cap", () => {
    const forms = kreisPlan(6, STAGE).seats;
    const laid = kreisNames(forms, NAMES.slice(0, 6), STAGE.width, 184, side);
    laid.forEach((n, i) => {
      expect(n.side).toBe(side(forms[i].x, forms[i].size));
      expect(n.max).toBe(184);
    });
  });

  it("keeps every capsule clear of its neighbours up to 18 people", () => {
    for (const count of [3, 6, 9, 12, 14, 16, 18])
      expect({ count, overlaps: overlaps(count) }).toEqual({
        count,
        overlaps: 0,
      });
  });

  it("hangs a crowded ring's names outward and never cuts below the minimum", () => {
    const forms = kreisPlan(18, STAGE).seats;
    const laid = kreisNames(forms, NAMES, STAGE.width, 184, side);
    const mid = STAGE.width / 2;
    forms.forEach((f, i) => {
      const at = f.x + f.size / 2;
      if (Math.abs(at - mid) >= f.size / 2)
        expect(laid[i].side).toBe(at > mid ? "start" : "end");
      expect(laid[i].max).toBeGreaterThanOrEqual(KREIS_NAME_MIN);
      expect(laid[i].max).toBeLessThanOrEqual(184);
    });
  });

  it("cuts only what has to go: short names on a crowded ring keep the cap", () => {
    const forms = kreisPlan(18, STAGE).seats;
    const laid = kreisNames(
      forms,
      forms.map(() => "Ida"),
      STAGE.width,
      184,
      side,
    );
    expect(laid.every((n) => n.max === 184)).toBe(true);
  });
});
