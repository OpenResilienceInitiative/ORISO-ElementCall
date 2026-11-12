/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./KachelnPager.module.css";
import { type KachelnRange, kachelnRange } from "./kacheln";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

const SHEET = '[data-testid="oriso-grove"][data-mode="scroll"]';

/** The nearest ancestor that scrolls: the call's `.inRoom`. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p !== null; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}

/** One row of tiles: the distance from the first row to the next. */
function rowStep(sheet: Element | null): number {
  const slots = sheet ? [...sheet.children] : [];
  if (slots.length === 0) return 0;
  const first = slots[0].getBoundingClientRect();
  const next = slots.find((s) => s.getBoundingClientRect().top > first.top);
  return next ? next.getBoundingClientRect().top - first.top : first.height;
}

/**
 * The part of the call that shows the stage: below the header, above the
 * bar. Both stay put while the call scrolls, so this is where "in sight"
 * is measured, and where the pager is pinned.
 */
function stageFrame(scroller: HTMLElement): { top: number; bottom: number } {
  const own = scroller.getBoundingClientRect();
  const header = scroller.querySelector('[data-testid="oriso-header"]');
  const bar = scroller.querySelector('[data-testid="oriso-toolbar"]');
  return {
    top: header ? header.getBoundingClientRect().bottom : own.top,
    bottom: bar ? bar.getBoundingClientRect().top : own.bottom,
  };
}

interface PagerState {
  overflow: boolean;
  atTop: boolean;
  atBottom: boolean;
  range: KachelnRange | null;
}

/**
 * The Kacheln's pager (#2233, T12): how many people are in the call, and —
 * when not everybody fits — who is in sight, with a button a row up and a
 * row down. Two fingers on a trackpad still scroll the sheet as before; the
 * buttons are for everybody else.
 *
 * The call scrolls as a whole (`.inRoom`), and only the header and the bar
 * stay put: the pager rides on the bar, above its right end, and "in sight"
 * means between the header and the bar.
 */
export const KachelnPager: FC<{ count: number }> = ({ count }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<PagerState>({
    overflow: false,
    atTop: true,
    atBottom: true,
    range: null,
  });

  useEffect(() => {
    const el = ref.current;
    const scroller = el && scrollParent(el);
    if (!el || !scroller) return;
    const measure = (): void => {
      const sheet = scroller.querySelector(SHEET);
      const frame = stageFrame(scroller);
      const slots = sheet
        ? [...sheet.children].map((slot) => slot.getBoundingClientRect())
        : [];
      setState({
        overflow: scroller.scrollHeight > scroller.clientHeight + 1,
        atTop: scroller.scrollTop <= 1,
        atBottom:
          scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 1,
        range: kachelnRange(slots, frame),
      });
    };
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resize?.observe(scroller);
    const sheet = scroller.querySelector(SHEET);
    if (sheet) resize?.observe(sheet);
    return (): void => {
      scroller.removeEventListener("scroll", measure);
      resize?.disconnect();
    };
  }, [count]);

  const move = useCallback(
    (direction: 1 | -1) => {
      const scroller = ref.current && scrollParent(ref.current);
      if (!scroller) return;
      scroller.scrollBy({
        top: direction * rowStep(scroller.querySelector(SHEET)),
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [reducedMotion],
  );

  // Paged only while somebody is out of sight: a sheet that scrolls by its
  // own padding has nobody to page to.
  const paged =
    state.overflow &&
    state.range !== null &&
    (state.range.first > 1 || state.range.last < count);
  return (
    <div
      ref={ref}
      className={styles.pager}
      data-testid="oriso-kacheln-pager"
      role="group"
      aria-label={t("oriso.kacheln_pager")}
    >
      {paged && (
        <button
          type="button"
          className={styles.step}
          aria-label={t("oriso.kacheln_up")}
          title={t("oriso.kacheln_up")}
          disabled={state.atTop}
          onClick={() => move(-1)}
        >
          <ChevronUpIcon aria-hidden width={20} height={20} />
        </button>
      )}
      <span className={styles.count} aria-live="polite">
        {paged
          ? t("oriso.kacheln_range", {
              first: state.range!.first,
              last: state.range!.last,
              count,
            })
          : t("oriso.participants_count", { count })}
      </span>
      {paged && (
        <button
          type="button"
          className={styles.step}
          aria-label={t("oriso.kacheln_down")}
          title={t("oriso.kacheln_down")}
          disabled={state.atBottom}
          onClick={() => move(1)}
        >
          <ChevronDownIcon aria-hidden width={20} height={20} />
        </button>
      )}
    </div>
  );
};
