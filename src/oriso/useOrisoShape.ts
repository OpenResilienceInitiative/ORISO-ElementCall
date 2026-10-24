/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createContext,
  use,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";

import { type TileShape } from "./shape";

/**
 * The channel from a layout to the tiles it placed.
 *
 * A tile knows its own box — the grid springs that in from the slot it
 * measured — but not what kind of form that box is: a grove blob with its own
 * eight-value radius and its own lean, a field with square corners, or one
 * bowed half of a shared circle. Only the layout knows, and the grid hands
 * tiles nothing but their rectangle.
 *
 * Going through the grid was the alternative, and it is worse: the slot would
 * have to carry the form as data attributes, `Grid` would have to read them
 * back off the DOM while measuring, and every layout upstream owns would grow
 * a field it does not use. This leaves `Grid` untouched.
 *
 * It is a subscription store rather than React state, and that is not a
 * preference. React state here deadlocks the grid: `useUpdateLayout` bumps a
 * generation on every render of a layout, `Grid` re-renders on that, and a
 * context change re-renders the layout straight through `Grid`'s `memo`. The
 * first version of this did exactly that and React stopped it with "Maximum
 * update depth exceeded". Publishing into a store notifies only the tiles,
 * which are leaves, so nothing above them renders again.
 */
export class OrisoShapeStore {
  private shapes: ReadonlyMap<string, TileShape> = new Map();
  private readonly listeners = new Set<() => void>();

  public publish(next: ReadonlyMap<string, TileShape>): void {
    if (sameShapes(this.shapes, next)) return;
    this.shapes = next;
    for (const listener of this.listeners) listener();
  }

  public get(mediaId: string): TileShape | undefined {
    return this.shapes.get(mediaId);
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => void this.listeners.delete(listener);
  };
}

/** True when two shape maps say the same thing. */
export function sameShapes(
  a: ReadonlyMap<string, TileShape>,
  b: ReadonlyMap<string, TileShape>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, shape] of a) {
    const other = b.get(id);
    if (
      other === undefined ||
      other.radius !== shape.radius ||
      other.tilt !== shape.tilt ||
      other.clipPath !== shape.clipPath ||
      other.focusX !== shape.focusX ||
      other.speakingAs !== shape.speakingAs ||
      other.contentShare !== shape.contentShare ||
      other.body !== shape.body ||
      other.lifted !== shape.lifted
    )
      return false;
  }
  return true;
}

export const OrisoShapesContext = createContext<OrisoShapeStore>(
  new OrisoShapeStore(),
);

/**
 * The form this tile is standing in, if a layout said.
 *
 * Keyed by the MEDIA's id rather than the user's. A Matrix user can be in one
 * call from two devices, which is two tiles under one user id; keying by user
 * gave both of them whichever form was published last.
 */
export function useOrisoShape(mediaId: string): TileShape | undefined {
  const store = use(OrisoShapesContext);
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(mediaId),
    () => undefined,
  );
}

/**
 * Called by an ORISO layout with the forms it just laid out.
 *
 * Published from a LAYOUT effect, which runs after the commit and before the
 * browser paints. A passive effect runs after the paint, so the frame that
 * first carried a new arrangement was painted with the previous one's forms:
 * fields drawn as leaning blobs for a frame when switching from the grove,
 * rail tiles wearing grove tilts, or a one-on-one pair still clipped by a
 * seam whose SVG definition had already gone with the layout that owned it.
 *
 * This cannot be witnessed by a test here: `act` flushes passive and layout
 * effects together before anything can observe the gap between them, and
 * jsdom never paints. It is the same reason the artwork is cleared during
 * render rather than in an effect — what a frame carries is decided before
 * the browser is allowed to show it.
 */
export function usePublishOrisoShapes(
  shapes: ReadonlyMap<string, TileShape>,
): void {
  const store = use(OrisoShapesContext);
  useLayoutEffect(() => store.publish(shapes), [store, shapes]);
  /*
   * A layout that is gone must not leave its forms behind.
   *
   * Switching to the spotlight unmounts the publisher but used to leave the
   * map standing, so upstream's spotlight tiles kept a grove tilt or a
   * one-on-one clip path — a seam cut into a tile with no seam in it. This is
   * a second effect rather than a cleanup on the one above on purpose: that
   * one re-runs whenever the shapes change, and clearing there would publish
   * an empty map between every two arrangements, blanking every form for a
   * frame. This cleanup runs only on unmount.
   */
  useLayoutEffect(() => (): void => store.publish(new Map()), [store]);
}
