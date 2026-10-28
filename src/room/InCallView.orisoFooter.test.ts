/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The ORISO footer and the call's stacking order, asserted against the
 * stylesheets themselves: jsdom applies no CSS and no media queries, so a
 * rendering test cannot see where the toolbar sits or what paints over what.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from the repository root: vitest runs there, and `import.meta.url`
// is not a file URL once Vite has transformed this module. Comments are
// stripped first, so prose about replaced selectors is not parsed as one.
const read = (path: string): string =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const room = read("src/room/InCallView.module.css");
const toolbar = read("src/oriso/OrisoToolbar.module.css");
const einzel = read("src/grid/EinzelgespraechLayout.module.css");

/** The declarations of every rule whose selector matches a predicate. */
function bodiesWhere(
  css: string,
  match: (selector: string) => boolean,
): string[] {
  const bodies: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = pattern.exec(css)) !== null) {
    if (match(rule[1].trim())) bodies.push(rule[2]);
  }
  return bodies;
}

function px(body: string, property: string): number {
  const match = new RegExp(`(?:^|;|\\s)${property}:\\s*(\\d+)px`).exec(body);
  if (match === null) throw new Error(`no ${property} in ${body}`);
  return Number(match[1]);
}

describe("the ORISO footer", () => {
  it("holds the toolbar, and the toolbar is never hidden", () => {
    const rules = bodiesWhere(room, (s) => s.includes(".orisoToolbar"));
    // Without this the loop would pass by having nothing to check.
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) expect(body).not.toMatch(/display:\s*none/);
    expect(rules.join()).toMatch(/grid-area:\s*buttons/);
    expect(
      bodiesWhere(room, (s) => s === ".footer.orisoFooter").join(),
    ).toMatch(/grid-template-areas:\s*"\. buttons buttons buttons \."/);
  });

  it("no longer places the view rail in the footer", () => {
    // It moved into the toolbar's `⋮` menu, under "Ansicht".
    expect(room).not.toContain(".orisoLayout");
  });

  it("fits five buttons and the hang-up into 320px with 16px gutters", () => {
    const narrow = toolbar.slice(toolbar.indexOf("@media (max-width: 400px)"));
    const button = px(
      bodiesWhere(narrow, (s) => s === ".button")[0],
      "inline-size",
    );
    const bar = bodiesWhere(narrow, (s) => s === ".bar")[0];
    const [, padInline] = /padding:\s*\d+px (\d+)px/.exec(bar)!;
    const hangup = px(
      bodiesWhere(narrow, (s) => s === ".hangup")[0],
      "inline-size",
    );
    const gap = px(bodiesWhere(narrow, (s) => s === ".toolbar")[0], "gap");

    const width =
      5 * button + 4 * px(bar, "gap") + 2 * Number(padInline) + gap + hangup;
    expect(width).toBeLessThanOrEqual(320 - 2 * 16);
  });
});

describe("the stacking order", () => {
  /*
   * One order for every call surface, from the 28 Oct audit: the stage at
   * z 1 and isolated (shapes 1..5 and names 6 inside it), the toolbar and
   * its menu at 20, the header at 30. The prototype got it wrong in four
   * places — a menu trapped under shapes, panels under names — so it is
   * asserted here rather than left to whoever edits a z-index next.
   */
  const tokens = bodiesWhere(room, (s) => s === '.inRoom[data-oriso="true"]')
    .join()
    .matchAll(/--oriso-z-([a-z-]+):\s*(\d+)/g);
  const z = Object.fromEntries(
    [...tokens].map(([, name, value]) => [name, Number(value)]),
  );

  it("names one value per layer, bottom to top", () => {
    expect(z).toEqual({ stage: 1, names: 6, toolbar: 20, header: 30 });
  });

  it("isolates the stage, so nothing inside it can climb out", () => {
    const stage = bodiesWhere(
      room,
      (s) => s.includes("> .scrollingGrid") && s.includes("> .fixedGrid"),
    ).join();
    expect(stage).toMatch(/z-index:\s*var\(--oriso-z-stage\)/);
    expect(stage).toMatch(/isolation:\s*isolate/);
  });

  it("lifts the footer and the header above the stage", () => {
    expect(
      bodiesWhere(
        room,
        (s) => s === '.inRoom[data-oriso="true"] > .footer',
      ).join(),
    ).toMatch(/z-index:\s*var\(--oriso-z-toolbar\)/);
    expect(
      bodiesWhere(
        room,
        (s) => s === '.inRoom[data-oriso="true"] > .header',
      ).join(),
    ).toMatch(/z-index:\s*var\(--oriso-z-header\)/);
  });

  it("puts the z-index on the toolbar itself, and its menu inside it", () => {
    const own = bodiesWhere(toolbar, (s) => s === ".toolbar").join();
    expect(own).toMatch(/position:\s*relative/);
    expect(own).toMatch(/z-index:\s*var\(--oriso-z-toolbar, 20\)/);
    // A z-index on the menu alone is the prototype's bug: it is compared
    // only with its siblings inside the toolbar's stacking context.
    const menu = bodiesWhere(toolbar, (s) => s === ".menu").join();
    expect(menu).not.toMatch(/z-index/);
  });

  it("stands the seam with the names, above both halves", () => {
    const seam = bodiesWhere(einzel, (s) => s === ".seam").join();
    expect(seam).toMatch(/z-index:\s*var\(--oriso-z-names, 6\)/);
    expect(seam).toMatch(/pointer-events:\s*none/);
  });
});
