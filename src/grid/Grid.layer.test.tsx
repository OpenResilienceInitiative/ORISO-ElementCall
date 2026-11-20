/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * A tile that paints outside its own box needs a layer of its own.
 *
 * The slots a layout renders are invisible measuring boxes — the real tile is
 * sprung into place by `Grid`, and its `z-index` comes from the spring. So a
 * layout cannot raise one tile from the slot's own style, and the ORISO
 * grove's speaker, whose halo reaches `HALO_ROOM_PX` past its tile and whose
 * rise moves it four pixels further, was painted over by whichever quiet
 * neighbour came later in the DOM. The visual harness gave the speaker a
 * z-index; the real layout had no way to.
 *
 * This renders a real `Grid`, because the property is the whole path: a
 * layout asks, and the tile carries it.
 */
import { type FC, type Ref } from "react";
import { render, screen } from "@testing-library/react";
import { animated } from "@react-spring/web";
import { beforeAll, describe, expect, it } from "vitest";

import {
  Grid,
  type LayoutProps,
  type TileProps,
  SPEAKING_LAYER,
  BASE_LAYER,
  useUpdateLayout,
} from "./Grid";

interface Model {
  name: string;
  /** Whoever is lit up, and so has to be in front. */
  loud: boolean;
}

/*
 * jsdom has no layout, so every `offsetWidth` is 0 — and `Grid` drops a slot
 * it measures as empty, which would leave no tiles at all. The slots below
 * carry an inline size and this hands it back, so the grid works from the
 * layout's own numbers.
 */
beforeAll(() => {
  /*
   * `Grid` measures itself with `react-use-measure`, which refuses to run
   * without a `ResizeObserver`; jsdom has none. Nothing here depends on the
   * measured bounds — the slots carry their own size below — so an observer
   * that never reports is enough to get past the check.
   */
  const Observer = class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  /*
   * On both, because the setup file's `global-jsdom/register` and Vitest's
   * own jsdom environment are two realms: the library reads it off `window`,
   * and defining it on one of the two is silent.
   */
  for (const target of [globalThis, globalThis.window, document.defaultView])
    if (target)
      (target as { ResizeObserver?: unknown }).ResizeObserver ??= Observer;

  const prototype = Object.getPrototypeOf(
    Object.getPrototypeOf(document.createElement("div")),
  ) as object;
  for (const [property, axis] of [
    ["offsetWidth", "width"],
    ["offsetHeight", "height"],
  ] as const)
    Object.defineProperty(prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style[axis]) || 0;
      },
    });
});

const Layout: FC<LayoutProps<Model[], Model, HTMLDivElement>> = ({
  ref,
  model,
  Slot,
}) => {
  useUpdateLayout();
  return (
    <div ref={ref}>
      {model.map((tile) => (
        <Slot
          key={tile.name}
          id={tile.name}
          model={tile}
          layer={tile.loud ? SPEAKING_LAYER : undefined}
          style={{ width: 100, height: 100 }}
        />
      ))}
    </div>
  );
};

const Tile: FC<TileProps<Model, HTMLDivElement>> = ({ ref, style, model }) => (
  <animated.div ref={ref as Ref<HTMLDivElement>} style={style}>
    <span data-testid={`tile-${model.name}`} />
  </animated.div>
);

/** The element the spring writes its `z-index` onto. */
const layerOf = (name: string): number =>
  Number(
    screen.getByTestId(`tile-${name}`).parentElement?.style.zIndex ?? "NaN",
  );

describe("a tile's stacking layer", () => {
  it("is the plain one unless the layout asks for another", () => {
    render(
      <Grid
        model={[
          { name: "quiet", loud: false },
          { name: "alsoquiet", loud: false },
        ]}
        Layout={Layout}
        Tile={Tile}
      />,
    );
    expect(layerOf("quiet")).toBe(BASE_LAYER);
    expect(layerOf("alsoquiet")).toBe(BASE_LAYER);
  });

  it("puts the tile the layout raised in front of the others", () => {
    // Order matters: the raised tile comes FIRST, so without a layer of its
    // own the later sibling paints over it — which is exactly the grove's
    // case, where the speaker is wherever the packer put them.
    render(
      <Grid
        model={[
          { name: "speaker", loud: true },
          { name: "neighbour", loud: false },
        ]}
        Layout={Layout}
        Tile={Tile}
      />,
    );
    expect(layerOf("speaker")).toBe(SPEAKING_LAYER);
    expect(layerOf("neighbour")).toBe(BASE_LAYER);
    expect(layerOf("speaker")).toBeGreaterThan(layerOf("neighbour"));
  });
});
