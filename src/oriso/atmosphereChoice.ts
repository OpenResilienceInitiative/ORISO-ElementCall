/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AtmosphereName,
  DEFAULT_ATMOSPHERE,
  isAtmosphereName,
} from "./Atmosphere";

/**
 * Which backdrop somebody chose for themselves (design 2a, "Atmosphäre").
 *
 * Decision 3 of the call-design plan: the person chooses, and the default is
 * the carrier's motif — the `orisoAtmosphere` value the host puts on the
 * URL. "traeger" means "whatever the carrier set", so a carrier that changes
 * its motif later still reaches everybody who never chose one.
 *
 * Stored per person in this browser only: it is a preference about what does
 * somebody good, not a property of the call, and nobody else sees it.
 */
export type AtmosphereChoice = AtmosphereName | "traeger";

export const ATMOSPHERE_CHOICE_KEY = "oriso-call-atmosphere";

/** The stored value as a choice; anything unknown is the carrier's motif. */
export function readAtmosphereChoice(raw: string | null): AtmosphereChoice {
  return raw !== null && isAtmosphereName(raw) ? raw : "traeger";
}

/** The carrier's motif off the URL, or the handoff's default. */
export function carrierAtmosphere(urlValue: string | null): AtmosphereName {
  return urlValue !== null && isAtmosphereName(urlValue)
    ? urlValue
    : DEFAULT_ATMOSPHERE;
}

/** The backdrop to draw for a choice. */
export function resolveAtmosphere(
  choice: AtmosphereChoice,
  urlValue: string | null,
): AtmosphereName {
  return choice === "traeger" ? carrierAtmosphere(urlValue) : choice;
}

/**
 * A still preview of each motif for the picker, from the motif's own colours
 * in `pond.js` (base and masses). Eleven live canvases in a popover would
 * cost more than the stage itself; a gradient in the same colours is enough
 * to choose by.
 */
const SWATCH_COLOURS: Record<AtmosphereName, [string, string, string]> = {
  teich: ["#fbf7f6", "#f6dcd8", "#eec8c6"],
  fluss: ["#fcf8f7", "#f1d2cd", "#e6a79f"],
  nebel: ["#f8f8f7", "#e4e6e6", "#c9d2d2"],
  glut: ["#fdf8f3", "#f2c39a", "#eab19a"],
  lichtung: ["#f9faf6", "#d8e7d6", "#c3d8c6"],
  strom: ["#b8231f", "#a5000a", "#ffe9e2"],
  nacht: ["#1d1519", "#4a1a20", "#e3b6bf"],
  spirale: ["#161217", "#3a2530", "#c79aa0"],
  lagerfeuer: ["#0e1310", "#20301f", "#e8a05a"],
  ruhe: ["#fcf9f9", "#f2e4e1", "#eadcda"],
  duene: ["#fbf6f2", "#f0d3c7", "#e6b9ad"],
};

export function swatchFor(name: AtmosphereName): string {
  const [base, mass, accent] = SWATCH_COLOURS[name];
  return (
    `radial-gradient(circle at 30% 40%, ${mass} 0%, transparent 55%), ` +
    `radial-gradient(circle at 72% 62%, ${accent} 0%, transparent 50%), ` +
    base
  );
}
