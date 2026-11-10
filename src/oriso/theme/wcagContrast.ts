/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * VENDORED from ORISO-Frontend. Do not change the logic here: the call must
 * compute the same colours as the app (epic ORISO-Frontend#2187, "Call
 * branding", decision of 2026-11-10).
 *
 * Source:  OpenResilienceInitiative/ORISO-Frontend, src/utils/theme/wcagContrast.ts
 * Commit:  4632215d4e96019988e2aeab3a2c10d76ea50557 (origin/dev, 2026-11-10)
 * Changes: only wcagContrast() is kept (the engine's sole use); effectiveBackground() is a DOM test helper the call does not need. Formatting per this repo's prettier.
 *
 * To update: copy the file again from the app, change the commit above, copy
 * the two fixtures in __fixtures__/ from the same commit and regenerate the
 * static palette (see orisoTheme.drift.test.ts).
 */

/**
 * WCAG 2.x contrast ratio between two CSS colours, `#rrggbb` or the
 * `rgb()/rgba()` form `getComputedStyle` returns. Alpha is ignored here;
 * `effectiveBackground` resolves translucent backgrounds first.
 */
const channels = (colour: string): [number, number, number] => {
  const value = colour.trim();
  if (value.startsWith("#")) {
    const n = parseInt(value.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    throw new Error(`wcagContrast: unsupported colour "${colour}"`);
  }
  const [r, g, b] = match[1].split(/[\s,/]+/).map(Number);
  return [r, g, b];
};

const relativeLuminance = (colour: string): number => {
  const [r, g, b] = channels(colour).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const wcagContrast = (a: string, b: string): number => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (light + 0.05) / (dark + 0.05);
};
