/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { OrisoToolbar } from "./OrisoToolbar";

const props = (
  overrides: Partial<ComponentProps<typeof OrisoToolbar>> = {},
): ComponentProps<typeof OrisoToolbar> => ({
  audioMuted: false,
  onToggleAudio: vi.fn(),
  videoMuted: true,
  onToggleVideo: vi.fn(),
  handRaised: false,
  onToggleHand: vi.fn(),
  onToggleNotes: vi.fn(),
  onHangup: vi.fn(),
  participantCount: 2,
  view: "einzelgespraech",
  offer: ["einzelgespraech", "spotlight"],
  onViewChange: vi.fn(),
  onToggleScreenShare: vi.fn(),
  sharingScreen: false,
  onOpenSoundSettings: vi.fn(),
  onOpenSettings: vi.fn(),
  ...overrides,
});

const barButtons = (): string[] =>
  within(screen.getByRole("toolbar"))
    .getAllByRole("button")
    .map((button) => button.dataset.testid ?? "");

describe("the ORISO control bar", () => {
  it("holds microphone, camera, hand, notes and ⋮, in that order", () => {
    render(<OrisoToolbar {...props()} />);
    expect(barButtons()).toEqual([
      "incall_mute",
      "incall_videomute",
      "incall_raise_hand",
      "incall_notes",
      "incall_menu",
    ]);
  });

  it("keeps the hang-up out of the bar, as its own round button", () => {
    const onHangup = vi.fn();
    render(<OrisoToolbar {...props({ onHangup })} />);
    const hangup = screen.getByTestId("incall_leave");
    expect(screen.getByRole("toolbar").contains(hangup)).toBe(false);
    fireEvent.click(hangup);
    expect(onHangup).toHaveBeenCalledOnce();
  });

  it("leaves out what the call cannot do", () => {
    render(
      <OrisoToolbar {...props({ onToggleHand: null, onToggleNotes: null })} />,
    );
    expect(barButtons()).toEqual([
      "incall_mute",
      "incall_videomute",
      "incall_menu",
    ]);
  });

  it("says which devices are on, and toggles them", () => {
    const onToggleAudio = vi.fn();
    const onToggleVideo = vi.fn();
    render(<OrisoToolbar {...props({ onToggleAudio, onToggleVideo })} />);
    const mic = screen.getByTestId("incall_mute");
    const camera = screen.getByTestId("incall_videomute");
    expect(mic.dataset.state).toBe("live");
    expect(camera.dataset.state).toBe("off");
    fireEvent.click(mic);
    fireEvent.click(camera);
    expect(onToggleAudio).toHaveBeenCalledOnce();
    expect(onToggleVideo).toHaveBeenCalledOnce();
  });

  it("disables a device the call cannot toggle", () => {
    render(<OrisoToolbar {...props({ onToggleAudio: null })} />);
    expect(screen.getByTestId("incall_mute")).toHaveProperty("disabled", true);
  });

  it("shows a raised hand as pressed", () => {
    render(<OrisoToolbar {...props({ handRaised: true })} />);
    const hand = screen.getByTestId("incall_raise_hand");
    expect(hand.getAttribute("aria-pressed")).toBe("true");
    expect(hand.dataset.state).toBe("raised");
  });

  it("asks the host for the notes", () => {
    const onToggleNotes = vi.fn();
    render(<OrisoToolbar {...props({ onToggleNotes })} />);
    fireEvent.click(screen.getByTestId("incall_notes"));
    expect(onToggleNotes).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations, open or closed", async () => {
    const { container } = render(<OrisoToolbar {...props()} />);
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("the call menu behind ⋮", () => {
  const open = (overrides = {}): ReturnType<typeof props> => {
    const p = props(overrides);
    render(<OrisoToolbar {...p} />);
    fireEvent.click(screen.getByTestId("incall_menu"));
    return p;
  };

  it("lists the design's entries, in the design's order", () => {
    open();
    const menu = screen.getByTestId("oriso-call-menu");
    const entries = [...menu.querySelectorAll("[data-entry]")].map(
      (el) => (el as HTMLElement).dataset.entry,
    );
    expect(entries).toEqual([
      "participants",
      "view",
      "share_screen",
      "notes",
      "sound",
      "settings",
      "leave",
    ]);
    expect(
      menu.querySelector('[data-entry="participants"]')?.textContent,
    ).toContain("2");
  });

  it("is rendered inside the toolbar, so it shares the toolbar's z-index", () => {
    open();
    expect(
      screen
        .getByTestId("oriso-toolbar")
        .contains(screen.getByTestId("oriso-call-menu")),
    ).toBe(true);
  });

  it("reports itself as open on its trigger", () => {
    open();
    const trigger = screen.getByTestId("incall_menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(
      screen.getByTestId("oriso-call-menu").id,
    );
  });

  it("offers the views as the rail, and changes the view", () => {
    const p = open();
    const rail = screen.getByTestId("view-switcher");
    fireEvent.click(rail.querySelector('[data-view="spotlight"]')!);
    expect(p.onViewChange).toHaveBeenCalledWith("spotlight");
  });

  it("opens the sound settings and the settings, and closes behind them", () => {
    const p = open();
    fireEvent.click(screen.getByText("Sound & devices"));
    expect(p.onOpenSoundSettings).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();

    fireEvent.click(screen.getByTestId("incall_menu"));
    fireEvent.click(screen.getByText("Settings"));
    expect(p.onOpenSettings).toHaveBeenCalledOnce();
  });

  it("leaves out screen sharing where there is none", () => {
    open({ onToggleScreenShare: null });
    expect(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="share_screen"]'),
    ).toBeNull();
  });

  it("closes on Escape and gives focus back to ⋮", () => {
    open();
    fireEvent.keyDown(screen.getByTestId("oriso-call-menu"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("incall_menu"));
  });

  it("closes on a click anywhere else", () => {
    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();
  });
});
