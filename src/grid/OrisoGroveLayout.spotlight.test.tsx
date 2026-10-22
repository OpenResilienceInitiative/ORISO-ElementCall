/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Nobody stands under the shared screen.
 *
 * The live test of 22 October photographed the shared screen's box sitting
 * on the corner of a participant's form. The box is a fixed slot pinned to a
 * corner of the stage, drawn in a layer above the forms — upstream's
 * arrangement, kept — while the forms were packed across the whole stage as
 * though that corner were free.
 *
 * This renders the real layout and reads the rectangles it asks for, rather
 * than re-deriving them: a test that repeated the arithmetic would agree
 * with the layout however wrong both were.
 */
import { render } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { type ReactNode } from "react";

vi.mock("./Grid", () => ({
  // The grid's own bookkeeping, which needs a Grid around it. Neither does
  // anything this test can observe.
  useUpdateLayout: (): void => {},
  useVisibleTiles: (): void => {},
  SPEAKING_LAYER: 1,
}));

const { makeOrisoGroveLayout } = await import("./OrisoGroveLayout");
const { spotlightBlockSize } = await import("../oriso/spotlightRoom");
const { OrisoViewContext } = await import("../oriso/useOrisoView");

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const STAGE = { width: 900, height: 620 };

/** A tile model, cut down to what the grove reads off it. */
const tile = (id: string): unknown => ({
  id,
  media$: new BehaviorSubject({
    id,
    userId: `@${id}:oriso.test`,
    displayName$: new BehaviorSubject(`ruhiger Fuchs ${id}`),
    speaking$: new BehaviorSubject(false),
  }),
});

const placedRects = (
  people: number,
  view: "hain" | "felder",
  sharing: boolean,
  block: "start" | "end",
): Rect[] => {
  // Keyed by slot, because the test renderer renders twice and a list would
  // come back with every rectangle in it twice over.
  const rects = new Map<string, Rect>();
  const Slot = ({
    id,
    style,
  }: {
    id: string;
    style?: Record<string, number>;
  }): ReactNode => {
    if (style?.insetBlockStart !== undefined)
      rects.set(id, {
        top: style.insetBlockStart,
        bottom: style.insetBlockStart + (style.blockSize ?? 0),
        left: style.insetInlineStart ?? 0,
        right: (style.insetInlineStart ?? 0) + (style.inlineSize ?? 0),
      });
    return null;
  };
  const layout = makeOrisoGroveLayout({
    minBounds$: new BehaviorSubject(STAGE),
    spotlightAlignment$: new BehaviorSubject({ block, inline: "end" }),
    pipAlignment$: new BehaviorSubject({ block: "end", inline: "end" }),
  } as never);
  const Scrolling = layout.scrolling as (props: unknown) => ReactNode;
  render(
    <OrisoViewContext value={view}>
      <Scrolling
        ref={null}
        model={{
          grid: Array.from({ length: people }, (_, i) => tile(`p${i}`)),
          spotlight: sharing ? tile("screen") : undefined,
          setVisibleTiles: () => {},
        }}
        Slot={Slot}
      />
    </OrisoViewContext>,
  );
  return [...rects.values()];
};

/** The band the shared screen occupies, as the stylesheet draws it. */
const band = spotlightBlockSize(STAGE.width);

describe.each(["hain", "felder"] as const)("the %s, while sharing", (view) => {
  describe.each([2, 3, 5, 8] as const)("with %i people", (people) => {
    it("leaves the shared screen's band at the top empty", () => {
      const rects = placedRects(people, view, true, "start");
      expect(rects).toHaveLength(people);
      for (const rect of rects) expect(rect.top).toBeGreaterThanOrEqual(band);
    });

    it("leaves it empty at the bottom too", () => {
      const rects = placedRects(people, view, true, "end");
      expect(rects).toHaveLength(people);
      for (const rect of rects)
        expect(rect.bottom).toBeLessThanOrEqual(STAGE.height - band);
    });
  });
});

describe("the grove with nothing shared", () => {
  /*
   * The band is reserved only when there is something to reserve it for.
   * Without this the arrangement would give away a sixth of a counselling
   * call's stage for a screen nobody is sharing.
   */
  it("still uses the whole stage", () => {
    const sharing = placedRects(5, "hain", true, "start");
    const alone = placedRects(5, "hain", false, "start");
    expect(Math.min(...alone.map((r) => r.top))).toBeLessThan(band);
    expect(Math.min(...sharing.map((r) => r.top))).toBeGreaterThanOrEqual(band);
  });
});
