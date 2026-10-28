/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The seam's motion rules, asserted against the stylesheet: jsdom runs no
 * animations and applies no media queries.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  "src/grid/EinzelgespraechLayout.module.css",
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function bodiesWhere(
  source: string,
  match: (selector: string) => boolean,
): string[] {
  const bodies: string[] = [];
  const pattern = /([^{}@]+)\{([^{}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = pattern.exec(source)) !== null) {
    if (match(rule[1].trim())) bodies.push(rule[2]);
  }
  return bodies;
}

describe("the bars on the seam", () => {
  it("are the capsule the design measured", () => {
    const seam = bodiesWhere(css, (s) => s === ".seam").join();
    expect(seam).toMatch(/inline-size:\s*46px/);
    expect(seam).toMatch(/block-size:\s*min\(176px, 63%\)/);
    expect(seam).toMatch(/border-radius:\s*23px/);
    expect(seam).toMatch(/background:\s*rgb\(252 249 249 \/ 94%\)/);
    expect(seam).toMatch(/box-shadow:\s*0 0 0 1px rgb\(0 0 0 \/ 6%\)/);
    const bar = bodiesWhere(css, (s) => s === ".bar").join();
    expect(bar).toMatch(/block-size:\s*4px/);
    expect(bar).toMatch(/border-radius:\s*3px/);
  });

  it("animate only while somebody speaks", () => {
    // Resting bars carry no animation at all.
    expect(bodiesWhere(css, (s) => s === ".bar").join()).not.toMatch(
      /animation/,
    );
    expect(
      bodiesWhere(css, (s) => s === '.seam[data-active="true"] .bar').join(),
    ).toMatch(/animation:\s*oriso-barh [\d.]+s ease-in-out infinite/);
    expect(css).toMatch(/@keyframes oriso-barh/);
  });

  it("stand still for somebody who asked for less motion", () => {
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced.length).toBeGreaterThan(0);
    expect(
      bodiesWhere(
        reduced,
        (s) => s === '.seam[data-active="true"] .bar',
      ).join(),
    ).toMatch(/animation:\s*none/);
  });
});
