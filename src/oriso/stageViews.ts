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
 * not the head count: a Gesprächskreis starts in the Kreis, another group
 * conversation in the Felder, and both stay groups at two people; a single
 * conversation starts in the Einzelgespräch. Without a type the head count
 * decides, as it always did.
 *
 * A single conversation that grows to three (S8, "Link teilen") gets the
 * group's rail and starts in the Felder; back at two it is the
 * Einzelgespräch again.
 */
export type OrisoCallType = "group" | "circle" | "single";

/**
 * A conversation of many: a Gesprächskreis (`circle`) or any other group,
 * e.g. an internal team chat (`group`). It keeps the group's views at two
 * people too.
 */
export const isGroupConversation = (callType: OrisoCallType | null): boolean =>
  callType === "group" || callType === "circle";

/*
 * Where a typed conversation of three or more starts (#2233 D9, Frank,
 * 12.11.): a Gesprächskreis in the Kreis, everything else in the Felder —
 * an internal group chat, and a 1:1 that grew into a group through the
 * shared link. Fixed defaults; there is no favourite view in the profile.
 */
const TYPE_FALLBACK: Record<OrisoCallType, StageView> = {
  circle: "kreis",
  group: "felder",
  single: "felder",
};
export type OrisoCallIntent = "audio" | "video";
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
/*
 * A video group (S7): the arrangements that carry a camera inside their
 * forms. The Kreis is a voice view — its middle is the room's sound — and is
 * not offered when people can see each other.
 */
const VIDEO_GROUP_OFFER: readonly StageView[] = [
  "hain",
  "felder",
  "kacheln",
  "spotlight",
];

export function stagePlan({
  alone,
  callType = null,
  intent = null,
}: {
  /** Exactly two people, as the view model counts them. */
  alone: boolean;
  callType?: OrisoCallType | null;
  intent?: OrisoCallIntent | null;
}): StagePlan {
  if (alone && !isGroupConversation(callType))
    return { offer: ONE_ON_ONE_OFFER, fallback: "einzelgespraech" };
  const offer = intent === "video" ? VIDEO_GROUP_OFFER : GROUP_OFFER;
  /*
   * Without a type, the Hain as before. A typed default the offer does not
   * have (the Kreis where a video group is not offered it) falls back to the
   * Hain too, so a call never starts in a view its rail cannot show.
   */
  const typed = callType === null ? "hain" : TYPE_FALLBACK[callType];
  return { offer, fallback: offer.includes(typed) ? typed : "hain" };
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
