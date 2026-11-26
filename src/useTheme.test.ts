/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest";
import EventEmitter from "events";
import { WidgetApiToWidgetAction } from "matrix-widget-api";

import { useTheme } from "./useTheme";
import { getUrlParams } from "./UrlParams";
import { widget } from "./widget";

vi.mock("./UrlParams", () => ({ getUrlParams: vi.fn() }));
vi.mock("./widget", () => ({
  widget: {
    api: { transport: { reply: vi.fn() } },
    lazyActions: new EventEmitter(),
  },
}));

describe("useTheme", () => {
  let originalClassList: DOMTokenList;
  beforeEach(() => {
    // Save the original classList to setup spies
    originalClassList = document.body.classList;

    vi.spyOn(originalClassList, "add");
    vi.spyOn(originalClassList, "remove");
    vi.spyOn(originalClassList, "item").mockReturnValue(null);
    (getUrlParams as Mock).mockReturnValue({ theme: "dark" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    { setTheme: null, add: ["cpd-theme-dark"] },
    { setTheme: "light", add: ["cpd-theme-light"] },
    { setTheme: "dark-high-contrast", add: ["cpd-theme-dark-hc"] },
    { setTheme: "light-high-contrast", add: ["cpd-theme-light-hc"] },
  ])("apply procedure", ({ setTheme, add }) => {
    test(`should apply ${add[0]} theme when ${setTheme} theme is specified`, () => {
      (getUrlParams as Mock).mockReturnValue({ theme: setTheme });

      renderHook(() => useTheme());

      expect(originalClassList.remove).toHaveBeenCalledWith(
        "cpd-theme-light",
        "cpd-theme-dark",
        "cpd-theme-light-hc",
        "cpd-theme-dark-hc",
      );
      expect(originalClassList.add).toHaveBeenCalledWith(...add);
    });
  });

  test("should not reapply the same theme if it hasn't changed", () => {
    // Simulate a previous theme
    originalClassList.item = vi.fn().mockReturnValue("cpd-theme-dark");

    renderHook(() => useTheme());

    expect(document.body.classList.add).not.toHaveBeenCalledWith(
      "cpd-theme-dark",
    );

    // Ensure the 'no-theme' class is removed
    expect(document.body.classList.remove).toHaveBeenCalledWith("no-theme");
    expect(originalClassList.add).not.toHaveBeenCalled();
  });

  test("theme changes in response to widget actions", async () => {
    renderHook(() => useTheme());

    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-dark");
    await act(() =>
      widget!.lazyActions.emit(
        WidgetApiToWidgetAction.ThemeChange,
        new CustomEvent(WidgetApiToWidgetAction.ThemeChange, {
          detail: { data: { name: "light" } },
        }),
      ),
    );
    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenLastCalledWith("cpd-theme-light");
  });

  test.each(["light", "dark"] as const)(
    "uses Medium with %s from the widget address",
    (scheme) => {
      (getUrlParams as Mock).mockReturnValue({
        theme: `${scheme}-medium-contrast`,
      });

      const { result } = renderHook(() => useTheme());

      expect(result.current).toEqual({ scheme, contrast: "medium" });
      expect(document.body).toHaveClass(`cpd-theme-${scheme}`);
      expect(document.body).toHaveAttribute(
        "data-oriso-contrast-level",
        "medium",
      );
    },
  );

  test("changes a live widget's appearance and keeps the last valid scale", () => {
    const previous =
      document.documentElement.style.getPropertyValue("--font-scale");
    try {
      document.documentElement.style.setProperty("--font-scale", "1.25");
      renderHook(() => useTheme());
      const action = WidgetApiToWidgetAction.ThemeChange;
      const publish = (data: { name?: string; fontScale?: unknown }): void => {
        widget!.lazyActions.emit(
          action,
          new CustomEvent(action, { detail: { data } }),
        );
      };
      act(() => publish({ name: "dark-medium-contrast", fontScale: 1.5 }));
      expect(document.body).toHaveClass("cpd-theme-dark");
      expect(document.body).toHaveAttribute(
        "data-oriso-contrast-level",
        "medium",
      );
      act(() => publish({ name: "light-high-contrast" }));
      expect(document.body).toHaveAttribute(
        "data-oriso-contrast-level",
        "high",
      );
      expect(document.body.classList.add).toHaveBeenLastCalledWith(
        "cpd-theme-light-hc",
      );
      expect(
        document.documentElement.style.getPropertyValue("--font-scale"),
      ).toBe("1.5");
      act(() => publish({ name: "dark-high-contrast", fontScale: -1 }));
      expect(document.body.classList.add).toHaveBeenLastCalledWith(
        "cpd-theme-dark-hc",
      );
      expect(
        document.documentElement.style.getPropertyValue("--font-scale"),
      ).toBe("1.5");
      act(() => publish({ name: "dark-medium-contrast" }));
      expect(document.body).not.toHaveClass("cpd-theme-dark-hc");
      expect(document.body).toHaveClass("cpd-theme-dark");
      expect(document.body).toHaveAttribute(
        "data-oriso-contrast-level",
        "medium",
      );
      act(() => publish({ name: "dark" }));
      expect(document.body).not.toHaveAttribute("data-oriso-contrast-level");
      expect(
        document.documentElement.style.getPropertyValue("--font-scale"),
      ).toBe("1.5");
      act(() => publish({ name: "light", fontScale: 1 }));
      expect(
        document.documentElement.style.getPropertyValue("--font-scale"),
      ).toBe("1");
    } finally {
      document.documentElement.style.setProperty("--font-scale", previous);
    }
  });
});
