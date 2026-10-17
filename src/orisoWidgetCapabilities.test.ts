/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { EventType } from "matrix-js-sdk";

import { ElementCallReactionEventType } from "./reactions";
import { buildOrisoWidgetCapabilities } from "./orisoWidgetCapabilities";
import { ORISO_IDENTITY_EVENT_TYPE } from "./oriso/identity";

describe("ORISO widget capability contract", () => {
  it("exposes only the minimum MatrixRTC and reaction surface", () => {
    const capabilities = buildOrisoWidgetCapabilities(
      "@user:oriso.example",
      "ORISO_WEB_device",
    );

    expect(capabilities).toEqual({
      sendEvent: [
        EventType.CallEncryptionKeysPrefix,
        EventType.RTCNotification,
        EventType.Reaction,
        ElementCallReactionEventType,
      ],
      /*
       * Wider than `sendEvent` by exactly one event: the identity record,
       * which arrives as a TIMELINE event so that the room's encryption
       * covers it — room state is not encrypted, and an identity in state is
       * a record the homeserver can read. Readable, never sendable: the call
       * is told who everybody is and never decides it.
       */
      receiveEvent: [
        EventType.CallEncryptionKeysPrefix,
        EventType.RTCNotification,
        EventType.Reaction,
        ElementCallReactionEventType,
        ORISO_IDENTITY_EVENT_TYPE,
      ],
      sendState: [
        {
          eventType: EventType.GroupCallMemberPrefix,
          stateKey: "@user:oriso.example",
        },
        {
          eventType: EventType.GroupCallMemberPrefix,
          stateKey: "_@user:oriso.example_ORISO_WEB_device_m.call",
        },
        {
          eventType: EventType.GroupCallMemberPrefix,
          stateKey: "@user:oriso.example_ORISO_WEB_device_m.call",
        },
      ],
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
    });
  });
});
