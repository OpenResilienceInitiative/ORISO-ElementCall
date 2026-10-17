/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventType } from "matrix-js-sdk";

import type { ICapabilities } from "matrix-js-sdk";
import { ElementCallReactionEventType } from "./reactions";
import { ORISO_IDENTITY_EVENT_TYPE } from "./oriso/identity";

/**
 * The first-party ORISO widget contract. Keep this deliberately smaller than
 * upstream Element Call: the iframe receives only the events needed for
 * MatrixRTC membership, encrypted media keys, ringing and reactions.
 */
export const buildOrisoWidgetCapabilities = (
  userId: string,
  deviceId: string,
  /**
   * Whether this embedding asked for the ORISO design.
   *
   * Required rather than defaulted, because it decides whether identity
   * records are delivered into the iframe at all and a silent default is the
   * wrong failure mode for that. A plain Element Web embedding of this fork
   * renders upstream's rectangles, so it has no use for them: asking for them
   * anyway widens the contract for an embedder that never reads them. There
   * would be nothing to deliver in practice — only the ORISO host publishes
   * identities — but least privilege on the one event that carries who
   * somebody is should not depend on that.
   */
  orisoDesign: boolean,
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
    /*
     * Receive is wider than send by exactly one event, and only when the
     * ORISO design was asked for.
     *
     * Who everybody is, as their own client published it, arrives as a
     * TIMELINE event so that the room's encryption covers it — room state is
     * not encrypted, and an identity in state was a record the homeserver
     * could read. It is absent from `sendEvent` on purpose: the call is told
     * identities and never writes one, not even its own. The host does that,
     * because the host is what knows.
     */
    receiveEvent: orisoDesign
      ? [...rtcEvents, ORISO_IDENTITY_EVENT_TYPE]
      : rtcEvents,
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
