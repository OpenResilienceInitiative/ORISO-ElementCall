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
  const { roomId: urlRoomId, password, widgetId, parentUrl } = getUrlParams();
  if (widgetId && parentUrl) return null;
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
  const { widgetId, parentUrl, perParticipantE2EE } = getUrlParams();
  const isWidget = !!widgetId && !!parentUrl;

  // NOTE: the first argument is the *room id*, not the storage key —
  // `useRoomSharedKey` prefixes it itself. Passing an already-prefixed key here
  // produced `room-shared-key-room-shared-key-…`, so a shared secret could be
  // written but never read back.
  const [storedPassword] = useRoomSharedKey(
    roomId,
    isWidget ? undefined : (getKeyForRoom(roomId) ?? undefined),
  );

  const room = client?.getRoom(roomId);
  const e2eeSystem = <EncryptionSystem>useMemo(() => {
    if (!room) return { kind: E2eeType.NONE };
    if (!isWidget && storedPassword)
      return { kind: E2eeType.SHARED_KEY, secret: storedPassword };
    // In widget mode the embedding host owns Matrix crypto, so it also decides
    // whether media is end-to-end encrypted — it is the only side that knows
    // whether its own key distribution is working. Deriving this from the room
    // state alone turned media E2EE on for every encrypted room the moment the
    // widget path shipped, and a single broken link in the key chain then
    // presents as a connected call with no audio and no error at all.
    // Absent flag means no media E2EE: signalling stays encrypted either way.
    if (isWidget)
      return perParticipantE2EE && room.hasEncryptionStateEvent()
        ? { kind: E2eeType.PER_PARTICIPANT }
        : { kind: E2eeType.NONE };
    if (room.hasEncryptionStateEvent())
      return { kind: E2eeType.PER_PARTICIPANT };
    return { kind: E2eeType.NONE };
  }, [isWidget, perParticipantE2EE, room, storedPassword]);
  return e2eeSystem;
}
