/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DataPacket_Kind as DataPacketKind,
  Encryption_Type as EncryptionType,
  type RemoteParticipant,
  type Room as LivekitRoom,
  RoomEvent,
} from "livekit-client";

import { POINTER_TTL_MS, PointerChannel } from "./PointerChannel";
import { POINTER_TOPIC, decodePointer, encodePointer } from "./protocol";

const SHARE = "@sharer:oriso.org:SHAREDEV";

function fakeRoom(): LivekitRoom & {
  publishData: ReturnType<typeof vi.fn>;
  receive: (
    from: string,
    bytes: Uint8Array,
    enc?: EncryptionType,
    topic?: string,
  ) => void;
} {
  const room = new EventEmitter() as unknown as LivekitRoom & {
    publishData: ReturnType<typeof vi.fn>;
    receive: (
      from: string,
      bytes: Uint8Array,
      enc?: EncryptionType,
      topic?: string,
    ) => void;
  };
  const publishData = vi.fn().mockResolvedValue(undefined);
  Object.assign(room, {
    publishData,
    isE2EEEnabled: true,
    localParticipant: { identity: "@me:oriso.org:MYDEV", publishData },
    receive: (
      from: string,
      bytes: Uint8Array,
      enc = EncryptionType.GCM,
      topic = POINTER_TOPIC,
    ): boolean =>
      room.emit(
        RoomEvent.DataReceived,
        bytes,
        { identity: from, isLocal: false } as unknown as RemoteParticipant,
        DataPacketKind.LOSSY,
        topic,
        enc,
      ),
  });
  return room;
}

describe("PointerChannel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends my pointer lossy, on its own topic, throttled", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    for (let i = 0; i < 10; i++) ch.point(SHARE, { x: i / 10, y: 0.5 });
    expect(room.publishData).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60);
    expect(room.publishData).toHaveBeenCalledTimes(2);
    const [bytes, opts] = room.publishData.mock.calls[1];
    expect(opts).toEqual({ reliable: false, topic: POINTER_TOPIC });
    expect(decodePointer(bytes)).toEqual({ share: SHARE, x: 0.9, y: 0.5 });
    ch.destroy();
  });

  it("sends a hide at once when the pointer leaves the screen", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    ch.point(SHARE, { x: 0.1, y: 0.1 });
    ch.point(SHARE, { x: 0.2, y: 0.2 });
    ch.point(SHARE, null);
    expect(decodePointer(room.publishData.mock.lastCall![0])).toEqual({
      share: SHARE,
      x: null,
      y: null,
    });
    ch.destroy();
  });

  it("never sends in a call without end-to-end encryption", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: false });
    ch.setRooms(room, [room]);
    ch.point(SHARE, { x: 0.5, y: 0.5 });
    vi.advanceTimersByTime(600);
    expect(room.publishData).not.toHaveBeenCalled();
    expect(ch.available).toBe(false);
    ch.destroy();
  });

  it("shows who points where, keyed by share, with the sender taken from the SFU", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true, now: (): number => 1000 });
    ch.setRooms(room, [room]);
    room.receive(
      "@anna:oriso.org:A",
      encodePointer({ share: SHARE, x: 0.25, y: 0.5 }),
    );
    expect(ch.pointers$.value.get(SHARE)).toEqual([
      {
        identity: "@anna:oriso.org:A",
        userId: "@anna:oriso.org",
        x: 0.25,
        y: 0.5,
        at: 1000,
      },
    ]);
    ch.destroy();
  });

  it("drops pointer packets that arrived unencrypted", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    room.receive(
      "@mallory:oriso.org:M",
      encodePointer({ share: SHARE, x: 0.5, y: 0.5 }),
      EncryptionType.NONE,
    );
    expect(ch.pointers$.value.size).toBe(0);
    ch.destroy();
  });

  it("ignores other topics and garbage", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    room.receive(
      "@a:oriso.org:A",
      encodePointer({ share: SHARE, x: 0.5, y: 0.5 }),
      EncryptionType.GCM,
      "something.else",
    );
    room.receive("@a:oriso.org:A", new TextEncoder().encode("{bad"));
    expect(ch.pointers$.value.size).toBe(0);
    ch.destroy();
  });

  it("removes a pointer on hide, and keeps the others", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    room.receive("@a:o.org:A", encodePointer({ share: SHARE, x: 0.1, y: 0.1 }));
    room.receive("@b:o.org:B", encodePointer({ share: SHARE, x: 0.9, y: 0.9 }));
    room.receive(
      "@a:o.org:A",
      encodePointer({ share: SHARE, x: null, y: null }),
    );
    expect(ch.pointers$.value.get(SHARE)?.map((p) => p.userId)).toEqual([
      "@b:o.org",
    ]);
    ch.destroy();
  });

  it("listens on every connection and stops listening on the ones it lost", () => {
    const a = fakeRoom();
    const b = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(a, [a, b]);
    b.receive("@x:o.org:X", encodePointer({ share: SHARE, x: 0.1, y: 0.1 }));
    expect(ch.pointers$.value.get(SHARE)).toHaveLength(1);
    ch.setRooms(a, [a]);
    b.receive("@y:o.org:Y", encodePointer({ share: SHARE, x: 0.1, y: 0.1 }));
    expect(ch.pointers$.value.get(SHARE)).toHaveLength(1);
    ch.destroy();
    expect(a.listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it("fails closed: sends nothing while the room's encryption is not running", () => {
    const room = fakeRoom();
    Object.assign(room, { isE2EEEnabled: false });
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    ch.point(SHARE, { x: 0.5, y: 0.5 });
    ch.point(SHARE, null);
    vi.advanceTimersByTime(600);
    expect(room.publishData).not.toHaveBeenCalled();
    ch.destroy();
  });

  it("keeps one pointer per sender, whatever share ids it sends", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    for (let i = 0; i < 1000; i++)
      room.receive(
        "@flood:o.org:F",
        encodePointer({ share: `fake-${i}`, x: 0.5, y: 0.5 }),
      );
    expect(ch.pointers$.value.size).toBe(1);
    expect(ch.pointers$.value.get("fake-999")).toHaveLength(1);
    ch.destroy();
  });

  it("ignores absurdly long share ids", () => {
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true });
    ch.setRooms(room, [room]);
    room.receive(
      "@a:o.org:A",
      encodePointer({ share: "x".repeat(5000), x: 0.5, y: 0.5 }),
    );
    expect(ch.pointers$.value.size).toBe(0);
    ch.destroy();
  });

  it("drops stale pointers and those of people who left", () => {
    let now = 0;
    const room = fakeRoom();
    const ch = new PointerChannel({ encrypted: true, now: (): number => now });
    ch.setRooms(room, [room]);
    room.receive("@a:o.org:A", encodePointer({ share: SHARE, x: 0.1, y: 0.1 }));
    room.receive("@b:o.org:B", encodePointer({ share: SHARE, x: 0.2, y: 0.2 }));
    room.emit(RoomEvent.ParticipantDisconnected, {
      identity: "@b:o.org:B",
    } as unknown as RemoteParticipant);
    expect(ch.pointers$.value.get(SHARE)?.map((p) => p.identity)).toEqual([
      "@a:o.org:A",
    ]);
    now = POINTER_TTL_MS + 1;
    room.receive("@c:o.org:C", encodePointer({ share: SHARE, x: 0.3, y: 0.3 }));
    expect(ch.pointers$.value.get(SHARE)?.map((p) => p.identity)).toEqual([
      "@c:o.org:C",
    ]);
    ch.destroy();
  });
});
