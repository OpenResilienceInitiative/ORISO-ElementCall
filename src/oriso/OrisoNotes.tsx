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
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  CopyIcon,
  LockSolidIcon,
  OverflowVerticalIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./OrisoNotes.module.css";
import {
  ChatMenuDropdown,
  ChatMenuDropdownDivider,
  ChatMenuDropdownHeader,
  ChatMenuDropdownItem,
  ChatMenuDropdownSection,
} from "./ChatMenuDropdown";
import { NoteTypeIcon, PasteIcon, SendIcon } from "./NoteIcons";
import {
  addNote,
  IMPORT_MAX_ENTRIES,
  importNotes,
  moveNote,
  NOTE_FILTERS,
  NOTE_KINDS,
  notesAsMarkdown,
  removeNote,
  toggleDone,
  visibleNotes,
  type Note,
  type NoteFilter,
  type NoteKind,
} from "./notes";

/** How long the copy pill says "Kopiert", as in the prototype. */
const COPIED_FOR_MS = 1800;
/** How long a notice (import result, no clipboard) replaces the info line. */
const NOTICE_FOR_MS = 4000;
/** A note longer than this folds to four lines behind "Mehr anzeigen". */
const FOLD_AFTER = 160;

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
  /** The phone card: icon-only copy. */
  compact: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The Schmierzettel (#112, "Meine Gesprächsnotiz" before), from the approved
 * Claude Design (G-Aktionen / H-Menü).
 *
 * Private is the feature: the notes live in this component and nowhere else,
 * for everyone in the call, and end with the call. Copying Markdown is the
 * way out, pasting Markdown the way in. Closing only hides the card, so the
 * notes survive it. The filter and the last type used are kept the same way:
 * for the call window's life, never longer.
 */
export const OrisoNotes: FC<Props> = ({
  ref,
  open,
  onClose,
  layout,
  compact,
  className,
  style,
}) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [last, setLast] = useState<NoteKind>("frage");
  const [filter, setFilter] = useState<NoteFilter>("alle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(new Set());
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const menuId = useId();

  useEffect(
    () => (): void => {
      clearTimeout(copiedTimer.current);
      clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Spelled out, so the i18n parser sees every key.
  const kindLabels: Record<NoteKind, string> = {
    notiz: t("oriso.notes_kind_notiz"),
    frage: t("oriso.notes_kind_frage"),
    aufgabe: t("oriso.notes_kind_aufgabe"),
  };
  // The plural words: the filter's entries and the Markdown's headings.
  const groupLabels: Record<NoteFilter, string> = {
    alle: t("oriso.notes_group_alle"),
    notiz: t("oriso.notes_group_notiz"),
    frage: t("oriso.notes_group_frage"),
    aufgabe: t("oriso.notes_group_aufgabe"),
  };
  const headings: Record<NoteKind, string> = {
    notiz: groupLabels.notiz,
    frage: groupLabels.frage,
    aufgabe: groupLabels.aufgabe,
  };
  const emptyTexts: Record<NoteFilter, string> = {
    alle: t("oriso.notes_empty_alle"),
    notiz: t("oriso.notes_empty_notiz"),
    frage: t("oriso.notes_empty_frage"),
    aufgabe: t("oriso.notes_empty_aufgabe"),
  };

  const flash = useCallback((message: string): void => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), NOTICE_FOR_MS);
  }, []);

  const hasText = draft.trim() !== "";
  const shown = visibleNotes(notes, filter);

  // The newest note is at the bottom; keep it in view as it arrives.
  const count = notes.length;
  const previousCount = useRef(count);
  useEffect(() => {
    if (count > previousCount.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    previousCount.current = count;
  }, [count]);

  const send = (kind: NoteKind): void => {
    if (!hasText) return;
    setNotes((all) => addNote(all, kind, draft));
    setDraft("");
    setLast(kind);
    // A note the filter would hide is a note that seems to have vanished.
    setFilter((f) => (f === "alle" || f === kind ? f : "alle"));
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    // Enter that confirms an input method's candidate is not a submit.
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(last);
    }
  };

  const copy = (): void => {
    if (notes.length === 0) return;
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard?.writeText) {
      flash(t("oriso.notes_notice_unavailable"));
      return;
    }
    clipboard.writeText(notesAsMarkdown(notes, headings)).then(
      () => {
        setCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
      },
      () => flash(t("oriso.notes_notice_unavailable")),
    );
  };

  const applyImport = (markdown: string): void => {
    const result = importNotes(notesRef.current, markdown, headings);
    if (result.imported === 0) {
      flash(t("oriso.notes_notice_none"));
      return;
    }
    setNotes(result.notes);
    setFilter("alle");
    const parts = [t("oriso.notes_notice_imported", { n: result.imported })];
    if (result.skipped > 0) {
      parts.push(
        t("oriso.notes_notice_skipped", {
          n: result.skipped,
          max: IMPORT_MAX_ENTRIES,
        }),
      );
    }
    if (result.truncated > 0) {
      parts.push(t("oriso.notes_notice_truncated", { n: result.truncated }));
    }
    flash(parts.join(" · "));
  };

  const pasteImport = (): void => {
    setMenuOpen(false);
    // No fallback field: when the browser says no, nothing is imported.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard?.readText) {
      flash(t("oriso.notes_notice_unavailable"));
      return;
    }
    clipboard
      .readText()
      .then(applyImport, () => flash(t("oriso.notes_notice_unavailable")));
  };

  const closeMenu = useCallback((refocus: boolean): void => {
    setMenuOpen(false);
    if (refocus) menuButtonRef.current?.focus();
  }, []);

  // Open: the chosen filter takes focus. Open: a press outside closes it.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.focus();
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return (): void =>
      document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeMenu(true);
      return;
    }
    if (e.key === "Tab") {
      closeMenu(false);
      return;
    }
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("button") ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === "ArrowDown"
        ? (at + 1) % items.length
        : e.key === "ArrowUp"
          ? (at - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to].focus();
  };

  if (!open) return null;

  const copyName = t("oriso.notes_copy");
  const lastName = kindLabels[last];
  const filtered = filter !== "alle";
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
        {/* The docked card closes here too: design 2a draws the × beside
            "Als Text kopieren", and with the card docked in every view (S5)
            it must not depend on finding the bar's notes button. */}
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t("oriso.notes_close")}
          title={t("oriso.notes_close")}
        >
          <CloseIcon aria-hidden />
        </button>
      </div>
      <div className={styles.info}>
        <LockSolidIcon aria-hidden />
        <span
          className={notice ? styles.notice : undefined}
          role="status"
          aria-live="polite"
        >
          {notice || t("oriso.notes_info")}
        </span>
      </div>

      <div ref={listRef} className={styles.list}>
        {shown.length === 0 ? (
          <p className={styles.empty}>{emptyTexts[filter]}</p>
        ) : (
          <ul className={styles.notes}>
            {shown.map((n, i) => {
              const long = n.text.length > FOLD_AFTER;
              const isOpen = unfolded.has(n.id);
              return (
                <li
                  key={n.id}
                  className={styles.note}
                  data-kind={n.kind}
                  data-done={n.done ? "true" : undefined}
                >
                  <div className={styles.noteHead}>
                    <button
                      type="button"
                      className={classNames(
                        styles.tag,
                        styles[`tag_${n.kind}`],
                      )}
                      onClick={() => setNotes((all) => toggleDone(all, n.id))}
                      aria-pressed={n.done}
                      aria-label={t("oriso.notes_mark_done", {
                        kind: kindLabels[n.kind],
                      })}
                      title={t("oriso.notes_mark_done", {
                        kind: kindLabels[n.kind],
                      })}
                    >
                      <NoteTypeIcon kind={n.kind} />
                      {kindLabels[n.kind]}
                    </button>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.act}
                        disabled={i === 0}
                        onClick={() =>
                          setNotes((all) => moveNote(all, n.id, -1, filter))
                        }
                        aria-label={t("oriso.notes_up")}
                        title={t("oriso.notes_up")}
                      >
                        <ArrowUpIcon aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.act}
                        disabled={i === shown.length - 1}
                        onClick={() =>
                          setNotes((all) => moveNote(all, n.id, 1, filter))
                        }
                        aria-label={t("oriso.notes_down")}
                        title={t("oriso.notes_down")}
                      >
                        <ArrowDownIcon aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={classNames(styles.act, styles.actDelete)}
                        onClick={() => setNotes((all) => removeNote(all, n.id))}
                        aria-label={t("oriso.notes_delete")}
                        title={t("oriso.notes_delete")}
                      >
                        <CloseIcon aria-hidden />
                      </button>
                    </div>
                  </div>
                  <p
                    className={classNames(styles.text, {
                      [styles.clamp]: long && !isOpen,
                    })}
                  >
                    {n.text}
                  </p>
                  {long && (
                    <button
                      type="button"
                      className={styles.more}
                      aria-expanded={isOpen}
                      onClick={() =>
                        setUnfolded((was) => {
                          const next = new Set(was);
                          if (!next.delete(n.id)) next.add(n.id);
                          return next;
                        })
                      }
                    >
                      {isOpen ? t("oriso.notes_less") : t("oriso.notes_more")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.inputRow}>
          <input
            type="text"
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKey}
            placeholder={t("oriso.notes_placeholder")}
            aria-label={t("oriso.notes_placeholder")}
          />
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.ghost}
            onClick={() => setMenuOpen((was) => !was)}
            aria-label={
              filtered
                ? t("oriso.notes_menu_button_active", {
                    filter: groupLabels[filter],
                  })
                : t("oriso.notes_menu_button")
            }
            title={t("oriso.notes_menu_button")}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
          >
            <OverflowVerticalIcon aria-hidden />
          </button>
          {filtered && <span className={styles.dot} aria-hidden="true" />}
        </div>
        {menuOpen && (
          <ChatMenuDropdown
            ref={menuRef}
            id={menuId}
            ariaLabel={t("oriso.notes_menu_title")}
            className={styles.menu}
            onKeyDown={onMenuKey}
          >
            <ChatMenuDropdownHeader
              subtitle={t("oriso.notes_menu_subtitle")}
              title={t("oriso.notes_menu_title")}
            />
            <ChatMenuDropdownDivider />
            <ChatMenuDropdownSection
              role="radiogroup"
              ariaLabel={t("oriso.notes_menu_title")}
            >
              {NOTE_FILTERS.map((f) => (
                <ChatMenuDropdownItem
                  key={f}
                  role="radio"
                  aria-checked={filter === f}
                  active={filter === f}
                  icon={<NoteTypeIcon kind={f} />}
                  title={groupLabels[f]}
                  onClick={() => {
                    setFilter(f);
                    closeMenu(true);
                  }}
                />
              ))}
            </ChatMenuDropdownSection>
            <ChatMenuDropdownDivider />
            <ChatMenuDropdownItem
              icon={<PasteIcon />}
              title={t("oriso.notes_import")}
              description={t("oriso.notes_import_hint", {
                max: IMPORT_MAX_ENTRIES,
              })}
              onClick={pasteImport}
            />
          </ChatMenuDropdown>
        )}
        <div className={styles.sendRow}>
          <div
            role="group"
            aria-label={t("oriso.notes_send_group")}
            className={styles.types}
          >
            {NOTE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={classNames(styles.pill, {
                  [styles.pillLast]: last === k,
                })}
                disabled={!hasText}
                onClick={() => send(k)}
                aria-label={t("oriso.notes_send_as", { kind: kindLabels[k] })}
                title={t("oriso.notes_send_as", { kind: kindLabels[k] })}
              >
                <NoteTypeIcon kind={k} />
                {last === k && (
                  <span className={styles.pillLabel}>{kindLabels[k]}</span>
                )}
              </button>
            ))}
          </div>
          {hasText && (
            <button
              type="button"
              className={styles.send}
              onClick={() => send(last)}
              aria-label={t("oriso.notes_send_as", { kind: lastName })}
              title={t("oriso.notes_send_as", { kind: lastName })}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
