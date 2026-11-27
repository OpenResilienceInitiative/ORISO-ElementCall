/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { type JSX } from "react";

import { Setting, backgroundBlur } from "../settings/settings";
import {
  applyInitialBackgroundBlur,
  ProcessorProvider,
} from "./TrackProcessorContext";

const getUrlParams = vi.hoisted(() => vi.fn());
vi.mock("../UrlParams", () => ({ getUrlParams }));

describe("background blur from the host's URL (#2558)", () => {
  afterEach(() => {
    localStorage.clear();
    backgroundBlur.setValue(false);
  });

  it("turns blur on or off when the host says so", () => {
    const setting = new Setting<boolean>("test-blur", false);
    applyInitialBackgroundBlur(true, setting);
    expect(setting.getValue()).toBe(true);
    applyInitialBackgroundBlur(false, setting);
    expect(setting.getValue()).toBe(false);
  });

  it("keeps the stored setting when the host says nothing", () => {
    const setting = new Setting<boolean>("test-blur", false);
    setting.setValue(true);
    applyInitialBackgroundBlur(undefined, setting);
    expect(setting.getValue()).toBe(true);
  });

  it("applies the flag once at start and leaves later toggles alone", () => {
    getUrlParams.mockReturnValue({ backgroundBlur: true });
    const child = (): JSX.Element => <div />;
    const { rerender } = render(
      <ProcessorProvider>{child()}</ProcessorProvider>,
    );
    expect(backgroundBlur.getValue()).toBe(true);

    // The person turns it off in Element Call's settings during the call.
    backgroundBlur.setValue(false);
    rerender(<ProcessorProvider>{child()}</ProcessorProvider>);
    expect(backgroundBlur.getValue()).toBe(false);
  });
});
