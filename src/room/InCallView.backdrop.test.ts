/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The pond stays behind the stage all the way down.
 *
 * Asserted against the stylesheet, for the same reason as the view rail
 * beside it: jsdom applies no layout and no scrolling, and the browser
 * harness mounts stages rather than a call view, so nothing else in this
 * repository can see it. The numbers that made the case are in
 * `docs/evidence/scrollport`, taken with `scripts/measureScrollport.mjs`.
 *
 * `.inRoom` is the scroll container. A backdrop positioned `absolute` inside
 * it is sized to that container's padding box — one screenful — and scrolls
 * away with the content: above eight people, where the fields scroll, every
 * row past the fold came out from under the pond onto bare page. At a phone's
 * 390x640 with fourteen people the backdrop ended 1204px ABOVE the viewport at
 * maximum scroll, which is to say it was not on screen at all.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Comments are stripped first: the rule below names the declarations it
// replaced, and a naive parse reads that prose as part of the rule.
const css = readFileSync("src/room/InCallView.module.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const bodyOf = (selector: string): string => {
  const match = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^{}]*)\\}`,
  ).exec(css);
  return match?.[1] ?? "";
};

describe("the ORISO backdrop", () => {
  it("is pinned to the scrollport, not to the first screenful", () => {
    const body = bodyOf(".orisoBackdrop");
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/inset:\s*0/);
    // What it was: sized to `.inRoom`'s padding box and scrolled with it.
    expect(body).not.toMatch(/position:\s*absolute/);
  });

  it("still sits behind the call rather than in front of it", () => {
    // The pinning must not cost the thing the stacking fix bought: a fixed
    // element with a positive layer would paint OVER the faces it is a
    // backdrop for, and over the header and footer with it.
    const body = bodyOf(".orisoBackdrop");
    expect(body).toMatch(/z-index:\s*-1/);
    expect(body).toMatch(/pointer-events:\s*none/);
    // And -1 has to mean "behind the call", not "behind the page".
    expect(bodyOf('.inRoom[data-oriso="true"]')).toMatch(
      /isolation:\s*isolate/,
    );
  });
});
