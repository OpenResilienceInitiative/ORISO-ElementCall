/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Hct, argbFromHex } from "@material/material-color-utilities";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { buildBrandThemeCss, resolveBrandSeeds } from "./brandTheme";
import { DARK, LIGHT, themeBlocks } from "./themeCss.testUtils";

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
  it("puts both schemes into the layer Compound reserves for overrides", () => {
    const css = buildBrandThemeCss({ primary: "#0a7a3c" });
    expect(css.startsWith("@layer compound.custom {")).toBe(true);
    const blocks = themeBlocks(css);
    expect(Object.keys(blocks).sort()).toEqual([DARK, LIGHT]);
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
