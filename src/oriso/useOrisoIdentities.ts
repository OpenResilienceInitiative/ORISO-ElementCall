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
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
 * against the state key by hand; here there is no key to claim.
 *
 * What this reader cannot check is whether the event WAS encrypted. The host
 * decrypts and feeds the widget the clear event (`getEffectiveEvent()`), so
 * `isEncrypted()` is false here for every record, genuine or not, and
 * filtering on it would drop them all. The guarantee lives on the sending
 * side — the host refuses to publish into a room that is not encrypted — so a
 * plaintext record could only come from a client that skipped that, and
 * keyed by sender it can only ever change that client's own face.
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
  const newest = newestIdentityEvents(room);
  if (newest === null) return identities;
  for (const [sender, event] of newest) {
    const identity = readIdentity(event.getContent?.());
    // Explicitly removed rather than merely not set: with the known
    // identities seeded above, skipping would leave the withdrawn record
    // standing, which is the redaction bug over again.
    if (identity === null) identities.delete(sender);
    else identities.set(sender, identity);
  }
  return identities;
}

/**
 * The newest identity event per sender in the live timeline, or `null` when
 * the room cannot answer — a mock, or a timeline that has not loaded.
 *
 * The newest record per sender, and only then read it. Reading as we go would
 * let an older valid record survive a newer invalid one — and the commonest
 * newer-invalid record is a REDACTED one, whose content is empty. Somebody who
 * withdrew their animal would have kept it, or fallen back to one they had
 * replaced, instead of returning to the stand-in letters. The newest thing a
 * person said about themselves wins, including when the newest thing is
 * nothing.
 *
 * One malformed record still costs only its own owner a face, which is the
 * other half of the rule.
 */
function newestIdentityEvents(room: Room): Map<string, MatrixEvent> | null {
  const events = room.getLiveTimeline?.()?.getEvents?.();
  if (!Array.isArray(events)) return null;
  const newest = new Map<string, MatrixEvent>();
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
    newest.set(sender, event);
  }
  return newest;
}

/**
 * Which event each identity we are holding came from.
 *
 * Needed because an identity can outlive its event's presence in the window:
 * the carry-over keeps a record that a limited sync pushed out of the live
 * timeline, and a redaction of THAT event arrives as a redaction with nothing
 * left in the timeline to match it against. Without the id the withdrawn
 * animal stayed on the stage indefinitely.
 */
function readIdentitySources(
  room: Room,
  known?: ReadonlyMap<string, string>,
): Map<string, string> {
  const sources = new Map<string, string>(known ?? []);
  const newest = newestIdentityEvents(room);
  if (newest === null) return sources;
  for (const [sender, event] of newest) {
    const id = event.getId?.();
    if (typeof id === "string") sources.set(sender, id);
  }
  return sources;
}

function sameSources(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [sender, id] of a) if (b.get(sender) !== id) return false;
  return true;
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

interface State {
  /** The room the two maps below describe. */
  roomId: string;
  identities: Identities;
  sources: ReadonlyMap<string, string>;
}

/** What a room says about itself before anything has been carried over. */
function freshState(room: Room): State {
  return {
    roomId: room.roomId,
    identities: readIdentities(room),
    sources: readIdentitySources(room),
  };
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
  /*
   * The map, and where each entry came from, in one piece of state.
   *
   * One piece, because the updater has to stay a pure function of `prev`: a
   * ref written inside it is a side effect in something React may call twice,
   * which is the trap the `carryOver` parameter below already documents.
   */
  const [state, setState] = useState<State>(() => freshState(room));
  /*
   * Which room the map in state describes, as part of the state itself.
   *
   * Carrying known identities over is only valid WITHIN one room, and this
   * component is reused across rooms: `RoomPage` is a wildcard route, so SPA
   * navigation can replace `room` without remounting the hook. The first
   * version of the carry-over seeded the new room's read from the old room's
   * map, and somebody present in both kept the animal they had in the room
   * just left — indefinitely, because absence from the new timeline is
   * deliberately not treated as withdrawal.
   *
   * The reset happens HERE, during the render, and not in the effect below.
   * A ref consulted only inside the effect fixed the lasting case but left
   * one render in which the new room was described by the old room's map —
   * and that render is the one that paints. Changing rooms mid-call showed
   * everybody the faces from the room just left for a frame, which on a
   * counselling platform is a frame of the wrong person's animal in front of
   * the wrong people. Setting state during a render of the same component is
   * React's own answer to a prop the state derives from: the render is
   * discarded and repeated, and nothing is shown in between.
   */
  const fresh = state.roomId === room.roomId ? null : freshState(room);
  if (fresh !== null) setState(fresh);
  // Not `state`: in the render that spots the change, `state` is the one
  // being discarded, and this hook's caller must not be handed it.
  const current = fresh ?? state;
  const identities = current.identities;
  /*
   * A mirror for the listener, which runs outside React's rendering and
   * needs the current ids without re-subscribing every time they change.
   */
  const sourcesRef = useRef(current.sources);
  sourcesRef.current = current.sources;

  useEffect(() => {
    /*
     * `carryOver` is a parameter rather than a captured flag on purpose: a
     * mutable one would have to be written inside the state updater, and an
     * updater React may call twice would then seed the second call from the
     * room that was just left.
     */
    const update = (carryOver: boolean, forget?: string): void =>
      setState((prev) => {
        // The room is reset during the render, so a `prev` from another room
        // cannot reach here — but a listener firing between the two would be
        // reading the wrong room, and dropping it is free.
        if (prev.roomId !== room.roomId) return prev;
        let known = carryOver ? prev.identities : undefined;
        let knownSources = carryOver ? prev.sources : undefined;
        if (forget !== undefined && known?.has(forget)) {
          known = new Map([...known].filter(([sender]) => sender !== forget));
          knownSources = new Map(
            [...(knownSources ?? [])].filter(([sender]) => sender !== forget),
          );
        }
        const next = readIdentities(room, known);
        const nextSources = readIdentitySources(room, knownSources);
        return same(prev.identities, next) &&
          sameSources(prev.sources, nextSources)
          ? prev
          : { roomId: prev.roomId, identities: next, sources: nextSources };
      });
    // Whatever arrived between the render and this effect, on top of what
    // the render already read.
    update(true);
    const onRoomEvent = (): void => update(true);
    room.on(RoomEvent.Timeline, onRoomEvent);
    /*
     * A gappy sync replaces the live timeline wholesale, so the new chunk has
     * to be read — but it is read ON TOP of what is known rather than instead
     * of it, because an identity missing from the new chunk has not been
     * withdrawn. See `readIdentities`.
     */
    room.on(RoomEvent.TimelineReset, onRoomEvent);
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
    /*
     * The redacted event's own id, because it may be gone from the window.
     *
     * Re-reading alone only works while the redacted event is still in the
     * live timeline, where its emptied content makes `readIdentity` reject
     * it. Once a limited sync has replaced the window, the carry-over is
     * holding a record whose event is no longer there to contradict — and
     * the withdrawn animal stayed on the stage for good. So the sender whose
     * newest record the redaction names is dropped by hand.
     */
    const onRedaction = (event?: MatrixEvent): void => {
      // The emitter promises an event; a test double, and older SDKs, do not.
      const redacted =
        event?.getAssociatedId?.() ??
        (event as { event?: { redacts?: unknown } } | undefined)?.event
          ?.redacts;
      if (typeof redacted !== "string") {
        update(true);
        return;
      }
      let forget: string | undefined;
      for (const [sender, id] of sourcesRef.current)
        if (id === redacted) forget = sender;
      update(true, forget);
    };
    room.on(RoomEvent.Redaction, onRedaction);
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
      update(true);
    };
    room.client?.on?.(MatrixEventEvent.Decrypted, onDecrypted);
    return (): void => {
      room.off(RoomEvent.Timeline, onRoomEvent);
      room.off(RoomEvent.TimelineReset, onRoomEvent);
      room.off(RoomEvent.Redaction, onRedaction);
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
    /*
     * Seeded from the name the record CARRIES, where it carries one.
     *
     * Otherwise a counsellor published as "Beratung Nord" with no letters of
     * their own got the initials of `@cyrus:oriso.org` — the identifier the
     * `name` field exists to stop showing, reappearing two letters at a time
     * on the very form that was supposed to be rid of it.
     */
    return published.initials === undefined
      ? {
          ...published,
          initials: initialsFor(userId, published.name ?? displayName),
        }
      : published;
  }, [enabled, published, userId, displayName]);
}
