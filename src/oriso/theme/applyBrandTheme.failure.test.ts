/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { computeUrlParams } from "../../UrlParams";
import { BRAND_STYLE_ID, applyBrandTheme } from "./applyBrandTheme";
import type * as BrandTheme from "./brandTheme";

vi.mock("./brandTheme", async (importOriginal) => ({
  ...(await importOriginal<typeof BrandTheme>()),
  buildBrandThemeCss: (): string => {
    throw new Error("engine blew up");
  },
}));

describe("applyBrandTheme when the palette cannot be built", () => {
  it("leaves the shipped palette alone instead of breaking the call", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    expect(applyBrandTheme(computeUrlParams("", "#?orisoPrimary=0a7a3c"))).toBe(
      false,
    );
    expect(document.getElementById(BRAND_STYLE_ID)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
