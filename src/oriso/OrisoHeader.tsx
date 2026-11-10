/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode, type Ref, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  CollapseIcon,
  ExitFullScreenIcon,
  FullScreenIcon,
  LockSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./OrisoHeader.module.css";
import { type OrisoWindowCommand } from "./useOrisoWindow";

interface Props {
  ref?: Ref<HTMLElement>;
  /** Light over the atmosphere (2a/2b), dark on the video stage (5a). */
  tone: "light" | "dark";
  title: string;
  encrypted: boolean;
  /** After the chip, e.g. the call's duration. */
  meta?: ReactNode;
  /** The header's own buttons, at its right end before the window's. */
  actions?: ReactNode;
  /**
   * The window buttons' channel to the host; null when the host draws its
   * own over the iframe. Then the header keeps that corner free instead.
   */
  onWindow: ((command: OrisoWindowCommand) => void) | null;
  fullscreen: boolean;
  onTouchEnd?: (e: TouchEvent) => void;
  /**
   * A phone in full screen (5b/5d, S9): title, "verschlüsselt · …" under it
   * and the header's own buttons (the ⋮ among them). No window buttons:
   * "Schweben/Vollbild" is an entry of the ⋮ there.
   */
  compact?: boolean;
  className?: string;
}

/**
 * The ORISO call header, section 2a of the handoff: the title, the
 * encryption chip and what the call is doing on the left; the header's own
 * buttons and, when the host leaves them to the call (`orisoHostChrome`),
 * "Verkleinern" and "Vollbild" at the right end.
 *
 * When the host keeps its own window buttons, they lie over the iframe's top
 * right corner — over this header. Dev showed them on top of the video
 * stage's "Notizen" button. So without `onWindow` the header reserves that
 * corner (`data-host-chrome="host"`), and nothing of its own sits under them.
 */
export const OrisoHeader: FC<Props> = ({
  ref,
  tone,
  title,
  encrypted,
  meta,
  actions,
  onWindow,
  fullscreen,
  onTouchEnd,
  compact = false,
  className,
}) => {
  const { t } = useTranslation();
  const fullscreenLabel = fullscreen
    ? t("oriso.window_exit_fullscreen")
    : t("oriso.window_fullscreen");

  return (
    <header
      ref={ref}
      className={classNames(styles.header, className)}
      data-tone={tone}
      data-host-chrome={onWindow === null ? "host" : "call"}
      data-compact={compact || undefined}
      data-testid="oriso-header"
    >
      <div className={styles.lead}>
        <span className={styles.title}>{title}</span>
        {(encrypted || meta) && (
          <span className={styles.meta}>
            {encrypted && (
              <span className={styles.chip} data-testid="oriso-header-e2ee">
                <LockSolidIcon aria-hidden />
                {compact ? (
                  <span>{t("oriso.encrypted_short")}</span>
                ) : (
                  <span className={styles.chipText}>
                    {t("oriso.video_stage_encrypted")}
                  </span>
                )}
              </span>
            )}
            {encrypted && meta && <span aria-hidden="true">·</span>}
            {meta}
          </span>
        )}
      </div>
      {(actions || (onWindow && !compact)) && (
        <div className={styles.actions}>
          {actions}
          {onWindow && !compact && (
            <>
              <button
                type="button"
                className={styles.windowButton}
                aria-label={t("oriso.window_minimise")}
                title={t("oriso.window_minimise")}
                onClick={() => onWindow("minimise")}
                onTouchEnd={onTouchEnd}
                data-testid="oriso-window-minimise"
              >
                <CollapseIcon aria-hidden />
              </button>
              <button
                type="button"
                className={styles.windowButton}
                aria-label={fullscreenLabel}
                title={fullscreenLabel}
                aria-pressed={fullscreen}
                onClick={() => onWindow("toggle_fullscreen")}
                onTouchEnd={onTouchEnd}
                data-testid="oriso-window-fullscreen"
              >
                {fullscreen ? (
                  <ExitFullScreenIcon aria-hidden />
                ) : (
                  <FullScreenIcon aria-hidden />
                )}
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
