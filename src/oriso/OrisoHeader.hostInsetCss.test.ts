/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Where the host still draws its window buttons (`data-host-chrome="host"`),
 * the header keeps their corner free — on a phone's compact header too, whose
 * own padding shorthand would otherwise give that corner back (#145 review).
 * Asserted against the stylesheet: jsdom lays nothing out.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/oriso/OrisoHeader.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const rule = (selector: string): string | undefined => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
};

describe("the compact header and the host's window buttons", () => {
  it("reserves the host's corner after the compact padding", () => {
    const compact = css.indexOf(".header[data-compact] {");
    const hostCompact = css.indexOf(
      '.header[data-compact][data-host-chrome="host"] {',
    );
    expect(compact).toBeGreaterThan(-1);
    expect(hostCompact).toBeGreaterThan(compact);
    expect(rule('.header[data-compact][data-host-chrome="host"]')).toMatch(
      /padding-inline-end:\s*calc\(16px \+ 96px\)/,
    );
  });
});
