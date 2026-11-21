/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";

import { OrisoGuestFab } from "./OrisoGuestFab";

const URL_ = "https://oriso.test/call/abc";

const props = (
  overrides: Partial<ComponentProps<typeof OrisoGuestFab>> = {},
): ComponentProps<typeof OrisoGuestFab> => ({
  inviteRequest: vi.fn().mockResolvedValue({ url: URL_ }),
  knock: true,
  onKnockChange: vi.fn(),
  waitingCount: 0,
  ...overrides,
});

describe("the guest button (call UX round #170)", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("is one labelled button, closed, until it is pressed", () => {
    render(<OrisoGuestFab {...props()} />);
    const fab = screen.getByRole("button", { name: "Guests" });
    expect(fab).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is the icon alone on a phone, still named", () => {
    render(<OrisoGuestFab {...props({ compact: true })} />);
    const fab = screen.getByRole("button", { name: "Guests" });
    expect(fab.textContent).toBe("");
  });

  it("counts the people waiting on the button and in its name", () => {
    render(<OrisoGuestFab {...props({ waitingCount: 2 })} />);
    const fab = screen.getByRole("button", { name: "Guests, 2 waiting" });
    expect(fab).toContainElement(screen.getByTestId("oriso-guest-fab-badge"));
  });

  it("opens the guest settings and moves focus into them", async () => {
    const user = userEvent.setup();
    render(<OrisoGuestFab {...props()} />);
    await user.click(screen.getByRole("button", { name: "Guests" }));
    const dialog = screen.getByRole("dialog", { name: "Guests" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Guests" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("switches Anklopfen and stays open, so the switch is seen to flip", async () => {
    const user = userEvent.setup();
    const onKnockChange = vi.fn();
    render(<OrisoGuestFab {...props({ onKnockChange })} />);
    await user.click(screen.getByRole("button", { name: "Guests" }));
    const knock = screen.getByRole("switch", { name: "Knock first" });
    expect(knock).toHaveAttribute("aria-checked", "true");
    await user.click(knock);
    expect(onKnockChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("asks for the link only when the counsellor wants it, then copies it", async () => {
    const user = userEvent.setup();
    const inviteRequest = vi.fn().mockResolvedValue({ url: URL_ });
    render(<OrisoGuestFab {...props({ inviteRequest })} />);
    await user.click(screen.getByRole("button", { name: "Guests" }));
    expect(inviteRequest).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Guests" });
    await user.tab();
    expect(screen.getByRole("button", { name: "Share link" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(inviteRequest).toHaveBeenCalledOnce();
    const url = await screen.findByTestId("oriso-invite-url");
    expect(url).toHaveValue(URL_);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(url).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Guests" })).toHaveFocus();
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("shows only what the host offers: no link without one, no switch without one", async () => {
    const user = userEvent.setup();
    render(
      <OrisoGuestFab
        {...props({ inviteRequest: null, knock: null, onKnockChange: null })}
        waitingCount={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Guests, 1 waiting" }));
    expect(screen.queryByRole("button", { name: "Share link" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("dialog")).toHaveTextContent("1 waiting");
  });

  it("closes on Escape and gives focus back to the button", async () => {
    const user = userEvent.setup();
    render(<OrisoGuestFab {...props()} />);
    const fab = screen.getByRole("button", { name: "Guests" });
    await user.click(fab);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab).toHaveFocus();
  });

  it("closes on a click anywhere else and on its own close button", async () => {
    const user = userEvent.setup();
    render(<OrisoGuestFab {...props()} />);
    const fab = screen.getByRole("button", { name: "Guests" });
    await user.click(fab);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(fab);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab).toHaveFocus();
  });

  it("is reachable and operable by keyboard alone", async () => {
    const user = userEvent.setup();
    render(<OrisoGuestFab {...props()} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Guests" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has no accessibility violations, open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OrisoGuestFab {...props({ waitingCount: 1 })} />,
    );
    await user.click(screen.getByRole("button", { name: "Guests, 1 waiting" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
