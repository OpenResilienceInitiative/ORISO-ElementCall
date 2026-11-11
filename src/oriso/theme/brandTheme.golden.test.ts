/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The colour engine is a copy of the app's. This pins the copy to the app's
 * own golden fixture (`tenant-colour-golden.json`, owned by ORISO-Frontend,
 * copied here byte for byte): for every seed the app accepts, the call must
 * paint the same primary, the same label colour and the same hover.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { parseBrandHex } from "./brandParams";
import { buildBrandThemeCss, resolveBrandSeeds } from "./brandTheme";
import { LIGHT, themeBlocks } from "./themeCss.testUtils";

interface GoldenCase {
  seed: string | null;
  accepted: boolean;
  primary: string | null;
  onPrimary: string | null;
  primaryHover: string | null;
}

const { cases } = JSON.parse(
  readFileSync(
    "src/oriso/theme/__fixtures__/tenant-colour-golden.json",
    "utf8",
  ),
) as { cases: GoldenCase[] };

/**
 * What the app puts into the call address for a stored seed: bare, lower
 * case, six digits. The app expands the three-digit shorthand and trims
 * blanks itself; the call accepts nothing but the final form.
 */
const sentByApp = (seed: string | null): string | null => {
  if (seed === null) return null;
  const hex = seed.trim().toLowerCase().replace(/^#/, "");
  return parseBrandHex(hex) === null ? null : hex;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the call paints what the app's golden fixture says", () => {
  const sendable = cases.filter((c) => sentByApp(c.seed) !== null);

  it("covers a good spread of the app's seeds", () => {
    expect(sendable.filter((c) => c.accepted).length).toBeGreaterThanOrEqual(
      15,
    );
    expect(sendable.filter((c) => !c.accepted).length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it.each(sendable.map((c) => [c.seed, c] as const))(
    "seed %j",
    (_seed, golden) => {
      vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      const hex = sentByApp(golden.seed)!;
      const seeds = resolveBrandSeeds({
        primary: parseBrandHex(hex),
        accent: null,
        signal: null,
      });

      // Accepted and rejected seeds agree with the app.
      expect(seeds !== null).toBe(golden.accepted);
      if (!golden.accepted) return;

      const light = themeBlocks(buildBrandThemeCss(seeds!))[LIGHT];
      expect(light["--cpd-color-bg-action-primary-rest"]).toBe(golden.primary);
      expect(light["--cpd-color-text-on-solid-primary"]).toBe(golden.onPrimary);
      expect(light["--cpd-color-bg-action-primary-hovered"]).toBe(
        golden.primaryHover,
      );
    },
  );

  it("does not take the shorthand or padded forms the app tolerates", () => {
    // The address contract is strict: the app normalises, the call rejects.
    for (const seed of ["#fc0", "#1c4f8f ", "#1C4F8F"]) {
      expect(parseBrandHex(seed)).toBeNull();
    }
  });
});
