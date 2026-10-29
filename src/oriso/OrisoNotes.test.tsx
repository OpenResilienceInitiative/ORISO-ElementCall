/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * "Meine Gesprächsnotiz" inside the call (#112), built 1:1 from the approved
 * design (2a docked, 2b in the view, the compact phone card).
 */
import { type ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { OrisoNotes } from "./OrisoNotes";
import styles from "./OrisoNotes.module.css";

const START = Date.parse("2026-10-29T10:00:00Z");

const props = (
  overrides: Partial<ComponentProps<typeof OrisoNotes>> = {},
): ComponentProps<typeof OrisoNotes> => ({
  open: true,
  onClose: vi.fn(),
  layout: "docked",
  compact: false,
  startedAt: START,
  ...overrides,
});

const write = (text: string): void => {
  const field = screen.getByPlaceholderText("Write a note…");
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(START + 192_000);
});
afterEach(() => vi.useRealTimers());

describe("the call notepad (#112)", () => {
  it("shows the design's card: title, copy pill, lock line, footer", () => {
    render(<OrisoNotes {...props()} />);
    const card = screen.getByRole("region", { name: "My call note" });
    expect(card.classList).toContain(styles.docked);
    within(card).getByRole("button", { name: "Copy as text" });
    // 2a folds from the control bar; only the card in the view has a close.
    expect(within(card).queryByRole("button", { name: "Close" })).toBeNull();
    within(card).getByText("Only you — nobody else in the call sees this");
    within(card).getByText("Temporary — deleted when you leave. Copy first.");
  });

  it("adds a note on Enter with its type and the call time", () => {
    render(<OrisoNotes {...props()} />);
    write("Since when?");
    const row = screen.getByRole("listitem");
    within(row).getByText("Question");
    within(row).getByText("Since when?");
    within(row).getByText("3:12");
    expect(
      (screen.getByPlaceholderText("Write a note…") as HTMLInputElement).value,
    ).toBe("");
  });

  it("waits for an input method to finish before Enter adds", () => {
    render(<OrisoNotes {...props()} />);
    const field = screen.getByPlaceholderText("Write a note…");
    fireEvent.change(field, { target: { value: "いつから" } });
    // Enter that confirms a Japanese or Chinese candidate is not a submit.
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    expect(screen.queryByRole("listitem")).toBeNull();
    expect((field as HTMLInputElement).value).toBe("いつから");
    fireEvent.keyDown(field, { key: "Enter" });
    within(screen.getByRole("listitem")).getByText("いつから");
  });

  it("takes the type from the ⋮ menu: exactly three", () => {
    render(<OrisoNotes {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Type of note" }));
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((i) => i.textContent),
    ).toEqual(["Question", "Remark", "Task"]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Task" }));
    expect(screen.queryByRole("menu")).toBeNull();
    write("Send the contact");
    within(screen.getByRole("listitem")).getByText("Task");
  });

  it("ticks a note done", () => {
    render(<OrisoNotes {...props()} />);
    write("Since when?");
    const box = screen.getByRole("checkbox", { name: "Done" });
    expect(box).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("listitem").dataset.done).toBe("true");
  });

  it("copies the notes as text and says so for a moment", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<OrisoNotes {...props()} />);
    write("Since when?");
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(writeText).toHaveBeenCalledWith("[Question 3:12] Since when?");
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByText("Copied");
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.queryByText("Copied")).toBeNull();
  });

  it("keeps the notes while it is closed", () => {
    const { rerender } = render(<OrisoNotes {...props()} />);
    write("Since when?");
    rerender(<OrisoNotes {...props({ open: false })} />);
    expect(screen.queryByRole("region", { name: "My call note" })).toBeNull();
    rerender(<OrisoNotes {...props()} />);
    screen.getByText("Since when?");
  });

  it("closes the card in the view from its own button", () => {
    const onClose = vi.fn();
    render(<OrisoNotes {...props({ layout: "sheet", onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens in the view as a card, and compact on a phone", () => {
    const { rerender } = render(<OrisoNotes {...props({ layout: "sheet" })} />);
    const card = screen.getByRole("region", { name: "My call note" });
    expect(card.classList).toContain(styles.sheet);
    rerender(<OrisoNotes {...props({ layout: "sheet", compact: true })} />);
    expect(card.classList).toContain(styles.compact);
    // The phone card keeps the copy as an icon with its name.
    expect(
      screen.getByRole("button", { name: "Copy as text" }).textContent,
    ).toBe("");
    screen.getByText("Only you — nobody else sees this");
    screen.getByText("Temporary — copy first.");
  });

  it("has no accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = render(<OrisoNotes {...props()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
