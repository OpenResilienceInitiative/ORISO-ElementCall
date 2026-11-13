/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type StageView } from "./ViewSwitcher";
import { kreisCentreNamesSpeaker } from "./kreis";
import { type SpotlightSide, stageBesideSpotlight } from "./spotlightRoom";

/**
 * Where the wave band with the speaker's name goes (R27, design 5b).
 *
 * - `"phone"`: the 56px pill under a phone's compact header, as 5b draws it.
 * - `"header"`: condensed into the middle of the desktop header — the same
 *   bars and name in one 40px line, so the stage keeps its height and the
 *   band covers no face and no part of the bar.
 * - `"pip"`: a slim line above the one form of the minimised call, which
 *   has no header to put it in.
 * - `null`: not drawn.
 */
export type SpeakerBandPlace = "phone" | "header" | "pip" | null;

/** The pip line's height and its margin above, which the form gives up. */
export const PIP_BAND_BLOCK = 32 + 6;

export interface SpeakerBandInput {
  /** The ORISO design is on. */
  enabled: boolean;
  /** The call is minimised to its picture-in-picture (`layout.type`). */
  pip: boolean;
  /** The ORISO header is drawn (controls shown, not in pip). */
  headerShown: boolean;
  /** A phone's full screen (compact header). */
  mobile: boolean;
  view: StageView;
  /** The Kreis's centre is big enough to say who speaks itself. */
  kreisNamesSpeaker: boolean;
}

/**
 * Who is speaking is shown in every view, the minimised call included.
 *
 * The one exception is a desktop Kreis whose centre already reads
 * "Susanne P. spricht" in the middle of the circle: the header saying the
 * same sentence again, a hand's width above it, is noise. Where the centre is
 * too small for the name — or is left out — the band is back. A phone keeps
 * its band in the Kreis too, because there the band is part of the header in
 * every view (5b) and the centre is mostly too small for a name anyway.
 */
export function speakerBandPlace(input: SpeakerBandInput): SpeakerBandPlace {
  if (!input.enabled) return null;
  if (input.pip) return "pip";
  if (!input.headerShown) return null;
  if (input.mobile) return "phone";
  if (input.view === "kreis" && input.kreisNamesSpeaker) return null;
  return "header";
}

/**
 * Whether the Kreis's centre names the speaker, on the stage it really gets.
 *
 * With a shared screen the grove gives the Kreis only the stage beside it
 * (`stageBesideSpotlight`). Measured on the whole grid instead, the header
 * left the name to a centre too small to show it, and nobody was named at
 * all (#2233 review).
 */
export function kreisNamesSpeakerBeside(
  grid: { width: number; height: number },
  spotlight: SpotlightSide,
): boolean {
  return kreisCentreNamesSpeaker(
    stageBesideSpotlight(grid.width, grid.height, spotlight),
  );
}
