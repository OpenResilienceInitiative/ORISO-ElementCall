/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KachelnPager } from "./KachelnPager";

const rect = (top: number, bottom: number): DOMRect =>
  ({
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
  }) as DOMRect;

/**
 * The call's scroll container with the header, the Kacheln sheet, the pager
 * and the bar in it; the stage in sight is 0–410, between header and bar.
 */
function renderSheet(
  people: number,
  {
    scrollHeight,
    clientHeight,
    tile = 200,
  }: { scrollHeight: number; clientHeight: number; tile?: number },
): { scroller: HTMLElement; scrollBy: ReturnType<typeof vi.fn> } {
  const { container } = render(
    <div data-testid="scroller" style={{ overflowY: "auto" }}>
      <div data-testid="oriso-grove" data-view="kacheln" data-mode="scroll">
        {Array.from({ length: people }, (_, i) => (
          <div key={i} data-row={Math.floor(i / 2)} />
        ))}
      </div>
      <div data-testid="oriso-header" />
      <div data-testid="fixed-layer">
        <KachelnPager count={people} />
      </div>
      <div data-testid="oriso-toolbar" />
    </div>,
  );
  const scroller = screen.getByTestId("scroller");
  Object.defineProperty(scroller, "scrollHeight", { value: scrollHeight });
  Object.defineProperty(scroller, "clientHeight", { value: clientHeight });
  const scrollBy = vi.fn();
  scroller.scrollBy = scrollBy as never;
  for (const slot of container.querySelectorAll<HTMLElement>("[data-row]")) {
    const row = Number(slot.dataset.row);
    slot.getBoundingClientRect = (): DOMRect =>
      rect(row * (tile + 10), row * (tile + 10) + tile);
  }
  // The stage in sight: from the header's bottom to the bar's top.
  screen.getByTestId("oriso-header").getBoundingClientRect = (): DOMRect =>
    rect(-60, 0);
  screen.getByTestId("oriso-toolbar").getBoundingClientRect = (): DOMRect =>
    rect(410, 470);
  act(() => {
    scroller.dispatchEvent(new Event("scroll"));
  });
  return { scroller, scrollBy };
}

describe("the Kacheln's pager (#2233)", () => {
  it("shows how many people there are when everybody fits", () => {
    renderSheet(4, { scrollHeight: 400, clientHeight: 600 });
    expect(screen.getByTestId("oriso-kacheln-pager")).toHaveTextContent(
      "4 participants",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not page when only the sheet's padding scrolls", () => {
    renderSheet(4, { scrollHeight: 640, clientHeight: 410 });
    expect(screen.getByTestId("oriso-kacheln-pager")).toHaveTextContent(
      "4 participants",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers up and down, and says who is in sight, when not everybody fits", () => {
    const { scrollBy } = renderSheet(6, {
      scrollHeight: 640,
      clientHeight: 410,
    });
    const pager = screen.getByTestId("oriso-kacheln-pager");
    expect(pager).toHaveTextContent("1–4 of 6");
    const up = screen.getByRole("button", { name: "Scroll up" });
    const down = screen.getByRole("button", { name: "Scroll down" });
    expect(up).toBeDisabled();
    expect(down).toBeEnabled();

    fireEvent.click(down);
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 210 }),
    );
  });

  it("keeps the arrows when no tile fits whole, as on a phone held sideways", () => {
    renderSheet(4, { scrollHeight: 1100, clientHeight: 410, tile: 500 });
    expect(screen.getByTestId("oriso-kacheln-pager")).toHaveTextContent(
      "4 participants",
    );
    expect(screen.getByRole("button", { name: "Scroll down" })).toBeEnabled();
  });

  it("does not read the range out on every scroll", () => {
    renderSheet(6, { scrollHeight: 640, clientHeight: 410 });
    expect(
      screen.getByTestId("oriso-kacheln-pager").querySelector("[aria-live]"),
    ).toBeNull();
  });
});
