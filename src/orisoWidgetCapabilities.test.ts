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
      true,
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

describe("the identity capability follows the opt-in", () => {
  /*
   * Least privilege on the one event that carries who somebody is.
   *
   * A plain Element Web embedding of this fork renders upstream's rectangles
   * — the design is gated on `orisoDesign` — so it has no use for identity
   * records, and asking for them anyway widens the contract for an embedder
   * that never reads them. In practice there would be nothing to deliver,
   * since only the ORISO host publishes identities, but that is an argument
   * about what happens to be in the room rather than about what the iframe is
   * allowed to see.
   */
  const identityIn = (orisoDesign: boolean): boolean =>
    (
      buildOrisoWidgetCapabilities(
        "@user:oriso.example",
        "ORISO_WEB_device",
        orisoDesign,
      ).receiveEvent ?? []
    ).includes(ORISO_IDENTITY_EVENT_TYPE);

  it("asks for identity records when the ORISO design was asked for", () => {
    expect(identityIn(true)).toBe(true);
  });

  it("does not ask for them in a plain embedding", () => {
    expect(identityIn(false)).toBe(false);
  });

  it("changes nothing else between the two", () => {
    // The gate must move exactly one event, not quietly reshape the contract.
    const withDesign = buildOrisoWidgetCapabilities(
      "@user:oriso.example",
      "ORISO_WEB_device",
      true,
    );
    const plain = buildOrisoWidgetCapabilities(
      "@user:oriso.example",
      "ORISO_WEB_device",
      false,
    );
    expect({ ...plain, receiveEvent: undefined }).toEqual({
      ...withDesign,
      receiveEvent: undefined,
    });
    expect((withDesign.receiveEvent ?? []).length).toBe(
      (plain.receiveEvent ?? []).length + 1,
    );
  });
});
