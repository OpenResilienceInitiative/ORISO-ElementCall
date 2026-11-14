/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POINTER_SEND_INTERVAL_MS, createThrottle } from "./throttle";

describe("createThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends between 15 and 20 times a second", () => {
    expect(1000 / POINTER_SEND_INTERVAL_MS).toBeGreaterThanOrEqual(15);
    expect(1000 / POINTER_SEND_INTERVAL_MS).toBeLessThanOrEqual(20);
  });

  it("sends the first value at once", () => {
    const send = vi.fn();
    const t = createThrottle(send, 60);
    t.push(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("caps a mouse at 120 Hz to one send per interval", () => {
    const send = vi.fn();
    const t = createThrottle(send, 60);
    // One second of movement, an event every ~8 ms.
    for (let i = 0; i < 120; i++) {
      t.push(i);
      vi.advanceTimersByTime(1000 / 120);
    }
    vi.advanceTimersByTime(60);
    // 1000 / 60 ≈ 16.7 → 17 or 18 sends including the leading and trailing one.
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(16);
    expect(send.mock.calls.length).toBeLessThanOrEqual(18);
  });

  it("always delivers the LAST position, so the dot stops where the mouse stopped", () => {
    const send = vi.fn();
    const t = createThrottle(send, 60);
    t.push("a");
    t.push("b");
    t.push("c");
    expect(send).toHaveBeenLastCalledWith("a");
    vi.advanceTimersByTime(60);
    expect(send).toHaveBeenLastCalledWith("c");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sends nothing more once there is nothing new", () => {
    const send = vi.fn();
    const t = createThrottle(send, 60);
    t.push(1);
    vi.advanceTimersByTime(600);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flush sends a pending value now and cancel drops it", () => {
    const send = vi.fn();
    const t = createThrottle(send, 60);
    t.push(1);
    t.push(2);
    t.flush();
    expect(send).toHaveBeenLastCalledWith(2);
    t.push(3);
    t.push(4);
    t.cancel();
    vi.advanceTimersByTime(600);
    expect(send).not.toHaveBeenCalledWith(4);
  });
});
