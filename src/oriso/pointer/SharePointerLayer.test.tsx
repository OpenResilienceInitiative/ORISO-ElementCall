/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import { OrisoStageContext } from "../useOrisoIdentities";
import { POINTER_IDLE_MS, SharePointerLayer } from "./SharePointerLayer";
import { type PointerChannel, type PointersByShare } from "./PointerChannel";

const SHARE = "@sharer:oriso.org:S";

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  };
}

function setup({
  pointing = false,
  local = false,
}: { pointing?: boolean; local?: boolean } = {}): {
  pointers$: BehaviorSubject<PointersByShare>;
  point: ReturnType<typeof vi.fn>;
  tile: HTMLElement;
} {
  const pointers$ = new BehaviorSubject<PointersByShare>(new Map());
  const point = vi.fn();
  const channel = { pointers$, point } as unknown as PointerChannel;
  const { container } = render(
    <OrisoStageContext
      value={{
        identities: new Map([
          [
            "@anna:oriso.org",
            { kind: "initials", bg: "#165E83", ink: "#FFFFFF", initials: "A" },
          ],
        ]),
        parentUrl: null,
        enabled: true,
        pointer: {
          channel,
          pointing,
          displayNameOf: (u: string): string =>
            u === "@anna:oriso.org" ? "Anna Berg" : "Ben Ott",
        },
      }}
    >
      <div data-testid="tile">
        <video data-testid="video" />
        <SharePointerLayer share={SHARE} local={local} />
      </div>
    </OrisoStageContext>,
  );
  const tile = container.querySelector<HTMLElement>('[data-testid="tile"]')!;
  return { pointers$, point, tile };
}

/** jsdom has no PointerEvent; a MouseEvent of that type carries the point. */
function move(target: HTMLElement, clientX: number, clientY: number): void {
  fireEvent(
    target,
    new MouseEvent("pointermove", { bubbles: true, clientX, clientY }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public observe(): void {}
      public disconnect(): void {}
    },
  );
  // An 800×800 tile showing a 16:9 screen: letterboxed, 175px bars.
  // Patched on the prototypes `document` really uses, which in this test
  // environment are not the globals of the same name.
  const videoProto = Object.getPrototypeOf(document.createElement("video"));
  let rectOwner = videoProto;
  while (!Object.hasOwn(rectOwner, "getBoundingClientRect"))
    rectOwner = Object.getPrototypeOf(rectOwner);
  vi.spyOn(rectOwner, "getBoundingClientRect").mockReturnValue(rect(800, 800));
  Object.defineProperty(videoProto, "videoWidth", {
    configurable: true,
    get: () => 1920,
  });
  Object.defineProperty(videoProto, "videoHeight", {
    configurable: true,
    get: () => 1080,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SharePointerLayer", () => {
  it("draws each pointer at its spot on the picture, not on the tile", () => {
    const { pointers$ } = setup();
    act(() =>
      pointers$.next(
        new Map([
          [
            SHARE,
            [
              {
                identity: "@anna:oriso.org:A",
                userId: "@anna:oriso.org",
                x: 0.5,
                y: 0,
                at: 1,
              },
              {
                identity: "@ben:oriso.org:B",
                userId: "@ben:oriso.org",
                x: 1,
                y: 1,
                at: 1,
              },
            ],
          ],
        ]),
      ),
    );
    const [anna, ben] = screen.getAllByTestId("oriso-pointer");
    // Top of the picture is 175px down, below the bar.
    expect(anna.style.transform).toBe("translate(400px, 175px)");
    expect(ben.style.transform).toBe("translate(800px, 625px)");
    expect(anna.textContent).toBe("Anna Berg");
    // Ben is in the bottom-right corner: his name hangs left and up.
    expect(anna.dataset.flipX).toBeUndefined();
    expect(ben.dataset.flipX).toBe("true");
    expect(ben.dataset.flipY).toBe("true");
    // In the person's own ORISO colour.
    expect(anna.style.getPropertyValue("--oriso-pointer-bg")).toBe("#165E83");
    expect(anna.style.getPropertyValue("--oriso-pointer-ink")).toBe("#FFFFFF");
  });

  it("ignores pointers on another share", () => {
    const { pointers$ } = setup();
    act(() =>
      pointers$.next(
        new Map([
          [
            "@other:oriso.org:O",
            [
              {
                identity: "@anna:oriso.org:A",
                userId: "@anna:oriso.org",
                x: 0.5,
                y: 0.5,
                at: 1,
              },
            ],
          ],
        ]),
      ),
    );
    expect(screen.queryByTestId("oriso-pointer")).toBeNull();
  });

  it("fades a pointer that stopped moving, and wakes it when it moves", () => {
    const { pointers$ } = setup();
    const at = (n: number, x: number): void =>
      act(() =>
        pointers$.next(
          new Map([
            [
              SHARE,
              [
                {
                  identity: "@anna:oriso.org:A",
                  userId: "@anna:oriso.org",
                  x,
                  y: 0.5,
                  at: n,
                },
              ],
            ],
          ]),
        ),
      );
    at(1, 0.1);
    const dot = screen.getByTestId("oriso-pointer");
    expect(dot.dataset.idle).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(POINTER_IDLE_MS);
    });
    expect(dot.dataset.idle).toBe("true");
    at(2, 0.2);
    expect(screen.getByTestId("oriso-pointer").dataset.idle).toBeUndefined();
  });

  it("sends where I point when the switch is on, as a fraction of the picture", () => {
    const { point, tile } = setup({ pointing: true });
    move(tile, 200, 400);
    expect(point).toHaveBeenLastCalledWith(SHARE, { x: 0.25, y: 0.5 });
    // Over the black bar there is nothing to point at.
    move(tile, 200, 50);
    expect(point).toHaveBeenLastCalledWith(SHARE, null);
    fireEvent.pointerLeave(tile);
    expect(point).toHaveBeenLastCalledWith(SHARE, null);
  });

  it("sends nothing while the switch is off", () => {
    const { point, tile } = setup({ pointing: false });
    move(tile, 200, 400);
    expect(point).not.toHaveBeenCalled();
  });

  it("does not point at my own share", () => {
    const { point, tile } = setup({ pointing: true, local: true });
    move(tile, 200, 400);
    expect(point).not.toHaveBeenCalled();
  });

  it("is hidden from assistive tech and never takes a click", () => {
    setup();
    const layer = screen.getByTestId("oriso-pointer-layer");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    const css = readFileSync(
      "src/oriso/pointer/SharePointerLayer.module.css",
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.layer\s*\{[^}]*pointer-events:\s*none/);
    // Reduced motion: no easing and no fade animation.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.pointer[^{]*\{[^}]*transition:\s*none/,
    );
  });
});
