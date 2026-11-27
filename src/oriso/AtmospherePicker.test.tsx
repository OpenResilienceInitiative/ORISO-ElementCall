/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type FC, useState } from "react";

import { AtmospherePicker } from "./AtmospherePicker";
import { ATMOSPHERE_NAMES } from "./Atmosphere";
import {
  type AtmosphereChoice,
  DARK_ATMOSPHERES,
  readAtmosphereChoice,
  resolveAtmosphere,
} from "./atmosphereChoice";
import { readNameStyle } from "./nameStyle";

describe("the atmosphere a person chooses (S5)", () => {
  it("defaults to the carrier's motif", () => {
    expect(readAtmosphereChoice(null)).toBe("traeger");
    expect(readAtmosphereChoice("not-a-motif")).toBe("traeger");
    expect(resolveAtmosphere("traeger", "lichtung")).toBe("lichtung");
  });

  it("falls back to the handoff's default when the carrier set nothing usable", () => {
    expect(resolveAtmosphere("traeger", null)).toBe("fluss");
    expect(resolveAtmosphere("traeger", "nonsense")).toBe("fluss");
  });

  it("lets the person's own choice win over the carrier's", () => {
    expect(readAtmosphereChoice("glut")).toBe("glut");
    expect(resolveAtmosphere("glut", "lichtung")).toBe("glut");
  });

  it("gives the carrier's light motif its dark counterpart in dark mode (FE#1134)", () => {
    expect(resolveAtmosphere("traeger", "fluss", "dark")).toBe("nacht");
    expect(resolveAtmosphere("traeger", null, "dark")).toBe("nacht");
    expect(resolveAtmosphere("traeger", "fluss", "light")).toBe("fluss");
    expect(resolveAtmosphere("traeger", "fluss")).toBe("fluss");
  });

  it("keeps a dark carrier motif and the person's own choice in dark mode", () => {
    expect(resolveAtmosphere("traeger", "lagerfeuer", "dark")).toBe(
      "lagerfeuer",
    );
    expect(resolveAtmosphere("glut", "fluss", "dark")).toBe("glut");
  });

  it("lists exactly the motifs pond.js marks as dark", () => {
    const pond = readFileSync(resolve(__dirname, "pond.js"), "utf8");
    const dark = ATMOSPHERE_NAMES.filter((name) =>
      new RegExp(`\\n\\t${name}: \\{[^}]*?dark: true`).test(pond),
    );
    expect([...DARK_ATMOSPHERES].sort()).toEqual([...dark].sort());
  });

  it("reads the name style, capsule by default", () => {
    expect(readNameStyle(null)).toBe("popout");
    expect(readNameStyle("dezent")).toBe("dezent");
    expect(readNameStyle("x")).toBe("popout");
  });
});

const Harness: FC<{ onChoose: (c: AtmosphereChoice) => void }> = ({
  onChoose,
}) => {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<AtmosphereChoice>("traeger");
  return (
    <AtmospherePicker
      choice={choice}
      current={resolveAtmosphere(choice, "fluss")}
      onChoose={(c) => {
        setChoice(c);
        onChoose(c);
      }}
      open={open}
      onOpenChange={setOpen}
    />
  );
};

describe("the atmosphere popover", () => {
  it("offers every motif and the carrier's, with the design's sentence", () => {
    render(<Harness onChoose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("oriso-atmosphere-button"));
    const popover = screen.getByTestId("oriso-atmosphere-popover");
    expect(popover.querySelectorAll("[data-motif]")).toHaveLength(
      ATMOSPHERE_NAMES.length + 1,
    );
    expect(popover.textContent).toContain("You choose what does you good.");
    expect(
      popover
        .querySelector('[data-motif="traeger"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("chooses a motif and keeps the popover open to compare", () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    fireEvent.click(screen.getByTestId("oriso-atmosphere-button"));
    fireEvent.click(
      screen
        .getByTestId("oriso-atmosphere-popover")
        .querySelector('[data-motif="nacht"]')!,
    );
    expect(onChoose).toHaveBeenCalledWith("nacht");
    expect(
      screen
        .getByTestId("oriso-atmosphere-popover")
        .querySelector('[data-motif="nacht"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("closes on Escape and on a click elsewhere", () => {
    render(<Harness onChoose={vi.fn()} />);
    const button = screen.getByTestId("oriso-atmosphere-button");
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByTestId("oriso-atmosphere-popover"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("oriso-atmosphere-popover")).toBeNull();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("oriso-atmosphere-popover")).toBeNull();
  });
});
