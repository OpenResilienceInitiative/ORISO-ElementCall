/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callStartOf,
  formatCallDuration,
  useCallDuration,
} from "./useCallDuration";

const membership = (ts: number): { createdTs(): number } => ({
  createdTs: () => ts,
});

describe("the call's duration in the header (S3)", () => {
  it.each([
    [0, "0:00"],
    [4_000, "0:04"],
    [724_000, "12:04"],
    [3_600_000 + 65_000, "1:01:05"],
    [-5_000, "0:00"],
  ])("writes %i ms as %s", (ms, want) => {
    expect(formatCallDuration(ms)).toBe(want);
  });

  it("counts from the oldest membership, so both people see the same", () => {
    expect(callStartOf([membership(5_000), membership(2_000)], 9_000)).toBe(
      2_000,
    );
  });

  it("falls back to the mount time when the session cannot say", () => {
    expect(callStartOf(undefined, 9_000)).toBe(9_000);
    expect(
      callStartOf(
        [
          {
            createdTs: (): number => {
              throw new Error("no ts");
            },
          },
          membership(0),
        ],
        9_000,
      ),
    ).toBe(9_000);
  });

  describe("the hook", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(100_000);
    });
    afterEach(() => vi.useRealTimers());

    it("ticks every second while on", () => {
      const session = { memberships: [membership(40_000)] };
      const { result } = renderHook(() =>
        useCallDuration(session as never, true),
      );
      expect(result.current).toBe("1:00");
      act(() => void vi.advanceTimersByTime(5_000));
      expect(result.current).toBe("1:05");
    });

    it("is null while off", () => {
      const { result } = renderHook(() => useCallDuration(undefined, false));
      expect(result.current).toBeNull();
    });
  });
});
