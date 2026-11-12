/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type KeyboardEvent,
  type TouchEvent,
  useEffect,
  useId,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./AtmospherePicker.module.css";
import { ATMOSPHERE_NAMES, type AtmosphereName } from "./Atmosphere";
import { type AtmosphereChoice, swatchFor } from "./atmosphereChoice";

interface Props {
  choice: AtmosphereChoice;
  /** What is drawn right now, for the round button. */
  current: AtmosphereName;
  onChoose: (choice: AtmosphereChoice) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTouchEnd?: (e: TouchEvent) => void;
}

/**
 * The atmosphere popover in the call header (design 2a).
 *
 * A round button showing the backdrop that is on, and under it the motifs
 * and "Motiv des Trägers". Controlled from outside, because the call menu's
 * "Hintergrund" opens the same popover.
 */
export const AtmospherePicker: FC<Props> = ({
  choice,
  current,
  onChoose,
  open,
  onOpenChange,
  onTouchEnd,
}) => {
  const { t } = useTranslation();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return (): void =>
      document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenChange]);

  // Opening moves focus onto the motif that is chosen.
  useEffect(() => {
    if (open)
      popoverRef.current
        ?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  const label = t("oriso.atmosphere_title");

  return (
    <div className={styles.picker}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => onOpenChange(!open)}
        onTouchEnd={onTouchEnd}
        data-testid="oriso-atmosphere-button"
      >
        <span
          className={styles.dot}
          style={{ background: swatchFor(current) }}
          aria-hidden="true"
        />
      </button>
      {open && (
        // A popover of buttons, like the call menu: a group, not an ARIA menu.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={popoverRef}
          id={id}
          role="group"
          aria-labelledby={`${id}-title`}
          className={styles.popover}
          onKeyDown={onKeyDown}
          onTouchEnd={onTouchEnd}
          data-testid="oriso-atmosphere-popover"
        >
          <div className={styles.head}>
            <span id={`${id}-title`} className={styles.title}>
              {label}
            </span>
            <span className={styles.text}>{t("oriso.atmosphere_text")}</span>
          </div>
          <div className={styles.grid}>
            {ATMOSPHERE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.motif}
                aria-pressed={choice === name}
                onClick={() => onChoose(name)}
                data-motif={name}
              >
                <span
                  className={styles.swatch}
                  style={{ background: swatchFor(name) }}
                  aria-hidden="true"
                />
                <span className={styles.motifLabel}>
                  {t(`oriso.atmosphere_${name}`)}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.carrier}
            aria-pressed={choice === "traeger"}
            onClick={() => onChoose("traeger")}
            data-motif="traeger"
          >
            <ImageIcon aria-hidden width={20} height={20} />
            <span className={styles.carrierText}>
              <span className={styles.carrierTitle}>
                {t("oriso.atmosphere_carrier")}
              </span>
              <span className={styles.carrierHint}>
                {t("oriso.atmosphere_carrier_hint")}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
