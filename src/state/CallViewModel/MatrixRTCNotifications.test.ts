/*
Copyright 2026 OpenResilienceInitiative.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventType, MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
  type JoinSessionConfig,
} from "matrix-js-sdk/lib/matrixrtc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushPromises } from "../../utils/test";

const roomId = "!call:example.org";
const userId = "@caller:example.org";
const deviceId = "CALLER";
const membershipEventId = "$own-membership";
const widgetJoinConfig = {
  notificationType: "ring",
  callIntent: "video",
  sendLegacyNotification: false,
} as const;

describe("MatrixRTC call notifications", () => {
  let client: MatrixClient;
  let room: Room;
  let session: MatrixRTCSession;

  beforeEach(() => {
    client = new MatrixClient({
      baseUrl: "https://example.org",
      userId,
      deviceId,
    });
    room = new Room(roomId, client, userId);
    room.currentState.setStateEvents([
      new MatrixEvent({
        room_id: roomId,
        sender: userId,
        state_key: "",
        type: EventType.RoomCreate,
        content: { room_version: "10", creator: userId },
      }),
      new MatrixEvent({
        room_id: roomId,
        sender: userId,
        state_key: userId,
        type: EventType.RoomMember,
        content: { membership: "join" },
      }),
    ]);
    session = MatrixRTCSession.sessionForSlot(client, room, {
      id: "",
      application: "m.call",
    });
    vi.spyOn(client, "_unstable_sendDelayedStateEvent").mockResolvedValue({
      delay_id: "delayed-leave",
    });
    vi.spyOn(
      client,
      "_unstable_restartScheduledDelayedEvent",
    ).mockResolvedValue({});
    vi.spyOn(client, "_unstable_sendScheduledDelayedEvent").mockResolvedValue(
      {},
    );
  });

  afterEach(async () => {
    await session.stop();
    vi.restoreAllMocks();
  });

  async function joinAsFirstMember(config: JoinSessionConfig): Promise<void> {
    const membershipSent = Promise.withResolvers<MatrixEvent>();
    vi.spyOn(client, "sendStateEvent").mockImplementation(
      async (_roomId, type, content, stateKey) => {
        membershipSent.resolve(
          new MatrixEvent({
            event_id: membershipEventId,
            room_id: roomId,
            sender: userId,
            state_key: stateKey,
            type,
            content,
            origin_server_ts: Date.now(),
          }),
        );
        return await Promise.resolve({ event_id: membershipEventId });
      },
    );

    session.joinRoomSession([], undefined, config);
    room.currentState.setStateEvents([await membershipSent.promise]);
    session.onRTCSessionMemberUpdate();
    await flushPromises();
  }

  it("sends only the modern notification for widgets and reports it to listeners", async () => {
    const sendEvent = vi.spyOn(client, "sendEvent").mockResolvedValue({
      event_id: "$notification",
    });
    const didSend = vi.fn();
    session.on(MatrixRTCSessionEvent.DidSendCallNotification, didSend);

    await joinAsFirstMember(widgetJoinConfig);

    const notification = expect.objectContaining({
      notification_type: "ring",
      "m.call.intent": "video",
      "m.relates_to": { event_id: membershipEventId, rel_type: "m.reference" },
    });
    expect(sendEvent).toHaveBeenCalledExactlyOnceWith(
      roomId,
      EventType.RTCNotification,
      notification,
    );
    expect(didSend).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event_id: "$notification",
        notification_type: "ring",
      }),
      undefined,
    );
  });

  it("preserves both notifications for standalone callers", async () => {
    const sendEvent = vi.spyOn(client, "sendEvent").mockResolvedValue({
      event_id: "$notification",
    });
    const didSend = vi.fn();
    session.on(MatrixRTCSessionEvent.DidSendCallNotification, didSend);

    await joinAsFirstMember({ notificationType: "ring", callIntent: "video" });

    expect(sendEvent.mock.calls.map(([, type]) => type)).toEqual([
      EventType.CallNotify,
      EventType.RTCNotification,
    ]);
    expect(didSend).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ notification_type: "ring" }),
      expect.objectContaining({ notify_type: "ring" }),
    );
  });

  it("logs the original modern send error", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    // Keep the old destructuring catch executable so the regression fails at
    // the assertion without creating an unhandled rejection in the test runner.
    const sendError = Object.assign(
      new Error("Modern notification was rejected"),
      {
        [Symbol.iterator]: function* () {
          yield "lost rejection reason";
        },
      },
    );
    vi.spyOn(client, "sendEvent").mockImplementation(async (_roomId, type) => {
      if (type === EventType.RTCNotification) throw sendError;
      return await Promise.resolve({ event_id: "$legacy" });
    });

    await joinAsFirstMember(widgetJoinConfig);

    const failure = logError.mock.calls.find(
      ([, message]) => message === "Failed to send call notification",
    );
    expect(failure?.[2]).toBe(sendError);
  });
});
