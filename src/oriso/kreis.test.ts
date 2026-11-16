/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  KREIS_NAME_MIN,
  kreisNames,
  kreisPlan,
  type KreisStatus,
  kreisStatusWidth,
} from "./kreis";
import { nameSideFor } from "./shape";
import { NEUTRAL_NAME, type OrisoIdentity, readIdentity } from "./identity";
import { shownNameOnStage } from "./useOrisoIdentities";

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
  // The capsule as `kreisNames` plans it: the name at its guessed width,
  // and whatever status stands beside it.
  const capsule = (
    f: { x: number; y: number; size: number },
    n: { side: string; max: number },
    name: string,
    status?: KreisStatus,
  ): { l: number; r: number; t: number } => {
    const w =
      Math.min(n.max, [...name].length * 7) + 24 + kreisStatusWidth(status);
    const l =
      n.side === "start"
        ? f.x
        : n.side === "end"
          ? f.x + f.size - w
          : f.x + f.size / 2 - w / 2;
    return { l, r: l + w, t: f.y };
  };
  /**
   * How many capsule pairs meet on a ring of `count`. `planned` are the names
   * `kreisNames` is given, `shown` those the capsules then carry.
   */
  const overlaps = (
    count: number,
    status: readonly KreisStatus[] = [],
    planned: readonly string[] = NAMES.slice(0, count),
    shown: readonly string[] = planned,
  ): number => {
    const forms = kreisPlan(count, STAGE).seats;
    const laid = kreisNames(forms, planned, STAGE.width, 184, side, status);
    const caps = forms.map((f, i) => capsule(f, laid[i], shown[i], status[i]));
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

  it("keeps the full cap for a capsule nobody presses on, even on a crowded ring", () => {
    // Codex on #160: one capped pair used to cap every name at its guessed
    // width, so wide glyphs (CJK, "W") were cut where there was room.
    const forms = kreisPlan(18, STAGE).seats;
    const names = NAMES.map((n, i) => (i === 4 ? "WWWWWWWWWW" : n));
    const laid = kreisNames(forms, names, STAGE.width, 184, side);
    expect(laid.some((n) => n.max < 184)).toBe(true);
    expect(laid[4].max).toBe(184);
  });

  /*
   * The very top and bottom seat of a ring of 14 or more sit between two
   * neighbours whose capsules start at their own forms' edges: the gap is
   * narrower than a hand, its time and the shortest name together, so those
   * two seats are left out of the "every hand up" cases below. One hand
   * anywhere else, or a muted microphone anywhere, always fits.
   */
  const crest = (count: number, i: number): boolean => {
    if (count < 14) return false;
    const forms = kreisPlan(count, STAGE).seats;
    const mid =
      forms.reduce((sum, f) => sum + f.x + f.size / 2, 0) / forms.length;
    const f = forms[i];
    return Math.abs(f.x + f.size / 2 - mid) < f.size / 2;
  };

  it("leaves room for raised hands: no overlap with (nearly) every hand up", () => {
    for (const count of [6, 9, 12, 14, 16, 18]) {
      const hands = Array.from({ length: count }, (_, i) => ({
        hand: !crest(count, i),
        muted: false,
      }));
      expect({ count, overlaps: overlaps(count, hands) }).toEqual({
        count,
        overlaps: 0,
      });
    }
  });

  it("leaves room for one raised hand on any side seat", () => {
    for (const count of [6, 9, 12, 14, 16, 18])
      for (let h = 0; h < count; h++) {
        if (crest(count, h)) continue;
        const one = Array.from({ length: count }, (_, i) => ({
          hand: i === h,
          muted: true,
        }));
        expect({ count, h, overlaps: overlaps(count, one) }).toEqual({
          count,
          h,
          overlaps: 0,
        });
      }
  });

  it("leaves room for muted microphones, alone and beside a hand", () => {
    for (const count of [6, 9, 12, 14, 16, 18]) {
      const muted = Array.from({ length: count }, () => ({
        hand: false,
        muted: true,
      }));
      const mixed = Array.from({ length: count }, (_, i) => ({
        hand: i % 2 === 0 && !crest(count, i),
        muted: i % 3 !== 0,
      }));
      expect({
        count,
        muted: overlaps(count, muted),
        mixed: overlaps(count, mixed),
      }).toEqual({ count, muted: 0, mixed: 0 });
    }
  });

  it("re-plans when a hand goes up: the status changes the budget", () => {
    const forms = kreisPlan(18, STAGE).seats;
    const calm = kreisNames(forms, NAMES, STAGE.width, 184, side);
    const hands = kreisNames(
      forms,
      NAMES,
      STAGE.width,
      184,
      side,
      forms.map(() => ({ hand: true, muted: true })),
    );
    expect(hands).not.toEqual(calm);
    hands.forEach((n) => expect(n.max).toBeGreaterThanOrEqual(KREIS_NAME_MIN));
  });

  describe("measures the name the capsule shows (pseudonymous accounts)", () => {
    const record = (name?: string): OrisoIdentity => {
      const read = readIdentity({
        kind: "animal",
        file: "fox.svg",
        bg: "#F7CAC9",
        ink: "#1A1A1A",
        ...(name === undefined ? {} : { name }),
      });
      if (read === null) throw new Error("the fixture itself was rejected");
      return read;
    };
    const idOf = (i: number): string => `@p${i}:o.test`;

    it("resolves the published name, the neutral label, or upstream's", () => {
      const identities = new Map([[idOf(1), record("ruhiger Fuchs 432")]]);
      const on = { identities, enabled: true };
      expect(shownNameOnStage(on, idOf(1), idOf(1), NEUTRAL_NAME)).toBe(
        "ruhiger Fuchs 432",
      );
      expect(shownNameOnStage(on, idOf(2), idOf(2), NEUTRAL_NAME)).toBe(
        NEUTRAL_NAME,
      );
      // A real room name wins over the published one.
      expect(shownNameOnStage(on, idOf(1), "Alice", NEUTRAL_NAME)).toBe(
        "Alice",
      );
      expect(
        shownNameOnStage(
          { identities, enabled: false },
          idOf(1),
          idOf(1),
          NEUTRAL_NAME,
        ),
      ).toBe(idOf(1));
    });

    it("keeps capsules apart only when planned with the shown names", () => {
      const ids = NAMES.map((_, i) => idOf(i));
      const identities = new Map(NAMES.map((n, i) => [ids[i], record(n)]));
      const shown = ids.map((id) =>
        shownNameOnStage({ identities, enabled: true }, id, id, NEUTRAL_NAME),
      );
      expect(shown).toEqual(NAMES);
      // At 13, planned off the short Matrix ids nothing seems to meet, and
      // the longer published names then collide; planned off them, none do.
      expect(overlaps(13, [], ids.slice(0, 13), shown)).toBeGreaterThan(0);
      expect(overlaps(13, [], shown.slice(0, 13), shown)).toBe(0);
    });
  });
});
