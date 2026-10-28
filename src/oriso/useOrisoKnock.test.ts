/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventEmitter } from "events";
import { useOrisoKnock } from "./useOrisoKnock";

const host = vi.hoisted(() => ({
  lazyActions: null as unknown as EventEmitter,
  send: vi.fn(),
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
      api: { transport: { send: host.send, reply: host.reply } },
    },
  };
});

const fromHost = (data: unknown): void => {
  act(() => {
    host.lazyActions.emit(
      "org.oriso.call.knock_state",
      new CustomEvent("x", { detail: { data } }),
    );
  });
};

describe("knocking between call and host (#108)", () => {
  beforeEach(() => {
    host.send.mockReset();
    host.reply.mockReset();
  });

  it("has no switch until the host sends its link's state", () => {
    const { result } = renderHook(() => useOrisoKnock());
    expect(result.current).toEqual({ waiting: 0, knock: null, setKnock: null });
  });

  it("shows what the host sends and answers it", () => {
    const { result } = renderHook(() => useOrisoKnock());
    fromHost({ waiting: 2, knock: true });
    expect(result.current.waiting).toBe(2);
    expect(result.current.knock).toBe(true);
    expect(host.reply).toHaveBeenCalledOnce();
  });

  it("ignores a state it cannot read", () => {
    const { result } = renderHook(() => useOrisoKnock());
    fromHost({ waiting: 1, knock: false });
    fromHost({ waiting: "lots" });
    expect(result.current.waiting).toBe(1);
  });

  it("asks the host to flip Anklopfen", async () => {
    host.send.mockResolvedValue({});
    const { result } = renderHook(() => useOrisoKnock());
    fromHost({ waiting: 0, knock: true });
    await act(async () => {
      result.current.setKnock!(false);
      await Promise.resolve();
    });
    expect(host.send).toHaveBeenCalledWith("org.oriso.call.set_knock", {
      knock: false,
    });
    expect(result.current.knock).toBe(false);
  });

  it("flips back when the host did not take it", async () => {
    host.send.mockRejectedValue(new Error("no"));
    const { result } = renderHook(() => useOrisoKnock());
    fromHost({ waiting: 0, knock: true });
    await act(async () => {
      result.current.setKnock!(false);
      await Promise.resolve();
    });
    expect(result.current.knock).toBe(true);
  });
});
