/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useId, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";

import { type OneOnOneLayout as OneOnOneLayoutModel } from "../state/layout-types.ts";
import styles from "./EinzelgespraechLayout.module.css";
import { type CallLayout } from "./CallLayout";
import { useUpdateLayout } from "./Grid";
import {
  SEAM_EASING,
  type Speaking,
  seamFor,
  shareFor,
} from "../oriso/einzelgespraech";
import { liftFor } from "../oriso/lift";
import { usePublishOrisoShapes } from "../oriso/useOrisoShape";
import { type TileShape } from "../oriso/shape";
import { useBehavior } from "../useBehavior";

/**
 * How big the animal is inside its half.
 *
 * The handoff sizes it at 22% of the stage, and the circle is 86% of the
 * stage, so within the circle that is this. Expressed against the circle
 * because the circle is what the halves are measured in.
 */
const FACE_SHARE_OF_CIRCLE = 0.22 / 0.86;

/**
 * How much of the stage the circle takes.
 *
 * The handoff's 86%. In px rather than as a percentage, because a percentage
 * resolved against a grid row sized by its own content, the height collapsed
 * and the circle came out a flat ellipse — two to one.
 */
const CIRCLE_SHARE = 0.86;

/**
 * Einzelgespräch — one circle, two halves, a bowing seam.
 *
 * The most common ORISO call by far: one person seeking advice, one
 * counsellor. The speaking half grows past half and the seam bows into the
 * quiet side, so the change reads as one body pressing against another
 * rather than as a bar filling up. Silence is an even split, and
 * `einzelgespraech.ts` says at some length why that matters more than it
 * sounds.
 *
 * Both halves are given the SAME box — the whole circle — and differ only by
 * the clip path that cuts them. That is what makes them one body: a single
 * curve, authored once, so the two can never part, and the shading over them
 * is one sphere rather than two half-spheres that meet.
 *
 * The motion is a CSS transition over two numbers. Nothing here runs per
 * frame.
 */
export const makeEinzelgespraechLayout: CallLayout<OneOnOneLayoutModel> = ({
  minBounds$,
}) => ({
  scrollingOnTop: false,

  fixed: function EinzelgespraechFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} className={styles.fixed} />;
  },

  scrolling: function Einzelgespraech({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const { width, height } = useObservableEagerState(minBounds$);
    const seamId = useId().replace(/:/g, "");

    // Remote on the left, local on the right. Fixed rather than
    // speaking-dependent: the halves must not swap sides when somebody
    // starts talking.
    const first = model.remote;
    const second = model.local;
    /*
     * Subscribed, not sampled.
     *
     * The first version read `media$.value.speaking$.value`. Nothing
     * re-renders this layer when somebody starts speaking — the change
     * happens inside a MediaViewModel and the tile model is untouched — so
     * the seam never bowed and the whole arrangement was a fixed half-and-
     * half. It is two tiles and always two, so a hook each is fine here.
     */
    const firstMedia = useBehavior(first.media$);
    const secondMedia = useBehavior(second.media$);
    const firstSpeaking = useBehavior(firstMedia.speaking$);
    const secondSpeaking = useBehavior(secondMedia.speaking$);

    const speaking: Speaking =
      firstSpeaking && secondSpeaking
        ? "both"
        : firstSpeaking
          ? "first"
          : secondSpeaking
            ? "second"
            : "none";

    const share = shareFor(speaking);
    const bow = seamFor(share);
    const tip = share + bow;
    // Clamped, because the stage can be reported smaller than the header
    // and footer that are subtracted from it — during a resize, or before
    // either has measured itself. A negative circle renders as nothing at
    // all, which looks like the call failing rather than like a frame.
    const circle = Math.max(
      0,
      Math.round(Math.min(width, height) * CIRCLE_SHARE),
    );

    const shapes = useMemo(() => {
      const common = {
        radius: "50%",
        tilt: 0,
        // A halo around one half would glow around the whole circle, since
        // both halves occupy the same box. The handoff gives this view an
        // inset rim light instead.
        speakingAs: "rim" as const,
        lifted: false,
        contentShare: FACE_SHARE_OF_CIRCLE,
      };
      // Keyed by the media's own id, not the user's: one Matrix user in the
      // call from two devices shares a user id, and keying by user gave both
      // halves whichever clip path was written last.
      const map = new Map<string, TileShape>();
      map.set(firstMedia.id, {
        ...common,
        clipPath: `url(#${seamId})`,
        focusX: share / 2,
      });
      map.set(secondMedia.id, {
        ...common,
        clipPath: `url(#${seamId}-rest)`,
        focusX: share + (1 - share) / 2,
      });
      return map;
    }, [firstMedia, secondMedia, seamId, share]);
    usePublishOrisoShapes(shapes);

    return (
      <div ref={ref} className={styles.layer} data-testid="einzelgespraech">
        {/* The seam is an SVG path in objectBoundingBox units, not a CSS
            clip-path shape. `ellipse()` cannot bow into the quiet side — its
            edge is always convex the same way — and the first attempt at it
            swallowed almost the whole circle: the quiet half became a sliver
            and its animal vanished. A quadratic curve says exactly what the
            design describes. */}
        <svg width="0" height="0" aria-hidden="true">
          <defs>
            <clipPath id={seamId} clipPathUnits="objectBoundingBox">
              <path d={`M0,0 L${share},0 Q${tip},0.5 ${share},1 L0,1 Z`} />
            </clipPath>
            {/* The same seam from the other side: the whole box minus the
                first half, by even-odd, so the second half bows exactly
                where the seam does instead of being cut down the middle. */}
            <clipPath
              id={`${seamId}-rest`}
              clipPathUnits="objectBoundingBox"
              clipRule="evenodd"
            >
              <path
                clipRule="evenodd"
                d={`M0,0 L1,0 L1,1 L0,1 Z M0,0 L${share},0 Q${tip},0.5 ${share},1 L0,1 Z`}
              />
            </clipPath>
          </defs>
        </svg>

        <div
          className={styles.circle}
          style={{ inlineSize: circle, blockSize: circle }}
          data-speaking={speaking}
        >
          <span
            className={styles.lift}
            style={{
              inlineSize: circle,
              blockSize: circle,
              boxShadow: liftFor(circle),
            }}
          />
          <Slot
            id={first.id}
            model={first}
            className={styles.slot}
            style={{ transition: `clip-path ${SEAM_EASING}` }}
          />
          <Slot
            id={second.id}
            model={second}
            className={styles.slot}
            style={{ transition: `clip-path ${SEAM_EASING}` }}
          />
        </div>
      </div>
    );
  },
});
