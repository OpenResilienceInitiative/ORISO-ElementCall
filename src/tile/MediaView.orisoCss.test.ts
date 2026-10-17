/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Two ORISO tile rules, asserted against the stylesheet itself.
 *
 * Both bugs these pin were selectors that did not match the DOM they were
 * written for, and no rendering test in this repository could see either:
 * jsdom applies no CSS, and the browser harness mounts `OrisoFace` rather
 * than `MediaView`. Both survived a round of review each.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from the repository root: vitest runs there, and `import.meta.url` is
// not a file URL once Vite has transformed this module.
// Comments are stripped first: these rules document the selectors they
// REPLACED, so a naive parse reads "`> *` was wrong here" as part of a
// selector and the assertions below fail on their own prose.
const css = readFileSync("src/tile/MediaView.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The declarations of every rule whose selector matches a predicate. */
function bodiesWhere(match: (selector: string) => boolean): string[] {
  const bodies: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = pattern.exec(css)) !== null) {
    if (match(rule[1])) bodies.push(rule[2]);
  }
  return bodies;
}

const reEnables = (): string[] =>
  bodiesWhere((selector) => selector.includes(".oriso")).flatMap((body, i) =>
    /pointer-events:\s*auto/.test(body) ? [String(i)] : [],
  );

describe("only the visible form takes the pointer", () => {
  it("turns the grove tile's root off and something back on", () => {
    const off = bodiesWhere(
      (selector) =>
        selector.includes(".oriso") &&
        selector.includes(':not([data-oriso-half="true"])'),
    ).filter((body) => /pointer-events:\s*none/.test(body));
    expect(off.length).toBeGreaterThan(0);
    expect(reEnables().length).toBeGreaterThan(0);
  });

  it("never re-enables the whole chrome layer", () => {
    /*
     * `.fg` is absolutely positioned across the entire tile. The first
     * version of this fix used `> *`, which re-enabled it and handed the
     * transparent square corners straight back — so the fix did nothing while
     * looking exactly right.
     */
    const selectors: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    let rule: RegExpExecArray | null;
    while ((rule = pattern.exec(css)) !== null) {
      if (/pointer-events:\s*auto/.test(rule[2])) selectors.push(rule[1]);
    }
    for (const selector of selectors) {
      expect(selector).not.toMatch(/>\s*\*/);
      // `.fg button` is fine; `> .fg` or a bare `.fg` as the subject is not.
      expect(selector).not.toMatch(/\.fg\s*(,|$)/);
    }
  });
});

describe("the chrome belongs to its half", () => {
  it("shifts the layer the chrome is actually in", () => {
    /*
     * The options button is rendered inside `.fg`, not as a child of the
     * tile, so a `> button` selector never matched it and it stayed at the
     * shared box's corner — clipped into the other half, taking the tile's
     * only menu control with it.
     */
    const shifted = bodiesWhere(
      (selector) =>
        selector.includes('[data-oriso-half="true"]') &&
        selector.includes(".fg"),
    ).filter((body) => /translate:\s*var\(--oriso-focus-shift/.test(body));
    expect(shifted.length).toBe(1);

    const selectors: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    let rule: RegExpExecArray | null;
    while ((rule = pattern.exec(css)) !== null) {
      if (/translate:\s*var\(--oriso-focus-shift/.test(rule[2]))
        selectors.push(rule[1]);
    }
    for (const selector of selectors) {
      expect(selector).not.toMatch(/>\s*button/);
    }
  });
});
