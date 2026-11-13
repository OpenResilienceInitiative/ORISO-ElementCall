/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { type FC } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStageScrolled } from "./useStageScrolled";

const Scroller: FC = () => {
  const [scrolled, onScroll] = useStageScrolled();
  return (
    <div
      data-testid="scroller"
      data-stage-scrolled={scrolled ? "true" : undefined}
      onScroll={onScroll}
    />
  );
};

describe("the phone header over a scrolling stage (#2233)", () => {
  it("says when the stage has scrolled under the header, and when it is back", () => {
    render(<Scroller />);
    const scroller = screen.getByTestId("scroller");
    expect(scroller.dataset.stageScrolled).toBeUndefined();

    scroller.scrollTop = 240;
    fireEvent.scroll(scroller);
    expect(scroller.dataset.stageScrolled).toBe("true");

    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    expect(scroller.dataset.stageScrolled).toBeUndefined();
  });

  /*
   * Asserted against the stylesheet: jsdom has no layout and no scrolling.
   * The header was sticky all along — it stays at the top, measured at
   * every scroll position — but the phone's light header is transparent
   * over the stage (5b), so the Kacheln scrolled straight under the title
   * and the "verschlüsselt · 12 Teilnehmende" line, which then read as
   * gone. Once something is under it, it needs a surface of its own.
   */
  const css = readFileSync("src/room/InCallView.module.css", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const bodyOf = (selector: string): string =>
    new RegExp(
      `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^{}]*)\\}`,
    ).exec(css)?.[1] ?? "";

  it("stays put at the top, like the bar at the bottom", () => {
    const body = bodyOf(".orisoMobileHeader");
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/inset-block-start:\s*0/);
  });

  it("gets a surface once the stage is under it", () => {
    const body = bodyOf(
      '.inRoom[data-stage-scrolled="true"] > .orisoMobileHeader',
    );
    expect(body).toMatch(/background:/);
    expect(body).toMatch(/backdrop-filter:/);
  });
});
