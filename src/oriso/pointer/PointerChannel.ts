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
      room.on(RoomEvent.DataReceived, onData);
      this.listening.set(room, () => room.off(RoomEvent.DataReceived, onData));
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

    const next = new Map(this.pointers$.value);
    const others = (next.get(msg.share) ?? []).filter(
      (p) => p.identity !== participant.identity,
    );
    if (msg.x === null || msg.y === null) {
      if (others.length > 0) next.set(msg.share, others);
      else next.delete(msg.share);
    } else {
      next.set(msg.share, [
        ...others,
        {
          identity: participant.identity,
          userId,
          x: msg.x,
          y: msg.y,
          at: this.now(),
        },
      ]);
    }
    this.pointersSubject$.next(next);
  }
}
