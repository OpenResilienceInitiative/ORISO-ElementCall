/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The call's brand palette: seeds from the call address → the app's colour
 * engine (vendored next to this file) → the Compound roles the call renders.
 *
 * Everything here is ORISO's own glue; the maths lives in the vendored
 * `orisoScheme.ts`, so a Träger's colour comes out the same in the app and in
 * the call (epic ORISO-Frontend#2187, "Call branding").
 */
import { logger } from "matrix-js-sdk/lib/logger";

import { CALL_TOKEN_MAP, callThemeDeclaration } from "./callTheme";
import {
  type OrisoSchemeName,
  type OrisoSeeds,
  computeOrisoPalette,
} from "./orisoScheme";

/** The ORISO default tenant; the shipped `src/oriso-theme.css` is this seed. */
export const DEFAULT_SEED = "#a5000a";

/** Compound's reserved layer for outside overrides (see src/index.css). */
const LAYER = "compound.custom";

type CallScheme = Exclude<OrisoSchemeName, "inverted">;

/** The Compound theme class each scheme is emitted under. */
const SCHEME_CLASS: Record<CallScheme, string> = {
  light: "cpd-theme-light",
  dark: "cpd-theme-dark",
};

/** Seeds as the call address carries them: validated `#rrggbb`, or absent. */
export interface BrandSeedInput {
  primary: string | null;
  accent: string | null;
  signal: string | null;
}

/**
 * Decides which seeds the call may use. Mirrors the app's
 * `applyTenantPalette` (ORISO-Frontend, src/utils/theme/applyTenantTheme.ts):
 *
 * - no primary, an unreadable primary, or a primary too pale to carry a brand
 *   palette: no palette at all (null), so the shipped default stays;
 * - an accent or signal the engine cannot read is dropped on its own; a valid
 *   sibling still applies.
 */
export const resolveBrandSeeds = (input: BrandSeedInput): OrisoSeeds | null => {
  if (input.primary === null) {
    return null;
  }

  const attempt = (seeds: OrisoSeeds, what: string): boolean => {
    try {
      computeOrisoPalette(seeds, "light");
      return true;
    } catch (error) {
      logger.warn(`Call branding: ${what} is invalid, ignoring it.`, error);
      return false;
    }
  };

  let primaryResult;
  try {
    primaryResult = computeOrisoPalette({ primary: input.primary }, "light");
  } catch (error) {
    logger.warn(
      "Call branding: primary colour is invalid, keeping the default palette.",
      error,
    );
    return null;
  }
  if (primaryResult.tooPale) {
    // A near-achromatic seed (chroma < 12, e.g. black or grey) cannot yield
    // distinguishable role colours; the app keeps its default for it too.
    logger.warn(
      `Call branding: primary ${input.primary} is too pale, keeping the default palette.`,
    );
    return null;
  }

  const resolved: OrisoSeeds = { primary: input.primary };
  if (
    input.accent !== null &&
    attempt({ primary: input.primary, accent: input.accent }, "accent colour")
  ) {
    resolved.accent = input.accent;
  }
  if (
    input.signal !== null &&
    attempt({ primary: input.primary, signal: input.signal }, "signal colour")
  ) {
    resolved.signal = input.signal;
  }
  return resolved;
};

const block = (scheme: CallScheme, seeds: OrisoSeeds): string => {
  const { tokens } = computeOrisoPalette(seeds, scheme);
  const body = Object.entries(CALL_TOKEN_MAP)
    .map(([cpdToken, mapping]) =>
      callThemeDeclaration(cpdToken, mapping, tokens),
    )
    .join("\n");
  // The class is doubled to match the specificity Compound uses for its own
  // per-theme blocks; the layer and the document order decide the winner.
  const selector = `.${SCHEME_CLASS[scheme]}.${SCHEME_CLASS[scheme]}`;
  return `${selector} {\n${body}\n}`;
};

const blocks = (seeds: OrisoSeeds): string =>
  [block("light", seeds), block("dark", seeds)].join("\n\n");

/**
 * The runtime stylesheet: both schemes, inside Compound's override layer.
 * Appended after the shipped stylesheet it wins inside that layer.
 */
export const buildBrandThemeCss = (seeds: OrisoSeeds): string => {
  const indented = blocks(seeds)
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
  return `@layer ${LAYER} {\n${indented}\n}\n`;
};

/**
 * The shipped default (`src/oriso-theme.css`, imported into the same layer by
 * src/index.css). Written by the drift test, never by hand.
 */
export const buildStaticThemeCss = (seeds: OrisoSeeds): string =>
  [
    "/*",
    " * GENERATED — do not edit by hand.",
    " *",
    " * Source: src/oriso/theme/brandTheme.ts (buildStaticThemeCss), which runs",
    " *         the colour engine vendored from ORISO-Frontend (see the headers",
    " *         of the files next to it).",
    ` * Seed:   ${seeds.primary.toLowerCase()} (ORISO default tenant)`,
    " *",
    " * Regenerate with:",
    " *   UPDATE_ORISO_THEME=1 yarn vitest run src/oriso/theme/orisoTheme.drift.test.ts",
    " * Editing this file by hand will be reverted by that drift test.",
    " */",
    "",
    blocks(seeds),
    "",
  ].join("\n");
