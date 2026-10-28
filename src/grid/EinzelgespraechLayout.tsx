/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useId, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import { animated, useSpring } from "@react-spring/web";

import { type OneOnOneLayout as OneOnOneLayoutModel } from "../state/layout-types.ts";
import styles from "./EinzelgespraechLayout.module.css";
import { type CallLayout } from "./CallLayout";
import { useUpdateLayout } from "./Grid";
import {
  SEAM_BARS,
  SEAM_TWEEN,
  type Speaking,
  seamFor,
  seamMiddleFor,
  shareFor,
} from "../oriso/einzelgespraech";
import { liftFor } from "../oriso/lift";
import { usePublishOrisoShapes } from "../oriso/useOrisoShape";
import { type TileShape } from "../oriso/shape";
import { useBehavior } from "../useBehavior";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

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
 * The room kept free under the circle for the two names, and above it so
 * the circle stays centred.
 *
 * The names stand under the circle (section 2b), two lines of 18px and 16px
 * after a 12px gap. With the circle at 86% of a short stage there was 7% of
 * the height left below it — 21px on a 300px landscape phone — so the names
 * ran off the stage or under the toolbar.
 */
const NAME_ROOM = 40;

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

    /*
     * The seam MOVES, and it has to be moved by hand.
     *
     * The halves carry `clip-path: url(#seam)`, and that string never
     * changes — what changes is the `d` of the path it points at, which no
     * CSS transition on `clip-path` touches. (The first version put a
     * transition on the invisible measurement slot, which has no clip path at
     * all, so the seam simply jumped between states.) So the share is tweened
     * on the ticket's own curve and the path is rebuilt from it each frame,
     * by `animated.path` rather than by a React render — a render of a layout
     * layer bumps the grid's generation, and doing that sixty times a second
     * is how the first attempt at shapes in React state deadlocked.
     *
     * The two faces' `focusX` still steps rather than eases, because it
     * travels to the tiles through the shape store and a spring value cannot.
     * They sit near the middle of their halves, so a 450ms seam with the
     * faces already at their destination reads as the seam moving past them;
     * easing those too would mean re-rendering the layer per frame.
     */
    const share = shareFor(speaking);
    /*
     * Not for everybody.
     *
     * `Grid` asks this of every spring it owns, and this one is created here
     * instead — so it was the one piece of motion in the design that ignored
     * the preference. It is also the largest: a 450ms sweep of the seam
     * across the whole circle, on every change of who is speaking, in the
     * view two people are in for the length of a counselling session. With
     * the preference set the share goes straight to its destination, which
     * is where the two faces already step to.
     */
    const prefersReducedMotion = usePrefersReducedMotion();
    const { eased } = useSpring({
      eased: share,
      config: SEAM_TWEEN,
      immediate: prefersReducedMotion,
    });
    /** The seam, from a share — the same two curves at any point of the ease. */
    const seamPath = (at: number): string =>
      `M0,0 L${at},0 Q${at + seamFor(at)},0.5 ${at},1 L0,1 Z`;
    const restPath = (at: number): string =>
      `M0,0 L1,0 L1,1 L0,1 Z ${seamPath(at)}`;
    // Clamped, because the stage can be reported smaller than the header
    // and footer that are subtracted from it — during a resize, or before
    // either has measured itself. A negative circle renders as nothing at
    // all, which looks like the call failing rather than like a frame.
    const circle = Math.max(
      0,
      Math.round(Math.min(width, height - 2 * NAME_ROOM) * CIRCLE_SHARE),
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
              {/* `animated.path` so react-spring writes `d` straight onto the
                  element: the seam eases without a React render per frame,
                  which matters because a render of a layout layer bumps the
                  grid's generation. */}
              <animated.path d={eased.to(seamPath)} />
            </clipPath>
            {/* The same seam from the other side: the whole box minus the
                first half, by even-odd, so the second half bows exactly
                where the seam does instead of being cut down the middle. */}
            <clipPath
              id={`${seamId}-rest`}
              clipPathUnits="objectBoundingBox"
              clipRule="evenodd"
            >
              <animated.path clipRule="evenodd" d={eased.to(restPath)} />
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
          {/* No transition on these: they are the invisible measurement
              slots, they carry no clip path, and the motion is the spring on
              `share` above. */}
          <Slot id={first.id} model={first} className={styles.slot} />
          <Slot id={second.id} model={second} className={styles.slot} />
          {/* The microphone on the seam. It rides the same spring as the
              clip paths, so it never parts from the line it sits on, and its
              bars move only while somebody is actually speaking. */}
          <animated.div
            className={styles.seam}
            style={{
              insetInlineStart: eased.to(
                (at) => `${(seamMiddleFor(at) * 100).toFixed(3)}%`,
              ),
            }}
            data-testid="oriso-seam"
            data-active={speaking !== "none"}
            aria-hidden="true"
          >
            {SEAM_BARS.map((bar, i) => (
              <span
                key={i}
                className={styles.bar}
                style={{
                  inlineSize: bar.width,
                  animationDuration: `${bar.duration}s`,
                  animationDelay: `${bar.delay}s`,
                }}
              />
            ))}
          </animated.div>
        </div>
      </div>
    );
  },
});
