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
  /(\.cpd-theme-(?:light|dark)\.cpd-theme-(?:light|dark)|:root)\s*\{([^{}]*)\}/g;

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
