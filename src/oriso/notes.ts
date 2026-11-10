/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The model behind the Schmierzettel (#112, formerly "Meine Gesprächsnotiz").
 * Private is the feature: notes live in the call window's memory and end with
 * the call. Copying Markdown is the way out, pasting Markdown the way in —
 * nothing else crosses the window's edge.
 */

/** Exactly three types, the whole taxonomy. */
export const NOTE_KINDS = ["notiz", "frage", "aufgabe"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** What the list can be narrowed to: everything, or one type. */
export const NOTE_FILTERS = ["alle", ...NOTE_KINDS] as const;
export type NoteFilter = (typeof NOTE_FILTERS)[number];

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  done: boolean;
}

/** The headings of the copied Markdown, one per type, in the user's language. */
export type NoteHeadings = Record<NoteKind, string>;

/** A pasted import takes at most this many entries ... */
export const IMPORT_MAX_ENTRIES = 24;
/** ... and at most this many characters of each, cut with an ellipsis. */
export const IMPORT_MAX_LENGTH = 500;

const nextId = (notes: readonly Note[]): number =>
  notes.reduce((max, n) => Math.max(max, n.id), 0) + 1;

/** The same list when the draft is empty, so nothing re-renders for it. */
export function addNote(
  notes: readonly Note[],
  kind: NoteKind,
  draft: string,
): Note[] {
  const text = draft.trim();
  if (!text) return notes as Note[];
  return [...notes, { id: nextId(notes), kind, text, done: false }];
}

export function toggleDone(notes: readonly Note[], id: number): Note[] {
  return notes.map((n) => (n.id === id ? { ...n, done: !n.done } : n));
}

export function removeNote(notes: readonly Note[], id: number): Note[] {
  return notes.filter((n) => n.id !== id);
}

const matches = (n: Note, filter: NoteFilter): boolean =>
  filter === "alle" || n.kind === filter;

/** What the list shows under a filter; the same array for "alle". */
export function visibleNotes(
  notes: readonly Note[],
  filter: NoteFilter,
): Note[] {
  return filter === "alle"
    ? (notes as Note[])
    : notes.filter((n) => matches(n, filter));
}

/**
 * Swaps a note with its next neighbour that the filter shows, so a move is
 * always something the person can see. The same array when there is none.
 */
export function moveNote(
  notes: readonly Note[],
  id: number,
  direction: -1 | 1,
  filter: NoteFilter,
): Note[] {
  const from = notes.findIndex((n) => n.id === id);
  if (from < 0) return notes as Note[];
  let to = from + direction;
  while (to >= 0 && to < notes.length && !matches(notes[to], filter)) {
    to += direction;
  }
  if (to < 0 || to >= notes.length) return notes as Note[];
  const next = notes.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * The copy: Markdown a counsellor can paste into a case file. One section per
 * type that has notes; done is `~~struck through~~`, or `[x]` for a task.
 * Always the whole list, whatever the filter shows.
 */
export function notesAsMarkdown(
  notes: readonly Note[],
  headings: NoteHeadings,
): string {
  return NOTE_KINDS.flatMap((kind) => {
    const rows = notes.filter((n) => n.kind === kind);
    if (rows.length === 0) return [];
    const lines = rows.map((n) =>
      kind === "aufgabe"
        ? `- [${n.done ? "x" : " "}] ${n.text}`
        : `- ${n.done ? `~~${n.text}~~` : n.text}`,
    );
    return [`## ${headings[kind]}\n${lines.join("\n")}`];
  }).join("\n\n");
}

export interface ParsedEntry {
  kind: NoteKind;
  text: string;
  done: boolean;
}

/** Headings of other people's Markdown that mean the same as ours. */
const HEADING_ALIASES: Record<string, NoteKind> = {
  notizen: "notiz",
  notiz: "notiz",
  notes: "notiz",
  note: "notiz",
  fragen: "frage",
  frage: "frage",
  questions: "frage",
  question: "frage",
  aufgaben: "aufgabe",
  aufgabe: "aufgabe",
  tasks: "aufgabe",
  task: "aufgabe",
};

const HEADING = /^\s*#{1,6}\s*(.+?)\s*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;
const CHECKBOX = /^\[( |x|X)\](?:\s+(.*\S))?$/;
const STRUCK = /^~~(.+)~~$/;

/**
 * Reads a pasted Markdown list. A heading decides the type of what follows;
 * without any heading a list is notes, and a `[ ]` item is a task. Headings
 * it does not know and lines that are no list items are ignored.
 */
export function parseMarkdown(
  text: string,
  headings: NoteHeadings,
): ParsedEntry[] {
  const known = new Map<string, NoteKind>(Object.entries(HEADING_ALIASES));
  NOTE_KINDS.forEach((k) => known.set(headings[k].trim().toLowerCase(), k));
  let kind: NoteKind = "notiz";
  let underHeading = false;
  const out: ParsedEntry[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const heading = HEADING.exec(line);
    if (heading) {
      const found = known.get(heading[1].toLowerCase());
      if (found) {
        kind = found;
        underHeading = true;
      }
      return;
    }
    const bullet = BULLET.exec(line);
    if (!bullet) return;
    let body = bullet[1];
    let done = false;
    let boxed = false;
    const box = CHECKBOX.exec(body);
    if (box) {
      if (!box[2]) return;
      boxed = true;
      done = box[1] !== " ";
      body = box[2];
    }
    const struck = STRUCK.exec(body);
    if (struck) {
      body = struck[1];
      done = true;
    }
    out.push({
      kind: !underHeading && boxed ? "aufgabe" : kind,
      text: body,
      done,
    });
  });
  return out;
}

export interface ImportResult {
  notes: Note[];
  /** Entries added. */
  imported: number;
  /** Entries left out because the import takes `IMPORT_MAX_ENTRIES`. */
  skipped: number;
  /** Entries that were cut to `IMPORT_MAX_LENGTH`. */
  truncated: number;
}

/** Cuts by characters, not UTF-16 units, so an emoji is never split. */
function clip(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= IMPORT_MAX_LENGTH) return text;
  return `${chars
    .slice(0, IMPORT_MAX_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

/**
 * Appends what a pasted Markdown holds, within the limits. Nothing readable
 * in it: the same list and `imported: 0`.
 */
export function importNotes(
  notes: readonly Note[],
  markdown: string,
  headings: NoteHeadings,
): ImportResult {
  const all = parseMarkdown(markdown, headings);
  if (all.length === 0) {
    return { notes: notes as Note[], imported: 0, skipped: 0, truncated: 0 };
  }
  const taken = all.slice(0, IMPORT_MAX_ENTRIES);
  let truncated = 0;
  const first = nextId(notes);
  const added = taken.map((entry, i): Note => {
    const text = clip(entry.text);
    if (text !== entry.text) truncated++;
    return { id: first + i, kind: entry.kind, text, done: entry.done };
  });
  return {
    notes: [...notes, ...added],
    imported: added.length,
    skipped: all.length - taken.length,
    truncated,
  };
}
