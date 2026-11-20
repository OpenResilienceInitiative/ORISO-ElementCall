/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The speaking rim, asserted against the stylesheet: jsdom draws no shadows.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/oriso/OrisoFace.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const rim = /(?:^|\})\s*\.rim\s*\{([^{}]*)\}/.exec(css)?.[1] ?? "";

describe("the rim on whoever is speaking", () => {
  it("follows the circle, not the square box inside it", () => {
    // Frank, 28 Oct: on a square box the inset ring sits on the box's edges,
    // and the round face clips all of it away except three short red arcs
    // where the square touches the circle — top, bottom and outer side.
    expect(rim).toMatch(/box-shadow/);
    expect(rim).toMatch(/border-radius:\s*inherit/);
  });
});
