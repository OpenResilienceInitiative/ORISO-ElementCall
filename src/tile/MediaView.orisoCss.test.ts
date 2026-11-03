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
  it("turns every ORISO tile's root off and something back on", () => {
    /*
     * The Einzelgespräch's halves included. They used to rely on a clip path
     * on the ROOT for this, and that clip also cut off the names, which stand
     * under the circle. The clip is the face's now, and a clipped face is
     * hit-tested along its clip.
     */
    const off = bodiesWhere(
      (selector) => selector.trim() === ".media.oriso",
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

describe("the names stand under the circle", () => {
  /*
   * Section 2b: plain text under the circle, the left half's name at its
   * left edge and the right half's at its right edge. Dev showed two dark
   * capsules at the top of the circle instead (`place-self: start start`
   * inside the shared box), and jsdom applies no CSS, so only the stylesheet
   * can say where they go.
   */
  const halfChrome = (): string[] =>
    bodiesWhere(
      (selector) =>
        selector.includes('[data-oriso-half="true"] > .fg') &&
        !selector.includes("button"),
    );

  it("moves the chrome layer out of the circle, below it", () => {
    const rules = halfChrome();
    expect(rules.length).toBe(1);
    expect(rules[0]).toMatch(/inset-block-start:\s*calc\(100% \+ \d+px\)/);
    expect(rules[0]).toMatch(/inline-size:\s*50%/);
    // Above every shape in the stage.
    expect(rules[0]).toMatch(/z-index:\s*var\(--oriso-z-names, 6\)/);
  });

  it("puts each name on its own side, its `⋮` on the outside", () => {
    const start = bodiesWhere((selector) =>
      selector.includes('[data-oriso-side="start"] > .fg'),
    );
    const end = bodiesWhere((selector) =>
      selector.includes('[data-oriso-side="end"] > .fg'),
    );
    expect(start.join()).toMatch(/inset-inline-start:\s*0/);
    expect(end.join()).toMatch(/inset-inline-end:\s*0/);
    expect(end.join()).toMatch(/flex-direction:\s*row-reverse/);
  });

  it("drops the capsule for plain text in the design's type", () => {
    const tag = bodiesWhere(
      (selector) =>
        selector.includes('[data-oriso-half="true"] .nameTag') &&
        !selector.includes(">"),
    ).join();
    expect(tag).toMatch(/background:\s*none/);
    expect(tag).toMatch(/color:\s*rgb\(45 44 40\)/);

    const name = bodiesWhere((selector) =>
      selector.includes(".orisoLabel > .name"),
    ).join();
    expect(name).toMatch(/font:\s*500 14px/);
  });

  it("says who is talking in the primary colour and who listens in grey", () => {
    const status = bodiesWhere(
      (selector) => selector.trim() === ".media.oriso .orisoStatus",
    ).join();
    expect(status).toMatch(/font:\s*400 12px/);
    expect(status).toMatch(/color:\s*rgb\(120 118 125\)/);
    const speaking = bodiesWhere((selector) =>
      selector.includes('.orisoStatus[data-speaking="true"]'),
    ).join();
    expect(speaking).toMatch(/color:\s*var\(--oriso-primary, #a5000a\)/);
  });

  it("never targets a button that is not a child of the tile", () => {
    /*
     * The options button is rendered inside `.fg`, not as a child of the
     * tile, so `[data-oriso-half] > button` never matched anything. `.fg >
     * button` is where it actually is.
     */
    const selectors: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    let rule: RegExpExecArray | null;
    while ((rule = pattern.exec(css)) !== null) {
      if (rule[1].includes('[data-oriso-half="true"]')) selectors.push(rule[1]);
    }
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).not.toMatch(/\]\s*>\s*button/);
    }
  });
});
