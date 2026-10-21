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
 * Widening it to three values would make that rule ambiguous and would reach
 * into six files that are working.
 *
 * So the view switcher writes to both: Kreis and Kacheln both mean grid mode
 * with a different arrangement, Spotlight means spotlight mode. Two
 * orthogonal settings, one control.
 */
export type OrisoView = "hain" | "felder";

export const ORISO_VIEW_STORAGE_KEY = "oriso-call-view";

export const OrisoViewContext = createContext<OrisoView>("hain");

export function useOrisoView(): OrisoView {
  return use(OrisoViewContext);
}
