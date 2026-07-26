/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useRoomEncryptionSystem } from "./sharedKeyManagement";
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
}: {
  encrypted: boolean;
  password?: string | null;
  roomExists?: boolean;
}): void => {
  getUrlParamsMock.mockReturnValue({ roomId: ROOM_ID, password });
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
  it("uses per-participant media encryption in an encrypted widget room", () => {
    setup({ encrypted: true });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.PER_PARTICIPANT });
  });

  it("prefers a shared secret from the call link", () => {
    setup({ encrypted: true, password: "secret-from-link" });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({
      kind: E2eeType.SHARED_KEY,
      secret: "secret-from-link",
    });
  });

  it("reads a shared secret from the same storage key it writes", () => {
    setup({ encrypted: true, password: "written-once" });
    renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    setup({ encrypted: true, password: null });
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
});
