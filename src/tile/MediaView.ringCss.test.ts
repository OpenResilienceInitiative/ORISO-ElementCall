/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The selection ring of an ORISO form (#171), asserted against the
 * stylesheets: jsdom draws neither outlines nor shadows.
 *
 * Frank, 18 Nov, on Dev: hovering "Schildkröte" in the rail drew a light-grey
 * RECTANGLE around the round form. That was upstream's hover outline on the
 * tile's square box. The ring belongs on the form itself.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const media = read("src/tile/MediaView.module.css");
const grid = read("src/tile/GridTile.module.css");

/** Every rule body whose selector list matches `selector`. */
const bodies = (css: string, selector: RegExp): string[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel]) => selector.test(sel))
    .map(([, , body]) => body);

const ring = bodies(media, /\.media\.oriso[^{,]*>\s*\.bg::after/).join("\n");

describe("the selection ring of an ORISO form (#171)", () => {
  it("is not drawn on the square tile box", () => {
    // Specific enough to beat upstream's `.tile:hover` outline.
    const oriso = bodies(grid, /\.tile\[data-oriso="true"\]:hover/).join("\n");
    expect(oriso).toMatch(/outline:\s*none/);
  });

  it("is a layer of the form: its radius, its lean, its clip", () => {
    // `::after` of the face: it rotates with the Hain's lean, takes the
    // circle's or the blob's radius, and the 1:1 halves' clip path cuts it
    // along the seam, as it does the speaking rim.
    expect(ring).toMatch(/position:\s*absolute/);
    expect(ring).toMatch(/inset:\s*0/);
    expect(ring).toMatch(/border-radius:\s*inherit/);
    expect(ring).toMatch(/pointer-events:\s*none/);
  });

  it("is the design system's focus colour, the M3 primary role", () => {
    const shown = bodies(
      media,
      /\.media\.oriso:(hover|has)[^{]*>\s*\.bg::after/,
    ).join("\n");
    expect(shown).toMatch(/var\(--cpd-color-border-focused\)/);
    // No hard-coded colour anywhere in the ring.
    expect(`${ring}\n${shown}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });

  it("is at least 2px wide (WCAG 2.2 focus appearance)", () => {
    const width = /--oriso-ring-width:\s*(\d+)px/.exec(media)?.[1];
    expect(Number(width)).toBeGreaterThanOrEqual(2);
  });

  it("shows on hover, on keyboard focus, and while the form's menu is open", () => {
    const shownSelectors = [...media.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /--cpd-color-border-focused/.test(body))
      .map(([, sel]) => sel)
      .join("\n");
    expect(shownSelectors).toMatch(/\.media\.oriso:hover\s*>\s*\.bg::after/);
    expect(shownSelectors).toMatch(
      /\.media\.oriso:has\(:focus-visible\)\s*>\s*\.bg::after/,
    );
    expect(shownSelectors).toMatch(
      /\.media\.oriso:has\(\[data-state="open"\]\)\s*>\s*\.bg::after/,
    );
  });
});
