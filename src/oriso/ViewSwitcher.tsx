/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  GroupIcon,
  GridIcon,
  SpotlightIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./ViewSwitcher.module.css";

/** What the rail offers. Two arrangements plus the spotlight. */
export type StageView = "hain" | "felder" | "spotlight";

interface Entry {
  key: StageView;
  label: string;
  icon: ReactNode;
}

interface Props {
  active: StageView;
  onChange: (view: StageView) => void;
  className?: string;
  onTouchEnd?: (e: TouchEvent) => void;
}

/**
 * The view switcher.
 *
 * Semantically a radio group rather than three toggle buttons, because it is
 * one choice: the arrows move within it and the whole rail is a single tab
 * stop. That is also what replaces upstream's `LayoutToggle`, which offers
 * two.
 *
 * The icons are Compound's. They are chrome rather than identity, so unlike
 * the animals they are not inherited from the host — but the handoff does
 * draw its own three, and one of them (a house, for the fields) is an open
 * question with the owner. Written down rather than quietly settled.
 */
export const ViewSwitcher: FC<Props> = ({
  active,
  onChange,
  className,
  onTouchEnd,
}) => {
  const { t } = useTranslation();

  const views: Entry[] = [
    {
      key: "hain",
      label: t("oriso.view_grove"),
      icon: <GroupIcon aria-hidden width={20} height={20} />,
    },
    {
      key: "felder",
      label: t("oriso.view_fields"),
      icon: <GridIcon aria-hidden width={20} height={20} />,
    },
    {
      key: "spotlight",
      label: t("layout_spotlight_label"),
      icon: <SpotlightIcon aria-hidden width={20} height={20} />,
    },
  ];

  const move = useCallback(
    (event: KeyboardEvent) => {
      const index = views.findIndex((v) => v.key === active);
      if (index < 0) return;
      const last = views.length - 1;
      let next: number;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = index === last ? 0 : index + 1;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = index === 0 ? last : index - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = last;
          break;
        default:
          return;
      }
      // The arrows own these keys inside a radio group; letting them also
      // scroll the stage would move two things at once.
      event.preventDefault();
      if (next !== index) onChange(views[next].key);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, onChange],
  );

  return (
    <div
      className={classNames(styles.rail, className)}
      data-testid="view-switcher"
      role="radiogroup"
      aria-label={t("oriso.view_switcher_label")}
      onKeyDown={move}
    >
      {views.map((view) => {
        const current = view.key === active;
        return (
          <button
            key={view.key}
            type="button"
            role="radio"
            aria-checked={current}
            aria-label={view.label}
            data-view={view.key}
            // Roving tabindex: the group is one tab stop and the arrows move
            // inside it.
            tabIndex={current ? 0 : -1}
            className={styles.view}
            onClick={() => {
              // Picking the view that is already current would re-render the
              // whole stage for nothing.
              if (!current) onChange(view.key);
            }}
            onTouchEnd={onTouchEnd}
          >
            <span className={styles.icon} aria-hidden="true">
              {view.icon}
            </span>
            {current && (
              <span className={styles.label} aria-hidden="true">
                {view.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
