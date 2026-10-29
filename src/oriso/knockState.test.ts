/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { parseKnockState } from "./knockState";

describe("the host's knock state (#108)", () => {
  it("reads the waiting count and the switch", () => {
    expect(parseKnockState({ waiting: 3, knock: true })).toEqual({
      waiting: 3,
      knock: true,
    });
  });

  it("keeps the switch hidden when the host has no link to switch", () => {
    expect(parseKnockState({ waiting: 0, knock: null })).toEqual({
      waiting: 0,
      knock: null,
    });
  });

  it("refuses what is not a count", () => {
    for (const waiting of [-1, 1.5, "2", Number.NaN, undefined])
      expect(parseKnockState({ waiting, knock: true })).toBeNull();
    expect(parseKnockState(null)).toBeNull();
    expect(parseKnockState({ waiting: 1, knock: "yes" })).toBeNull();
  });
});
