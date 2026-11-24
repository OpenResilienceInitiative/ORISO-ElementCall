/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventEmitter } from "events";
import { forgetWindowState, useOrisoWindow } from "./useOrisoWindow";

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
      "org.oriso.call.window_state",
      new CustomEvent("x", { detail: { data } }),
    );
  });
};

describe("the window buttons between call and host (S2)", () => {
  beforeEach(() => {
    host.send.mockReset().mockResolvedValue({});
    host.reply.mockReset();
    forgetWindowState();
  });

  it("has no buttons while the host keeps its own", () => {
    const { result } = renderHook(() => useOrisoWindow(false));
    expect(result.current.send).toBeNull();
  });

  it.each(["minimise", "toggle_fullscreen"] as const)(
    "asks the host to %s",
    (command) => {
      const { result } = renderHook(() => useOrisoWindow(true));
      result.current.send!(command);
      expect(host.send).toHaveBeenCalledWith("org.oriso.call.window", {
        command,
      });
    },
  );

  it("shows the full-screen state the host reports, and answers it", () => {
    const { result } = renderHook(() => useOrisoWindow(true));
    expect(result.current.fullscreen).toBe(false);
    fromHost({ fullscreen: true });
    expect(result.current.fullscreen).toBe(true);
    expect(host.reply).toHaveBeenCalledOnce();
    fromHost({ fullscreen: false });
    expect(result.current.fullscreen).toBe(false);
  });

  it("ignores a state that is not a boolean", () => {
    const { result } = renderHook(() => useOrisoWindow(true));
    fromHost({ fullscreen: "yes" });
    expect(result.current.fullscreen).toBe(false);
    expect(host.reply).toHaveBeenCalledOnce();
  });

  it("does not throw when the host refuses", async () => {
    host.send.mockRejectedValue(new Error("no"));
    const { result } = renderHook(() => useOrisoWindow(true));
    expect(() => result.current.send!("minimise")).not.toThrow();
    await Promise.resolve();
  });
});
