/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OrisoHeader } from "./OrisoHeader";

describe("the call header's window buttons (S2)", () => {
  it("sends minimise and full screen to the host", () => {
    const onWindow = vi.fn();
    render(
      <OrisoHeader
        tone="dark"
        title="Einzelgespräch"
        encrypted
        onWindow={onWindow}
        fullscreen={false}
        actions={<button type="button">Notizen</button>}
      />,
    );
    fireEvent.click(screen.getByTestId("oriso-window-minimise"));
    fireEvent.click(screen.getByTestId("oriso-window-fullscreen"));
    expect(onWindow.mock.calls).toEqual([["minimise"], ["toggle_fullscreen"]]);
    expect(screen.getByTestId("oriso-header").dataset.hostChrome).toBe("call");
  });

  it("puts the window buttons after the header's own buttons", () => {
    render(
      <OrisoHeader
        tone="dark"
        title="Einzelgespräch"
        encrypted={false}
        onWindow={vi.fn()}
        fullscreen={false}
        actions={<button type="button">Notizen</button>}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent || b.dataset.testid)).toEqual([
      "Notizen",
      "oriso-window-minimise",
      "oriso-window-fullscreen",
    ]);
  });

  it("says which way the full-screen button goes", () => {
    const { rerender } = render(
      <OrisoHeader
        tone="light"
        title="x"
        encrypted={false}
        onWindow={vi.fn()}
        fullscreen={false}
      />,
    );
    const button = screen.getByTestId("oriso-window-fullscreen");
    expect(button).toHaveAccessibleName("Full screen");
    expect(button).toHaveAttribute("aria-pressed", "false");
    rerender(
      <OrisoHeader
        tone="light"
        title="x"
        encrypted={false}
        onWindow={vi.fn()}
        fullscreen
      />,
    );
    expect(button).toHaveAccessibleName("Exit full screen");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("draws no window buttons and keeps the corner free while the host has its own", () => {
    render(
      <OrisoHeader
        tone="dark"
        title="x"
        encrypted={false}
        onWindow={null}
        fullscreen={false}
      />,
    );
    expect(screen.queryByTestId("oriso-window-minimise")).toBeNull();
    expect(screen.getByTestId("oriso-header").dataset.hostChrome).toBe("host");
  });

  /*
   * The defect measured on Dev: the host's four corner buttons (32px each,
   * 10px from the edge, the last one ending 162px in) lay over the video
   * header's "Notizen". jsdom lays nothing out, so the reservation is
   * asserted on the stylesheet.
   */
  it("reserves at least the host buttons' corner when the host draws them", () => {
    const css = readFileSync("src/oriso/OrisoHeader.module.css", "utf8");
    const rule =
      /\.header\[data-host-chrome="host"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const reserved = Number(/\+\s*(\d+)px/.exec(rule)?.[1]);
    expect(reserved).toBeGreaterThanOrEqual(162);
    expect(css).not.toMatch(/\[data-host-chrome="call"\][^{]*\{[^}]*padding/);
  });
});

describe("who is speaking in the desktop header (R27)", () => {
  it("sits between the title and the buttons", () => {
    render(
      <OrisoHeader
        tone="light"
        title="Gruppengespräch"
        encrypted
        onWindow={vi.fn()}
        fullscreen={false}
        speaker={<span data-testid="band">Susanne P. spricht</span>}
        actions={<button type="button">Kreis</button>}
      />,
    );
    const header = screen.getByTestId("oriso-header");
    const order = Array.from(header.querySelectorAll("*"))
      .map((el) =>
        el.getAttribute("data-testid") === "band"
          ? "band"
          : el.textContent === "Kreis" && el.tagName === "BUTTON"
            ? "actions"
            : el.textContent === "Gruppengespräch"
              ? "title"
              : null,
      )
      .filter(Boolean);
    expect(order).toEqual(["title", "band", "actions"]);
  });

  it("is left to the band under the header on a phone", () => {
    render(
      <OrisoHeader
        tone="light"
        compact
        title="Gruppengespräch"
        encrypted
        onWindow={null}
        fullscreen
        speaker={<span data-testid="band">Susanne P. spricht</span>}
      />,
    );
    expect(screen.queryByTestId("band")).toBeNull();
  });
});
