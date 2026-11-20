/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The Schmierzettel (#112, "Meine Gesprächsnotiz"), the model behind the
 * card: what a note is, how the list is filtered and reordered, and the two
 * ways across the window's edge — the copied Markdown and the pasted one.
 */
import { describe, expect, it } from "vitest";

import {
  addNote,
  importNotes,
  IMPORT_MAX_ENTRIES,
  IMPORT_MAX_LENGTH,
  moveNote,
  NOTE_FILTERS,
  NOTE_KINDS,
  notesAsMarkdown,
  parseMarkdown,
  removeNote,
  toggleDone,
  visibleNotes,
  type Note,
} from "./notes";

const headings = { notiz: "Notizen", frage: "Fragen", aufgabe: "Aufgaben" };

const note = (
  id: number,
  kind: Note["kind"],
  text: string,
  done = false,
): Note => ({ id, kind, text, done });

describe("the Schmierzettel's notes (#112)", () => {
  it("knows exactly three types and the filter for all of them", () => {
    expect(NOTE_KINDS).toEqual(["notiz", "frage", "aufgabe"]);
    expect(NOTE_FILTERS).toEqual(["alle", "notiz", "frage", "aufgabe"]);
  });

  it("adds a trimmed note at the end and ignores an empty one", () => {
    const one = addNote([], "frage", "  Seit wann?  ");
    expect(one).toEqual([
      { id: 1, kind: "frage", text: "Seit wann?", done: false },
    ]);
    expect(addNote(one, "aufgabe", "   ")).toBe(one);
    const two = addNote(one, "aufgabe", "Kontakt schicken");
    expect(two.map((n) => n.text)).toEqual(["Seit wann?", "Kontakt schicken"]);
    expect(new Set(two.map((n) => n.id)).size).toBe(2);
  });

  it("never gives a new note the id of one still in the list", () => {
    const three = addNote(
      addNote(addNote([], "notiz", "a"), "notiz", "b"),
      "notiz",
      "c",
    );
    const gap = removeNote(three, 1);
    expect(new Set(addNote(gap, "notiz", "d").map((n) => n.id)).size).toBe(3);
  });

  it("ticks a note done and back, and deletes it", () => {
    const notes = addNote([], "frage", "A");
    const id = notes[0].id;
    expect(toggleDone(notes, id)[0].done).toBe(true);
    expect(toggleDone(toggleDone(notes, id), id)[0].done).toBe(false);
    expect(removeNote(notes, id)).toEqual([]);
  });

  describe("filtering and reordering", () => {
    const all = [
      note(1, "notiz", "n1"),
      note(2, "frage", "f1"),
      note(3, "aufgabe", "a1"),
      note(4, "frage", "f2"),
    ];

    it("shows every note for 'alle', one type for the others", () => {
      expect(visibleNotes(all, "alle")).toBe(all);
      expect(visibleNotes(all, "frage").map((n) => n.text)).toEqual([
        "f1",
        "f2",
      ]);
    });

    it("moves a note one place up or down in the whole list", () => {
      expect(moveNote(all, 2, -1, "alle").map((n) => n.id)).toEqual([
        2, 1, 3, 4,
      ]);
      expect(moveNote(all, 2, 1, "alle").map((n) => n.id)).toEqual([
        1, 3, 2, 4,
      ]);
    });

    it("skips the notes the filter hides, so a move is visible", () => {
      // Under "Fragen" the neighbour of f1 is f2, with a task in between.
      expect(moveNote(all, 2, 1, "frage").map((n) => n.id)).toEqual([
        1, 4, 3, 2,
      ]);
      expect(moveNote(all, 4, -1, "frage").map((n) => n.id)).toEqual([
        1, 4, 3, 2,
      ]);
    });

    it("stays put at the ends, and for an unknown id", () => {
      expect(moveNote(all, 1, -1, "alle")).toBe(all);
      expect(moveNote(all, 4, 1, "alle")).toBe(all);
      expect(moveNote(all, 2, -1, "frage")).toBe(all);
      expect(moveNote(all, 99, 1, "alle")).toBe(all);
    });
  });

  describe("the copied Markdown", () => {
    it("groups by type with a heading, Notizen, Fragen, Aufgaben", () => {
      const notes = [
        note(1, "frage", "Ist eine Ratenzahlung möglich?"),
        note(2, "notiz", "Mietrückstand seit Mai"),
        note(3, "aufgabe", "Termin anfragen"),
        note(4, "notiz", "Zweite Notiz"),
      ];
      expect(notesAsMarkdown(notes, headings)).toBe(
        [
          "## Notizen",
          "- Mietrückstand seit Mai",
          "- Zweite Notiz",
          "",
          "## Fragen",
          "- Ist eine Ratenzahlung möglich?",
          "",
          "## Aufgaben",
          "- [ ] Termin anfragen",
        ].join("\n"),
      );
    });

    it("marks done notes: ~~strikethrough~~, tasks as [x]", () => {
      const notes = [
        note(1, "notiz", "Erledigt", true),
        note(2, "aufgabe", "Gemacht", true),
        note(3, "aufgabe", "Offen"),
      ];
      expect(notesAsMarkdown(notes, headings)).toBe(
        [
          "## Notizen",
          "- ~~Erledigt~~",
          "",
          "## Aufgaben",
          "- [x] Gemacht",
          "- [ ] Offen",
        ].join("\n"),
      );
    });

    it("leaves out a type with no notes, and is empty without notes", () => {
      expect(notesAsMarkdown([note(1, "frage", "A")], headings)).toBe(
        "## Fragen\n- A",
      );
      expect(notesAsMarkdown([], headings)).toBe("");
    });
  });

  describe("reading Markdown back", () => {
    it("reads what the copy writes, in any language it was written in", () => {
      const notes = [
        note(1, "notiz", "Erledigt", true),
        note(2, "frage", "Seit wann?"),
        note(3, "aufgabe", "Gemacht", true),
        note(4, "aufgabe", "Offen"),
      ];
      const french = { notiz: "Notes", frage: "Questions", aufgabe: "Tâches" };
      for (const h of [headings, french]) {
        expect(
          parseMarkdown(notesAsMarkdown(notes, h), french).map(
            ({ kind, text, done }) => ({ kind, text, done }),
          ),
        ).toEqual(notes.map(({ kind, text, done }) => ({ kind, text, done })));
      }
    });

    it("lets the heading decide the type, in German or English", () => {
      const md =
        "# Fragen\n- a\n## tasks\n* b\n### NOTES\n+ c\n#### Aufgabe\n1. d";
      expect(parseMarkdown(md, headings).map((e) => e.kind)).toEqual([
        "frage",
        "aufgabe",
        "notiz",
        "aufgabe",
      ]);
    });

    it("takes a list without a heading as notes", () => {
      expect(parseMarkdown("- eins\n- zwei", headings)).toEqual([
        { kind: "notiz", text: "eins", done: false },
        { kind: "notiz", text: "zwei", done: false },
      ]);
    });

    it("takes a [ ] without a heading as a task, [x] as a done one", () => {
      expect(
        parseMarkdown("- [ ] offen\n- [x] fertig\n- [X] auch", headings),
      ).toEqual([
        { kind: "aufgabe", text: "offen", done: false },
        { kind: "aufgabe", text: "fertig", done: true },
        { kind: "aufgabe", text: "auch", done: true },
      ]);
    });

    it("keeps the heading's type for a [ ] below a heading", () => {
      expect(
        parseMarkdown("## Fragen\n- [ ] doch eine Frage", headings),
      ).toEqual([{ kind: "frage", text: "doch eine Frage", done: false }]);
    });

    it("reads ~~text~~ as done and drops the marks", () => {
      expect(parseMarkdown("- ~~weg~~\n- ~~ nicht ganz", headings)).toEqual([
        { kind: "notiz", text: "weg", done: true },
        { kind: "notiz", text: "~~ nicht ganz", done: false },
      ]);
    });

    it("ignores headings it does not know and lines that are no list", () => {
      const md = "## Irgendwas\nFließtext\n- Punkt\n\n---\n";
      expect(parseMarkdown(md, headings)).toEqual([
        { kind: "notiz", text: "Punkt", done: false },
      ]);
    });

    it("reads Windows line endings and indented bullets", () => {
      expect(
        parseMarkdown("## Fragen\r\n  - a\r\n\t- b\r\n", headings),
      ).toEqual([
        { kind: "frage", text: "a", done: false },
        { kind: "frage", text: "b", done: false },
      ]);
    });

    it("skips an empty bullet and finds nothing in plain prose", () => {
      expect(parseMarkdown("- \n- [ ] \nhallo", headings)).toEqual([]);
      expect(parseMarkdown("", headings)).toEqual([]);
    });
  });

  describe("importing", () => {
    it("appends the entries after the existing notes, ids unique", () => {
      const existing = [note(5, "frage", "alt")];
      const r = importNotes(existing, "## Aufgaben\n- [ ] neu", headings);
      expect(r.imported).toBe(1);
      expect(r.notes.map((n) => n.text)).toEqual(["alt", "neu"]);
      expect(r.notes[1]).toEqual({
        id: 6,
        kind: "aufgabe",
        text: "neu",
        done: false,
      });
    });

    it("takes at most 24 entries and says how many it left out", () => {
      expect(IMPORT_MAX_ENTRIES).toBe(24);
      const md = Array.from({ length: 30 }, (_, i) => `- n${i}`).join("\n");
      const r = importNotes([], md, headings);
      expect(r.imported).toBe(24);
      expect(r.skipped).toBe(6);
      expect(r.notes).toHaveLength(24);
      expect(r.notes[23].text).toBe("n23");
    });

    it("cuts an entry to 500 characters, ending in an ellipsis", () => {
      expect(IMPORT_MAX_LENGTH).toBe(500);
      const r = importNotes(
        [],
        `- ${"a".repeat(500)}\n- ${"b".repeat(501)}\n- kurz`,
        headings,
      );
      expect(r.truncated).toBe(1);
      expect(r.notes[0].text).toBe("a".repeat(500));
      expect(r.notes[1].text).toBe(`${"b".repeat(499)}…`);
      expect(r.notes[1].text).toHaveLength(500);
    });

    it("does not cut an emoji in half", () => {
      const r = importNotes([], `- ${"😀".repeat(501)}`, headings);
      expect(r.notes[0].text).toBe(`${"😀".repeat(499)}…`);
    });

    it("changes nothing when there is nothing to read", () => {
      const existing = [note(1, "frage", "alt")];
      const r = importNotes(existing, "Nur Text", headings);
      expect(r).toEqual({
        notes: existing,
        imported: 0,
        skipped: 0,
        truncated: 0,
      });
      expect(r.notes).toBe(existing);
    });
  });
});
