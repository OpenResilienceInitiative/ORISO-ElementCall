/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { EventType } from "matrix-js-sdk";

import { ElementCallReactionEventType } from "./reactions";
import { buildOrisoWidgetCapabilities } from "./orisoWidgetCapabilities";

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
      receiveEvent: [
        EventType.CallEncryptionKeysPrefix,
        EventType.RTCNotification,
        EventType.Reaction,
        ElementCallReactionEventType,
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
