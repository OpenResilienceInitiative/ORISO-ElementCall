/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The drawing a face is handed must be a drawing of the identity it is
 * rendering — in the very render that carries the new identity, not one
 * commit later.
 *
 * `useArtwork` cleared its held SVG from an effect, and an effect runs after
 * the commit it belongs to. So the frame in which somebody's new identity
 * first appeared still carried the previous animal, in the previous ink; a
 * withdrawal — an identity with no file at all — was the worse half, because
 * there is nothing on its way to replace what is shown.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  resetArtworkCache,
  resetMissingArtworkLog,
  useArtwork,
} from "./artwork";
import type { OrisoIdentity } from "./identity";

const animal = (file: string, ink: string): OrisoIdentity => ({
  kind: "animal",
  file,
  bg: "#165E83",
  ink,
  initials: "AB",
});

const letters: OrisoIdentity = {
  kind: "initials",
  bg: "#165E83",
  ink: "#FFFFFF",
  initials: "AB",
};

/** Every value the hook returned, with the identity it was rendering. */
let seen: Array<{ file?: string; ink: string; svg: string | null }> = [];

const Probe = ({ identity }: { identity: OrisoIdentity }): null => {
  const svg = useArtwork(identity, null);
  seen.push({ file: identity.file, ink: identity.ink, svg });
  return null;
};

const serveByName = (): void => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    // The signature is a promise and there is nothing here to await; a
    // non-async function returning one trips `promise-function-async`.
    // eslint-disable-next-line @typescript-eslint/require-await
    async (input): Promise<Response> => {
      // `loadArtwork` passes a string; the other two are the DOM union's.
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
          `<title>${url.includes("fox") ? "fox" : "otter"}</title>` +
          '<path fill="#000000" d="M0 0h10v10H0z"/></svg>',
        { headers: { "content-type": "image/svg+xml" } },
      );
    },
  );
};

afterEach(() => {
  vi.restoreAllMocks();
  resetArtworkCache();
  resetMissingArtworkLog();
  seen = [];
});

const settled = async (file: string | undefined): Promise<string | null> => {
  await waitFor(() => {
    const last = seen.at(-1);
    expect(last?.file).toBe(file);
    if (file !== undefined) expect(last?.svg).not.toBeNull();
  });
  return seen.at(-1)?.svg ?? null;
};

describe("the artwork a changed identity is handed", () => {
  it("is never the previous animal", async () => {
    serveByName();
    const { rerender } = render(<Probe identity={animal("fox.svg", "#111")} />);
    const fox = await settled("fox.svg");
    expect(fox).not.toBeNull();

    rerender(<Probe identity={animal("otter.svg", "#222")} />);
    await settled("otter.svg");

    // Not "the last value is right" — that was always true one commit later.
    // No render carrying the new identity may have been handed the old
    // drawing at all.
    expect(
      seen.filter((entry) => entry.file === "otter.svg" && entry.svg === fox),
    ).toEqual([]);
  });

  it("is never the previous ink, when only the ink changed", async () => {
    serveByName();
    const { rerender } = render(<Probe identity={animal("fox.svg", "#111")} />);
    const inOldInk = await settled("fox.svg");

    rerender(<Probe identity={animal("fox.svg", "#999")} />);
    await waitFor(() => {
      const last = seen.at(-1);
      expect(last?.ink).toBe("#999");
      expect(last?.svg).not.toBeNull();
      expect(last?.svg).not.toBe(inOldInk);
    });

    expect(
      seen.filter((entry) => entry.ink === "#999" && entry.svg === inOldInk),
    ).toEqual([]);
  });

  it("is nothing at all once the animal is withdrawn", async () => {
    serveByName();
    const { rerender } = render(<Probe identity={animal("fox.svg", "#111")} />);
    const fox = await settled("fox.svg");

    // The case with nothing on its way: the face has to fall back to the
    // letters immediately, not after a round trip it will never make.
    rerender(<Probe identity={letters} />);
    expect(seen.at(-1)).toMatchObject({ file: undefined, svg: null });
    expect(
      seen.filter((entry) => entry.file === undefined && entry.svg === fox),
    ).toEqual([]);
  });
});

describe("a drawing that does not arrive", () => {
  it("says where it looked, once, and falls back to the letters", async () => {
    /*
     * The fallback is right — the call never invents an animal — but on its
     * own it is unreadable: "the call shows letters" could be a person who
     * published nothing, a renamed file, or a set deployed to a folder the
     * call does not read. The URL in the message is what tells those apart.
     */
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const { rerender } = render(
      <Probe identity={animal("forest-fox.svg", "#111")} />,
    );
    await waitFor(() => expect(warn).toHaveBeenCalled());

    const said = String(warn.mock.calls[0][0]);
    expect(said).toContain("forest-fox.svg");
    expect(said).toContain("/static/anon-animals/forest-fox.svg");
    expect(seen.at(-1)?.svg).toBeNull();

    // Every tile in the call asks for the same drawing; one line is enough.
    rerender(<Probe identity={animal("forest-fox.svg", "#222")} />);
    await waitFor(() => expect(seen.at(-1)?.ink).toBe("#222"));
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
