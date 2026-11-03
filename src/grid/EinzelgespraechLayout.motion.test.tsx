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
import {
  MAX_SHARE,
  SEAM_BARS,
  seamFor,
  seamMiddleFor,
} from "../oriso/einzelgespraech";

/** The bars of the capsule, top to bottom. */
const barsOf = (capsule: HTMLElement): HTMLElement[] => [
  ...capsule.querySelectorAll<HTMLElement>("[data-bar]"),
];
/** How far a bar is turned, from its inline transform. */
const turnOf = (bar: HTMLElement): number =>
  parseFloat(/rotate\((-?[\d.]+)deg\)/.exec(bar.style.transform)?.[1] ?? "NaN");

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
  localSpeaking$: BehaviorSubject<boolean>;
  seam: () => string;
  capsule: () => HTMLElement | null;
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
    localSpeaking$: local.speaking$,
    capsule: () =>
      view.container.querySelector<HTMLElement>('[data-testid="oriso-seam"]'),
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

describe("the microphone on the seam", () => {
  /*
   * Section 2b: a white capsule centred on the seam, nine short bars in the
   * primary colour that move while somebody speaks. Dev had nothing on the
   * seam at all.
   */
  it("stands on the seam with nine bars, resting while nobody speaks", () => {
    const restore = wantsLessMotion(true);
    try {
      const { capsule, unmount } = mount();
      const seam = capsule();
      expect(seam).not.toBeNull();
      expect(seam!.getAttribute("aria-hidden")).toBe("true");
      expect(seam!.dataset.active).toBe("false");
      expect(barsOf(seam!)).toHaveLength(SEAM_BARS.length);
      expect(SEAM_BARS).toHaveLength(9);
      // The even split: the seam, and so the capsule, is in the middle and
      // straight, its bars level.
      for (const bar of barsOf(seam!)) {
        expect(parseFloat(bar.style.insetInlineStart)).toBeCloseTo(50, 3);
        expect(turnOf(bar)).toBeCloseTo(0, 6);
      }
      expect(seam!.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
      unmount();
    } finally {
      restore();
    }
  });

  it("moves its bars while either person speaks, and rests again after", async () => {
    const restore = wantsLessMotion(true);
    try {
      const { capsule, remoteSpeaking$, localSpeaking$, unmount } = mount();

      act(() => remoteSpeaking$.next(true));
      await waitFor(() => expect(capsule()!.dataset.active).toBe("true"));
      act(() => remoteSpeaking$.next(false));
      await waitFor(() => expect(capsule()!.dataset.active).toBe("false"));
      act(() => localSpeaking$.next(true));
      await waitFor(() => expect(capsule()!.dataset.active).toBe("true"));
      unmount();
    } finally {
      restore();
    }
  });

  it("rides the seam as it bows, never parting from the line", async () => {
    const restore = wantsLessMotion(true);
    try {
      const { capsule, remoteSpeaking$, unmount } = mount();
      act(() => remoteSpeaking$.next(true));
      const middle = (): HTMLElement => barsOf(capsule()!)[4];
      await waitFor(
        () =>
          expect(parseFloat(middle().style.insetInlineStart)).toBeCloseTo(
            seamMiddleFor(MAX_SHARE) * 100,
            2,
          ),
        { timeout: 50 },
      );
      unmount();
    } finally {
      restore();
    }
  });

  it("bends with the seam, whichever side it bows to", async () => {
    // Frank, 28 Oct: a straight pill on a curved seam looks pasted on.
    const restore = wantsLessMotion(true);
    try {
      const { capsule, remoteSpeaking$, localSpeaking$, unmount } = mount();
      const ends = (): [number, number] => {
        const bars = barsOf(capsule()!);
        return [turnOf(bars[0]), turnOf(bars[bars.length - 1])];
      };
      const straight = capsule()!.querySelector("path")!.getAttribute("d");

      act(() => remoteSpeaking$.next(true));
      await waitFor(() => expect(Math.abs(ends()[0])).toBeGreaterThan(0.5));
      const [top, bottom] = ends();
      // Above the middle it leans one way, below it the other.
      expect(bottom).toBeCloseTo(-top, 6);
      expect(capsule()!.querySelector("path")!.getAttribute("d")).not.toBe(
        straight,
      );

      act(() => remoteSpeaking$.next(false));
      act(() => localSpeaking$.next(true));
      // The other speaker bows it the other way, so the lean mirrors.
      await waitFor(() => expect(ends()[0]).toBeCloseTo(-top, 6));
      unmount();
    } finally {
      restore();
    }
  });

  it("gives every bar its own speed and a later start than the last", () => {
    const restore = wantsLessMotion(true);
    try {
      const { capsule, unmount } = mount();
      // The moving part is inside each bar's seat, which carries the turn.
      const bars = barsOf(capsule()!).map(
        (seat) => seat.firstElementChild as HTMLElement,
      );
      const delays = bars.map((bar) => parseFloat(bar.style.animationDelay));
      expect(delays).toEqual([...delays].sort((a, b) => a - b));
      expect(new Set(bars.map((bar) => bar.style.animationDuration)).size).toBe(
        5,
      );
      expect(bars.map((bar) => bar.style.inlineSize)).toEqual(
        SEAM_BARS.map((bar) => `${bar.width}px`),
      );
      unmount();
    } finally {
      restore();
    }
  });
});
