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
 * Source:  OpenResilienceInitiative/ORISO-Frontend, src/utils/theme/callTheme.ts
 * Commit:  4632215d4e96019988e2aeab3a2c10d76ea50557 (origin/dev, 2026-11-10)
 * Changes: formatting only (this repo's prettier), plus
 *          - `CallTokenMapping` and `declaration()` are exported (the latter as
 *            `callThemeDeclaration`);
 *          - `block()`, `buildCallThemeCss()`, `CALL_THEME_ARTEFACT_PATH` and
 *            `UNMAPPED_BY_DESIGN` are left out: the app's generator takes a
 *            primary seed only, the call also takes accent and signal, so
 *            ./brandTheme.ts builds the stylesheet from the full seed set.
 *            `CALL_TOKEN_MAP` itself is untouched.
 *
 * To update: copy the file again from the app, change the commit above, copy
 * the two fixtures in __fixtures__/ from the same commit and regenerate the
 * static palette (see orisoTheme.drift.test.ts).
 */

/**
 * Element Call theme bridge (Frontend#897).
 *
 * The embedded call UI is built on Compound, which speaks `--cpd-*`
 * semantic roles; ORISO speaks the `--m3-*` roles produced by the
 * OrisoScheme engine. This module maps one onto the other and emits the
 * stylesheet the fork ships, so the call renders engine colours instead
 * of a second, hand-maintained palette.
 *
 * Compound declares `@layer cpd-semantic, custom, cpd-base` precisely so
 * that semantic roles can be reconfigured from outside — `custom` wins
 * over `cpd-semantic`. The generated file therefore belongs in that
 * layer, and needs neither `!important` nor selector games.
 *
 * Pure module: same input → same output. No DOM, no filesystem.
 */

export interface CallTokenMapping {
  /** The `--m3-*` role this Compound role reads from. */
  m3: string;
  /**
   * Opacity in percent for overlay roles. Emitted as `color-mix`, which
   * keeps the engine colour visible in the artefact instead of baking
   * it into an opaque literal nobody can trace back.
   */
  alpha?: number;
  /** Rationale — only where the pairing is not self-evident. */
  note?: string;
}

/**
 * Compound role → ORISO role.
 *
 * Deliberately NOT mapped, so they keep their Compound values:
 * - `bg-decorative-*` / `text-decorative-*`: a six-hue set that colours
 *   user avatars apart. ORISO has no counterpart, and collapsing them
 *   onto one brand colour would make every participant look identical.
 * - `gradient-action-*`: Compound's own gradient stops; the call does not
 *   surface them and ORISO defines no gradient roles.
 * - The raw palette (`--cpd-color-gray-*` and friends): base tokens, and
 *   Compound's layer order puts those out of reach by design.
 */
export const CALL_TOKEN_MAP: Record<string, CallTokenMapping> = {
  // --- Surfaces -----------------------------------------------------
  "--cpd-color-bg-canvas-default": { m3: "--m3-surface" },
  "--cpd-color-bg-canvas-disabled": { m3: "--m3-surface-dim" },
  "--cpd-color-bg-subtle-primary": { m3: "--m3-surface-container-high" },
  "--cpd-color-bg-subtle-secondary": { m3: "--m3-surface-container" },
  "--cpd-color-theme-bg": { m3: "--m3-surface" },

  // --- Text ---------------------------------------------------------
  "--cpd-color-text-primary": { m3: "--m3-on-surface" },
  "--cpd-color-text-secondary": { m3: "--m3-on-surface-variant" },
  "--cpd-color-text-placeholder": {
    m3: "--m3-outline",
    note: "Not a Compound role, but the fork reads it in input/Input.module.css, where it would otherwise resolve to nothing.",
  },
  "--cpd-color-text-disabled": { m3: "--m3-outline" },
  "--cpd-color-text-on-solid-primary": { m3: "--m3-on-primary" },
  "--cpd-color-text-action-primary": { m3: "--m3-on-surface" },
  "--cpd-color-text-action-accent": { m3: "--m3-primary" },
  "--cpd-color-text-critical-primary": { m3: "--m3-error" },
  "--cpd-color-text-success-primary": { m3: "--m3-success" },
  "--cpd-color-text-info-primary": { m3: "--m3-secondary" },
  "--cpd-color-text-link-external": { m3: "--m3-primary" },
  "--cpd-color-text-badge-accent": { m3: "--m3-on-primary-container" },
  "--cpd-color-text-badge-info": { m3: "--m3-on-secondary-container" },

  // --- Icons: mirror the text ladder so an icon never out-contrasts
  // the label beside it.
  "--cpd-color-icon-primary": { m3: "--m3-on-surface" },
  "--cpd-color-icon-secondary": { m3: "--m3-on-surface-variant" },
  "--cpd-color-icon-tertiary": { m3: "--m3-outline" },
  "--cpd-color-icon-quaternary": { m3: "--m3-outline-variant" },
  "--cpd-color-icon-disabled": { m3: "--m3-outline-variant" },
  "--cpd-color-icon-primary-alpha": { m3: "--m3-on-surface" },
  "--cpd-color-icon-secondary-alpha": { m3: "--m3-on-surface-variant" },
  "--cpd-color-icon-tertiary-alpha": { m3: "--m3-outline" },
  "--cpd-color-icon-quaternary-alpha": { m3: "--m3-outline-variant" },
  "--cpd-color-icon-on-solid-primary": { m3: "--m3-on-primary" },
  "--cpd-color-icon-accent-primary": { m3: "--m3-primary" },
  "--cpd-color-icon-accent-tertiary": { m3: "--m3-primary-fixed-dim" },
  "--cpd-color-icon-critical-primary": { m3: "--m3-error" },
  "--cpd-color-icon-success-primary": { m3: "--m3-success" },
  "--cpd-color-icon-info-primary": { m3: "--m3-secondary" },

  // --- Primary actions (the join/leave/confirm buttons) -------------
  "--cpd-color-bg-action-primary-rest": { m3: "--m3-primary" },
  "--cpd-color-bg-action-primary-hovered": { m3: "--m3-primary-hover" },
  "--cpd-color-bg-action-primary-pressed": { m3: "--m3-primary-hover" },
  "--cpd-color-bg-action-primary-disabled": { m3: "--m3-outline-variant" },

  // Secondary/tertiary actions sit on the canvas, so they step up the
  // container ladder rather than carrying brand colour.
  "--cpd-color-bg-action-secondary-rest": {
    m3: "--m3-surface-container-low",
  },
  "--cpd-color-bg-action-secondary-hovered": { m3: "--m3-surface-container" },
  "--cpd-color-bg-action-secondary-pressed": {
    m3: "--m3-surface-container-high",
  },
  "--cpd-color-bg-action-tertiary-rest": { m3: "--m3-surface-container-low" },
  "--cpd-color-bg-action-tertiary-hovered": { m3: "--m3-surface-container" },
  "--cpd-color-bg-action-tertiary-selected": {
    m3: "--m3-surface-container-high",
  },

  // --- Accent (selected states, brand emphasis) ---------------------
  "--cpd-color-bg-accent-rest": { m3: "--m3-primary" },
  "--cpd-color-bg-accent-hovered": { m3: "--m3-primary-hover" },
  "--cpd-color-bg-accent-pressed": { m3: "--m3-primary-hover" },
  "--cpd-color-bg-accent-selected": { m3: "--m3-primary-container" },

  // --- Critical / success / info ------------------------------------
  "--cpd-color-bg-critical-primary": { m3: "--m3-error" },
  "--cpd-color-bg-critical-hovered": { m3: "--m3-error" },
  "--cpd-color-bg-critical-subtle": { m3: "--m3-error-container" },
  "--cpd-color-bg-critical-subtle-hovered": { m3: "--m3-error-container" },
  "--cpd-color-bg-success-subtle": {
    m3: "--m3-success",
    alpha: 16,
    note: "ORISO has no success container; a tinted overlay keeps the subtle role subtle.",
  },
  "--cpd-color-bg-info-subtle": { m3: "--m3-secondary-container" },
  "--cpd-color-bg-badge-default": { m3: "--m3-surface-container-high" },
  "--cpd-color-bg-badge-accent": { m3: "--m3-primary-container" },
  "--cpd-color-bg-badge-info": { m3: "--m3-secondary-container" },

  // --- Borders ------------------------------------------------------
  "--cpd-color-border-interactive-primary": { m3: "--m3-outline" },
  "--cpd-color-border-interactive-secondary": { m3: "--m3-outline-variant" },
  "--cpd-color-border-interactive-hovered": { m3: "--m3-on-surface-variant" },
  "--cpd-color-border-disabled": { m3: "--m3-outline-variant" },
  "--cpd-color-border-focused": {
    m3: "--m3-primary",
    note: "Not --m3-primary-outline: that role is tuned to stay dark on light brand surfaces, which makes it invisible on a dark canvas (1.5:1). The primary role flips with the scheme and clears 3:1 in both.",
  },
  "--cpd-color-border-accent-subtle": { m3: "--m3-primary-fixed-dim" },
  "--cpd-color-border-critical-primary": { m3: "--m3-error" },
  "--cpd-color-border-critical-hovered": { m3: "--m3-error" },
  "--cpd-color-border-critical-subtle": { m3: "--m3-error-container" },
  "--cpd-color-border-info-subtle": { m3: "--m3-secondary-container" },
  "--cpd-color-border-success-subtle": { m3: "--m3-success", alpha: 30 },

  // --- Overlays -----------------------------------------------------
  // Scrims and hover washes over video. They must stay translucent —
  // an opaque value here would black out the picture behind them.
  "--cpd-color-alpha-gray-100": { m3: "--m3-on-surface", alpha: 4 },
  "--cpd-color-alpha-gray-200": { m3: "--m3-on-surface", alpha: 8 },
  "--cpd-color-alpha-gray-300": { m3: "--m3-on-surface", alpha: 12 },
  "--cpd-color-alpha-gray-400": { m3: "--m3-on-surface", alpha: 16 },
  "--cpd-color-alpha-gray-500": { m3: "--m3-on-surface", alpha: 24 },
  "--cpd-color-alpha-gray-600": { m3: "--m3-on-surface", alpha: 32 },
  "--cpd-color-alpha-gray-1400": { m3: "--m3-scrim", alpha: 80 },
};

export const callThemeDeclaration = (
  cpdToken: string,
  mapping: CallTokenMapping,
  palette: Record<string, string>,
): string => {
  const value = palette[mapping.m3];
  if (!value) {
    throw new Error(
      `callTheme: ${cpdToken} maps to unknown engine role ${mapping.m3}`,
    );
  }
  const rendered =
    mapping.alpha === undefined
      ? value
      : `color-mix(in srgb, ${value} ${mapping.alpha}%, transparent)`;
  const comment = mapping.note ? ` /* ${mapping.note} */` : "";
  return `\t${cpdToken}: ${rendered};${comment}`;
};
