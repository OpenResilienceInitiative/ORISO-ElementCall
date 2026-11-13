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
 * Two people get the Einzelgespräch, which is not a choice but the name of
 * what two people are in; the alternative is the spotlight. Everybody else
 * gets the five views of design 2a.
 *
 * The head count decides first (#2233, D7): a group conversation with only
 * two people in it is a 1:1 until the third arrives. From three on, the
 * conversation type (`orisoCallType`, S6b) decides where a call starts: a
 * Gesprächskreis in the Kreis, any other group conversation in the Felder.
 * Without a type the Hain, as it always did.
 *
 * A single conversation that grows to three (S8, "Link teilen") gets the
 * group's rail and starts in the Felder; back at two it is the
 * Einzelgespräch again.
 */
export type OrisoCallType = "group" | "circle" | "single";

/**
 * A conversation of many: a Gesprächskreis (`circle`) or any other group,
 * e.g. an internal team chat (`group`). At two people it is a 1:1 all the
 * same (#2233, D7); its type only decides where three or more start.
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
 * A video group (S7) gets the same five views (#2233): the Kreis is where a
 * Gesprächskreis meets, with cameras or without.
 */
const VIDEO_GROUP_OFFER: readonly StageView[] = GROUP_OFFER;

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
  // Two people are a 1:1 whatever the conversation type (#2233, D7).
  if (alone) return { offer: ONE_ON_ONE_OFFER, fallback: "einzelgespraech" };
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
