/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CSSProperties,
  type FC,
  type KeyboardEvent,
  type TouchEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  CloseIcon,
  UserAddIcon,
  LinkIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./OrisoGuestFab.module.css";
import toolbarStyles from "./OrisoToolbar.module.css";
import { InviteLinkBody, useInviteLink } from "./InviteLinkBody";
import { type InviteLinkReply } from "./inviteLink";
import { useMenuPopover } from "./OrisoToolbar";

interface Props {
  /** Asks the host for the call's link; null: this call has none to offer. */
  inviteRequest: (() => Promise<InviteLinkReply>) | null;
  /** "Anklopfen" of the call's link; null: no link to switch. */
  knock: boolean | null;
  onKnockChange: ((knock: boolean) => void) | null;
  /** People knocking on the link (#108). */
  waitingCount: number;
  /** A phone: the icon alone, the word its name. */
  compact?: boolean;
  /** The 1:1 video stage shares the host's palette. */
  followCallAppearance?: boolean;
  onTouchEnd?: (e: TouchEvent) => void;
  className?: string;
  /** Where the bar ends: `--oriso-footer-h`. */
  style?: CSSProperties;
}

const noRequest = async (): Promise<InviteLinkReply> =>
  Promise.resolve({ error: "No link for this call" });

/**
 * The guest button (call UX round #170): one Material-3 floating action
 * button, only in a call with guests, that holds what concerns them — the
 * call's link, "Anklopfen" and who is waiting.
 *
 * It replaces "Link teilen" in the header and "Anklopfen" in the call menu:
 * with a counsellor and a logged-in advice seeker they were noise (Frank,
 * live test 18 Nov). "Einladelink senden" stays in the menu, so inviting
 * somebody is always one entry away; doing it brings this button.
 */
export const OrisoGuestFab: FC<Props> = ({
  inviteRequest,
  knock,
  onKnockChange,
  waitingCount,
  compact = false,
  followCallAppearance = false,
  onTouchEnd,
  className,
  style,
}) => {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const invite = useInviteLink(inviteRequest ?? noRequest);
  const { close: closeInvite } = invite;

  const setOpenAndReset = useCallback(
    (next: boolean): void => {
      setOpen(next);
      if (!next) closeInvite();
    },
    [closeInvite],
  );
  useMenuPopover(open, setOpenAndReset, triggerRef, panelRef);

  const close = useCallback((): void => {
    setOpenAndReset(false);
    triggerRef.current?.focus();
  }, [setOpenAndReset]);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    close();
  };

  const title = t("oriso.guests_title");
  const waiting =
    waitingCount > 0 ? t("oriso.waiting_count", { count: waitingCount }) : null;
  const fabLabel = waiting ? `${title}, ${waiting}` : title;

  return (
    <div
      className={classNames(
        styles.guests,
        { "cpd-theme-light": !followCallAppearance },
        className,
      )}
      data-compact={compact || undefined}
      style={style}
      onTouchEnd={onTouchEnd}
    >
      {open && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-labelledby={`${id}-title`}
          className={styles.panel}
          onKeyDown={onKeyDown}
          data-testid="oriso-guest-panel"
        >
          <div className={styles.head}>
            <span id={`${id}-title`} className={styles.title}>
              {title}
            </span>
            <button
              type="button"
              className={styles.close}
              aria-label={t("oriso.invite_close")}
              onClick={close}
            >
              <CloseIcon aria-hidden width={20} height={20} />
            </button>
          </div>
          {waiting && (
            <p className={styles.waiting} role="status">
              {waiting}
            </p>
          )}
          {inviteRequest !== null && (
            <div
              ref={linkRef}
              className={styles.link}
              role="group"
              aria-label={t("oriso.invite_title")}
              tabIndex={-1}
            >
              {invite.state.kind === "closed" ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    linkRef.current?.focus();
                    invite.start();
                  }}
                  data-testid="oriso-guest-link"
                >
                  <LinkIcon aria-hidden width={20} height={20} />
                  {t("oriso.invite_button")}
                </button>
              ) : (
                <InviteLinkBody
                  state={invite.state}
                  onCopy={invite.copyAgain}
                />
              )}
            </div>
          )}
          {knock !== null && onKnockChange !== null && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                <span id={`${id}-knock`}>{t("oriso.knock_label")}</span>
                <span
                  id={`${id}-knock-state`}
                  className={styles.rowDescription}
                >
                  {knock ? t("oriso.knock_on") : t("oriso.knock_off")}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={knock}
                aria-labelledby={`${id}-knock`}
                aria-describedby={`${id}-knock-state`}
                className={toolbarStyles.switch}
                data-state={knock ? "on" : "off"}
                onClick={() => onKnockChange(!knock)}
                data-testid="oriso-knock-switch"
              >
                <span
                  className={toolbarStyles.switchThumb}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={styles.fab}
        aria-label={fabLabel}
        title={compact ? fabLabel : undefined}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpenAndReset(!open)}
        data-testid="oriso-guest-fab"
      >
        <UserAddIcon aria-hidden width={24} height={24} />
        {!compact && <span aria-hidden="true">{title}</span>}
        {waiting && (
          <span
            className={styles.badge}
            aria-hidden="true"
            data-testid="oriso-guest-fab-badge"
          >
            {waitingCount > 99 ? "99+" : waitingCount}
          </span>
        )}
      </button>
    </div>
  );
};
