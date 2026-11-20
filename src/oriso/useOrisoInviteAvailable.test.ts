/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventEmitter } from "events";
import {
  forgetInviteAvailable,
  useOrisoInviteAvailable,
} from "./useOrisoInviteAvailable";

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
      "org.oriso.call.invite_available",
      new CustomEvent("x", { detail: { data } }),
    );
  });
};

describe("whether the call may offer its link, live from the host (#1662)", () => {
  beforeEach(() => {
    host.reply.mockReset();
    forgetInviteAvailable();
  });

  it("starts from `orisoInvite`", () => {
    expect(renderHook(() => useOrisoInviteAvailable(true)).result.current).toBe(
      true,
    );
    expect(
      renderHook(() => useOrisoInviteAvailable(false)).result.current,
    ).toBe(false);
  });

  it("turns the link off and on again when the host says so, and answers", () => {
    const { result } = renderHook(() => useOrisoInviteAvailable(true));
    fromHost({ available: false });
    expect(result.current).toBe(false);
    expect(host.reply).toHaveBeenCalledOnce();
    fromHost({ available: true });
    expect(result.current).toBe(true);
  });

  it("ignores a value that is not a boolean", () => {
    const { result } = renderHook(() => useOrisoInviteAvailable(true));
    fromHost({ available: "no" });
    expect(result.current).toBe(true);
    expect(host.reply).toHaveBeenCalledOnce();
  });

  it("keeps the host's last word for the next mount", () => {
    const first = renderHook(() => useOrisoInviteAvailable(true));
    fromHost({ available: false });
    first.unmount();
    expect(renderHook(() => useOrisoInviteAvailable(true)).result.current).toBe(
      false,
    );
  });
});
