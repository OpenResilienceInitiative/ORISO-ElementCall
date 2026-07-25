/*
Copyright 2026 ORISO / Open Resilience Initiative

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
      getRoom: (roomId: string) =>
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
  it("uses per-participant media encryption in an encrypted room", () => {
    // This is the ORISO default: every call room is created encrypted, so every
    // call must end up here. A regression to NONE means plaintext media.
    setup({ encrypted: true });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.PER_PARTICIPANT });
  });

  it("prefers a shared secret from the call link over per-participant keys", () => {
    // External guests have no Matrix identity and cannot take part in
    // per-participant key exchange, so a link password wins.
    setup({ encrypted: true, password: "s3cret-from-link" });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({
      kind: E2eeType.SHARED_KEY,
      secret: "s3cret-from-link",
    });
  });

  it("reads a shared secret back from local storage under the same key it was written to", () => {
    // Regression guard: the room id used to be double-prefixed on read, so a
    // stored secret was written but never found again.
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

  it("reports no encryption for an unencrypted room", () => {
    setup({ encrypted: false });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.NONE });
  });

  it("reports no encryption while the room is not known yet", () => {
    setup({ encrypted: true, roomExists: false });

    const { result } = renderHook(() => useRoomEncryptionSystem(ROOM_ID));

    expect(result.current).toEqual({ kind: E2eeType.NONE });
  });
});
