/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CSSProperties,
  type FC,
  type KeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  LockSolidIcon,
  OverflowVerticalIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./OrisoNotes.module.css";
import {
  addNote,
  NOTE_KINDS,
  notesAsText,
  toggleDone,
  type Note,
  type NoteKind,
} from "./notes";

/** How long the copy pill says "Kopiert", as in the prototype. */
const COPIED_FOR_MS = 1800;

interface Props {
  /** Measures the card, so the stage can give it room. */
  ref?: Ref<HTMLElement>;
  open: boolean;
  onClose: () => void;
  /**
   * "docked": beside the stage of a group call on a wide screen (design 2a).
   * "sheet": inside the view above the control bar (2b, and narrow screens).
   */
  layout: "docked" | "sheet";
  /** The phone card: icon-only copy, shorter lines. */
  compact: boolean;
  /** When this person joined the call; the notes carry the call time. */
  startedAt: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * "Meine Gesprächsnotiz" (#112), 1:1 from the approved Claude Design
 * ("Dynamische Call-Ansichten", 2a and 2b; handoff ticket 06).
 *
 * Private is the feature: the notes live in this component and nowhere else,
 * for everyone in the call, and end with the call. Copying is the only way
 * out. Closing only hides the card, so the notes survive it.
 */
export const OrisoNotes: FC<Props> = ({
  ref,
  open,
  onClose,
  layout,
  compact,
  startedAt,
  className,
  style,
}) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<NoteKind>("frage");
  const [kindMenuOpen, setKindMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleId = useId();
  const menuId = useId();

  useEffect(() => (): void => clearTimeout(copiedTimer.current), []);

  // Spelled out, so the i18n parser sees every key.
  const kindLabels: Record<NoteKind, string> = {
    frage: t("oriso.notes_kind_frage"),
    anmerkung: t("oriso.notes_kind_anmerkung"),
    aufgabe: t("oriso.notes_kind_aufgabe"),
  };
  const kindLabel = (k: NoteKind): string => kindLabels[k];

  const add = (): void => {
    setNotes((all) => addNote(all, kind, draft, Date.now() - startedAt));
    setDraft("");
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") add();
  };

  const copy = (): void => {
    navigator.clipboard
      ?.writeText(notesAsText(notes, kindLabels))
      .then(() => {
        setCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
      })
      .catch(() => {});
  };

  if (!open) return null;

  const copyName = t("oriso.notes_copy");
  return (
    <section
      ref={ref}
      className={classNames(
        styles.card,
        layout === "docked" ? styles.docked : styles.sheet,
        { [styles.compact]: compact },
        className,
      )}
      style={style}
      aria-labelledby={titleId}
    >
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 id={titleId} className={styles.title}>
            {t("oriso.notes_title")}
          </h2>
          <button
            type="button"
            className={styles.copy}
            onClick={copy}
            aria-label={compact ? copyName : undefined}
            title={compact ? copyName : undefined}
          >
            <CopyIcon aria-hidden />
            {!compact && (
              <span aria-live="polite">
                {copied ? t("oriso.notes_copied") : copyName}
              </span>
            )}
          </button>
          {/* 2a has no close: the docked card folds from the control bar. */}
          {layout === "sheet" && (
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label={t("oriso.notes_close")}
              title={t("oriso.notes_close")}
            >
              <CloseIcon aria-hidden />
            </button>
          )}
        </div>
        <span className={styles.private}>
          <LockSolidIcon aria-hidden />
          {compact ? t("oriso.notes_private_short") : t("oriso.notes_private")}
        </span>
      </div>
      <div className={styles.rule} />
      <ul className={styles.list}>
        {notes.map((n) => (
          <li
            key={n.id}
            className={styles.note}
            data-done={n.done ? "true" : undefined}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={n.done}
              aria-label={t("oriso.notes_done")}
              title={t("oriso.notes_done")}
              className={styles.box}
              onClick={() => setNotes((all) => toggleDone(all, n.id))}
            >
              <CheckIcon aria-hidden />
            </button>
            <span className={styles.kind}>{kindLabel(n.kind)}</span>
            <span className={styles.text}>{n.text}</span>
            {layout === "docked" && (
              <span className={styles.time}>{n.time}</span>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.foot}>
        <div className={styles.field}>
          <input
            type="text"
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKey}
            placeholder={t("oriso.notes_placeholder")}
            aria-label={t("oriso.notes_placeholder")}
          />
          <div className={styles.kindAnchor}>
            <button
              type="button"
              className={styles.kindButton}
              onClick={() => setKindMenuOpen((was) => !was)}
              aria-label={t("oriso.notes_kind")}
              title={t("oriso.notes_kind")}
              aria-haspopup="menu"
              aria-expanded={kindMenuOpen}
              aria-controls={kindMenuOpen ? menuId : undefined}
            >
              <OverflowVerticalIcon aria-hidden />
            </button>
            {kindMenuOpen && (
              <div
                id={menuId}
                role="menu"
                aria-label={t("oriso.notes_kind")}
                className={styles.kindMenu}
              >
                {NOTE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={kind === k}
                    className={styles.kindItem}
                    onClick={() => {
                      setKind(k);
                      setKindMenuOpen(false);
                    }}
                  >
                    {kindLabel(k)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <span className={styles.temporary}>
          {compact
            ? t("oriso.notes_temporary_short")
            : t("oriso.notes_temporary")}
        </span>
      </div>
    </section>
  );
};
