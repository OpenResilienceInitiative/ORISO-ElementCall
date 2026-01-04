/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useMemo } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  setLocalStorageItemReactive,
  useLocalStorage,
} from "../useLocalStorage";
import { getUrlParams } from "../UrlParams";
import { E2eeType } from "./e2eeType";
import { useClient } from "../ClientContext";

/**
 * This setter will update the state for all `useRoomSharedKey` hooks
 * if the password is different from the one in local storage or if its not yet in the local storage.
 */
export function saveKeyForRoom(roomId: string, password: string): void {
  if (
    localStorage.getItem(getRoomSharedKeyLocalStorageKey(roomId)) !== password
  )
    setLocalStorageItemReactive(
      getRoomSharedKeyLocalStorageKey(roomId),
      password,
    );
}

const getRoomSharedKeyLocalStorageKey = (roomId: string): string =>
  `room-shared-key-${roomId}`;

/**
 * An upto-date shared key for the room. Either from local storage or the value from `setInitialValue`.
 * @param roomId
 * @param setInitialValue The value we get from the URL. The hook will overwrite the local storage value with this.
 * @returns [roomSharedKey, setRoomSharedKey] like a react useState hook.
 */
const useRoomSharedKey = (
  roomId: string,
  setInitialValue?: string,
): [string | null, setKey: (key: string) => void] => {
  const [roomSharedKey, setRoomSharedKey] = useLocalStorage(
    getRoomSharedKeyLocalStorageKey(roomId),
  );
  useEffect(() => {
    // If setInitialValue is available, update the local storage (usually the password from the url).
    // This will update roomSharedKey but wont update the returned value since
    // that already defaults to setInitialValue.
    if (setInitialValue) setRoomSharedKey(setInitialValue);
  }, [setInitialValue, setRoomSharedKey]);

  // make sure we never return the initial null value from `useLocalStorage`
  return [setInitialValue ?? roomSharedKey, setRoomSharedKey];
};

export function getKeyForRoom(roomId: string): string | null {
  const { roomId: urlRoomId, password } = getUrlParams();
  if (roomId !== urlRoomId)
    logger.warn(
      "requested key for a roomId which is not the current call room id (from the URL)",
      roomId,
      urlRoomId,
    );
  return (
    password ?? localStorage.getItem(getRoomSharedKeyLocalStorageKey(roomId))
  );
}

export type Unencrypted = { kind: E2eeType.NONE };
export type SharedSecret = { kind: E2eeType.SHARED_KEY; secret: string };
export type PerParticipantE2EE = { kind: E2eeType.PER_PARTICIPANT };
export type EncryptionSystem = Unencrypted | SharedSecret | PerParticipantE2EE;

export function useRoomEncryptionSystem(roomId: string): EncryptionSystem {
  const { client } = useClient();

  const [storedPassword] = useRoomSharedKey(
    getRoomSharedKeyLocalStorageKey(roomId),
    getKeyForRoom(roomId) ?? undefined,
  );

  const room = client?.getRoom(roomId);
  const e2eeSystem = <EncryptionSystem>useMemo(() => {
    // TEMPORARY: Disable media E2EE to ensure maximum compatibility and stability
    // for the current ORISO deployment.
    //
    // Element Call normally chooses between:
    // - E2eeType.SHARED_KEY      (password-based)
    // - E2eeType.PER_PARTICIPANT (MatrixRTC per-device E2EE)
    //
    // In this installation, Matrix E2EE and device lists are not yet fully wired
    // for all clients (desktop + mobile), which leads to situations where calls
    // connect and tracks are published, but remote media cannot be decrypted and
    // tiles show “Waiting for media…”.
    //
    // By forcing E2eeType.NONE here, all participants receive **unencrypted**
    // media from LiveKit. This trades E2EE for reliability, but keeps signalling
    // and room encryption unchanged. Once the Matrix E2EE setup is ready for
    // MatrixRTC, this can be reverted to the original logic.
    if (!room) return { kind: E2eeType.NONE };
    // Always treat media as unencrypted for now
    return { kind: E2eeType.NONE };
  }, [room, storedPassword]);
  return e2eeSystem;
}
