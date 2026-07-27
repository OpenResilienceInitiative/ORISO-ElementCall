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

  // NOTE: the first argument is the *room id*, not the storage key —
  // `useRoomSharedKey` prefixes it itself. Passing an already-prefixed key here
  // produced `room-shared-key-room-shared-key-…`, so a shared secret could be
  // written but never read back.
  const [storedPassword] = useRoomSharedKey(
    roomId,
    getKeyForRoom(roomId) ?? undefined,
  );

  const room = client?.getRoom(roomId);
  const e2eeSystem = <EncryptionSystem>useMemo(() => {
    // ORISO policy: media in a counselling call is never sent in the clear.
    //
    // Media E2EE used to be forced to `E2eeType.NONE` here, because Element Call
    // borrowed the host app's Matrix device and therefore could not initialise a
    // crypto stack of its own — per-participant keys had nowhere to come from.
    // Element Call now logs in with its own device (see
    // `getElementCallAccessToken` in ORISO-Frontend), so the original upstream
    // logic applies again.
    //
    // A room we cannot see yet is treated as unencrypted only because there is
    // no call to protect at that point; `GroupCallView` will not start a call
    // without a room.
    if (!room) return { kind: E2eeType.NONE };

    // A shared secret arrives via the call link and is what external guests —
    // who have no Matrix identity — use. It takes precedence because those
    // participants cannot take part in per-participant key exchange.
    if (storedPassword) {
      return { kind: E2eeType.SHARED_KEY, secret: storedPassword };
    }

    // The normal ORISO path: every call room is created encrypted, so every
    // call gets MatrixRTC per-participant media encryption.
    if (room.hasEncryptionStateEvent()) {
      return { kind: E2eeType.PER_PARTICIPANT };
    }

    return { kind: E2eeType.NONE };
  }, [room, storedPassword]);
  return e2eeSystem;
}
