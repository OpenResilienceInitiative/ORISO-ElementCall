/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Two guards against the call painting a different palette than the app:
 *
 * 1. The static stylesheet (`src/oriso-theme.css`, the default red, shipped
 *    with every build) and the runtime generator must say the same thing for
 *    the default seed. Otherwise a call without brand colours and a call
 *    with `orisoPrimary=a5000a` would look different.
 * 2. The Compound roles the generator emits must equal the artefact the app
 *    itself generates (`__fixtures__/frontend-element-call-theme.css`, copied
 *    byte for byte from ORISO-Frontend), so a drifted copy of the engine or
 *    of the role map fails here instead of in somebody's call.
 *
 * After an intended change to the vendored engine, regenerate the static
 * file and commit it together with the change:
 *
 *   UPDATE_ORISO_THEME=1 yarn vitest run src/oriso/theme/orisoTheme.drift.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEED,
  buildBrandThemeCss,
  buildStaticThemeCss,
} from "./brandTheme";
import { DARK, LIGHT, ROOT, themeBlocks } from "./themeCss.testUtils";

const STATIC_PATH = "src/oriso-theme.css";
const FRONTEND_ARTEFACT =
  "src/oriso/theme/__fixtures__/frontend-element-call-theme.css";

describe("the static default palette", () => {
  it("is exactly what the generator writes for the default seed", () => {
    const expected = buildStaticThemeCss({ primary: DEFAULT_SEED });
    if (process.env.UPDATE_ORISO_THEME === "1") {
      writeFileSync(STATIC_PATH, expected);
    }
    expect(readFileSync(STATIC_PATH, "utf8")).toBe(expected);
  });

  it("carries the same declarations as the runtime generator for the default seed", () => {
    const fromFile = themeBlocks(readFileSync(STATIC_PATH, "utf8"));
    const fromRuntime = themeBlocks(
      buildBrandThemeCss({ primary: DEFAULT_SEED }),
    );
    expect(Object.keys(fromFile).sort()).toEqual([DARK, LIGHT, ROOT].sort());
    expect(fromRuntime).toEqual(fromFile);
  });
});

describe("the app's own call theme", () => {
  it("has the same Compound roles as the generator for the default seed", () => {
    const app = themeBlocks(readFileSync(FRONTEND_ARTEFACT, "utf8"));
    const here = themeBlocks(buildStaticThemeCss({ primary: DEFAULT_SEED }));
    for (const selector of [LIGHT, DARK]) {
      const compound = Object.fromEntries(
        Object.entries(here[selector]).filter(([name]) =>
          name.startsWith("--cpd-"),
        ),
      );
      expect(compound).toEqual(app[selector]);
    }
  });
});
