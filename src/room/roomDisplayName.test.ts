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

  /*
   * ORISO-Frontend#2170: the Frontend names a call after the direct link it
   * came through, else "Anruf". That neutral name is the one word that has to
   * show in the viewer's own language, not the counsellor's.
   */
  it("shows the neutral call name the Frontend sets in the viewer's language", () => {
    expect(roomDisplayName("Anruf", id, "Call", true)).toBe("Call");
  });

  it.each(["Anruf ", " Anruf", "anruf"])(
    "recognises the neutral call name when it is written %j",
    (name) => {
      expect(roomDisplayName(name, id, "Call", true)).toBe("Call");
    },
  );

  it("shows the name of a direct link as the counsellor wrote it", () => {
    expect(roomDisplayName("Flyer Schule", id, "Anruf", true)).toBe(
      "Flyer Schule",
    );
  });

  it("does not translate the neutral name outside an ORISO call", () => {
    expect(roomDisplayName("Anruf", id, "Call", false)).toBe("Anruf");
  });

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
