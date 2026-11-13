/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  KREIS_CENTRE_MIN,
  KREIS_CENTRE_SHARE,
  kreisCentreNamesSpeaker,
  kreisPlan,
} from "./kreis";
import {
  KACHEL_MAX_WIDTH,
  KACHEL_MIN_WIDTH,
  kachelSize,
  kachelnRange,
  orderForKacheln,
} from "./kacheln";
import { formatHandDuration } from "./handDuration";
import { haloRoomFor } from "./layout";
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

  it.each([
    ["phone", { width: 390, height: 604 }],
    ["phone, notes open, without the disc", { width: 390, height: 300 }],
  ])("seats one person alone on the stage (%s, #2233 review)", (_, stage) => {
    // One person is not the triangle of the smallest group: measured as
    // one, the seats' reach came to zero and every position to NaN.
    const { seats, centre, indicator } = kreisPlan(1, stage);
    if (stage.height === 300) expect(indicator).toBe(false);
    expect(seats).toHaveLength(1);
    const [seat] = seats;
    for (const v of [seat.x, seat.y, seat.size, centre.x, centre.y])
      expect(Number.isFinite(v)).toBe(true);
    expect(seat.size).toBeGreaterThan(0);
    expect(seat.x).toBeGreaterThanOrEqual(0);
    expect(seat.y).toBeGreaterThanOrEqual(0);
    expect(seat.x + seat.size).toBeLessThanOrEqual(stage.width);
    expect(seat.y + seat.size).toBeLessThanOrEqual(stage.height);
  });

  it("still has a group of two on the circle (a group call stays a Kreis)", () => {
    expect(kreisPlan(2, { width: 900, height: 600 }).seats).toHaveLength(2);
  });
});

describe("the Kreis at three, the smallest group (T4)", () => {
  // InCallView's stage at 1440x900 (header 72, bar 144) and on a 390x844
  // phone (header with the wave band 136, bar 104).
  const DESKTOP = { width: 1440, height: 684 };
  const PHONE = { width: 390, height: 604 };
  const box = (
    seats: { x: number; y: number; size: number }[],
  ): { top: number; bottom: number; left: number; right: number } => ({
    top: Math.min(...seats.map((s) => s.y)),
    bottom: Math.max(...seats.map((s) => s.y + s.size)),
    left: Math.min(...seats.map((s) => s.x)),
    right: Math.max(...seats.map((s) => s.x + s.size)),
  });

  it("gives three people bigger forms than a crowd gets", () => {
    const three = kreisPlan(3, DESKTOP).seats;
    const six = kreisPlan(6, DESKTOP).seats;
    expect(three[0].size).toBeGreaterThan(six[0].size);
    // At least the indicator's own size: three forms are not smaller than
    // the disc they stand around.
    expect(three[0].size).toBeGreaterThanOrEqual(
      Math.round(DESKTOP.height * KREIS_CENTRE_SHARE),
    );
    // On a phone, not the 97px they were.
    expect(kreisPlan(3, PHONE).seats[0].size).toBeGreaterThanOrEqual(110);
  });

  it.each([
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ])(
    "centres the three as a group, not the top one's ring (%s)",
    (_, stage) => {
      // A triangle on a circle has one person a whole radius up and two
      // only half a radius down: centred on the circle, the group hung in
      // the upper part of the stage with the bottom third empty.
      const { seats } = kreisPlan(3, stage, new Set([0]));
      const { top, bottom } = box(seats);
      expect(Math.abs(top - (stage.height - bottom))).toBeLessThanOrEqual(2);
    },
  );

  it("keeps the indicator in the middle of the three", () => {
    const { seats, centre } = kreisPlan(3, DESKTOP, new Set([1]));
    const cx = centre.x + centre.size / 2;
    const cy = centre.y + centre.size / 2;
    const radii = seats.map((s) =>
      Math.hypot(s.x + s.size / 2 - cx, s.y + s.size / 2 - cy),
    );
    for (const r of radii) expect(Math.abs(r - radii[0])).toBeLessThan(1.5);
  });

  it("leaves a small phone disc out at three, where it could not name anybody", () => {
    // A disc too small for the name is only bars between three forms that
    // already light up, and the phone's band names the speaker. Without it
    // the three get the room.
    const phone = kreisPlan(3, PHONE);
    expect(phone.indicator).toBe(false);
    expect(kreisCentreNamesSpeaker(PHONE)).toBe(false);
    expect(kreisPlan(3, DESKTOP).indicator).toBe(true);
    expect(kreisCentreNamesSpeaker(DESKTOP)).toBe(true);
  });

  it.each([
    ["desktop", DESKTOP],
    ["phone", PHONE],
    ["phone, notes open", { width: 390, height: 300 }],
  ])(
    "keeps three off each other, the indicator and the halo's room (%s)",
    (_, stage) => {
      for (const speaking of [new Set<number>(), new Set([0]), new Set([2])]) {
        const { seats, centre } = kreisPlan(3, stage, speaking);
        const room = haloRoomFor(stage.width, stage.height);
        const { top, bottom, left, right } = box(seats);
        expect(top).toBeGreaterThanOrEqual(Math.floor(room));
        expect(left).toBeGreaterThanOrEqual(Math.floor(room));
        expect(stage.height - bottom).toBeGreaterThanOrEqual(Math.floor(room));
        expect(stage.width - right).toBeGreaterThanOrEqual(Math.floor(room));
        for (const seat of seats)
          if (centre.size > 0) expect(overlap(seat, centre)).toBe(false);
        for (let i = 0; i < 3; i++)
          for (let j = i + 1; j < 3; j++)
            expect(overlap(seats[i], seats[j])).toBe(false);
      }
    },
  );
});

describe("the Kacheln (S6)", () => {
  it("gives everybody the same tile and as many per row as fit", () => {
    const size = kachelSize(9, 1000, 6);
    expect(size.columns).toBe(Math.floor(1006 / (KACHEL_MIN_WIDTH + 6)));
    // #2233 (T12): square tiles.
    expect(size.height).toBe(size.width);
  });

  it("puts two square tiles side by side on a phone (#2233)", () => {
    expect(kachelSize(14, 340, 6).columns).toBe(2);
    // What the sheet really gets: the phone's width less the halo's room on
    // both sides (360px phone, 302px sheet; a 320px phone, less still).
    for (const phone of [320, 360, 390]) {
      const sheet = phone - 2 * Math.round(haloRoomFor(phone, 700));
      const size = kachelSize(14, sheet, 6);
      expect(size.columns).toBe(2);
      expect(size.width * 2 + 6).toBeLessThanOrEqual(sheet);
    }
  });

  it("keeps a square tile to a size a face fills (#2233)", () => {
    const size = kachelSize(2, 3000, 6);
    expect(size.width).toBeLessThanOrEqual(KACHEL_MAX_WIDTH);
    expect(size.height).toBe(size.width);
  });

  it("names the people in sight by their place in the sheet (#2233)", () => {
    const rows = [0, 0, 210, 210, 420, 420].map((top) => ({
      top,
      bottom: top + 200,
    }));
    expect(kachelnRange(rows, { top: 0, bottom: 410 })).toEqual({
      first: 1,
      last: 4,
    });
    expect(kachelnRange(rows, { top: 205, bottom: 620 })).toEqual({
      first: 3,
      last: 6,
    });
    expect(kachelnRange([], { top: 0, bottom: 400 })).toBeNull();
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
  it("starts a group conversation in the Felder, at two people too", () => {
    for (const alone of [true, false]) {
      const plan = stagePlan({ alone, callType: "group" });
      expect(plan.fallback).toBe("felder");
      expect(plan.offer).not.toContain("einzelgespraech");
      expect(resolveStageView(null, plan)).toBe("felder");
    }
  });

  it("starts a Gesprächskreis in the Kreis", () => {
    for (const alone of [true, false]) {
      const plan = stagePlan({ alone, callType: "circle" });
      expect(plan.offer).not.toContain("einzelgespraech");
      expect(resolveStageView(null, plan)).toBe("kreis");
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
  it("offers a video group all five views, the Kreis too (#2233)", () => {
    for (const callType of ["group", "single", "circle", null] as const) {
      const plan = stagePlan({ alone: false, callType, intent: "video" });
      expect(plan.offer).toEqual([
        "kreis",
        "hain",
        "felder",
        "kacheln",
        "spotlight",
      ]);
      expect(resolveStageView("kreis", plan)).toBe("kreis");
    }
  });

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
