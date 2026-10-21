/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The artwork contract, from this side.
 *
 * Two repositories have to agree about three facts for a person's animal to
 * appear in a call: the shape of the file name, the folder it is served
 * from, and the revision that busts the cache when a drawing changes. The
 * host's end is `src/utils/anonName/data.ts` and `src/utils/pseudonymGenerator.ts`
 * in ORISO-Frontend, asserted there by `callIdentity.contract.test.ts`; this
 * is the same contract read from the call's side, and each file names the
 * other so a change on one turns the other red.
 *
 * The failure this guards against is the quiet one. A record we cannot use
 * ends as initials — correct, because the call never guesses an animal — and
 * it used to end there without a word: the chat showed the new animal, the
 * call showed two letters, and every test stayed green.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { ARTWORK_FILE_NAME, readIdentity, resetRejectionLog } from "./identity";
import { ARTWORK_REVISION, artworkUrl } from "./artwork";

const animal = (file: unknown): unknown => ({
  kind: "animal",
  file,
  bg: "#165E83",
  ink: "#ffffff",
});

afterEach(() => {
  vi.restoreAllMocks();
  resetRejectionLog();
});

describe("what the call accepts as a drawing", () => {
  it("takes the names ORISO-Frontend actually ships", () => {
    // Read off `public/static/anon-animals` in ORISO-Frontend. `Nightingale`
    // is capitalised there, which is why the pattern is case-insensitive.
    for (const file of [
      "fox.svg",
      "owl.svg",
      "sea-turtle.svg",
      "red_panda.svg",
      "Nightingale.svg",
    ])
      expect(ARTWORK_FILE_NAME.test(file)).toBe(true);
  });

  it("refuses anything that could leave the artwork folder", () => {
    for (const file of [
      "../secrets.svg",
      "sets/forest/fox.svg",
      "https://elsewhere.invalid/fox.svg",
      "fox.svg?v=3",
      "fox.png",
      "",
    ])
      expect(ARTWORK_FILE_NAME.test(file)).toBe(false);
  });

  it("looks for a drawing where the host serves it", () => {
    // `/static`, not `/assets`: on the host, `/assets` is routed to the call's
    // own Vite bundle, so the drawings would 404 there (ORISO-Frontend#840).
    expect(artworkUrl("fox.svg", "https://beratung.example/app")).toBe(
      `https://beratung.example/static/anon-animals/fox.svg?v=${ARTWORK_REVISION}`,
    );
  });

  it("agrees with the host about the cache revision", () => {
    // `AVATAR_ART_REVISION` in ORISO-Frontend's `src/utils/pseudonymGenerator.ts`.
    // If that one moves and this does not, a viewer keeps the old drawing
    // while the chat shows the new one.
    expect(ARTWORK_REVISION).toBe(2);
  });
});

describe("a record the call cannot use", () => {
  it("says so once, naming the file and the reason", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(readIdentity(animal("sets/forest/fox.svg"))).toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
    const said = String(warn.mock.calls[0][0]);
    expect(said).toContain("sets/forest/fox.svg");
    expect(said).toContain("bare <name>.svg");
  });

  it("does not repeat itself for the same file", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // A twenty-person call re-reads every record on every change.
    for (let i = 0; i < 20; i += 1) readIdentity(animal("fox.png"));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays silent for somebody who published no artwork at all", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // Initials are the whole answer here, and they are not a deployment
    // problem: this person simply never pressed the dice.
    expect(
      readIdentity({
        kind: "initials",
        bg: "#165E83",
        ink: "#ffffff",
        initials: "SP",
      }),
    ).toMatchObject({ kind: "initials" });
    expect(
      readIdentity({ kind: "animal", bg: "#165E83", ink: "#ffffff" }),
    ).toBeNull();

    expect(warn).not.toHaveBeenCalled();
  });
});
