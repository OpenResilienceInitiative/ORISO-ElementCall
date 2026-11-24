/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * "Namen & Symbole" lives in the settings, not in the call menu (Frank,
 * 12 Nov, ORISO-Frontend#2233), and the capsule is the default.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { OrisoNameStyleSetting } from "./OrisoNameStyleSetting";
import { NAME_STYLE_KEY } from "./nameStyle";
import { PreferencesSettingsTab } from "../settings/PreferencesSettingsTab";

afterEach(() => localStorage.removeItem(NAME_STYLE_KEY));

describe("Namen & Symbole in the settings", () => {
  it("starts on the capsule, listed first as the default", () => {
    render(<OrisoNameStyleSetting />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.dataset.nameStyle)).toEqual([
      "popout",
      "dezent",
    ]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("aria-checked", "false");
  });

  it("saves the choice for the next call", () => {
    render(<OrisoNameStyleSetting />);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(localStorage.getItem(NAME_STYLE_KEY)).toBe("dezent");
    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("is part of the preferences in the ORISO design only", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/room/#?orisoDesign=true"]}>
        <PreferencesSettingsTab />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("oriso-name-style-setting")).toBeTruthy();
    unmount();
    render(
      <MemoryRouter initialEntries={["/room/#?widgetId=w"]}>
        <PreferencesSettingsTab />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("oriso-name-style-setting")).toBeNull();
  });
});
