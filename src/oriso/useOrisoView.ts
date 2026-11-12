/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, use } from "react";

/**
 * How the group is arranged.
 *
 * Deliberately NOT folded into upstream's `GridMode`. That setting answers a
 * different question — whether one thing is big (a screen share, an expanded
 * speaker) or everybody is equal — and the machinery around it auto-switches
 * to spotlight when somebody shares a screen or turns their phone sideways.
 * Widening it would make that rule ambiguous and would reach into six files
 * that are working.
 *
 * So the view switcher writes to both: Kreis, Hain, Felder and Kacheln all
 * mean grid mode with a different arrangement, Spotlight means spotlight
 * mode. Two orthogonal settings, one control. See `stageViews.ts`.
 */
export type OrisoView = "kreis" | "hain" | "felder" | "kacheln";

export const OrisoViewContext = createContext<OrisoView>("hain");

export function useOrisoView(): OrisoView {
  return use(OrisoViewContext);
}

/**
 * Who is pinned ("Anheften — bleibt groß"), by media id, and the switch.
 *
 * Local to this person: pinning changes what I see, not what anybody else
 * does. Every arrangement reads it as "stays big" — weighted like a speaker
 * in the Hain, the Felder and the Kreis, first in the Kacheln.
 */
export interface OrisoPins {
  pinned: ReadonlySet<string>;
  toggle: ((mediaId: string) => void) | null;
}

export const OrisoPinsContext = createContext<OrisoPins>({
  pinned: new Set(),
  toggle: null,
});

export function useOrisoPins(): OrisoPins {
  return use(OrisoPinsContext);
}
