/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { oneOnOnePeople } from "./oneOnOnePeople";

const me = { id: "me", local: true };
const other = { id: "other", local: false };
const third = { id: "third", local: false };

describe("oneOnOnePeople (#2233, D7)", () => {
  it("is the pair for two people, one of them me", () => {
    expect(oneOnOnePeople([other, me])).toEqual({ local: me, remote: other });
  });

  it("is no 1:1 for three people", () => {
    expect(oneOnOnePeople([me, other, third])).toBeNull();
  });

  it("is no 1:1 for somebody alone in the call", () => {
    expect(oneOnOnePeople([me])).toBeNull();
  });

  it("is no 1:1 for two remote people without me", () => {
    expect(oneOnOnePeople([other, third])).toBeNull();
  });
});
