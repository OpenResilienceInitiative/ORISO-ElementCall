/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The Schmierzettel inside the call (#112), built from the approved design
 * (G-Aktionen, H-Menü): title and copy, the field with its type buttons, the
 * filter menu, the note cards, Markdown out and in.
 */
import { type ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { OrisoNotes } from "./OrisoNotes";
import styles from "./OrisoNotes.module.css";

const props = (
  overrides: Partial<ComponentProps<typeof OrisoNotes>> = {},
): ComponentProps<typeof OrisoNotes> => ({
  open: true,
  onClose: vi.fn(),
  layout: "docked",
  compact: false,
  ...overrides,
});

const field = (): HTMLInputElement =>
  screen.getByPlaceholderText("Write a note…");

const type = (text: string): void => {
  fireEvent.change(field(), { target: { value: text } });
};

const write = (text: string): void => {
  type(text);
  fireEvent.keyDown(field(), { key: "Enter" });
};

/** The type buttons; the send arrow carries the last one's name as well. */
const typeButton = (kind: string): HTMLElement =>
  within(screen.getByRole("group", { name: "Send right away as" })).getByRole(
    "button",
    { name: `Send as ${kind}` },
  );

const sendAs = (kind: string, text: string): void => {
  type(text);
  fireEvent.click(typeButton(kind));
};

const openMenu = (): HTMLElement => {
  fireEvent.click(screen.getByRole("button", { name: /^Filter notes/ }));
  return screen.getByRole("dialog", { name: "Filter by type" });
};

const pickFilter = (name: string): void => {
  const menu = openMenu();
  fireEvent.click(within(menu).getByRole("radio", { name }));
};

const cards = (): HTMLElement[] => screen.queryAllByRole("listitem");

const setClipboard = (clipboard: Partial<Clipboard> | undefined): void => {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  setClipboard(undefined);
});

describe("the Schmierzettel's card (#112)", () => {
  it("shows the design's card: title, copy pill, info line, field", () => {
    render(<OrisoNotes {...props()} />);
    const card = screen.getByRole("region", { name: "Scratchpad" });
    expect(card.classList).toContain(styles.docked);
    within(card).getByRole("button", { name: "Copy as text" });
    // 2a draws the × beside "Als Text kopieren" on the docked card too (S5).
    expect(within(card).getByRole("button", { name: "Close" })).toBeTruthy();
    within(card).getByText(
      "Only I can see this · Deleted when you leave the call",
    );
    within(card).getByText("Nothing noted yet.");
  });

  it("is a light-theme boundary inside the dark call", () => {
    // The call body carries cpd-theme-dark; the card's light surface must
    // resolve the light `--cpd-*` tokens, or its text turns near-white.
    document.body.classList.add("cpd-theme-dark");
    try {
      render(<OrisoNotes {...props()} />);
      const card = screen.getByRole("region", { name: "Scratchpad" });
      expect(card.classList).toContain("cpd-theme-light");
    } finally {
      document.body.classList.remove("cpd-theme-dark");
    }
  });

  it("opens in the view as a card, and compact on a phone", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <OrisoNotes {...props({ layout: "sheet", onClose })} />,
    );
    const card = screen.getByRole("region", { name: "Scratchpad" });
    expect(card.classList).toContain(styles.sheet);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<OrisoNotes {...props({ layout: "sheet", compact: true })} />);
    expect(card.classList).toContain(styles.compact);
    // The phone card keeps the copy as an icon with its name.
    expect(
      screen.getByRole("button", { name: "Copy as text" }).textContent,
    ).toBe("");
  });

  it("keeps the notes, the filter and the type while it is closed", () => {
    const { rerender } = render(<OrisoNotes {...props()} />);
    sendAs("Task", "Call back");
    rerender(<OrisoNotes {...props({ open: false })} />);
    expect(screen.queryByRole("region", { name: "Scratchpad" })).toBeNull();
    rerender(<OrisoNotes {...props()} />);
    screen.getByText("Call back");
  });

  it("keeps nothing in storage: it ends with the call", () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    render(<OrisoNotes {...props()} />);
    write("Private");
    sendAs("Task", "Also private");
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});

describe("writing and sending", () => {
  it("sends as the last type on Enter: Question at first", () => {
    render(<OrisoNotes {...props()} />);
    write("Since when?");
    const [card] = cards();
    within(card).getByText("Question");
    within(card).getByText("Since when?");
    expect(field().value).toBe("");
  });

  it("sends at once as the type that is clicked, and keeps it as the last", () => {
    render(<OrisoNotes {...props()} />);
    sendAs("Task", "Send the contact");
    within(cards()[0]).getByText("Task");
    // The next Enter now sends a task.
    write("And the form");
    within(cards()[1]).getByText("Task");
    sendAs("Note", "Remember");
    write("Another");
    within(cards()[3]).getByText("Note");
  });

  it("shows the last type with its word, the others as icons", () => {
    render(<OrisoNotes {...props()} />);
    type("x");
    const asQuestion = typeButton("Question");
    const asTask = typeButton("Task");
    expect(asQuestion.classList).toContain(styles.pillLast);
    expect(asQuestion.textContent).toBe("Question");
    expect(asTask.classList).not.toContain(styles.pillLast);
    expect(asTask.textContent).toBe("");
    fireEvent.click(asTask);
    type("y");
    expect(typeButton("Task").textContent).toBe("Task");
  });

  it("offers the send arrow only for typed text, and has none for spaces", () => {
    render(<OrisoNotes {...props()} />);
    const arrow = (): HTMLElement | null =>
      screen
        .queryAllByRole("button", { name: "Send as Question" })
        .find((b) => b.classList.contains(styles.send)) ?? null;
    expect(arrow()).toBeNull();
    type("   ");
    expect(arrow()).toBeNull();
    type("Hello");
    fireEvent.click(arrow()!);
    expect(cards()).toHaveLength(1);
    expect(arrow()).toBeNull();
  });

  it("disables the type buttons until there is text", () => {
    render(<OrisoNotes {...props()} />);
    for (const name of ["Question", "Task", "Note"]) {
      expect(typeButton(name)).toBeDisabled();
    }
    type("x");
    for (const name of ["Question", "Task", "Note"]) {
      expect(typeButton(name)).toBeEnabled();
    }
  });

  it("waits for an input method to finish before Enter sends", () => {
    render(<OrisoNotes {...props()} />);
    type("いつから");
    // Enter that confirms a Japanese or Chinese candidate is not a submit.
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
    expect(cards()).toHaveLength(0);
    expect(field().value).toBe("いつから");
    fireEvent.keyDown(field(), { key: "Enter" });
    within(cards()[0]).getByText("いつから");
  });
});

describe("a note's card", () => {
  it("is ticked done by its tag: struck through, not deleted", () => {
    render(<OrisoNotes {...props()} />);
    write("Since when?");
    const tag = screen.getByRole("button", {
      name: "Question: mark as done",
    });
    expect(tag).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(tag);
    expect(tag).toHaveAttribute("aria-pressed", "true");
    expect(cards()[0].dataset.done).toBe("true");
    fireEvent.click(tag);
    expect(cards()[0].dataset.done).toBeUndefined();
  });

  it("deletes a note from its own button", () => {
    render(<OrisoNotes {...props()} />);
    write("a");
    write("b");
    fireEvent.click(within(cards()[0]).getByRole("button", { name: "Delete" }));
    expect(cards().map((c) => c.textContent)).toEqual([
      expect.stringContaining("b"),
    ]);
  });

  it("moves up and down, and cannot at the ends", () => {
    render(<OrisoNotes {...props()} />);
    write("first");
    write("second");
    expect(
      within(cards()[0]).getByRole("button", { name: "Move up" }),
    ).toBeDisabled();
    expect(
      within(cards()[1]).getByRole("button", { name: "Move down" }),
    ).toBeDisabled();
    fireEvent.click(
      within(cards()[0]).getByRole("button", { name: "Move down" }),
    );
    expect(cards()[0].textContent).toContain("second");
    expect(cards()[1].textContent).toContain("first");
  });

  it("folds a long text to four lines behind 'Show more'", () => {
    render(<OrisoNotes {...props()} />);
    write("x".repeat(160));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    write("y".repeat(161));
    const more = screen.getByRole("button", { name: "Show more" });
    const text = within(cards()[1]).getByText("y".repeat(161));
    expect(text.classList).toContain(styles.clamp);
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(text.classList).not.toContain(styles.clamp);
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(text.classList).toContain(styles.clamp);
  });
});

describe("the filter menu", () => {
  it("is the shared menu: kicker, heading, four types, then the import", () => {
    render(<OrisoNotes {...props()} />);
    const menu = openMenu();
    within(menu).getByText("Narrow the view");
    within(menu).getByRole("heading", { name: "Filter by type" });
    expect(
      within(menu)
        .getAllByRole("radio")
        .map((i) => i.textContent),
    ).toEqual(["All", "Notes", "Questions", "Tasks"]);
    within(menu).getByRole("button", { name: /Paste from clipboard/ });
    expect(
      screen.getByRole("button", { name: "Filter notes" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("starts on 'All' and has no dot", () => {
    render(<OrisoNotes {...props()} />);
    const menu = openMenu();
    expect(within(menu).getByRole("radio", { name: "All" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.querySelector(`.${styles.dot}`)).toBeNull();
  });

  it("narrows the list to a type, keeps it, and shows a dot", () => {
    render(<OrisoNotes {...props()} />);
    sendAs("Task", "t1");
    sendAs("Question", "q1");
    sendAs("Note", "n1");
    pickFilter("Questions");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cards().map((c) => c.textContent)).toEqual([
      expect.stringContaining("q1"),
    ]);
    expect(document.querySelector(`.${styles.dot}`)).not.toBeNull();
    // Still chosen when the menu is opened again.
    const menu = openMenu();
    expect(
      within(menu).getByRole("radio", { name: "Questions" }),
    ).toHaveAttribute("aria-checked", "true");
    // And the button says so to a screen reader.
    screen.getByRole("button", { name: "Filter notes – active: Questions" });
  });

  it("says so when the filter shows nothing", () => {
    render(<OrisoNotes {...props()} />);
    write("a question");
    pickFilter("Tasks");
    screen.getByText("No tasks yet.");
  });

  it("goes back to 'All' when a note is sent as another type", () => {
    render(<OrisoNotes {...props()} />);
    sendAs("Question", "q1");
    pickFilter("Questions");
    sendAs("Question", "q2");
    expect(cards()).toHaveLength(2);
    sendAs("Task", "t1");
    // Sent as a task under "Questions": the filter drops, the note is there.
    expect(cards()).toHaveLength(3);
    expect(document.querySelector(`.${styles.dot}`)).toBeNull();
  });

  it("moves within the filter: a hidden neighbour is skipped", () => {
    render(<OrisoNotes {...props()} />);
    sendAs("Question", "q1");
    sendAs("Task", "t1");
    sendAs("Question", "q2");
    pickFilter("Questions");
    fireEvent.click(
      within(cards()[0]).getByRole("button", { name: "Move down" }),
    );
    pickFilter("All");
    expect(
      cards().map((c) => /q\d|t\d/.exec(c.textContent ?? "")?.[0]),
    ).toEqual(["q2", "t1", "q1"]);
  });

  it("closes on Escape and gives the focus back to its button", () => {
    render(<OrisoNotes {...props()} />);
    openMenu();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Filter by type" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Filter notes" }),
    );
  });

  it("closes on a press outside, and not on a press inside", () => {
    render(<OrisoNotes {...props()} />);
    const menu = openMenu();
    fireEvent.pointerDown(menu);
    screen.getByRole("dialog", { name: "Filter by type" });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts the focus on the chosen entry and walks with the arrows", () => {
    render(<OrisoNotes {...props()} />);
    const menu = openMenu();
    const items = Array.from(menu.querySelectorAll<HTMLElement>("button"));
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[4]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[4]);
  });
});

describe("copying Markdown", () => {
  it("copies the whole list as Markdown and says so for a moment", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<OrisoNotes {...props()} />);
    sendAs("Question", "Since when?");
    sendAs("Task", "Send the contact");
    sendAs("Note", "Rent arrears");
    fireEvent.click(
      screen.getByRole("button", { name: "Question: mark as done" }),
    );
    // The filter only changes what is shown; the copy takes everything.
    pickFilter("Tasks");
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(writeText).toHaveBeenCalledWith(
      [
        "## Notes",
        "- Rent arrears",
        "",
        "## Questions",
        "- ~~Since when?~~",
        "",
        "## Tasks",
        "- [ ] Send the contact",
      ].join("\n"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByText("Copied");
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.queryByText("Copied")).toBeNull();
  });

  it("does not touch the clipboard when there is nothing to copy", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<OrisoNotes {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("says so when the browser will not let it copy", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("no")) });
    render(<OrisoNotes {...props()} />);
    write("a");
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByText("Clipboard not available");
    expect(screen.queryByText("Copied")).toBeNull();
  });
});

describe("pasting Markdown", () => {
  const paste = async (clipboardText: string): Promise<void> => {
    setClipboard({ readText: vi.fn().mockResolvedValue(clipboardText) });
    fireEvent.click(
      within(openMenu()).getByRole("button", {
        name: /Paste from clipboard/,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
  };

  it("adds the entries, by their headings, and closes the menu", async () => {
    render(<OrisoNotes {...props()} />);
    write("existing");
    await paste("## Tasks\n- [ ] one\n- [x] two\n## Notes\n- three");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cards().map((c) => c.textContent)).toEqual([
      expect.stringContaining("existing"),
      expect.stringContaining("one"),
      expect.stringContaining("two"),
      expect.stringContaining("three"),
    ]);
    expect(cards()[2].dataset.done).toBe("true");
    expect(cards()[3].dataset.kind).toBe("notiz");
    screen.getByText("3 imported");
  });

  it("reads what the copy wrote", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { unmount } = render(<OrisoNotes {...props()} />);
    sendAs("Task", "Call");
    sendAs("Note", "Remember");
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    const copied = writeText.mock.calls[0][0] as string;
    unmount();
    render(<OrisoNotes {...props()} />);
    await paste(copied);
    expect(cards().map((c) => c.dataset.kind)).toEqual(["notiz", "aufgabe"]);
  });

  it("shows the filter 'All' after an import", async () => {
    render(<OrisoNotes {...props()} />);
    pickFilter("Tasks");
    await paste("- n1");
    expect(cards()).toHaveLength(1);
    expect(document.querySelector(`.${styles.dot}`)).toBeNull();
  });

  it("takes 24 entries and says so about the rest and the long ones", async () => {
    render(<OrisoNotes {...props()} />);
    const rows = Array.from({ length: 26 }, (_, i) =>
      i === 0 ? `- ${"a".repeat(600)}` : `- n${i}`,
    );
    await paste(rows.join("\n"));
    expect(cards()).toHaveLength(24);
    screen.getByText("24 imported · 2 left out (max. 24) · 1 shortened");
  });

  it("says when it found no Markdown, and adds nothing", async () => {
    render(<OrisoNotes {...props()} />);
    await paste("just some prose");
    screen.getByText("No Markdown found");
    expect(cards()).toHaveLength(0);
  });

  it("only says 'not available' when the browser will not read: no fallback field", async () => {
    setClipboard({ readText: vi.fn().mockRejectedValue(new Error("denied")) });
    render(<OrisoNotes {...props()} />);
    const inputsBefore = document.querySelectorAll("input,textarea").length;
    fireEvent.click(
      within(openMenu()).getByRole("button", {
        name: /Paste from clipboard/,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByText("Clipboard not available");
    expect(document.querySelectorAll("input,textarea").length).toBe(
      inputsBefore,
    );
    expect(cards()).toHaveLength(0);
  });

  it("says the same when there is no clipboard API at all", () => {
    setClipboard(undefined);
    render(<OrisoNotes {...props()} />);
    fireEvent.click(
      within(openMenu()).getByRole("button", {
        name: /Paste from clipboard/,
      }),
    );
    screen.getByText("Clipboard not available");
  });

  it("gives the info line back after the notice", async () => {
    render(<OrisoNotes {...props()} />);
    await paste("prose");
    expect(
      screen.queryByText(
        "Only I can see this · Deleted when you leave the call",
      ),
    ).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    screen.getByText("Only I can see this · Deleted when you leave the call");
  });
});

describe("accessibility", () => {
  it("has no violations: closed menu, notes, filter on", async () => {
    vi.useRealTimers();
    const { container } = render(<OrisoNotes {...props()} />);
    write("A question");
    sendAs("Task", "A task");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with the menu open", async () => {
    vi.useRealTimers();
    const { container } = render(<OrisoNotes {...props()} />);
    write("A question");
    openMenu();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("names the buttons that carry only an icon", () => {
    render(<OrisoNotes {...props()} />);
    write("a");
    const card = cards()[0];
    for (const name of ["Move up", "Move down", "Delete"]) {
      expect(within(card).getByRole("button", { name }).textContent).toBe("");
    }
    screen.getByRole("group", { name: "Send right away as" });
  });
});
