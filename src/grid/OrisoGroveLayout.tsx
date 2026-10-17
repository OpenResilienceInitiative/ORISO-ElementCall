/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import { distinctUntilChanged } from "rxjs";

import { type GridLayout as GridLayoutModel } from "../state/layout-types.ts";
import { type GridTileViewModel } from "../state/TileViewModel.ts";
import styles from "./OrisoGroveLayout.module.css";
import { useInitial } from "../useInitial";
import { type CallLayout } from "./CallLayout";
import { type DragCallback, useUpdateLayout, useVisibleTiles } from "./Grid";
import { packShapes, splitCells } from "../oriso/layout";
import { orderForFelder, splitsInto } from "../oriso/felder";
import { usePublishOrisoShapes } from "../oriso/useOrisoShape";
import { useOrisoView } from "../oriso/useOrisoView";
import { FIELD_RADIUS, type TileShape } from "../oriso/shape";

/** A speaker's share of the grove, relative to a quiet participant's 1. */
export const SPEAKING_WEIGHT = 1.6;

/** The handoff's gutter between fields. */
export const FIELD_GUTTER = 6;

/**
 * How much of a field the animal fills.
 *
 * The handoff's 0.56 of the field's smaller side. A field is a rectangle and
 * can be very wide; sizing the animal off the whole cell filled it corner to
 * corner and left no room for the name capsule under it.
 */
export const FIELD_FACE_SHARE = 0.56;

/** The fixed field beyond eight people, when the surface starts scrolling. */
export const FIELD_MIN_WIDTH = 220;
export const FIELD_ASPECT = 4 / 3;

interface Placed {
  id: string;
  userId: string;
  model: GridTileViewModel;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: TileShape;
}

/** What the engine needs to know about one person, and nothing more. */
interface Seat {
  model: GridTileViewModel;
  userId: string;
  /**
   * What the silhouette is seeded from.
   *
   * The displayed name, as the prototype does it, so "ruhiger Fuchs 432"
   * arrives as the same slightly lopsided form on every client and in the
   * handoff's own screenshots. The user id is the fallback for a member whose
   * name has not arrived yet — without it everybody nameless would share one
   * shape, and the packer would stack them.
   */
  seed: string;
  speaking: boolean;
}

/**
 * The grove, and the fields.
 *
 * One layout rather than two, because they differ only in where the slots go:
 * both arrange the same people, both hand the same tiles to the same grid,
 * and the view switcher moves between them without anything else changing.
 * Splitting them would mean two registry entries, two media types and two
 * cases in `layoutMedia$` for one decision the user makes with one button.
 *
 * Placement comes from the prototype's own functions, unchanged —
 * `packShapes` for the grove, `splitCells` for the fields. The slots this
 * renders are invisible: `Grid` measures them and springs the real tiles into
 * place, so the motion, the dragging and the spotlight all keep working.
 */
export const makeOrisoGroveLayout: CallLayout<GridLayoutModel> = ({
  minBounds$,
  spotlightAlignment$,
}) => ({
  scrollingOnTop: false,

  // The spotlight tile — a screen share — lives in the fixed layer, exactly
  // as it does upstream.
  fixed: function OrisoGroveFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const alignment = useObservableEagerState(
      useInitial(() =>
        spotlightAlignment$.pipe(
          distinctUntilChanged(
            (a1, a2) => a1.block === a2.block && a1.inline === a2.inline,
          ),
        ),
      ),
    );

    const onDragSpotlight: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        spotlightAlignment$.next({
          block: yRatio < 0.5 ? "start" : "end",
          inline: xRatio < 0.5 ? "start" : "end",
        }),
      [],
    );

    return (
      <div ref={ref} className={styles.fixed}>
        {model.spotlight && (
          <Slot
            className={styles.slot}
            id="spotlight"
            model={model.spotlight}
            onDrag={onDragSpotlight}
            data-block-alignment={alignment.block}
            data-inline-alignment={alignment.inline}
          />
        )}
      </div>
    );
  },

  scrolling: function OrisoGrove({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    const { width, height } = useObservableEagerState(minBounds$);
    const view = useOrisoView();

    // One subscription per tile would need a hook per element, which React
    // does not allow in a loop of changing length. The grid re-renders this
    // layer whenever a tile model changes, and `media$` is a Behavior, so
    // reading its current value here is both legal and live.
    const seats: Seat[] = model.grid.map((tile) => {
      const media = tile.media$.value;
      return {
        model: tile,
        userId: media.userId,
        seed: media.displayName$.value || media.userId,
        speaking: media.speaking$.value,
      };
    });

    const scrolls = view === "felder" && !splitsInto(seats.length);

    // What the arrangement actually depends on, as one value. `seats` is
    // rebuilt on every render, so it cannot be a dependency itself; this is
    // the alternative to re-running a 240-pass relaxation every frame.
    const signature = `${view}:${width}x${height}:${seats
      .map((s) => `${s.userId}|${s.seed}|${s.speaking ? 1 : 0}`)
      .join(",")}`;

    const placed: Placed[] = useMemo(() => {
      if (seats.length === 0) return [];

      if (view === "hain") {
        // The grove is built around a square, which is what the handoff
        // draws and what `packShapes` assumes. In a wide window it is
        // centred rather than stretched: stretching would turn every
        // organic form into an ellipse.
        const box = Math.max(1, Math.min(width, height));
        const offsetX = Math.round((width - box) / 2);
        const offsetY = Math.round((height - box) / 2);
        return packShapes(
          seats.map((s) => s.seed),
          box,
          seats.map((s) => (s.speaking ? SPEAKING_WEIGHT : 1)),
        ).map((spot, i) => ({
          id: seats[i].model.id,
          userId: seats[i].userId,
          model: seats[i].model,
          x: spot.x + offsetX,
          y: spot.y + offsetY,
          width: spot.size,
          height: spot.size,
          shape: { radius: spot.blob, tilt: Number(spot.tilt) },
        }));
      }

      const speaker = seats.findIndex((s) => s.speaking);
      return splitCells(
        seats.map((_, i) => i),
        { x: 0, y: 0, w: Math.max(0, width), h: Math.max(0, height) },
        speaker,
      ).map((cell) => ({
        id: seats[cell.i].model.id,
        userId: seats[cell.i].userId,
        model: seats[cell.i].model,
        x: cell.x + FIELD_GUTTER / 2,
        y: cell.y + FIELD_GUTTER / 2,
        width: Math.max(1, cell.w - FIELD_GUTTER),
        height: Math.max(1, cell.h - FIELD_GUTTER),
        shape: {
          radius: FIELD_RADIUS,
          tilt: 0,
          body: false,
          contentShare: FIELD_FACE_SHARE,
        },
      }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    // Beyond eight people the fields stop subdividing. Speakers move to the
    // top and everybody else keeps their order — a comparator that reshuffled
    // the quiet ones whenever somebody cleared their throat would make a room
    // of twenty unreadable. See `felder.ts`.
    const sheet = useMemo(
      () =>
        scrolls
          ? orderForFelder(
              seats,
              seats.filter((s) => s.speaking),
            )
          : [],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [scrolls, signature],
    );

    const shapes = useMemo(() => {
      const map = new Map<string, TileShape>();
      if (scrolls)
        for (const seat of sheet)
          map.set(seat.userId, {
            radius: FIELD_RADIUS,
            tilt: 0,
            body: false,
            contentShare: FIELD_FACE_SHARE,
          });
      else for (const p of placed) map.set(p.userId, p.shape);
      return map;
    }, [scrolls, sheet, placed]);
    usePublishOrisoShapes(shapes);

    if (scrolls)
      return (
        <div
          ref={ref}
          className={styles.sheet}
          data-testid="oriso-grove"
          data-view="felder"
          data-mode="scroll"
          style={{ "--oriso-field-gutter": `${FIELD_GUTTER}px` } as never}
        >
          {sheet.map((seat) => (
            <Slot
              key={seat.model.id}
              className={styles.slot}
              id={seat.model.id}
              model={seat.model}
              style={{
                inlineSize: FIELD_MIN_WIDTH,
                blockSize: Math.round(FIELD_MIN_WIDTH / FIELD_ASPECT),
              }}
            />
          ))}
        </div>
      );

    return (
      <div
        ref={ref}
        className={styles.stage}
        data-testid="oriso-grove"
        data-view={view}
        data-mode="split"
        style={{ width, height }}
      >
        {placed.map((p) => (
          <Slot
            key={p.id}
            className={styles.slot}
            id={p.id}
            model={p.model}
            style={{
              position: "absolute",
              insetInlineStart: p.x,
              insetBlockStart: p.y,
              inlineSize: p.width,
              blockSize: p.height,
            }}
          />
        ))}
      </div>
    );
  },
});
