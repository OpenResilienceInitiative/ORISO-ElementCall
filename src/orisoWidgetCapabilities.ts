/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventType } from "matrix-js-sdk";

import type { ICapabilities } from "matrix-js-sdk";
import { ElementCallReactionEventType } from "./reactions";

/**
 * The first-party ORISO widget contract. Keep this deliberately smaller than
 * upstream Element Call: the iframe receives only the events needed for
 * MatrixRTC membership, encrypted media keys, ringing and reactions.
 */
export const buildOrisoWidgetCapabilities = (
  userId: string,
  deviceId: string,
): ICapabilities => {
  const rtcEvents = [
    EventType.CallEncryptionKeysPrefix,
    EventType.RTCNotification,
    EventType.Reaction,
    ElementCallReactionEventType,
  ];
  const groupCallStateKeys = [
    userId,
    `_${userId}_${deviceId}_m.call`,
    `${userId}_${deviceId}_m.call`,
  ].map((stateKey) => ({
    eventType: EventType.GroupCallMemberPrefix,
    stateKey,
  }));

  return {
    sendEvent: rtcEvents,
    receiveEvent: rtcEvents,
    sendState: groupCallStateKeys,
    // create/name/member are read-only boot metadata. The ORISO host driver
    // still confines every state read to the single active call room.
    receiveState: [
      { eventType: EventType.RoomCreate },
      { eventType: EventType.RoomName },
      { eventType: EventType.RoomMember },
      { eventType: EventType.RoomEncryption },
      { eventType: EventType.GroupCallMemberPrefix },
    ],
    sendToDevice: [EventType.CallEncryptionKeysPrefix],
    receiveToDevice: [EventType.CallEncryptionKeysPrefix],
    turnServers: false,
    sendDelayedEvents: true,
    updateDelayedEvents: true,
  };
};
