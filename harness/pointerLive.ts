/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The laser pointer over a REAL LiveKit server with REAL end-to-end
 * encryption: the (patched) livekit-client, its E2EE worker, the room built
 * with `encryption` exactly as `ConnectionFactory` builds it, and the real
 * `PointerChannel`. Driven by `pointerLive.check.mjs`, which starts nothing
 * itself — see there.
 *
 *   ?url=ws://…&token=…&key=…   join with E2EE (shared test key)
 *   ?url=ws://…&token=…&plain=1 join WITHOUT E2EE: an attacker's / server's
 *                               plain-text packets, which must be dropped
 */
import {
  ExternalE2EEKeyProvider,
  Room,
  RoomEvent,
  type RemoteParticipant,
} from "livekit-client";
import E2EEWorker from "livekit-client/e2ee-worker?worker";

import { PointerChannel } from "../src/oriso/pointer/PointerChannel";
import { POINTER_TOPIC, encodePointer } from "../src/oriso/pointer/protocol";

const q = new URLSearchParams(window.location.search);
const plain = q.get("plain") === "1";
const log: string[] = [];
const say = (line: string): void => {
  log.push(line);
  document.getElementById("log")!.textContent = log.join("\n");
};

declare global {
  interface Window {
    pointer: {
      ready: Promise<void>;
      point: (share: string, x: number, y: number) => void;
      sendPlain: (share: string, x: number, y: number) => Promise<void>;
      pointers: () => unknown;
      received: { from: string; encryption: number | undefined }[];
      e2ee: () => boolean;
    };
  }
}

const keyProvider = new ExternalE2EEKeyProvider();
const room = new Room(
  plain ? {} : { encryption: { keyProvider, worker: new E2EEWorker() } },
);
const channel = new PointerChannel({ encrypted: true });
const received: { from: string; encryption: number | undefined }[] = [];

room.on(
  RoomEvent.DataReceived,
  (
    _payload: Uint8Array,
    participant?: RemoteParticipant,
    _kind?: unknown,
    topic?: string,
    encryption?: number,
  ) => {
    if (topic !== POINTER_TOPIC) return;
    received.push({ from: participant?.identity ?? "?", encryption });
  },
);

const ready = (async (): Promise<void> => {
  if (!plain) {
    await keyProvider.setKey(q.get("key")!);
    await room.setE2EEEnabled(true);
  }
  await room.connect(q.get("url")!, q.get("token")!);
  channel.setRooms(room, [room]);
  say(
    `joined as ${room.localParticipant.identity}, e2ee=${room.isE2EEEnabled}`,
  );
})();

window.pointer = {
  ready,
  point: (share, x, y) => channel.point(share, { x, y }),
  sendPlain: (share, x, y) =>
    room.localParticipant.publishData(encodePointer({ share, x, y }), {
      reliable: false,
      topic: POINTER_TOPIC,
    }),
  pointers: () =>
    Object.fromEntries(
      [...channel.pointers$.value].map(([k, v]) => [
        k,
        v.map((p) => ({ from: p.identity, x: p.x, y: p.y })),
      ]),
    ),
  received,
  e2ee: () => room.isE2EEEnabled,
};
