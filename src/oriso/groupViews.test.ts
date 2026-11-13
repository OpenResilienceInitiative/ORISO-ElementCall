/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { KREIS_CENTRE_MIN, KREIS_CENTRE_SHARE, kreisPlan } from "./kreis";
import { KACHEL_MIN_WIDTH, kachelSize, orderForKacheln } from "./kacheln";
import { formatHandDuration } from "./handDuration";
import {
  arrangementFor,
  resolveStageView,
  stagePlan,
  viewStorageKey,
} from "./stageViews";

const overlap = (
  a: { x: number; y: number; size: number },
  b: { x: number; y: number; size: number },
): boolean => {
  const ra = a.size / 2;
  const rb = b.size / 2;
  const dx = a.x + ra - (b.x + rb);
  const dy = a.y + ra - (b.y + rb);
  return Math.hypot(dx, dy) < ra + rb - 1;
};

describe("the Kreis (S6)", () => {
  it("puts the sound indicator in the middle of the stage", () => {
    const { centre } = kreisPlan(6, { width: 900, height: 600 });
    expect(centre.size).toBe(Math.round(600 * KREIS_CENTRE_SHARE));
    expect(centre.x + centre.size / 2).toBeCloseTo(450, 0);
    expect(centre.y + centre.size / 2).toBeCloseTo(300, 0);
  });

  it("drops the indicator where it would be too small to read (S9)", () => {
    // A phone with the notes sheet open leaves a stage about 375 x 290: the
    // indicator would be 87px, its name cut and its forms crowding over it.
    // The wave band above already says who speaks.
    const small = kreisPlan(6, { width: 375, height: 290 });
    expect(Math.round(290 * KREIS_CENTRE_SHARE)).toBeLessThan(KREIS_CENTRE_MIN);
    expect(small.indicator).toBe(false);
    expect(small.centre.size).toBe(0);
    // The ring no longer keeps room for it, so the forms are not pushed out.
    const withCentre = kreisPlan(6, { width: 600, height: 600 });
    expect(withCentre.indicator).toBe(true);
    expect(withCentre.centre.size).toBeGreaterThanOrEqual(KREIS_CENTRE_MIN);
  });

  it("uses a wide, low stage's width once the indicator is gone", () => {
    const stage = { width: 375, height: 290 };
    const { seats } = kreisPlan(6, stage, new Set([1]));
    const xs = seats.map((s) => s.x + s.size / 2);
    const ys = seats.map((s) => s.y + s.size / 2);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(spanX).toBeGreaterThan(spanY);
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThanOrEqual(0);
      expect(seat.y).toBeGreaterThanOrEqual(0);
      expect(seat.x + seat.size).toBeLessThanOrEqual(stage.width);
      expect(seat.y + seat.size).toBeLessThanOrEqual(stage.height);
    }
    for (let i = 0; i < seats.length; i++)
      for (let j = i + 1; j < seats.length; j++)
        expect(overlap(seats[i], seats[j])).toBe(false);
  });

  it("seats the first person at twelve o'clock and everybody on one circle", () => {
    const { seats, centre } = kreisPlan(8, { width: 800, height: 800 });
    const cx = centre.x + centre.size / 2;
    const cy = centre.y + centre.size / 2;
    const radii = seats.map((s) =>
      Math.hypot(s.x + s.size / 2 - cx, s.y + s.size / 2 - cy),
    );
    for (const r of radii) expect(Math.abs(r - radii[0])).toBeLessThan(1.5);
    expect(seats[0].x + seats[0].size / 2).toBeCloseTo(cx, 0);
    expect(seats[0].y).toBeLessThan(centre.y);
  });

  it.each([2, 3, 5, 9, 12])(
    "keeps %i people off the indicator, each other and the edge",
    (n) => {
      const stage = { width: 1000, height: 640 };
      const { seats, centre } = kreisPlan(n, stage);
      for (const seat of seats) {
        expect(overlap(seat, centre)).toBe(false);
        expect(seat.x).toBeGreaterThanOrEqual(0);
        expect(seat.y).toBeGreaterThanOrEqual(0);
        expect(seat.x + seat.size).toBeLessThanOrEqual(stage.width);
        expect(seat.y + seat.size).toBeLessThanOrEqual(stage.height);
      }
      for (let i = 0; i < seats.length; i++)
        for (let j = i + 1; j < seats.length; j++)
          expect(overlap(seats[i], seats[j])).toBe(false);
    },
  );

  it("makes a speaking or pinned person bigger", () => {
    const { seats } = kreisPlan(6, { width: 900, height: 600 }, new Set([2]));
    expect(seats[2].size).toBeGreaterThan(seats[0].size);
  });

  it("still has a group of two on the circle (a group call stays a Kreis)", () => {
    expect(kreisPlan(2, { width: 900, height: 600 }).seats).toHaveLength(2);
  });
});

describe("the Kacheln (S6)", () => {
  it("gives everybody the same tile and as many per row as fit", () => {
    const size = kachelSize(9, 1000, 6);
    expect(size.columns).toBe(Math.floor(1006 / (KACHEL_MIN_WIDTH + 6)));
    expect(size.height).toBe(Math.round(size.width / (4 / 3)));
  });

  it("never goes below one column or above the people there are", () => {
    expect(kachelSize(3, 120, 6).columns).toBe(1);
    expect(kachelSize(2, 3000, 6).columns).toBe(2);
  });

  it("puts pinned people first and keeps everybody else in order", () => {
    expect(orderForKacheln(["a", "b", "c", "d"], (s) => s === "c")).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });
});

describe("the raised hand's duration (S6)", () => {
  it.each([
    [0, "0:00"],
    [7_000, "0:07"],
    [100_000, "1:40"],
    [723_900, "12:03"],
    [-5, "0:00"],
  ])("shows %i ms as %s", (ms, want) => {
    expect(formatHandDuration(ms)).toBe(want);
  });
});

describe("the views a group offers (S6)", () => {
  it("offers five views to a group, two to a pair", () => {
    expect(stagePlan({ alone: false }).offer).toEqual([
      "kreis",
      "hain",
      "felder",
      "kacheln",
      "spotlight",
    ]);
    expect(stagePlan({ alone: true }).offer).toEqual([
      "einzelgespraech",
      "spotlight",
    ]);
  });

  it("keeps a stored view, the spotlight included", () => {
    const group = stagePlan({ alone: false });
    expect(resolveStageView("kacheln", group)).toBe("kacheln");
    expect(resolveStageView("spotlight", group)).toBe("spotlight");
  });

  it("falls back where the stored view is not on offer", () => {
    const pair = stagePlan({ alone: true });
    expect(resolveStageView("kreis", pair)).toBe("einzelgespraech");
    expect(resolveStageView("nonsense", stagePlan({ alone: false }))).toBe(
      "hain",
    );
  });

  it("draws the fallback arrangement under the spotlight", () => {
    const group = stagePlan({ alone: false });
    expect(arrangementFor("spotlight", group)).toBe("hain");
    expect(arrangementFor("kreis", group)).toBe("kreis");
  });
});

describe("the start view by conversation type (S6b, #2233 D9)", () => {
  it("starts a group conversation of three in the Felder", () => {
    const plan = stagePlan({ alone: false, callType: "group" });
    expect(plan.fallback).toBe("felder");
    expect(plan.offer).not.toContain("einzelgespraech");
    expect(resolveStageView(null, plan)).toBe("felder");
  });

  it("starts a Gesprächskreis of three in the Kreis", () => {
    const plan = stagePlan({ alone: false, callType: "circle" });
    expect(plan.offer).not.toContain("einzelgespraech");
    expect(resolveStageView(null, plan)).toBe("kreis");
  });

  /*
   * #2233 (D7): the head count decides first. A group conversation with
   * only two people in it is a 1:1 until the third arrives.
   */
  it("gives a group conversation of two the 1:1, whatever the type and intent", () => {
    for (const callType of ["group", "circle"] as const)
      for (const intent of ["audio", "video", null] as const) {
        const plan = stagePlan({ alone: true, callType, intent });
        expect(plan.offer).toEqual(["einzelgespraech", "spotlight"]);
        expect(resolveStageView("kreis", plan)).toBe("einzelgespraech");
      }
  });

  it("starts a 1:1 that grew into a group in the Felder", () => {
    const plan = stagePlan({ alone: false, callType: "single" });
    expect(resolveStageView(null, plan)).toBe("felder");
  });

  it("starts a single conversation of two in the Einzelgespräch", () => {
    const plan = stagePlan({ alone: true, callType: "single" });
    expect(resolveStageView(null, plan)).toBe("einzelgespraech");
  });

  it("keeps the head count's answer without a type", () => {
    expect(stagePlan({ alone: true }).fallback).toBe("einzelgespraech");
    expect(stagePlan({ alone: false, callType: null }).fallback).toBe("hain");
  });

  it("stores the choice per type", () => {
    expect(viewStorageKey("group")).toBe("oriso-call-view-group");
    expect(viewStorageKey("circle")).toBe("oriso-call-view-circle");
    expect(viewStorageKey("single")).toBe("oriso-call-view-single");
    expect(viewStorageKey(null)).toBe("oriso-call-view");
  });
});

describe("the views by call intent (S7)", () => {
  it("starts a video group by its type, never in a view it does not offer", () => {
    const want = {
      group: "felder",
      single: "felder",
      circle: "kreis",
    } as const;
    for (const callType of ["group", "single", "circle", null] as const) {
      const plan = stagePlan({ alone: false, callType, intent: "video" });
      expect(plan.offer).toContain(plan.fallback);
      if (callType === null) expect(plan.fallback).toBe("hain");
      else if (plan.offer.includes(want[callType]))
        expect(plan.fallback).toBe(want[callType]);
    }
  });

  it("keeps the Kreis for an audio Gesprächskreis", () => {
    const plan = stagePlan({
      alone: false,
      callType: "circle",
      intent: "audio",
    });
    expect(plan.offer[0]).toBe("kreis");
    expect(plan.fallback).toBe("kreis");
  });

  it("leaves a video pair its Einzelgespräch", () => {
    expect(
      stagePlan({ alone: true, callType: "single", intent: "video" }).offer,
    ).toEqual(["einzelgespraech", "spotlight"]);
  });
});
