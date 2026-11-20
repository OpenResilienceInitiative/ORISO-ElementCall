/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { computeUrlParams } from "../../UrlParams";
import { BRAND_STYLE_ID, applyBrandTheme } from "./applyBrandTheme";
import { LIGHT, themeBlocks } from "./themeCss.testUtils";

const injected = (): HTMLStyleElement | null =>
  document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;

beforeEach(() => {
  const shipped = document.createElement("style");
  shipped.id = "static";
  shipped.textContent = "/* index.css */";
  document.head.replaceChildren(shipped);
});

afterEach(() => {
  document.head.replaceChildren();
  vi.restoreAllMocks();
});

describe("applyBrandTheme", () => {
  it("changes nothing when the address carries no brand colour", () => {
    const before = document.head.innerHTML;
    expect(applyBrandTheme(computeUrlParams("", ""))).toBe(false);
    expect(document.head.innerHTML).toBe(before);
  });

  it("changes nothing for an invalid or too-pale primary", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const before = document.head.innerHTML;
    expect(applyBrandTheme(computeUrlParams("", "#?orisoPrimary=808080"))).toBe(
      false,
    );
    expect(
      applyBrandTheme(computeUrlParams("", "#?orisoPrimary=not-a-colour")),
    ).toBe(false);
    expect(applyBrandTheme(computeUrlParams("", "#?orisoAccent=1c4f8f"))).toBe(
      false,
    );
    expect(document.head.innerHTML).toBe(before);
  });

  it("adds one style element carrying the brand palette", () => {
    expect(applyBrandTheme(computeUrlParams("", "#?orisoPrimary=0a7a3c"))).toBe(
      true,
    );
    const style = injected();
    expect(style).not.toBeNull();
    expect(style!.tagName).toBe("STYLE");
    expect(style!.textContent).toContain("@layer compound.custom");
    expect(
      themeBlocks(style!.textContent!)[LIGHT][
        "--cpd-color-bg-action-primary-rest"
      ],
    ).toBe("#0a7a3c");
  });

  it("lands after the static stylesheet, so it wins inside the same layer", () => {
    applyBrandTheme(computeUrlParams("", "#?orisoPrimary=0a7a3c"));
    const styles = [...document.head.querySelectorAll("style")];
    expect(styles.map((s) => s.id)).toEqual(["static", BRAND_STYLE_ID]);
  });

  it("replaces its own element instead of piling up", () => {
    applyBrandTheme(computeUrlParams("", "#?orisoPrimary=0a7a3c"));
    applyBrandTheme(computeUrlParams("", "#?orisoPrimary=1c4f8f"));
    expect(document.querySelectorAll(`#${BRAND_STYLE_ID}`)).toHaveLength(1);
    expect(
      themeBlocks(injected()!.textContent!)[LIGHT][
        "--cpd-color-bg-action-primary-rest"
      ],
    ).toBe("#1c4f8f");
  });

  it("removes a stale element when a later address has no usable brand", () => {
    applyBrandTheme(computeUrlParams("", "#?orisoPrimary=0a7a3c"));
    expect(applyBrandTheme(computeUrlParams("", ""))).toBe(false);
    expect(injected()).toBeNull();
  });

  it("puts nothing but validated colours into the stylesheet", () => {
    applyBrandTheme(
      computeUrlParams(
        "",
        "#?orisoPrimary=0a7a3c&orisoAccent=red;}body{display:none&orisoSignal=%3C/style%3E",
      ),
    );
    const css = injected()!.textContent!;
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("body{");
    expect(css).not.toContain("</style");
    // The two rejected seeds left the palette exactly as if only the primary
    // had been sent.
    document.head.querySelector(`#${BRAND_STYLE_ID}`)!.remove();
    applyBrandTheme(computeUrlParams("", "#?orisoPrimary=0a7a3c"));
    expect(injected()!.textContent).toBe(css);
  });
});
