/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Test helper: reads the `:root` block and the per-scheme blocks of a generated call-theme
 * stylesheet into `{ selector: { property: value } }`, ignoring comments,
 * whitespace and an optional `@layer` wrapper.
 */
export type ThemeBlocks = Record<string, Record<string, string>>;

const BLOCK =
  /(\.cpd-theme-(?:light|dark)(?:-hc)?(?:\.cpd-theme-(?:light|dark)(?:-hc)?|\[data-oriso-contrast-level="medium"\])|:root)\s*\{([^{}]*)\}/g;

export const themeBlocks = (css: string): ThemeBlocks => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: ThemeBlocks = {};
  for (const [, selector, body] of stripped.matchAll(BLOCK)) {
    const declarations: Record<string, string> = {};
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      declarations[declaration.slice(0, colon).trim()] = declaration
        .slice(colon + 1)
        .trim();
    }
    blocks[selector] = declarations;
  }
  return blocks;
};

export const ROOT = ":root";
export const LIGHT = ".cpd-theme-light.cpd-theme-light";
export const DARK = ".cpd-theme-dark.cpd-theme-dark";

export const LIGHT_MEDIUM =
  '.cpd-theme-light[data-oriso-contrast-level="medium"]';
export const DARK_MEDIUM =
  '.cpd-theme-dark[data-oriso-contrast-level="medium"]';
export const LIGHT_HIGH = ".cpd-theme-light-hc.cpd-theme-light-hc";
export const DARK_HIGH = ".cpd-theme-dark-hc.cpd-theme-dark-hc";
export const CALL_THEME_SELECTORS = [
  LIGHT,
  DARK,
  LIGHT_MEDIUM,
  DARK_MEDIUM,
  LIGHT_HIGH,
  DARK_HIGH,
];
