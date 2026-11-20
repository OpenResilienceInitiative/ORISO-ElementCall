/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventEmitter } from "events";
import {
  forgetCounsellors,
  readCounsellors,
  useOrisoCounsellors,
} from "./useOrisoCounsellors";

const host = vi.hoisted(() => ({
  lazyActions: null as unknown as EventEmitter,
  reply: vi.fn(),
}));

vi.mock("../widget", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { EventEmitter } = await import("events");
  host.lazyActions = new EventEmitter();
  return {
    ...actual,
    widget: {
      lazyActions: host.lazyActions,
      api: { transport: { reply: host.reply } },
    },
  };
});

const fromHost = (data: unknown): void => {
  act(() => {
    host.lazyActions.emit(
      "org.oriso.call.counsellors",
      new CustomEvent("x", { detail: { data } }),
    );
  });
};

describe("the host's list of counsellors", () => {
  beforeEach(() => {
    host.reply.mockReset();
    forgetCounsellors();
  });

  it("is null until the host has sent one", () => {
    const { result } = renderHook(() => useOrisoCounsellors());
    expect(result.current).toBeNull();
  });

  it("follows what the host sends, and answers it", () => {
    const { result } = renderHook(() => useOrisoCounsellors());
    fromHost({ userIds: ["@berater:oriso.test"] });
    expect([...result.current!]).toEqual(["@berater:oriso.test"]);
    expect(host.reply).toHaveBeenCalledOnce();
    fromHost({ userIds: [] });
    expect(result.current!.size).toBe(0);
  });

  it("ignores a malformed message without clearing the list", () => {
    const { result } = renderHook(() => useOrisoCounsellors());
    fromHost({ userIds: ["@berater:oriso.test"] });
    fromHost({ userIds: "@anon:oriso.test" });
    expect([...result.current!]).toEqual(["@berater:oriso.test"]);
    expect(host.reply).toHaveBeenCalledTimes(2);
  });

  it("keeps only user ids that are strings", () => {
    expect([...readCounsellors({ userIds: ["@a:x", 3, null] })!]).toEqual([
      "@a:x",
    ]);
    expect(readCounsellors(undefined)).toBeNull();
  });
});
