/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Room, RoomEvent, RoomStateEvent } from "matrix-js-sdk";
import { createContext, use, useEffect, useMemo, useState } from "react";

import {
  ORISO_IDENTITY_EVENT_TYPE,
  type OrisoIdentity,
  fallbackIdentity,
  readIdentity,
} from "./identity";

export type Identities = ReadonlyMap<string, OrisoIdentity>;

/** Everybody's published identity, read out of room state. */
export function readIdentities(room: Room): Identities {
  const identities = new Map<string, OrisoIdentity>();
  const state = room.currentState;
  // A mock, or a room whose state has not loaded, answers neither.
  const events = state?.getStateEvents?.(ORISO_IDENTITY_EVENT_TYPE);
  if (!Array.isArray(events)) return identities;
  for (const event of events) {
    const userId = event.getStateKey();
    if (userId === undefined) continue;
    const identity = readIdentity(event.getContent());
    if (identity !== null) identities.set(userId, identity);
  }
  return identities;
}

function same(a: Identities, b: Identities): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [userId, identity] of a) {
    const other = b.get(userId);
    if (
      other === undefined ||
      other.kind !== identity.kind ||
      other.file !== identity.file ||
      other.bg !== identity.bg ||
      other.ink !== identity.ink ||
      other.initials !== identity.initials
    )
      return false;
  }
  return true;
}

/**
 * Everybody's identity in this room, as published by their own client.
 *
 * Read from room state rather than computed: the call is told who somebody is
 * and does not get a vote. Live, so a person who changes their motif
 * mid-call changes on the stage too.
 *
 * Deliberately NOT built on `useRoomState`. That hook maps room state through
 * `useSyncExternalStore`, whose `getSnapshot` must return a stable value — and
 * this mapping builds a Map, so a fresh object came back on every call and
 * React spun until it gave up with "Maximum update depth exceeded". State
 * plus an equality check is the version that holds still.
 */
export function useOrisoIdentities(room: Room): Identities {
  const [identities, setIdentities] = useState<Identities>(() =>
    readIdentities(room),
  );

  useEffect(() => {
    const update = (): void =>
      setIdentities((prev) => {
        const next = readIdentities(room);
        return same(prev, next) ? prev : next;
      });
    update();
    room.on(RoomEvent.CurrentStateUpdated, update);
    room.currentState?.on?.(RoomStateEvent.Events, update);
    return (): void => {
      room.off(RoomEvent.CurrentStateUpdated, update);
      room.currentState?.off?.(RoomStateEvent.Events, update);
    };
  }, [room]);

  return identities;
}

export interface OrisoStage {
  /** Who published what. Missing means we were not told. */
  identities: Identities;
  /** The host's origin, so the artwork can be inherited rather than drawn. */
  parentUrl: string | null;
  /**
   * Whether the ORISO design is in use at all.
   *
   * False in the standalone build and in every existing test, which keep
   * upstream's rectangles. One flag rather than a fork in the component tree,
   * so there is only ever one tile implementation.
   */
  enabled: boolean;
}

const EMPTY: OrisoStage = {
  identities: new Map(),
  parentUrl: null,
  enabled: false,
};

export const OrisoStageContext = createContext<OrisoStage>(EMPTY);

export function useOrisoStage(): OrisoStage {
  return use(OrisoStageContext);
}

/**
 * One person's identity, or the honest stand-in for not having been told.
 *
 * The stand-in is initials. An animal derived from the user id would look
 * like success and be the one thing the handoff forbids — see
 * `fallbackIdentity`.
 */
export function useOrisoIdentity(
  userId: string,
  displayName: string,
): OrisoIdentity | undefined {
  const { identities, enabled } = useOrisoStage();
  const published = identities.get(userId);
  return useMemo(() => {
    if (!enabled) return undefined;
    return published ?? fallbackIdentity(userId, displayName);
  }, [enabled, published, userId, displayName]);
}
