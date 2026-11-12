/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import {
  CheckIcon,
  ListBulletedIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { type NoteFilter, type NoteKind } from "./notes";

/*
 * The three type icons of the Schmierzettel: the design's clipboard for a
 * note, Material Symbols' `question_mark` for a question and `check` for a
 * task. Drawn with `currentColor`; whoever places them sizes them.
 */

/** The design's own clipboard glyph (a note), not a stock icon. */
const NoteClipboardIcon: FC = () => (
  <svg viewBox="13 13 74 74" fill="currentColor" aria-hidden="true">
    <path d="m32 20v8.1914c-5.2148 0.96094-8.9961 5.5078-9 10.809v30c0 6.0742 4.9258 11 11 11h32c6.0742 0 11-4.9258 11-11v-30c-0.003906-5.3008-3.7852-9.8477-9-10.809v-8.1914h-6v8h-9v-8h-6v8h-9v-8zm39 19v30c0 1.3242-0.52734 2.5977-1.4648 3.5352s-2.2109 1.4648-3.5352 1.4648h-32c-2.7617 0-5-2.2383-5-5v-30c0-2.7617 2.2383-5 5-5h32c1.3242 0 2.5977 0.52734 3.5352 1.4648s1.4648 2.2109 1.4648 3.5352z" />
    <path d="m39 44h22v6h-22z" />
    <path d="m39 58h22v6h-22z" />
  </svg>
);

const QuestionMarkIcon: FC = () => (
  <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M424-320q0-81 14.5-116.5T500-514q41-36 62.5-62.5T584-637q0-41-27.5-68T480-732q-51 0-77.5 31T365-638l-103-44q21-64 77-111t141-47q105 0 161.5 58.5T698-641q0 50-21.5 85.5T609-475q-49 47-59.5 71.5T539-320H424Zm56 240q-33 0-56.5-23.5T400-160q0-33 23.5-56.5T480-240q33 0 56.5 23.5T560-160q0 33-23.5 56.5T480-80Z" />
  </svg>
);

/** The icon of a note type, or of "all" (the filter's first entry). */
export const NoteTypeIcon: FC<{ kind: NoteFilter | NoteKind }> = ({ kind }) => {
  switch (kind) {
    case "notiz":
      return <NoteClipboardIcon />;
    case "frage":
      return <QuestionMarkIcon />;
    case "aufgabe":
      return <CheckIcon aria-hidden />;
    case "alle":
      return <ListBulletedIcon aria-hidden />;
  }
};

/** "Paste from the clipboard", stroked like the copy icon beside the title. */
export const PasteIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" />
    <path d="M9 13l3 3 3-3M12 9v7" />
  </svg>
);

/** The arrow of the send button. */
export const SendIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
