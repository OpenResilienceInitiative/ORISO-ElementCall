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
  type ContrastLevel,
  type OrisoSchemeName,
  type OrisoSeeds,
  computeOrisoPalette,
} from "./orisoScheme";

/** The ORISO default tenant; the shipped `src/oriso-theme.css` is this seed. */
export const DEFAULT_SEED = "#a5000a";

/** Compound's reserved layer for outside overrides (see src/index.css). */
const LAYER = "compound.custom";

type CallScheme = Exclude<OrisoSchemeName, "inverted">;

const SCHEMES = ["light", "dark"] as const;
const CONTRAST_LEVELS = ["standard", "medium", "high"] as const;

const contrastRoles: Record<string, string> = {
  "--cpd-color-text-placeholder": "--m3-on-surface-variant",
  "--cpd-color-text-action-accent": "--oriso-primary-text",
  "--cpd-color-text-link-external": "--oriso-primary-text",
  "--cpd-color-border-focused": "--oriso-primary-text",
  "--cpd-color-text-critical-primary": "--oriso-error-text",
};

/**
 * The brand colour as the call's own stylesheets read it (the toolbar, the
 * notes, the speaking rim, ...): not Compound roles, so not in CALL_TOKEN_MAP.
 * Variable name → the engine role it reads.
 *
 * Always the LIGHT scheme's colours, whichever theme the call is in: the call
 * has drawn its brand red the same in light and dark, and the dark scheme's
 * own primary is a pale tone of the hue. That is why they live in one `:root`
 * block of their own instead of in the two scheme blocks, and why that block
 * also reaches the dialogs Compound portals out of the call.
 */
const BRAND_VARIABLES: Record<string, string> = {
  "--oriso-primary": "--m3-primary",
  "--oriso-primary-hover": "--m3-primary-hover",
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

const block = (
  scheme: CallScheme,
  seeds: OrisoSeeds,
  contrast: ContrastLevel,
): string => {
  const { tokens } = computeOrisoPalette(seeds, scheme, contrast);
  const body = Object.entries(CALL_TOKEN_MAP)
    .map(([cpdToken, standard]) => {
      const role = contrast !== "standard" && contrastRoles[cpdToken];
      return callThemeDeclaration(
        cpdToken,
        role ? { ...standard, m3: role, note: undefined } : standard,
        tokens,
      );
    })
    .join("\n");
  // Match Compound's two-class specificity in its override layer. Medium
  // keeps the normal Compound theme and uses an ORISO marker for this block.
  const themeClass = `.cpd-theme-${scheme}${contrast === "high" ? "-hc" : ""}`;
  const selector =
    contrast === "medium"
      ? `${themeClass}[data-oriso-contrast-level="medium"]`
      : `${themeClass}${themeClass}`;
  return `${selector} {\n${body}\n}`;
};

const brandBlock = (seeds: OrisoSeeds): string => {
  const { tokens } = computeOrisoPalette(seeds, "light");
  const body = Object.entries(BRAND_VARIABLES)
    .map(([variable, role]) => `\t${variable}: ${tokens[role]};`)
    .join("\n");
  return `:root {\n${body}\n}`;
};

const blocks = (seeds: OrisoSeeds): string =>
  [
    brandBlock(seeds),
    ...CONTRAST_LEVELS.flatMap((level) =>
      SCHEMES.map((scheme) => block(scheme, seeds, level)),
    ),
  ].join("\n\n");

/**
 * The runtime stylesheet: both schemes at all three contrast levels, inside Compound's override layer.
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
