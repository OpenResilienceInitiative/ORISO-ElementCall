/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";
import userEvent from "@testing-library/user-event";

import { InitialDeviceNotice } from "./InitialDeviceNotice";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { mockMediaDevices } from "../utils/test";
import { type InitialInputKind } from "../state/initialInputDevices";

const renderNotice = (
  unmatched$: BehaviorSubject<InitialInputKind[]>,
): ReturnType<typeof render> =>
  render(
    <MediaDevicesContext
      value={mockMediaDevices({ unmatchedInitialInputs$: unmatched$ })}
    >
      <InitialDeviceNotice />
    </MediaDevicesContext>,
  );

describe("InitialDeviceNotice (#116)", () => {
  it("says nothing when the host's devices were found", () => {
    renderNotice(new BehaviorSubject<InitialInputKind[]>([]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says the chosen microphone was not found", () => {
    renderNotice(new BehaviorSubject<InitialInputKind[]>(["audioinput"]));
    expect(
      screen.getByText(
        "Your chosen microphone was not found. The call uses the default microphone.",
      ),
    ).toBeTruthy();
  });

  it("says the chosen camera was not found, once dismissed it stays away", async () => {
    const user = userEvent.setup();
    const unmatched$ = new BehaviorSubject<InitialInputKind[]>([]);
    renderNotice(unmatched$);
    act(() => unmatched$.next(["videoinput"]));
    const notice = screen.getByText(
      "Your chosen camera was not found. The call uses the default camera.",
    );
    await user.click(notice);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names both when neither was found", () => {
    renderNotice(
      new BehaviorSubject<InitialInputKind[]>(["audioinput", "videoinput"]),
    );
    expect(
      screen.getByText(
        "Your chosen microphone and camera were not found. The call uses the default devices.",
      ),
    ).toBeTruthy();
  });
});
