/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Hct, argbFromHex } from "@material/material-color-utilities";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  DEFAULT_SEED,
  buildBrandThemeCss,
  resolveBrandSeeds,
} from "./brandTheme";
import {
  CALL_THEME_SELECTORS,
  DARK,
  DARK_HIGH,
  DARK_MEDIUM,
  LIGHT,
  LIGHT_HIGH,
  LIGHT_MEDIUM,
  ROOT,
  themeBlocks,
} from "./themeCss.testUtils";
import { wcagContrast } from "./wcagContrast";

const hue = (hex: string): number => Hct.fromInt(argbFromHex(hex)).hue;
const chroma = (hex: string): number => Hct.fromInt(argbFromHex(hex)).chroma;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveBrandSeeds", () => {
  it("has no palette when the address carries no primary", () => {
    expect(
      resolveBrandSeeds({ primary: null, accent: "#1c4f8f", signal: null }),
    ).toBeNull();
    expect(
      resolveBrandSeeds({ primary: null, accent: null, signal: null }),
    ).toBeNull();
  });

  it("keeps the default for a too-pale primary, like the app does", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    // Grey, black and white cannot carry a brand palette (chroma < 12).
    for (const grey of ["#808080", "#000000", "#ffffff", "#8a8a8a"]) {
      expect(
        resolveBrandSeeds({ primary: grey, accent: null, signal: null }),
      ).toBeNull();
    }
  });

  it("keeps the default for a primary the engine cannot read", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    expect(
      resolveBrandSeeds({ primary: "#12345", accent: null, signal: null }),
    ).toBeNull();
  });

  it("takes a valid primary on its own", () => {
    expect(
      resolveBrandSeeds({ primary: "#0a7a3c", accent: null, signal: null }),
    ).toEqual({ primary: "#0a7a3c" });
  });

  it("takes accent and signal when they are valid", () => {
    expect(
      resolveBrandSeeds({
        primary: "#0a7a3c",
        accent: "#1c4f8f",
        signal: "#b1005e",
      }),
    ).toEqual({ primary: "#0a7a3c", accent: "#1c4f8f", signal: "#b1005e" });
  });

  it("drops an invalid accent or signal on its own and keeps the rest", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    expect(
      resolveBrandSeeds({
        primary: "#0a7a3c",
        accent: "#12345",
        signal: "#b1005e",
      }),
    ).toEqual({ primary: "#0a7a3c", signal: "#b1005e" });
    expect(
      resolveBrandSeeds({
        primary: "#0a7a3c",
        accent: "#1c4f8f",
        signal: "nope",
      }),
    ).toEqual({ primary: "#0a7a3c", accent: "#1c4f8f" });
  });
});

describe("buildBrandThemeCss", () => {
  it("puts all six schemes into the layer Compound reserves for overrides", () => {
    const css = buildBrandThemeCss({ primary: "#0a7a3c" });
    expect(css.startsWith("@layer compound.custom {")).toBe(true);
    const blocks = themeBlocks(css);
    expect(Object.keys(blocks).sort()).toEqual(
      [...CALL_THEME_SELECTORS, ROOT].sort(),
    );
  });

  it.each([
    [LIGHT_MEDIUM, 5.5],
    [DARK_MEDIUM, 5.5],
    [LIGHT_HIGH, 7],
    [DARK_HIGH, 7],
  ] as const)("keeps rendered text roles legible at %s", (selector, target) => {
    const blocks = themeBlocks(
      buildBrandThemeCss({
        primary: "#f8e71c",
        accent: "#1c4f8f",
        signal: "#cc3300",
      }),
    );
    const theme = blocks[selector];
    const canvas = "--cpd-color-bg-canvas-default";
    for (const [ink, fill, threshold] of [
      ["--cpd-color-text-primary", canvas, target],
      ["--cpd-color-text-secondary", "--cpd-color-bg-subtle-primary", target],
      ["--cpd-color-text-placeholder", canvas, target],
      ["--cpd-color-text-action-accent", canvas, target],
      ["--cpd-color-text-link-external", canvas, target],
      ["--cpd-color-text-critical-primary", canvas, target],
      [
        "--cpd-color-text-critical-primary",
        "--cpd-color-bg-subtle-primary",
        target,
      ],
      [
        "--cpd-color-text-on-solid-primary",
        "--cpd-color-bg-action-primary-rest",
        target,
      ],
      [
        "--cpd-color-text-on-solid-primary",
        "--cpd-color-bg-action-primary-hovered",
        target,
      ],
      ["--cpd-color-border-focused", canvas, 3],
    ] as const) {
      expect(wcagContrast(theme[ink], theme[fill]), ink).toBeGreaterThanOrEqual(
        threshold,
      );
    }
  });

  it("makes a green seed green in the primary action and the accent text", () => {
    const blocks = themeBlocks(buildBrandThemeCss({ primary: "#0a7a3c" }));
    for (const selector of [LIGHT, DARK]) {
      for (const token of [
        "--cpd-color-bg-action-primary-rest",
        "--cpd-color-text-action-accent",
      ]) {
        const value = blocks[selector][token];
        expect(value, `${selector} ${token}`).toMatch(/^#[0-9a-f]{6}$/);
        // Green sits at about 100-170 on the HCT hue wheel; the default
        // brand red is near 27.
        expect(hue(value), `${selector} ${token}`).toBeGreaterThan(100);
        expect(hue(value), `${selector} ${token}`).toBeLessThan(170);
        expect(chroma(value), `${selector} ${token}`).toBeGreaterThan(20);
      }
    }
    // The light scheme keeps the seed itself, like the app does.
    expect(blocks[LIGHT]["--cpd-color-bg-action-primary-rest"]).toBe("#0a7a3c");
  });

  it("derives the on-colour label for the primary action", () => {
    const blocks = themeBlocks(buildBrandThemeCss({ primary: "#f8e71c" }));
    // A light yellow needs dark text; white would be unreadable.
    expect(blocks[LIGHT]["--cpd-color-text-on-solid-primary"]).toBe("#1f1c00");
  });

  it("follows the accent in the info roles and the signal in the critical roles", () => {
    const base = themeBlocks(buildBrandThemeCss({ primary: "#0a7a3c" }))[LIGHT];
    const custom = themeBlocks(
      buildBrandThemeCss({
        primary: "#0a7a3c",
        accent: "#1c4f8f",
        signal: "#b1005e",
      }),
    )[LIGHT];
    expect(custom["--cpd-color-text-info-primary"]).not.toBe(
      base["--cpd-color-text-info-primary"],
    );
    // The default signal is #b1005e itself, so pick a different one.
    const signalled = themeBlocks(
      buildBrandThemeCss({ primary: "#0a7a3c", signal: "#cc3300" }),
    )[LIGHT];
    expect(signalled["--cpd-color-text-critical-primary"]).toBe("#cc3300");
    expect(base["--cpd-color-text-critical-primary"]).toBe("#b1005e");
  });

  it("emits colour values only, nothing a stylesheet could be broken out of", () => {
    const css = buildBrandThemeCss({
      primary: "#0a7a3c",
      accent: "#1c4f8f",
      signal: "#cc3300",
    });
    const values = Object.values(themeBlocks(css)).flatMap((block) =>
      Object.values(block),
    );
    expect(values.length).toBeGreaterThan(80);
    for (const value of values) {
      expect(value).toMatch(
        /^(?:#[0-9a-f]{6}|color-mix\(in srgb, #[0-9a-f]{6} \d+%, transparent\))$/,
      );
    }
  });
});

describe("the brand variables the call's own stylesheets read (#136)", () => {
  it("are the shipped red for the default seed", () => {
    const root = themeBlocks(buildBrandThemeCss({ primary: DEFAULT_SEED }))[
      ROOT
    ];
    expect(root["--oriso-primary"]).toBe("#a5000a");
    expect(root["--oriso-primary-hover"]).toBe("#820006");
  });

  it("follow a green seed, with a hover that is darker and just as green", () => {
    const root = themeBlocks(buildBrandThemeCss({ primary: "#0a7a3c" }))[ROOT];
    expect(root["--oriso-primary"]).toBe("#0a7a3c");
    const hover = root["--oriso-primary-hover"];
    expect(hover).toMatch(/^#[0-9a-f]{6}$/);
    expect(hue(hover)).toBeGreaterThan(100);
    expect(hue(hover)).toBeLessThan(170);
    expect(Hct.fromInt(argbFromHex(hover)).tone).toBeLessThan(
      Hct.fromInt(argbFromHex("#0a7a3c")).tone,
    );
  });

  it("sit outside the light and dark blocks, so the call looks the same in both", () => {
    // The call has always drawn its brand red the same in the light and the
    // dark theme; the dark scheme's own primary is a pale tone of the hue.
    const blocks = themeBlocks(buildBrandThemeCss({ primary: "#0a7a3c" }));
    for (const selector of [LIGHT, DARK]) {
      expect(blocks[selector]).not.toHaveProperty("--oriso-primary");
      expect(blocks[selector]).not.toHaveProperty("--oriso-primary-hover");
    }
  });
});
