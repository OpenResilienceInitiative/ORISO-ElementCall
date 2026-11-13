/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  Encryption_Type as EncryptionType,
  type RemoteParticipant,
  type Room as LivekitRoom,
  RoomEvent,
} from "livekit-client";
import { BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../state/Behavior";
import { type VideoPoint } from "./geometry";
import {
  POINTER_TOPIC,
  type PointerMessage,
  decodePointer,
  encodePointer,
  userIdOfParticipant,
} from "./protocol";
import { createThrottle, type Throttle } from "./throttle";

export interface RemotePointer {
  /** The pointing participant's LiveKit identity. */
  identity: string;
  userId: string;
  x: number;
  y: number;
  /** When the last position arrived (ms, `now()`). */
  at: number;
}

/**
 * How long a pointer is kept without news. Far longer than it is SHOWN
 * (`POINTER_IDLE_MS`); this only bounds what a silent sender leaves behind.
 */
export const POINTER_TTL_MS = 10_000;

/** A LiveKit identity is `${userId}:${deviceId}`; nothing real is longer. */
const MAX_SHARE_ID = 512;

/** Pointers by the share they point at (the sharer's LiveKit identity). */
export type PointersByShare = ReadonlyMap<string, readonly RemotePointer[]>;

interface Options {
  /**
   * Whether this call is end-to-end encrypted. Pointers are only sent and
   * only read in an encrypted call: the rooms are built with LiveKit's
   * `encryption` option, which seals data packets with the same per-person
   * keys as the media, and a pointer that arrives unsealed is dropped.
   */
  encrypted: boolean;
  now?: () => number;
}

/**
 * The laser pointer's transport: LiveKit data messages, lossy, ~16 Hz.
 *
 * Not Matrix events: those go through the homeserver (hundreds of ms) and
 * would stay in the room's history; a pointer is worthless a second later
 * and should leave no trace. Lossy because a lost position is replaced 60 ms
 * later anyway — retransmitting it would only make the dot lag.
 */
export class PointerChannel {
  private readonly pointersSubject$ = new BehaviorSubject<PointersByShare>(
    new Map(),
  );
  public readonly pointers$: Behavior<PointersByShare> = this.pointersSubject$;
  private publishRoom: LivekitRoom | null = null;
  private readonly listening = new Map<LivekitRoom, () => void>();
  private readonly throttle: Throttle<PointerMessage>;
  private readonly now: () => number;
  private readonly encrypted: boolean;

  public constructor({ encrypted, now = Date.now }: Options) {
    this.encrypted = encrypted;
    this.now = now;
    this.throttle = createThrottle((msg) => this.send(msg));
  }

  /** Whether pointing is possible in this call at all. */
  public get available(): boolean {
    return this.encrypted;
  }

  /**
   * `publish` is the connection my own media goes out on; `listen` is every
   * connection the call has, since others may publish to a different SFU.
   */
  public setRooms(publish: LivekitRoom | null, listen: LivekitRoom[]): void {
    this.publishRoom = publish;
    const wanted = new Set(listen);
    for (const [room, off] of this.listening) {
      if (!wanted.has(room)) {
        off();
        this.listening.delete(room);
      }
    }
    for (const room of wanted) {
      if (this.listening.has(room)) continue;
      const onData = (
        payload: Uint8Array,
        participant?: RemoteParticipant,
        _kind?: unknown,
        topic?: string,
        encryption?: EncryptionType,
      ): void => this.receive(payload, participant, topic, encryption);
      const onGone = (participant: RemoteParticipant): void =>
        this.forget(participant.identity);
      room.on(RoomEvent.DataReceived, onData);
      room.on(RoomEvent.ParticipantDisconnected, onGone);
      this.listening.set(room, () => {
        room.off(RoomEvent.DataReceived, onData);
        room.off(RoomEvent.ParticipantDisconnected, onGone);
      });
    }
  }

  /** My pointer on `share`, or null when it left the screen. */
  public point(share: string, p: VideoPoint | null): void {
    if (!this.available) return;
    if (p === null) {
      this.throttle.cancel();
      this.send({ share, x: null, y: null });
      return;
    }
    this.throttle.push({ share, x: p.x, y: p.y });
  }

  public destroy(): void {
    this.throttle.cancel();
    this.setRooms(null, []);
    this.pointersSubject$.complete();
  }

  private send(msg: PointerMessage): void {
    const room = this.publishRoom;
    if (room === null || !this.available) return;
    /*
     * Fail closed: the call being configured for E2EE is not enough, the
     * room must report that encryption is actually running for me. Before
     * the keys are in place (or after an encryption error) nothing is sent.
     */
    if (!room.isE2EEEnabled) return;
    room.localParticipant
      .publishData(encodePointer(msg), {
        reliable: false,
        topic: POINTER_TOPIC,
      })
      .catch((e: unknown) => logger.debug("pointer not sent", e));
  }

  private receive(
    payload: Uint8Array,
    participant: RemoteParticipant | undefined,
    topic: string | undefined,
    encryption: EncryptionType | undefined,
  ): void {
    if (topic !== POINTER_TOPIC || participant === undefined) return;
    if (!this.available || encryption === EncryptionType.NONE) return;
    if (encryption === undefined) return;
    const msg = decodePointer(payload);
    if (msg === null) return;
    const userId = userIdOfParticipant(participant.identity);
    if (userId === null) return;

    if (msg.share.length > MAX_SHARE_ID) return;

    /*
     * Bounded by the number of people in the call, whatever arrives: one
     * pointer per sender across ALL shares (a new position drops the old one
     * wherever it was), stale ones pruned, a leaver's dropped.
     */
    const now = this.now();
    const next = this.without(participant.identity, now);
    if (msg.x !== null && msg.y !== null) {
      next.set(msg.share, [
        ...(next.get(msg.share) ?? []),
        { identity: participant.identity, userId, x: msg.x, y: msg.y, at: now },
      ]);
    }
    this.pointersSubject$.next(next);
  }

  private forget(identity: string): void {
    this.pointersSubject$.next(this.without(identity, this.now()));
  }

  /** The current pointers minus one sender's and minus the stale ones. */
  private without(identity: string, now: number): Map<string, RemotePointer[]> {
    const next = new Map<string, RemotePointer[]>();
    for (const [share, list] of this.pointers$.value) {
      const kept = list.filter(
        (p) => p.identity !== identity && now - p.at < POINTER_TTL_MS,
      );
      if (kept.length > 0) next.set(share, kept);
    }
    return next;
  }
}
