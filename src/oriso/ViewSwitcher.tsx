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
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  GroupIcon,
  GridIcon,
  SpotlightIcon,
  UserProfileIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./ViewSwitcher.module.css";

/**
 * What the rail can offer.
 *
 * Two arrangements and the spotlight — plus the Einzelgespräch, which is not
 * a fourth arrangement but the name of the one the stage is already in when
 * there are exactly two people. See `offer` below.
 */
export type StageView = "hain" | "felder" | "einzelgespraech" | "spotlight";

interface Entry {
  key: StageView;
  label: string;
  icon: ReactNode;
}

interface Props {
  active: StageView;
  onChange: (view: StageView) => void;
  /**
   * Which views to put on the rail.
   *
   * Not always all of them. At exactly two people `layoutMedia$` gives the
   * stage the Einzelgespräch whichever arrangement is selected, so Kreis and
   * Kacheln were BOTH no-ops there: the radio moved and the stage did not.
   * A control that reports a choice it cannot carry out is worse than one
   * that offers less, so the caller says what is real.
   */
  offer?: readonly StageView[];
  /** `light` for the rail inside the call menu, which sits on white. */
  tone?: "dark" | "light";
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
/**
 * The rail as the handoff draws it: two arrangements and the spotlight.
 *
 * The Einzelgespräch is not in here because it is not a choice — it is the
 * name of the arrangement two people are already in, and `InCallView` asks
 * for it by name in that one case.
 */
const DEFAULT_VIEWS: readonly StageView[] = ["hain", "felder", "spotlight"];

export const ViewSwitcher: FC<Props> = ({
  active,
  onChange,
  offer = DEFAULT_VIEWS,
  tone = "dark",
  className,
  onTouchEnd,
}) => {
  const { t } = useTranslation();

  /*
   * One list, memoised on what it is actually made of.
   *
   * `offer` changes when the stage changes what it can honour — at two
   * people the rail offers the Einzelgespräch and the spotlight, otherwise
   * the handoff's three. `move` closes over this list, so a stale copy could
   * select a view that is no longer on the rail, and then focus nothing
   * because no button carries that `data-view`.
   */
  const views: Entry[] = useMemo(() => {
    const entries: Record<StageView, Entry> = {
      hain: {
        key: "hain",
        label: t("oriso.view_grove"),
        icon: <GroupIcon aria-hidden width={20} height={20} />,
      },
      felder: {
        key: "felder",
        label: t("oriso.view_fields"),
        icon: <GridIcon aria-hidden width={20} height={20} />,
      },
      einzelgespraech: {
        key: "einzelgespraech",
        label: t("oriso.view_one_on_one"),
        icon: <UserProfileIcon aria-hidden width={20} height={20} />,
      },
      spotlight: {
        key: "spotlight",
        label: t("layout_spotlight_label"),
        icon: <SpotlightIcon aria-hidden width={20} height={20} />,
      },
    };
    return offer.map((key) => entries[key]);
  }, [offer, t]);

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
      if (next === index) return;
      onChange(views[next].key);
      /*
       * Focus follows the selection, because with a roving tabindex it has
       * to. `onChange` only changes which button carries `tabIndex={0}`; the
       * browser keeps focus where it was, and after the re-render that button
       * is `tabIndex={-1}`. A keyboard user pressing an arrow then lost their
       * place in the rail and a screen reader never announced the new view.
       * All three buttons exist already, so the one to move to can be taken
       * straight off the group.
       */
      event.currentTarget
        .querySelector<HTMLElement>(`[data-view="${views[next].key}"]`)
        ?.focus();
    },
    [active, onChange, views],
  );

  return (
    // A radio group is a COMPOSITE widget: the group is not focusable,
    // its children are, and exactly one of them is in the tab order at a
    // time. That is the roving tabindex below, and it is what the ARIA
    // pattern asks for — the lint rule is reading the group as if it were
    // a single interactive element.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      className={classNames(styles.rail, className, {
        [styles.light]: tone === "light",
      })}
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
