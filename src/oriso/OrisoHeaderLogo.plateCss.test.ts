/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The Träger's logo sits on a white pill in the call header. Logos are often
 * square with a word mark along the bottom edge (Caritas: the cross over
 * "CARITAS"). Two things cut that word mark's corners off:
 * - a radius on the image itself: a replaced element is clipped to its own
 *   rounded content box, however much padding it has. So the pill is a
 *   plate around the image, and the image has no radius;
 * - too little padding: the pill's round ends then reach into the logo.
 * Asserted against the stylesheet: jsdom lays nothing out.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  "src/oriso/OrisoHeaderLogo.module.css",
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of `selector`, the base rule or the one in `@media`. */
const ruleOf = (selector: string, inMedia: boolean): string => {
  const media = css.indexOf("@media");
  const scope = inMedia ? css.slice(media) : css.slice(0, media);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(scope)?.[1] ?? "";
};

const px = (block: string, property: string): number | undefined => {
  const value = new RegExp(`(?:^|;|\\s)${property}:\\s*(\\d+)px`).exec(
    block,
  )?.[1];
  return value === undefined ? undefined : Number(value);
};

const padding = (block: string): { block: number; inline: number } => {
  const [, a, b] = /padding:\s*(\d+)px\s+(\d+)px/.exec(block) ?? [];
  return { block: Number(a), inline: Number(b) };
};

/**
 * How far the pill's round end reaches in, at the logo's top and bottom
 * edge: the plate is `height` high with fully round ends (radius
 * height / 2), the logo starts `inset` px inside its edge.
 */
const cornerReach = (height: number, inset: number): number => {
  const r = height / 2;
  return r - Math.sqrt(r * r - (r - inset) ** 2);
};

describe("the logo's white plate in the call header", () => {
  const logo = ruleOf(".logo", false);
  const phoneLogo = ruleOf(".logo", true);
  const plate = ruleOf(".plate", false);
  const phonePlate = ruleOf(".plate", true);
  const height = px(logo, "block-size")!;
  const phoneHeight = px(phoneLogo, "block-size") ?? height;
  const pad = padding(plate);
  const phonePad = /padding:/.test(phonePlate) ? padding(phonePlate) : pad;

  it("draws the logo large enough to read a word mark", () => {
    expect(height).toBeGreaterThanOrEqual(36);
    expect(phoneHeight).toBeGreaterThanOrEqual(32);
  });

  it("rounds the plate, never the image", () => {
    expect(plate).toMatch(/border-radius:\s*var\(--cpd-radius-pill-effect\)/);
    expect(plate).toMatch(/background:\s*#fff/);
    expect(logo).not.toMatch(/border-radius|padding|background/);
  });

  it("keeps the round ends of the plate off the logo's corners", () => {
    expect(cornerReach(height + 2 * pad.block, pad.block)).toBeLessThanOrEqual(
      pad.inline,
    );
    expect(
      cornerReach(phoneHeight + 2 * phonePad.block, phonePad.block),
    ).toBeLessThanOrEqual(phonePad.inline);
  });

  it("still fits the 64px header with its 8px padding", () => {
    expect(height + 2 * pad.block).toBeLessThanOrEqual(64 - 2 * 8);
  });
});
