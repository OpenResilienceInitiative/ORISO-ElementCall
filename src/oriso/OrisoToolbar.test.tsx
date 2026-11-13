/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { OrisoMobileMenu, OrisoToolbar } from "./OrisoToolbar";

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
  nameStyle: "popout",
  onNameStyleChange: vi.fn(),
  backgroundLabel: "Fluss von oben",
  onOpenBackground: vi.fn(),
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

  /*
   * S3, design 2b: an audio call shows only what an audio call can use —
   * no camera at all, not a crossed-out one — and the hang-up is wide and
   * spelled out.
   */
  it("holds only the audio controls in an audio call", () => {
    render(<OrisoToolbar {...props({ showVideo: false })} />);
    expect(barButtons()).toEqual([
      "incall_mute",
      "incall_raise_hand",
      "incall_notes",
      "incall_menu",
    ]);
  });

  it("says what the hang-up does in a word", () => {
    render(<OrisoToolbar {...props()} />);
    const hangup = screen.getByTestId("incall_leave");
    expect(hangup).toHaveTextContent("Hang up");
    expect(hangup).toHaveAccessibleName("Hang up");
  });

  /* S4, design 5a: the video call shares the screen from the bar itself. */
  it("puts screen sharing in the bar of a video call", () => {
    const onToggleScreenShare = vi.fn();
    render(
      <OrisoToolbar
        {...props({ screenShareInBar: true, onToggleScreenShare })}
      />,
    );
    expect(barButtons()).toEqual([
      "incall_mute",
      "incall_videomute",
      "incall_raise_hand",
      "incall_screenshare",
      "incall_notes",
      "incall_menu",
    ]);
    const share = screen.getByTestId("incall_screenshare");
    expect(share).toHaveAccessibleName("Share screen");
    fireEvent.click(share);
    expect(onToggleScreenShare).toHaveBeenCalledOnce();
  });

  it("leaves screen sharing out of the bar where it is not available", () => {
    render(
      <OrisoToolbar
        {...props({ screenShareInBar: true, onToggleScreenShare: null })}
      />,
    );
    expect(barButtons()).not.toContain("incall_screenshare");
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

  it("opens and folds the call note, and shows when it is open", () => {
    const onToggleNotes = vi.fn();
    const { rerender } = render(<OrisoToolbar {...props({ onToggleNotes })} />);
    const notes = screen.getByTestId("incall_notes");
    fireEvent.click(notes);
    expect(onToggleNotes).toHaveBeenCalledOnce();
    expect(notes.getAttribute("aria-pressed")).toBe("false");
    rerender(<OrisoToolbar {...props({ onToggleNotes, notesOpen: true })} />);
    expect(notes.getAttribute("aria-pressed")).toBe("true");
    expect(notes.dataset.state).toBe("open");
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
      "names",
      "participants",
      "share_screen",
      "background",
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

  // S5: the rail moved into the call header; the menu no longer holds it.
  it("no longer holds the view rail", () => {
    open();
    expect(screen.queryByTestId("view-switcher")).toBeNull();
  });

  it("offers Namen & Symbole as two cards and keeps the menu open", () => {
    const p = open();
    const menu = screen.getByTestId("oriso-call-menu");
    const cards = menu.querySelectorAll('[data-entry="names"] [role="radio"]');
    expect(cards).toHaveLength(2);
    const popout = menu.querySelector('[data-name-style="popout"]')!;
    expect(popout.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(menu.querySelector('[data-name-style="dezent"]')!);
    expect(p.onNameStyleChange).toHaveBeenCalledWith("dezent");
    expect(screen.getByTestId("oriso-call-menu")).toBeTruthy();
  });

  it("leaves Namen & Symbole out where there is no choice", () => {
    open({ onNameStyleChange: null });
    expect(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="names"]'),
    ).toBeNull();
  });

  it("opens the background from the menu, naming the motif that is on", () => {
    const p = open();
    const entry = screen
      .getByTestId("oriso-call-menu")
      .querySelector('[data-entry="background"]')!;
    expect(entry.textContent).toContain("Fluss von oben");
    fireEvent.click(entry);
    expect(p.onOpenBackground).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();
  });

  it("leaves Hintergrund out where there is no atmosphere", () => {
    open({ onOpenBackground: null });
    expect(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="background"]'),
    ).toBeNull();
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

  it("keeps a touch on the menu from reaching the call, as the bar does", () => {
    // Codex on #107: in flat mode a tap bubbling up to InCallView calls
    // vm.tapScreen() and hides the footer, the open menu with it.
    const onTouchEnd = vi.fn();
    open({ onTouchEnd });
    const menu = screen.getByTestId("oriso-call-menu");
    fireEvent.touchEnd(menu.querySelector('[data-entry="settings"]')!);
    fireEvent.touchEnd(menu);
    expect(onTouchEnd).toHaveBeenCalledTimes(2);
  });

  it("leaves out the settings where there is no dialog to open", () => {
    // Codex on #107: a call 600px high or less runs in flat mode, where
    // InCallView renders no SettingsModal, so the entries would open nothing.
    open({ onOpenSoundSettings: null, onOpenSettings: null });
    const menu = screen.getByTestId("oriso-call-menu");
    expect(menu.querySelector('[data-entry="sound"]')).toBeNull();
    expect(menu.querySelector('[data-entry="settings"]')).toBeNull();
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

describe("knocking in the call (#108)", () => {
  it("shows no waiting count and no switch when the host sends nothing", () => {
    render(<OrisoToolbar {...props()} />);
    expect(screen.queryByTestId("oriso-waiting-badge")).toBeNull();
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("counts the people waiting on the ⋮ and in the participants row", () => {
    render(<OrisoToolbar {...props({ waitingCount: 2 })} />);
    expect(screen.getByTestId("oriso-waiting-badge").textContent).toBe("2");
    expect(screen.getByTestId("incall_menu").getAttribute("aria-label")).toBe(
      "Call menu, 2 waiting",
    );
    fireEvent.click(screen.getByTestId("incall_menu"));
    const row = screen
      .getByTestId("oriso-call-menu")
      .querySelector('[data-entry="participants"]');
    expect(row?.textContent).toContain("2 waiting");
  });

  it("offers the Anklopfen switch with the host's setting", () => {
    const onKnockChange = vi.fn();
    render(<OrisoToolbar {...props({ knock: true, onKnockChange })} />);
    fireEvent.click(screen.getByTestId("incall_menu"));
    const knock = screen.getByRole("switch", { name: "Knock first" });
    expect(knock.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(knock);
    expect(onKnockChange).toHaveBeenCalledWith(false);
    // The menu stays open, so the person sees the switch flip.
    expect(screen.getByTestId("oriso-call-menu")).toBeTruthy();
  });

  it("has no accessibility violations with the badge and the switch", async () => {
    const { container } = render(
      <OrisoToolbar
        {...props({ waitingCount: 1, knock: false, onKnockChange: vi.fn() })}
      />,
    );
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("the laser pointer switch (#2233)", () => {
  it("is not there while nobody else shares a screen", () => {
    render(<OrisoToolbar {...props()} />);
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(screen.queryByTestId("oriso-pointer-switch")).toBeNull();
  });

  it("turns pointing on, says what it does, and closes the menu", () => {
    const onPointingChange = vi.fn();
    render(<OrisoToolbar {...props({ pointing: false, onPointingChange })} />);
    fireEvent.click(screen.getByTestId("incall_menu"));
    const pointer = screen.getByRole("switch", { name: "Laser pointer" });
    expect(pointer.getAttribute("aria-checked")).toBe("false");
    expect(pointer.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(pointer);
    expect(onPointingChange).toHaveBeenCalledWith(true);
    // Closed: the next thing the person does is point at the screen.
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();
  });

  it("says that nothing can be clicked while it is on", () => {
    render(
      <OrisoToolbar
        {...props({ pointing: true, onPointingChange: vi.fn() })}
      />,
    );
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(screen.getByTestId("oriso-call-menu").textContent).toContain(
      "Nothing can be clicked.",
    );
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <OrisoToolbar
        {...props({ pointing: false, onPointingChange: vi.fn() })}
      />,
    );
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

/*
 * S9, designs 5b/5d: the phone's bar holds four or five buttons — the
 * microphone, the camera only in a video call, the hand, the notes and the
 * hang-up at its end. The ⋮ lives in the header there.
 */
describe("the phone's control bar (S9)", () => {
  it("holds microphone, camera, hand, notes and the hang-up in a video call", () => {
    render(
      <OrisoToolbar {...props({ compact: true, screenShareInBar: true })} />,
    );
    expect(barButtons()).toEqual([
      "incall_mute",
      "incall_videomute",
      "incall_raise_hand",
      "incall_notes",
      "incall_leave",
    ]);
  });

  it("holds four in an audio call: no camera, no ⋮", () => {
    render(<OrisoToolbar {...props({ compact: true, showVideo: false })} />);
    expect(barButtons()).toEqual([
      "incall_mute",
      "incall_raise_hand",
      "incall_notes",
      "incall_leave",
    ]);
  });

  it("keeps the hang-up's word as its name", () => {
    render(<OrisoToolbar {...props({ compact: true })} />);
    expect(screen.getByTestId("incall_leave")).toHaveAccessibleName(/hang up/i);
  });
});

describe("the call menu in a phone's header (S9)", () => {
  const menuProps = (
    overrides: Partial<ComponentProps<typeof OrisoMobileMenu>> = {},
  ): ComponentProps<typeof OrisoMobileMenu> => {
    const {
      audioMuted: _a,
      onToggleAudio: _b,
      videoMuted: _c,
      onToggleVideo: _d,
      handRaised: _e,
      onToggleHand: _f,
      ...menu
    } = props();
    return { ...menu, ...overrides };
  };

  it("holds the view rail and the usual entries", () => {
    const onChange = vi.fn();
    render(
      <OrisoMobileMenu
        {...menuProps({
          views: {
            offer: ["kreis", "hain", "felder", "kacheln", "spotlight"],
            active: "kreis",
            onChange,
          },
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("oriso-mobile-menu"));
    const menu = screen.getByTestId("oriso-call-menu");
    expect(menu.dataset.placement).toBe("header");
    const rail = within(menu).getByTestId("view-switcher");
    fireEvent.click(within(rail).getAllByRole("radio")[1]);
    expect(onChange).toHaveBeenCalledWith("hain");
    expect(menu.querySelector('[data-entry="leave"]')).not.toBeNull();
  });

  it("stays on a narrow phone's screen beside the host's buttons (#145 review)", () => {
    // jsdom lays nothing out: a 320px phone, the ⋮ ending 112px in from the
    // right edge, a 288px panel. Hung from the ⋮ it would start at -80px.
    const width = window.innerWidth;
    window.innerWidth = 320;
    try {
      render(<OrisoMobileMenu {...menuProps()} />);
      const trigger = screen.getByTestId("oriso-mobile-menu");
      fireEvent.click(trigger);
      const menu = screen.getByTestId("oriso-call-menu");
      let triggerRight = 208;
      trigger.getBoundingClientRect = (): DOMRect =>
        ({ right: triggerRight }) as DOMRect;
      menu.getBoundingClientRect = (): DOMRect => ({ width: 288 }) as DOMRect;
      fireEvent(window, new Event("resize"));
      // Slid right by 96px: 16px free on the left, 16px on the right.
      expect(menu.style.right).toBe("-96px");
      // Wide enough: it hangs from the ⋮ as before.
      triggerRight = 1024 - 112;
      window.innerWidth = 1024;
      fireEvent(window, new Event("resize"));
      expect(menu.style.right).toBe("");
    } finally {
      window.innerWidth = width;
    }
  });

  it("sends Schweben while full screen and Vollbild while floating", () => {
    const onToggleWindow = vi.fn();
    const { rerender } = render(
      <OrisoMobileMenu {...menuProps({ onToggleWindow, fullscreen: true })} />,
    );
    fireEvent.click(screen.getByTestId("oriso-mobile-menu"));
    fireEvent.click(screen.getByRole("button", { name: "Float" }));
    expect(onToggleWindow).toHaveBeenCalledOnce();
    rerender(
      <OrisoMobileMenu {...menuProps({ onToggleWindow, fullscreen: false })} />,
    );
    fireEvent.click(screen.getByTestId("oriso-mobile-menu"));
    expect(
      screen.getByRole("button", { name: "Full screen" }),
    ).toBeInTheDocument();
  });

  it("shows who is waiting on the ⋮", () => {
    render(<OrisoMobileMenu {...menuProps({ waitingCount: 2 })} />);
    expect(screen.getByTestId("oriso-waiting-badge")).toHaveTextContent("2");
  });
});
