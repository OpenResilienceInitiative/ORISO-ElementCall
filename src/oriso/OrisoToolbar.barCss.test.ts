/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Two bar faults Frank found on 12 Nov (ORISO-Frontend#2233, checkpoint 5).
 * Asserted on the stylesheet: jsdom paints nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const toolbar = strip(
  readFileSync("src/oriso/OrisoToolbar.module.css", "utf8"),
);

/** Every rule whose selector list contains `selector`, as [selector, body]. */
const rules = (css: string): [string, string][] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

describe("the raised hand on hover", () => {
  it("keeps its dark fill: the bar's light hover is only for empty buttons", () => {
    const hovers = rules(toolbar).filter(
      ([selector]) => /:hover/.test(selector) && /\.fill/.test(selector),
    );
    // A hover rule without a state reaches every button, the raised hand
    // included, and paints its pale hand on light grey.
    for (const [selector] of hovers) {
      expect(selector).toMatch(/data-state=/);
    }
    const raisedHover = hovers.find(([s]) => s.includes('data-state="raised"'));
    expect(raisedHover?.[1]).toMatch(/background-color:\s*rgb\(8\d \d+ \d+\)/);
  });
});

describe("the hang-up button", () => {
  it("is round with the icon only, at every width", () => {
    const base = rules(toolbar).find(([s]) => s === ".hangup")?.[1] ?? "";
    expect(base).toMatch(/inline-size:\s*56px/);
    expect(base).toMatch(/padding:\s*0/);
    expect(base).toMatch(/border-radius:\s*28px/);
    // The word stays the button's name for a screen reader.
    const label = rules(toolbar).find(([s]) => s === ".hangupLabel")?.[1] ?? "";
    expect(label).toMatch(/clip-path:\s*inset\(50%\)/);
  });
});
