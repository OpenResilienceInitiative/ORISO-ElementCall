/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The seam moves, and for some people it must not.
 *
 * `Grid` asks `usePrefersReducedMotion()` for every spring it owns, but the
 * seam is tweened by a spring this layout creates itself — so it was the one
 * piece of motion in the design that ignored the preference, and the largest:
 * a 450ms sweep across the whole circle on every change of who is speaking,
 * in the view two people sit in for a whole counselling session.
 *
 * Measured on the path's own `d`, because that is what moves: the halves
 * carry `clip-path: url(#seam)` and the string never changes — what changes
 * is the `d` of the path it points at, written by `animated.path` without a
 * React render.
 */
import { type FC, type Ref } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { animated } from "@react-spring/web";
import { BehaviorSubject } from "rxjs";
import { beforeAll, describe, expect, it } from "vitest";

import { Grid, type TileProps } from "./Grid";
import { makeEinzelgespraechLayout } from "./EinzelgespraechLayout";
import { type OneOnOneLayout } from "../state/layout-types";
import { defaultSpotlightAlignment, defaultPipAlignment } from "./CallLayout";
import { MAX_SHARE, seamFor } from "../oriso/einzelgespraech";

beforeAll(() => {
  // `react-use-measure` refuses to run without one, and jsdom has none.
  // Nothing here reads the measured bounds.
  const Observer = class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  for (const target of [globalThis, globalThis.window, document.defaultView])
    if (target)
      (target as { ResizeObserver?: unknown }).ResizeObserver ??= Observer;
});

/** Whether the person has asked for less motion, for one render tree. */
const wantsLessMotion = (reduced: boolean): (() => void) => {
  const real = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as Partial<MediaQueryList> as MediaQueryList) as typeof window.matchMedia;
  return (): void => {
    window.matchMedia = real;
  };
};

interface Seat {
  speaking$: BehaviorSubject<boolean>;
  tile: {
    id: string;
    media$: BehaviorSubject<{
      id: string;
      speaking$: BehaviorSubject<boolean>;
    }>;
  };
}

const seat = (id: string): Seat => {
  const speaking$ = new BehaviorSubject(false);
  const media$ = new BehaviorSubject({ id, speaking$ });
  return { speaking$, tile: { id, media$ } };
};

const Tile: FC<TileProps<unknown, HTMLDivElement>> = ({ ref, style }) => (
  <animated.div ref={ref as Ref<HTMLDivElement>} style={style} />
);

const mount = (): {
  model: OneOnOneLayout;
  remoteSpeaking$: BehaviorSubject<boolean>;
  seam: () => string;
  unmount: () => void;
} => {
  const remote = seat("remote-media");
  const local = seat("local-media");
  const layout = makeEinzelgespraechLayout({
    minBounds$: new BehaviorSubject({ width: 800, height: 600 }),
    spotlightAlignment$: new BehaviorSubject(defaultSpotlightAlignment),
    pipAlignment$: new BehaviorSubject(defaultPipAlignment),
  });
  const model = {
    type: "one-on-one",
    remote: remote.tile,
    local: local.tile,
  } as unknown as OneOnOneLayout;
  const view = render(
    <Grid model={model} Layout={layout.scrolling} Tile={Tile} />,
  );
  return {
    model,
    remoteSpeaking$: remote.speaking$,
    // The first clip path: the one whose share the speaking state moves.
    seam: () =>
      view.container.querySelector("clipPath path")?.getAttribute("d") ?? "",
    unmount: view.unmount,
  };
};

/** Where the seam ends up once the first half has grown. */
const GROWN = `M0,0 L${MAX_SHARE},0 Q${MAX_SHARE + seamFor(MAX_SHARE)},0.5 ${MAX_SHARE},1 L0,1 Z`;

describe("the seam when somebody starts speaking", () => {
  it("travels there by default", async () => {
    const restore = wantsLessMotion(false);
    try {
      const { remoteSpeaking$, seam, unmount } = mount();
      expect(seam()).not.toBe(GROWN);

      act(() => remoteSpeaking$.next(true));
      // Mid-sweep: somewhere between, and not yet at the destination. A
      // 450ms tween cannot be done in a frame.
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(seam()).not.toBe(GROWN);

      // And it does arrive, so the test above is about timing rather than
      // about the seam never moving.
      await waitFor(() => expect(seam()).toBe(GROWN), { timeout: 2000 });
      unmount();
    } finally {
      restore();
    }
  });

  it("is already there for somebody who asked for less motion", async () => {
    const restore = wantsLessMotion(true);
    try {
      const { remoteSpeaking$, seam, unmount } = mount();
      expect(seam()).not.toBe(GROWN);

      act(() => remoteSpeaking$.next(true));
      // No sweep across the circle: one frame and it is at its destination.
      await waitFor(() => expect(seam()).toBe(GROWN), { timeout: 50 });
      unmount();
    } finally {
      restore();
    }
  });
});
