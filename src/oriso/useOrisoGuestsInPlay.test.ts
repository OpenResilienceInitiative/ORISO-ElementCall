/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  forgetGuestsInPlay,
  useOrisoGuestsInPlay,
} from "./useOrisoGuestsInPlay";

describe("whether guests are part of this call", () => {
  beforeEach(() => forgetGuestsInPlay());

  it("is not while only the counsellor and logged-in people are in it", () => {
    const { result } = renderHook(() => useOrisoGuestsInPlay("!call:a", 0));
    expect(result.current.inPlay).toBe(false);
  });

  it("is once somebody knocks, and stays after they were let in", () => {
    const { result, rerender } = renderHook(
      ({ waiting }) => useOrisoGuestsInPlay("!call:a", waiting),
      { initialProps: { waiting: 0 } },
    );
    rerender({ waiting: 1 });
    expect(result.current.inPlay).toBe(true);
    // Let in: nobody waits any more, but the guest is now in the call.
    rerender({ waiting: 0 });
    expect(result.current.inPlay).toBe(true);
  });

  it("is once the counsellor asks for the call's link", () => {
    const { result } = renderHook(() => useOrisoGuestsInPlay("!call:a", 0));
    act(() => result.current.markInviting());
    expect(result.current.inPlay).toBe(true);
  });

  it("is remembered for the same call across the lobby, not for another", () => {
    const first = renderHook(() => useOrisoGuestsInPlay("!call:a", 0));
    act(() => first.result.current.markInviting());
    first.unmount();
    expect(
      renderHook(() => useOrisoGuestsInPlay("!call:a", 0)).result.current
        .inPlay,
    ).toBe(true);
    expect(
      renderHook(() => useOrisoGuestsInPlay("!call:b", 0)).result.current
        .inPlay,
    ).toBe(false);
  });
});
