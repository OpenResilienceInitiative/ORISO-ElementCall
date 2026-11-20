/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Hanging up is the error colour, always — never the brand's or a tenant's
 * (#112 follow-up). Asserted on the stylesheets: jsdom paints nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const toolbar = strip(
  readFileSync("src/oriso/OrisoToolbar.module.css", "utf8"),
);
const room = strip(readFileSync("src/room/InCallView.module.css", "utf8"));
const theme = readFileSync("src/oriso-theme.css", "utf8");

const declarations = (css: string, selector: string): string =>
  new RegExp(`(?:^|\\})\\s*${selector}\\s*\\{([^{}]*)\\}`).exec(css)?.[1] ?? "";

describe("the hang-up button's colour", () => {
  it("is the error colour, not the brand colour", () => {
    const hangup = declarations(toolbar, "\\.hangup");
    expect(hangup).toMatch(/background:\s*var\(--oriso-critical, #b1005e\)/);
    expect(hangup).not.toMatch(/oriso-primary/);
    expect(declarations(toolbar, "\\.danger")).toMatch(
      /color:\s*var\(--oriso-critical, #b1005e\)/,
    );
    expect(declarations(toolbar, "\\.danger")).not.toMatch(/oriso-primary/);
  });

  it("darkens on hover from the same colour, not from the brand's hover", () => {
    const hover = /\.hangup:hover\s*\{([^{}]*)\}/.exec(toolbar)?.[1] ?? "";
    expect(hover).toMatch(/var\(--oriso-critical/);
    expect(hover).not.toMatch(/oriso-primary/);
  });

  it("takes its value from the theme's light error colour", () => {
    // The call is dark, whose critical token is pale pink; the button and the
    // light menu card need the light one, so it is fixed — and kept in step.
    const light = /\.cpd-theme-light\.cpd-theme-light\s*\{([^}]*)\}/.exec(
      theme,
    )?.[1];
    const critical = /--cpd-color-bg-critical-primary:\s*(#[0-9a-f]{6})/i.exec(
      light ?? "",
    )?.[1];
    const text = /--cpd-color-text-critical-primary:\s*(#[0-9a-f]{6})/i.exec(
      light ?? "",
    )?.[1];
    expect(critical).toBeDefined();
    expect(text).toBe(critical);
    expect(room).toContain(`--oriso-critical: ${critical}`);
  });
});
