/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type OrisoView } from "./useOrisoView";
import { type StageView } from "./ViewSwitcher";

/**
 * Which views a call offers, which one it starts in, and what a stored
 * choice means — one place, so the rail, the stage and the storage cannot
 * disagree.
 *
 * Two people in a call that is not a group get the Einzelgespräch, which is
 * not a choice but the name of what two people are in; the alternative is
 * the spotlight. Everybody else gets the five views of design 2a.
 *
 * The conversation type (`orisoCallType`, S6b) decides where a call starts,
 * not the head count: a group conversation starts in the Kreis and stays a
 * group at two people; a single conversation starts in the Einzelgespräch.
 * Without a type the head count decides, as it always did.
 */
export type OrisoCallType = "group" | "single";
export interface StagePlan {
  offer: readonly StageView[];
  /** The view a call starts in when nothing usable is stored. */
  fallback: StageView;
}

const GROUP_OFFER: readonly StageView[] = [
  "kreis",
  "hain",
  "felder",
  "kacheln",
  "spotlight",
];
const ONE_ON_ONE_OFFER: readonly StageView[] = ["einzelgespraech", "spotlight"];

export function stagePlan({
  alone,
  callType = null,
}: {
  /** Exactly two people, as the view model counts them. */
  alone: boolean;
  callType?: OrisoCallType | null;
}): StagePlan {
  if (callType === "group") return { offer: GROUP_OFFER, fallback: "kreis" };
  return alone
    ? { offer: ONE_ON_ONE_OFFER, fallback: "einzelgespraech" }
    : { offer: GROUP_OFFER, fallback: "hain" };
}

const ARRANGEMENTS: readonly string[] = ["kreis", "hain", "felder", "kacheln"];

const isArrangement = (view: string): view is OrisoView =>
  ARRANGEMENTS.includes(view);

/**
 * The view to show for what is stored: the stored one if this call offers
 * it, otherwise the plan's fallback. Spotlight is a stored choice too.
 */
export function resolveStageView(
  stored: string | null,
  plan: StagePlan,
): StageView {
  return stored !== null && (plan.offer as readonly string[]).includes(stored)
    ? (stored as StageView)
    : plan.fallback;
}

/**
 * The arrangement grid mode draws for a view. The spotlight and the
 * Einzelgespräch are not arrangements of the grove, so they keep the
 * fallback arrangement for the moment grid mode comes back.
 */
export function arrangementFor(view: StageView, plan: StagePlan): OrisoView {
  if (isArrangement(view)) return view;
  return isArrangement(plan.fallback) ? plan.fallback : "hain";
}

export const ORISO_VIEW_STORAGE_KEY = "oriso-call-view";

/**
 * Where the choice is kept: one per conversation type, so somebody who likes
 * the Kacheln for groups still starts a single conversation in the
 * Einzelgespräch. Without a type, the key everything used before.
 */
export function viewStorageKey(callType: OrisoCallType | null): string {
  return callType === null
    ? ORISO_VIEW_STORAGE_KEY
    : `${ORISO_VIEW_STORAGE_KEY}-${callType}`;
}
