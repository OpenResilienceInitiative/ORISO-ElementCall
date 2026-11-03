/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  SPOTLIGHT_ASPECT_RATIO,
  SPOTLIGHT_INLINE_INSET_PX,
  SPOTLIGHT_MAX_INLINE_PX,
  SPOTLIGHT_ROOM_MAX_SHARE,
  spotlightBlockSize,
  stageBesideSpotlight,
} from "./spotlightRoom";

describe("the shared screen's own height", () => {
  it("is upstream's box on a stage with room for it", () => {
    expect(spotlightBlockSize(900)).toBe(
      Math.round(SPOTLIGHT_MAX_INLINE_PX / SPOTLIGHT_ASPECT_RATIO),
    );
  });

  /*
   * On a phone the box is not 404px wide — the stylesheet shrinks it to the
   * stage minus its inset, keeping the ratio — so a band of a fixed 233px
   * would reserve room for a screen that is not there.
   */
  it("shrinks with the stage, as the stylesheet does", () => {
    const narrow = 390;
    expect(spotlightBlockSize(narrow)).toBe(
      Math.round(
        (narrow - 2 * SPOTLIGHT_INLINE_INSET_PX) / SPOTLIGHT_ASPECT_RATIO,
      ),
    );
    expect(spotlightBlockSize(narrow)).toBeLessThan(spotlightBlockSize(900));
  });

  it("answers nothing for a stage that has not measured itself", () => {
    expect(spotlightBlockSize(0)).toBe(0);
    expect(spotlightBlockSize(Number.NaN)).toBe(0);
  });
});

describe("the stage the forms are left", () => {
  it("is the whole stage when nothing is shared", () => {
    expect(stageBesideSpotlight(900, 620, null)).toEqual({
      width: 900,
      height: 620,
      offsetY: 0,
    });
  });

  it("starts below the band when the screen is pinned to the top", () => {
    const band = spotlightBlockSize(900);
    expect(stageBesideSpotlight(900, 620, "start")).toEqual({
      width: 900,
      height: 620 - band,
      offsetY: band,
    });
  });

  it("ends above the band when it is pinned to the bottom", () => {
    const band = spotlightBlockSize(900);
    expect(stageBesideSpotlight(900, 620, "end")).toEqual({
      width: 900,
      height: 620 - band,
      offsetY: 0,
    });
  });

  it("never narrows the stage: the band spans the full width", () => {
    // Which is what makes dragging the box along one edge free — see the
    // function's own comment.
    expect(stageBesideSpotlight(900, 620, "start").width).toBe(900);
  });

  /*
   * A call docked short and wide — a counsellor with the window at the foot
   * of their screen — would otherwise hand the whole height to the shared
   * screen and leave the forms a sliver. Past the cap the box goes back to
   * overlapping, which is the lesser loss, and the test says so out loud so
   * that the overlap is a decision rather than a regression.
   */
  it("gives the screen at most half a short stage, and no more", () => {
    const room = stageBesideSpotlight(900, 200, "start");
    expect(spotlightBlockSize(900)).toBeGreaterThan(200);
    expect(room.offsetY).toBe(Math.floor(200 * SPOTLIGHT_ROOM_MAX_SHARE));
    expect(room.height).toBe(200 - room.offsetY);
  });

  it("leaves a stage of nothing alone rather than going negative", () => {
    expect(stageBesideSpotlight(900, 0, "start")).toEqual({
      width: 900,
      height: 0,
      offsetY: 0,
    });
  });
});
