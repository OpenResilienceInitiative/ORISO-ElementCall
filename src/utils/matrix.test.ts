/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClientEvent,
  createClient,
  MatrixEvent,
  MemoryStore,
  RelationType,
  Room,
  type IMatrixClientCreateOpts,
  type MatrixClient,
} from "matrix-js-sdk";
import { EventEmitter } from "events";

import type * as MatrixSdk from "matrix-js-sdk";
import { ElementCallReactionEventType } from "../reactions";
import { hasEmbeddedSession, initClient } from "./matrix";

vi.mock("../IndexedDBWorker?worker");
vi.mock("matrix-js-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof MatrixSdk>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});

const HOMESERVER = "https://matrix.example.org";
const USER_ID = "@consultant:example.org";
const DEVICE_ID = "ABCDEFGHIJ";
const ROOM_ID = "!callroom:example.org";

/**
 * A client for an end-to-end encrypted room which, like the one Element Call
 * runs with in ORISO, has no crypto backend of its own: the embedding
 * application owns the Matrix device and its crypto state.
 */
function createClientForEncryptedRoom(usingExternalCrypto: boolean): {
  client: MatrixClient;
  fetchFn: ReturnType<typeof vi.fn>;
} {
  const fetchFn = vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response(JSON.stringify({ event_id: "$sent-event-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const createOpts: IMatrixClientCreateOpts = {
    baseUrl: HOMESERVER,
    userId: USER_ID,
    deviceId: DEVICE_ID,
    accessToken: "syt_token",
    store: new MemoryStore(),
    usingExternalCrypto,
    fetchFn: fetchFn as unknown as typeof globalThis.fetch,
  };
  const client = createClient(createOpts);

  const room = new Room(ROOM_ID, client, USER_ID);
  room.currentState.setStateEvents([
    new MatrixEvent({
      type: "m.room.encryption",
      state_key: "",
      room_id: ROOM_ID,
      sender: USER_ID,
      event_id: "$encryption-state-event",
      origin_server_ts: 0,
      content: { algorithm: "m.megolm.v1.aes-sha2" },
    }),
  ]);
  client.store.storeRoom(room);

  return { client, fetchFn };
}

async function sendCallReaction(client: MatrixClient): Promise<unknown> {
  return client.sendEvent(ROOM_ID, ElementCallReactionEventType, {
    "m.relates_to": {
      rel_type: RelationType.Reference,
      event_id: "$my-membership-event",
    },
    emoji: "🎉",
    name: "party",
  });
}

const EMBEDDED_SESSION_HASH = `#?roomId=${ROOM_ID}&accessToken=syt_token&userId=${USER_ID}&deviceId=${DEVICE_ID}`;

/**
 * A stand-in for the client returned by `createClient`, with just enough of the
 * client's startup surface for `initClient` to run against.
 */
function fakeClient(): MatrixClient & {
  initRustCrypto: ReturnType<typeof vi.fn>;
  clearStores: ReturnType<typeof vi.fn>;
} {
  const client = Object.assign(new EventEmitter(), {
    store: {
      startup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getSavedSyncToken: vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValue(null),
    },
    clearStores: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    initRustCrypto: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startClient: vi.fn(async () => {
      await Promise.resolve();
      // A real client syncs asynchronously, after `startClient` has returned.
      setTimeout(() => client.emit(ClientEvent.Sync, "PREPARED", null), 0);
    }),
  });
  return client as unknown as MatrixClient & {
    initRustCrypto: ReturnType<typeof vi.fn>;
    clearStores: ReturnType<typeof vi.fn>;
  };
}

describe("initClient", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockClear();
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("skips crypto setup for a session supplied by the embedding application", async () => {
    window.location.hash = EMBEDDED_SESSION_HASH;
    const client = fakeClient();
    vi.mocked(createClient).mockReturnValueOnce(client);

    expect(hasEmbeddedSession()).toBe(true);
    await initClient({ baseUrl: HOMESERVER }, true);

    expect(vi.mocked(createClient).mock.calls[0][0]).toMatchObject({
      usingExternalCrypto: true,
    });
    expect(client.initRustCrypto).not.toHaveBeenCalled();
  });

  it("sets up crypto for a session of its own", async () => {
    const client = fakeClient();
    vi.mocked(createClient).mockReturnValueOnce(client);

    expect(hasEmbeddedSession()).toBe(false);
    await initClient({ baseUrl: HOMESERVER }, true);

    expect(vi.mocked(createClient).mock.calls[0][0]).toMatchObject({
      usingExternalCrypto: false,
    });
    expect(client.initRustCrypto).toHaveBeenCalled();
  });
});

describe("sending call reactions into an encrypted room", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fails when the client neither has crypto nor knows that something else does", async () => {
    const { client, fetchFn } = createClientForEncryptedRoom(false);

    await expect(sendCallReaction(client)).rejects.toThrow(
      /does not support encryption/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends the reaction when the client knows that crypto is handled externally", async () => {
    const { client, fetchFn } = createClientForEncryptedRoom(true);

    await expect(sendCallReaction(client)).resolves.toEqual({
      event_id: "$sent-event-id",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [URL | string, RequestInit];
    expect(url.toString()).toContain(
      `/rooms/${encodeURIComponent(ROOM_ID)}/send/${encodeURIComponent(
        ElementCallReactionEventType,
      )}/`,
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      emoji: "🎉",
      name: "party",
    });
  });
});
