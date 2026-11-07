/*
Copyright 2026 OpenResilienceInitiative.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { roomDisplayName } from "./roomDisplayName";

const id = "!call:example.invalid";

describe("embedded ORISO call display name", () => {
  it.each(["Group call for !source:example.invalid", id, ""])(
    "uses the localized fallback for the technical name %s",
    (name) => {
      expect(roomDisplayName(name, id, "Anruf", true)).toBe("Anruf");
    },
  );

  it.each(["Familienberatung", "Group call for beginners", "!mein Titel"])(
    "preserves a real room name: %s",
    (name) => {
      expect(roomDisplayName(name, id, "Anruf", true)).toBe(name);
    },
  );

  it("leaves standalone naming alone", () => {
    const name = "Group call for !source:example.invalid";
    expect(roomDisplayName(name, id, "Call", false)).toBe(name);
  });
});
