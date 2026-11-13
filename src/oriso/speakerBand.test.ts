/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  kreisNamesSpeakerBeside,
  type SpeakerBandInput,
  speakerBandPlace,
} from "./speakerBand";
import { KREIS_CENTRE_TEXT_MIN, kreisPlan } from "./kreis";
import { stageBesideSpotlight } from "./spotlightRoom";
import { type StageView } from "./ViewSwitcher";

const desktop: SpeakerBandInput = {
  enabled: true,
  pip: false,
  headerShown: true,
  mobile: false,
  view: "hain",
  kreisNamesSpeaker: false,
};

const ALL_VIEWS: StageView[] = [
  "kreis",
  "hain",
  "felder",
  "kacheln",
  "spotlight",
  "einzelgespraech",
];

describe("where the speaker band goes (R27)", () => {
  it("sits under the phone's header in every view, the 1:1 included", () => {
    for (const view of ALL_VIEWS)
      expect(speakerBandPlace({ ...desktop, mobile: true, view })).toBe(
        "phone",
      );
  });

  it("sits in the desktop header, condensed, in every view but a Kreis that names the speaker", () => {
    for (const view of ALL_VIEWS.filter((v) => v !== "kreis"))
      expect(speakerBandPlace({ ...desktop, view })).toBe("header");
    // The Kreis's centre already says "Susanne P. spricht" in the middle of
    // the circle; the same sentence in the header would say it twice.
    expect(
      speakerBandPlace({ ...desktop, view: "kreis", kreisNamesSpeaker: true }),
    ).toBeNull();
    // A centre too small for the name (or left out) leaves it to the band.
    expect(
      speakerBandPlace({ ...desktop, view: "kreis", kreisNamesSpeaker: false }),
    ).toBe("header");
  });

  it("keeps the band on a phone's Kreis even when the centre names the speaker", () => {
    // 5b: the phone's band is part of its header, the same in every view.
    expect(
      speakerBandPlace({
        ...desktop,
        mobile: true,
        view: "kreis",
        kreisNamesSpeaker: true,
      }),
    ).toBe("phone");
  });

  it("is in the minimised call (pip), where there is no header", () => {
    expect(
      speakerBandPlace({ ...desktop, pip: true, headerShown: false }),
    ).toBe("pip");
    expect(
      speakerBandPlace({
        ...desktop,
        pip: true,
        headerShown: false,
        mobile: true,
      }),
    ).toBe("pip");
  });

  it("is not drawn without the ORISO design or without any call chrome", () => {
    expect(speakerBandPlace({ ...desktop, enabled: false })).toBeNull();
    expect(
      speakerBandPlace({ ...desktop, enabled: false, pip: true }),
    ).toBeNull();
    expect(speakerBandPlace({ ...desktop, headerShown: false })).toBeNull();
  });
});

describe("the Kreis beside a shared screen (#2233 review)", () => {
  // InCallView's grid at 1440x900 (header 72, bar 144).
  const GRID = { width: 1440, height: 684 };

  it("measures the centre on the stage the grove gives it, not the whole grid", () => {
    // The whole grid has room for "Susanne P. spricht" in the middle…
    expect(kreisNamesSpeakerBeside(GRID, null)).toBe(true);
    // …but a shared screen takes its band off the top or the bottom, the
    // centre shrinks below the name, and the header has to say it.
    for (const side of ["start", "end"] as const) {
      expect(kreisNamesSpeakerBeside(GRID, side)).toBe(false);
      expect(
        speakerBandPlace({
          ...desktop,
          view: "kreis",
          kreisNamesSpeaker: kreisNamesSpeakerBeside(GRID, side),
        }),
      ).toBe("header");
    }
  });

  it.each([null, "start", "end"] as const)(
    "agrees with the centre the grove draws (%s)",
    (side) => {
      const { centre } = kreisPlan(
        6,
        stageBesideSpotlight(GRID.width, GRID.height, side),
      );
      expect(kreisNamesSpeakerBeside(GRID, side)).toBe(
        centre.size >= KREIS_CENTRE_TEXT_MIN,
      );
    },
  );
});
