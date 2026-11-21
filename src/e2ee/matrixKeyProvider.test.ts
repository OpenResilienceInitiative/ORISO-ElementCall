/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { KeyProviderEvent } from "livekit-client";

import { flushPromises } from "../utils/test";
import { LocalMediaEncryptionError } from "../utils/errors";
import { MatrixKeyProvider } from "./matrixKeyProvider";

function mockRTCSession(): MatrixRTCSession {
  return {
    room: { roomId: "!fixture:example.org" },
    on: vi.fn(),
    off: vi.fn(),
    reemitEncryptionKeys: vi.fn(),
  } as unknown as MatrixRTCSession;
}

const LOCAL_PARTICIPANT = "@alice:example.org:ALICE_DEVICE";
const OTHER_DEVICE = "@alice:example.org:OTHER_DEVICE";

const emitKey = (
  session: MatrixRTCSession,
  participantId: string,
  index: number,
): void => {
  const [, onKey] = vi.mocked(session.on).mock.calls.at(-1)!;
  const callback = onKey as (
    key: Uint8Array,
    index: number,
    participantId: string,
  ) => void;
  callback(Uint8Array.of(index), index, participantId);
};

describe("matrixKeyProvider", () => {
  test("initializes", () => {
    const keyProvider = new MatrixKeyProvider(LOCAL_PARTICIPANT);
    expect(keyProvider).toBeTruthy();
  });

  test("listens for key requests and emits existing keys", () => {
    const keyProvider = new MatrixKeyProvider(LOCAL_PARTICIPANT);

    const session = mockRTCSession();

    keyProvider.setRTCSession(session);

    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function),
    );
    expect(session.off).not.toHaveBeenCalled();
  });

  test("stops listening when session changes", () => {
    const keyProvider = new MatrixKeyProvider(LOCAL_PARTICIPANT);

    const session1 = mockRTCSession();
    const session2 = mockRTCSession();

    keyProvider.setRTCSession(session1);
    expect(session1.off).not.toHaveBeenCalled();

    keyProvider.setRTCSession(session2);
    expect(session1.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function),
    );
  });

  test("emits existing keys", () => {
    const keyProvider = new MatrixKeyProvider(LOCAL_PARTICIPANT);
    const setKeyListener = vi.fn();
    keyProvider.on(KeyProviderEvent.SetKey, setKeyListener);

    const session = mockRTCSession();

    keyProvider.setRTCSession(session);

    expect(session.reemitEncryptionKeys).toHaveBeenCalled();
  });

  test("reports and retries the active local device key without treating another device as local", async () => {
    const provider = new MatrixKeyProvider(LOCAL_PARTICIPANT);
    const session = mockRTCSession();
    const importedKey = {} as CryptoKey;
    const importKey = vi
      .spyOn(crypto.subtle, "importKey")
      .mockRejectedValueOnce(new Error("other device key"))
      .mockRejectedValueOnce(new Error("local key"))
      .mockResolvedValueOnce(importedKey);
    try {
      provider.setRTCSession(session);
      emitKey(session, OTHER_DEVICE, 1);
      await flushPromises();
      expect(provider.localKeyState$.value).toBe("pending");

      emitKey(session, LOCAL_PARTICIPANT, 5);
      await flushPromises();
      expect(provider.localKeyState$.value).toBeInstanceOf(
        LocalMediaEncryptionError,
      );
      expect(provider.getKeys()).toHaveLength(0);

      provider.retryLocalKey();
      await flushPromises();
      expect(provider.localKeyState$.value).toBe("ready");
      expect(provider.getKeys()).toEqual([
        {
          key: importedKey,
          participantIdentity: LOCAL_PARTICIPANT,
          keyIndex: 5,
        },
      ]);
      expect(importKey).toHaveBeenCalledTimes(3);
    } finally {
      importKey.mockRestore();
    }
  });

  test("ignores an older local import that completes after a key at the wrapped index", async () => {
    const provider = new MatrixKeyProvider(LOCAL_PARTICIPANT);
    const session = mockRTCSession();
    const olderImport = Promise.withResolvers<CryptoKey>();
    const currentKey = {} as CryptoKey;
    const importKey = vi
      .spyOn(crypto.subtle, "importKey")
      .mockReturnValueOnce(olderImport.promise)
      .mockResolvedValueOnce(currentKey);
    const onSetKey = vi.fn();
    provider.on(KeyProviderEvent.SetKey, onSetKey);
    try {
      provider.setRTCSession(session);
      emitKey(session, LOCAL_PARTICIPANT, 255);
      emitKey(session, LOCAL_PARTICIPANT, 0);
      await flushPromises();
      expect(provider.localKeyState$.value).toBe("ready");

      olderImport.resolve({} as CryptoKey);
      await flushPromises();
      expect(onSetKey).toHaveBeenCalledExactlyOnceWith({
        key: currentKey,
        participantIdentity: LOCAL_PARTICIPANT,
        keyIndex: 0,
      });
      expect(provider.localKeyState$.value).toBe("ready");
    } finally {
      importKey.mockRestore();
    }
  });

  test("an import from a replaced Matrix session cannot report a failure", async () => {
    const provider = new MatrixKeyProvider(LOCAL_PARTICIPANT);
    const olderImport = Promise.withResolvers<CryptoKey>();
    const importKey = vi
      .spyOn(crypto.subtle, "importKey")
      .mockReturnValueOnce(olderImport.promise);
    try {
      const firstSession = mockRTCSession();
      provider.setRTCSession(firstSession);
      emitKey(firstSession, LOCAL_PARTICIPANT, 1);
      provider.setRTCSession(mockRTCSession());
      olderImport.reject(new Error("replaced session"));
      await flushPromises();
      expect(provider.localKeyState$.value).toBe("pending");
    } finally {
      importKey.mockRestore();
    }
  });
  test("asks Matrix to replay keys when an initial local key has not arrived", () => {
    const provider = new MatrixKeyProvider(LOCAL_PARTICIPANT);
    const session = mockRTCSession();
    provider.setRTCSession(session);
    provider.retryLocalKey(true);
    expect(session.reemitEncryptionKeys).toHaveBeenCalledTimes(2);
    expect(provider.localKeyState$.value).toBe("pending");
  });
});
