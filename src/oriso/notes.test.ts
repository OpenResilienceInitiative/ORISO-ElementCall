/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * "Meine Gesprächsnotiz" (#112), the model behind the card: what a note is,
 * when it was written, and the one way out — the copied text.
 */
import { describe, expect, it } from "vitest";

import {
  addNote,
  callTime,
  NOTE_KINDS,
  notesAsText,
  toggleDone,
  type Note,
} from "./notes";

const labels = { frage: "Frage", anmerkung: "Anmerkung", aufgabe: "Aufgabe" };

describe("the call notepad's notes (#112)", () => {
  it("knows exactly three types, Frage first", () => {
    expect(NOTE_KINDS).toEqual(["frage", "anmerkung", "aufgabe"]);
  });

  it("stamps a note with the call time, like the design's 3:12", () => {
    expect(callTime(0)).toBe("0:00");
    expect(callTime(192_000)).toBe("3:12");
    expect(callTime(3_723_000)).toBe("1:02:03");
  });

  it("adds a trimmed note at the end and ignores an empty one", () => {
    const one = addNote([], "frage", "  Seit wann?  ", 192_000);
    expect(one).toEqual([
      expect.objectContaining({
        kind: "frage",
        text: "Seit wann?",
        time: "3:12",
        done: false,
      }),
    ]);
    expect(addNote(one, "aufgabe", "   ", 200_000)).toBe(one);
    const two = addNote(one, "aufgabe", "Kontakt schicken", 482_000);
    expect(two.map((n) => n.text)).toEqual(["Seit wann?", "Kontakt schicken"]);
    expect(new Set(two.map((n) => n.id)).size).toBe(2);
  });

  it("ticks a note done and back", () => {
    const notes = addNote([], "frage", "A", 0);
    const id = notes[0].id;
    expect(toggleDone(notes, id)[0].done).toBe(true);
    expect(toggleDone(toggleDone(notes, id), id)[0].done).toBe(false);
  });

  it("copies one line per note as [Type time] text", () => {
    const notes: Note[] = [
      { id: 1, kind: "frage", text: "Seit wann?", time: "3:12", done: false },
      { id: 2, kind: "aufgabe", text: "Kontakt", time: "8:02", done: true },
    ];
    expect(notesAsText(notes, labels)).toBe(
      "[Frage 3:12] Seit wann?\n[Aufgabe 8:02] Kontakt",
    );
  });
});
