/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The backdrop stops drifting when somebody asks for less motion — including
 * when they ask for it DURING a call.
 *
 * `pond.js` reads the preference once, into a module-level constant, so a
 * preference switched on mid-call left its `requestAnimationFrame` loop
 * running; remounting would not help either, since that constant is
 * evaluated at import rather than per element. The file is ported verbatim
 * and its ticket says so in as many words, so the policy lives in this
 * wrapper and drives the element through the `stop()`, `loop()` and
 * `frame()` it already exposes.
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Atmosphere } from "./Atmosphere";

const real = window.matchMedia;
let reduced = false;

const stubMatchMedia = (): void => {
  window.matchMedia = ((query: string) =>
    ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as Partial<MediaQueryList> as MediaQueryList) as typeof window.matchMedia;
};

afterEach(() => {
  window.matchMedia = real;
  reduced = false;
});

/**
 * The element is not upgraded in jsdom — `pond.js` registers the custom
 * element from a dynamic import — so the methods are attached by hand. What
 * is under test is which of them this wrapper calls and when, not what the
 * prototype draws.
 */
const spyOnPond = (
  container: HTMLElement,
): {
  stop: ReturnType<typeof vi.fn>;
  loop: ReturnType<typeof vi.fn>;
  frame: ReturnType<typeof vi.fn>;
} => {
  const pond = container.querySelector("oriso-pond") as HTMLElement & {
    stop?: unknown;
    loop?: unknown;
    frame?: unknown;
  };
  expect(pond).toBeTruthy();
  const spies = { stop: vi.fn(), loop: vi.fn(), frame: vi.fn() };
  Object.assign(pond, spies);
  return spies;
};

describe("the backdrop and the motion preference", () => {
  it("keeps drifting for somebody who has not asked it to stop", () => {
    reduced = false;
    stubMatchMedia();
    const { container, rerender } = render(<Atmosphere palette="fluss" />);
    const pond = spyOnPond(container);

    // A palette change re-runs the effect, which is how the spies get to see
    // a call at all: the first run happened before they existed.
    rerender(<Atmosphere palette="teich" />);
    expect(pond.loop).toHaveBeenCalled();
    expect(pond.stop).not.toHaveBeenCalled();
  });

  it("holds still, on one frame, for somebody who has", () => {
    reduced = true;
    stubMatchMedia();
    const { container, rerender } = render(<Atmosphere palette="fluss" />);
    const pond = spyOnPond(container);

    rerender(<Atmosphere palette="teich" />);
    expect(pond.stop).toHaveBeenCalled();
    // A picture rather than a blank: the backdrop is still drawn once.
    expect(pond.frame).toHaveBeenCalled();
    expect(pond.loop).not.toHaveBeenCalled();
  });
});
