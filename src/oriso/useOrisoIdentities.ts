/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
} from "matrix-js-sdk";
import { createContext, use, useEffect, useMemo, useState } from "react";

import {
  ORISO_IDENTITY_EVENT_TYPE,
  type OrisoIdentity,
  fallbackIdentity,
  initialsFor,
  readIdentity,
} from "./identity";

export type Identities = ReadonlyMap<string, OrisoIdentity>;

/**
 * Everybody's published identity, read out of the call room's timeline.
 *
 * Timeline, not room state, and that is the whole point: room state is NOT
 * encrypted, in an encrypted room or any other. An `org.oriso.call.identity`
 * state event was readable by the homeserver and by every server it
 * federates to, which on a counselling platform is a record of which advice
 * seeker chose which animal. A timeline event in this room is sealed by the
 * room's Megolm session, so the server stores ciphertext and the design is
 * unchanged.
 *
 * Keyed by SENDER, which is also what closes forgery. A state event let one
 * participant claim another's slot unless the reader checked the sender
 * against the state key by hand; here there is no key to claim. The sender of
 * a decrypted event is attested by the device that encrypted it.
 *
 * The newest record wins. `getEvents()` is ordered oldest first, so a later
 * assignment simply overwrites — which is what makes a person who changes
 * their motif mid-call change on the stage, and what makes the re-send that
 * the host performs when somebody new joins land as an update rather than a
 * duplicate.
 */
export function readIdentities(room: Room, known?: Identities): Identities {
  /*
   * Starts from what is already known, because the live timeline is a WINDOW
   * on the room and not the room.
   *
   * Absence from it is not withdrawal. A limited sync replaces the live
   * timeline wholesale, and the replacement chunk need not contain identity
   * events that are still perfectly valid in the room's history; the same is
   * true once a long call pushes them out of the window. Building the map
   * from the window alone therefore dropped everybody who had not spoken
   * about themselves recently, and they fell back to stand-in letters until
   * their client happened to publish again. The earlier version of this had
   * the reasoning exactly backwards — it called that case "identities that
   * are no longer in it".
   *
   * What does remove somebody is their own newest record being unreadable,
   * which is the redaction case below. That is a thing they said; this is
   * only a thing we cannot currently see.
   */
  const identities = new Map<string, OrisoIdentity>(known ?? []);
  // A mock, or a room whose timeline has not loaded, answers neither.
  const events = room.getLiveTimeline?.()?.getEvents?.();
  if (!Array.isArray(events)) return identities;
  /*
   * The newest record per sender, and only then read it.
   *
   * Reading as we go would let an older valid record survive a newer invalid
   * one — and the commonest newer-invalid record is a REDACTED one, whose
   * content is empty. Somebody who withdrew their animal would have kept it,
   * or fallen back to one they had replaced, instead of returning to the
   * stand-in letters. The newest thing a person said about themselves wins,
   * including when the newest thing is nothing.
   *
   * One malformed record still costs only its own owner a face, which is the
   * other half of the rule.
   */
  const newest = new Map<string, unknown>();
  for (const event of events) {
    /*
     * An event still in flight reads as `m.room.encrypted` and only becomes
     * this type once decrypted, which is why the hook below re-reads on every
     * timeline change: the host feeds the widget decrypted events, so the
     * arrival of the clear event IS a timeline event.
     */
    if (event.getType?.() !== ORISO_IDENTITY_EVENT_TYPE) continue;
    const sender = event.getSender?.();
    if (typeof sender !== "string" || sender.length === 0) continue;
    newest.set(sender, event.getContent?.());
  }
  for (const [sender, content] of newest) {
    const identity = readIdentity(content);
    // Explicitly removed rather than merely not set: with the known
    // identities seeded above, skipping would leave the withdrawn record
    // standing, which is the redaction bug over again.
    if (identity === null) identities.delete(sender);
    else identities.set(sender, identity);
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
 * Read from the room's encrypted timeline rather than computed: the call is
 * told who somebody is and does not get a vote. Live, so a person who
 * changes their motif mid-call changes on the stage too.
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
        const next = readIdentities(room, prev);
        return same(prev, next) ? prev : next;
      });
    update();
    room.on(RoomEvent.Timeline, update);
    /*
     * A gappy sync replaces the live timeline wholesale, so the new chunk has
     * to be read — but it is read ON TOP of what is known rather than instead
     * of it, because an identity missing from the new chunk has not been
     * withdrawn. See `readIdentities`.
     */
    room.on(RoomEvent.TimelineReset, update);
    /*
     * A redaction is not a timeline event either.
     *
     * Removing the latest identity record emits `RoomEvent.Redaction`, so
     * without this the person would keep the animal or motif they had
     * withdrawn, for as long as the call stayed otherwise quiet. Re-reading
     * puts them back to whatever their previous record said, or to initials;
     * a redacted event's content is empty, so `readIdentity` rejects it and
     * the record simply stops counting.
     */
    room.on(RoomEvent.Redaction, update);
    /*
     * And again once the event is readable.
     *
     * In the embedded build the host decrypts before it feeds the widget, so
     * what arrives here is already clear and the timeline listener alone is
     * enough. That is an invariant of the OTHER repository, though, and this
     * hook should not depend on one it cannot see: the standalone build with
     * the flag set has a client of its own, and there `RoomEvent.Timeline`
     * fires while the type is still `m.room.encrypted` and nothing fires on
     * the timeline again when it opens. The last identity of a batch — or a
     * motif changed mid-call — would sit as initials until some unrelated
     * timeline activity happened to re-read it. `ReactionsReader` listens for
     * the same reason.
     */
    const onDecrypted = (event: MatrixEvent): void => {
      if (event.getRoomId?.() !== room.roomId) return;
      if (event.getType?.() !== ORISO_IDENTITY_EVENT_TYPE) return;
      update();
    };
    room.client?.on?.(MatrixEventEvent.Decrypted, onDecrypted);
    return (): void => {
      room.off(RoomEvent.Timeline, update);
      room.off(RoomEvent.TimelineReset, update);
      room.off(RoomEvent.Redaction, update);
      room.client?.off?.(MatrixEventEvent.Decrypted, onDecrypted);
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
 *
 * A published animal or motif gets letters too, which is not a second
 * identity but the same stand-in for a narrower gap: the artwork is fetched
 * from the host, so between mounting and arriving — and for good if the host
 * is unreachable — the form has a colour and nothing in it. Those records
 * carry no `initials` of their own and should not have to; the tile knows the
 * display name, so it supplies them here.
 */
export function useOrisoIdentity(
  userId: string,
  displayName: string,
): OrisoIdentity | undefined {
  const { identities, enabled } = useOrisoStage();
  const published = identities.get(userId);
  return useMemo(() => {
    if (!enabled) return undefined;
    if (published === undefined) return fallbackIdentity(userId, displayName);
    return published.initials === undefined
      ? { ...published, initials: initialsFor(userId, displayName) }
      : published;
  }, [enabled, published, userId, displayName]);
}
