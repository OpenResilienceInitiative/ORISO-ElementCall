/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { getKeyForRoom, useRoomEncryptionSystem } from "./sharedKeyManagement";
import { E2eeType } from "./e2eeType";

const useClientMock = vi.hoisted(() => vi.fn());
const getUrlParamsMock = vi.hoisted(() => vi.fn());

vi.mock("../ClientContext", () => ({ useClient: useClientMock }));
vi.mock("../UrlParams", () => ({ getUrlParams: getUrlParamsMock }));

const ROOM_ID = "!counselling:oriso.example";

const setup = ({
  encrypted,
  password = null,
  roomExists = true,
  widgetMode = true,
  perParticipantE2EE = undefined,
}: {
  encrypted: boolean;
  password?: string | null;
  roomExists?: boolean;
  widgetMode?: boolean;
  perParticipantE2EE?: boolean;
}): void => {
  getUrlParamsMock.mockReturnValue({
    roomId: ROOM_ID,
    password,
    perParticipantE2EE,
    widgetId: widgetMode ? "oriso-call" : null,
    parentUrl: widgetMode ? "https://app.oriso.example" : null,
  });
  useClientMock.mockReturnValue({
    client: {
      getRoom: (
        roomId: string,
      ): {
        roomId: string;
        hasEncryptionStateEvent: () => boolean;
      } | null =>
        roomExists && roomId === ROOM_ID
          ? { roomId, hasEncryptionStateEvent: () => encrypted }
          : null,
    },
  });
};

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useRoomEncryptionSystem", () => {
  it("uses per-participant media encryption when the host asks for it", () => {
    setup({ encrypted: true, perParticipantE2EE: true });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.PER_PARTICIPANT });
  });

  it("ignores a shared secret from the call link in widget mode", () => {
    setup({
      encrypted: true,
      password: "secret-from-link",
      widgetMode: true,
      perParticipantE2EE: true,
    });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.PER_PARTICIPANT });
    expect(getKeyForRoom(ROOM_ID)).toBeNull();
  });

  it("reads a shared secret from the same storage key in standalone mode", () => {
    setup({ encrypted: true, password: "written-once", widgetMode: false });
    renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    setup({ encrypted: true, password: null, widgetMode: false });
    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({
      kind: E2eeType.SHARED_KEY,
      secret: "written-once",
    });
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith("room-shared-key-"),
      ),
    ).toEqual([`room-shared-key-${ROOM_ID}`]);
  });

  it("ignores a previously stored shared key in widget mode", () => {
    localStorage.setItem(`room-shared-key-${ROOM_ID}`, "legacy-iframe-secret");
    setup({ encrypted: true, widgetMode: true, perParticipantE2EE: true });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.PER_PARTICIPANT });
  });

  it("uses no media encryption for an unencrypted room", () => {
    setup({ encrypted: false });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.NONE });
  });

  it("uses no media encryption while the room is unavailable", () => {
    setup({ encrypted: true, roomExists: false });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.NONE });
  });

  it("leaves media unencrypted in a widget room when the host does not ask for it", () => {
    // The host owns Matrix crypto, so it is the only side that can know whether
    // its media key distribution works. Turning per-participant E2EE on purely
    // because the room is encrypted produced calls that connected with no audio
    // in either direction and no error anywhere (ORISO-ElementCall#35).
    setup({ encrypted: true, perParticipantE2EE: undefined });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.NONE });
  });

  it("still uses per-participant encryption outside widget mode", () => {
    setup({
      encrypted: true,
      widgetMode: false,
      perParticipantE2EE: undefined,
    });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.PER_PARTICIPANT });
  });
});
