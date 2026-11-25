/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { WidgetApiToWidgetAction } from "matrix-widget-api";
import { type IThemeChangeActionRequest } from "matrix-widget-api";

import { type ContrastLevel } from "./oriso/theme/orisoScheme";
import { getUrlParams } from "./UrlParams";
import { widget } from "./widget";

interface CallAppearance {
  scheme: "light" | "dark";
  contrast: ContrastLevel;
}

export const CallAppearanceContext = createContext<CallAppearance>({
  scheme: "dark",
  contrast: "standard",
});

export const useTheme = (): CallAppearance => {
  const [requestedTheme, setRequestedTheme] = useState(
    () => getUrlParams().theme,
  );
  const previousTheme = useRef<string | null>(document.body.classList.item(0));
  // A standalone or unnamed widget starts in the existing dark scheme.
  const scheme = requestedTheme?.includes("light") ? "light" : "dark";
  const contrast = requestedTheme?.includes("high-contrast")
    ? "high"
    : requestedTheme?.endsWith("-medium-contrast")
      ? "medium"
      : "standard";

  useEffect(() => {
    if (widget) {
      const onThemeChange = (
        ev: CustomEvent<IThemeChangeActionRequest>,
      ): void => {
        ev.preventDefault();
        if ("name" in ev.detail.data && typeof ev.detail.data.name === "string")
          setRequestedTheme(ev.detail.data.name);
        const scale = ev.detail.data.fontScale;
        if (typeof scale === "number" && scale >= 0.5 && scale <= 3) {
          document.documentElement.style.setProperty(
            "--font-scale",
            String(scale),
          );
        }
        widget!.api.transport.reply(ev.detail, {});
      };

      widget.lazyActions.on(WidgetApiToWidgetAction.ThemeChange, onThemeChange);
      return (): void => {
        widget!.lazyActions.off(
          WidgetApiToWidgetAction.ThemeChange,
          onThemeChange,
        );
      };
    }
  }, []);

  useLayoutEffect(() => {
    const themeString = `cpd-theme-${scheme}${contrast === "high" ? "-hc" : ""}`;
    if (contrast === "standard") {
      delete document.body.dataset.orisoContrastLevel;
    } else {
      document.body.dataset.orisoContrastLevel = contrast;
    }
    if (themeString !== previousTheme.current) {
      document.body.classList.remove(
        "cpd-theme-light",
        "cpd-theme-dark",
        "cpd-theme-light-hc",
        "cpd-theme-dark-hc",
      );
      document.body.classList.add(themeString);
      previousTheme.current = themeString;
    }
    document.body.classList.remove("no-theme");
  }, [contrast, scheme]);

  return { scheme, contrast };
};
