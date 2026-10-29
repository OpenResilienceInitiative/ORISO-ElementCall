/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The model behind "Meine Gesprächsnotiz" (#112). Private is the feature:
 * notes live in the call window's memory and end with the call. Copying is
 * the only way out (handoff ticket 06).
 */

/** Exactly three types, the whole taxonomy. Frage is the default. */
export const NOTE_KINDS = ["frage", "anmerkung", "aufgabe"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  /** Call time when it was written, as the design shows it: "3:12". */
  time: string;
  done: boolean;
}

const two = (n: number): string => String(n).padStart(2, "0");

export function callTime(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The same list when the draft is empty, so nothing re-renders for it. */
export function addNote(
  notes: readonly Note[],
  kind: NoteKind,
  draft: string,
  elapsedMs: number,
): Note[] {
  const text = draft.trim();
  if (!text) return notes as Note[];
  const id = notes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
  return [...notes, { id, kind, text, time: callTime(elapsedMs), done: false }];
}

export function toggleDone(notes: readonly Note[], id: number): Note[] {
  return notes.map((n) => (n.id === id ? { ...n, done: !n.done } : n));
}

/** Plain text a counsellor can paste into a case file: one line per note. */
export function notesAsText(
  notes: readonly Note[],
  labels: Record<NoteKind, string>,
): string {
  return notes.map((n) => `[${labels[n.kind]} ${n.time}] ${n.text}`).join("\n");
}
