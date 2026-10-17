/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import { combineLatest, distinctUntilChanged, map, of, switchMap } from "rxjs";

import { type GridLayout as GridLayoutModel } from "../state/layout-types.ts";
import { type GridTileViewModel } from "../state/TileViewModel.ts";
import styles from "./OrisoGroveLayout.module.css";
import { useInitial } from "../useInitial";
import { type CallLayout } from "./CallLayout";
import {
  type DragCallback,
  SPEAKING_LAYER,
  useUpdateLayout,
  useVisibleTiles,
} from "./Grid";
import {
  groveBox,
  haloRoomFor,
  packShapes,
  pairShapes,
  splitCells,
} from "../oriso/layout";
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
  mediaId: string;
  model: GridTileViewModel;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: TileShape;
  /*
   * Carried through to the slot, because a speaking form paints OUTSIDE its
   * own tile: the halo reaches `HALO_ROOM_PX` past it and the rise moves it
   * four pixels further. The grove packs its shapes until they abut, so with
   * every tile on one layer a later quiet neighbour painted over the lit-up
   * one — exactly where the two forms touch, which is where the halo is
   * doing its work.
   */
  speaking: boolean;
}

/** What the engine needs to know about one person, and nothing more. */
interface Seat {
  model: GridTileViewModel;
  /**
   * The media's own id, which is what a shape is published under.
   *
   * Not the user id: a Matrix user can be in the same call from two devices,
   * and then two tiles share a user id. Keying the shape channel by user
   * handed both of them whichever form was written last — duplicate geometry
   * in the grove, and in the Einzelgespräch both halves taking the second
   * half's clip path. The inherited IDENTITY is still looked up by user id,
   * because that is per person; the FORM is per tile.
   */
  mediaId: string;
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

    /*
     * Subscribed, not sampled.
     *
     * The first version read `media$.value` and `speaking$.value` straight
     * off the behaviors. That compiles and it reads correctly ONCE: nothing
     * re-renders this layer when somebody starts speaking, because speaking
     * changes inside a MediaViewModel and leaves the tile model alone. So the
     * grove never re-packed and the speaker never grew — the one piece of
     * motion this arrangement has. The same went for a display name arriving
     * late, which is what the silhouette is seeded from.
     *
     * A hook per tile is not available in a loop of changing length, so the
     * whole seat list is one observable instead, rebuilt only when the set of
     * tiles changes. `combineLatest` over behaviors emits synchronously on
     * subscribe, so the eager read still has a value on the first render.
     */
    const tiles = model.grid;
    const seats$ = useMemo(
      () =>
        tiles.length === 0
          ? of<Seat[]>([])
          : combineLatest(
              tiles.map((tile) =>
                tile.media$.pipe(
                  switchMap((media) =>
                    combineLatest([media.displayName$, media.speaking$]).pipe(
                      map(
                        ([displayName, speaking]): Seat => ({
                          model: tile,
                          mediaId: media.id,
                          seed: displayName || media.userId,
                          speaking,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
      [tiles],
    );
    const seats = useObservableEagerState(seats$);

    const scrolls = view === "felder" && !splitsInto(seats.length);

    // What the arrangement actually depends on, as one value. `seats` is
    // rebuilt on every render, so it cannot be a dependency itself; this is
    // the alternative to re-running a 240-pass relaxation every frame.
    const signature = `${view}:${width}x${height}:${seats
      .map((s) => `${s.mediaId}|${s.seed}|${s.speaking ? 1 : 0}`)
      .join(",")}`;

    const placed: Placed[] = useMemo(() => {
      if (seats.length === 0) return [];

      if (view === "hain") {
        /*
         * Two people are not a packing problem, and `packShapes` treats them
         * as one: with two shapes the relaxation has nothing to relax
         * against and buries 31.2% of one behind the other — measured, and
         * pinned in `layout.test.ts`. The count arises whenever a screen
         * share takes the Einzelgespräch away from a two-person call, or
         * when somebody simply picks the Kreis at two.
         *
         * So the positions come from the fields' own division, with the
         * grove's forms inscribed in them. Design decided this on
         * 2026-10-17; three, five and six still overlap and are left to the
         * prototype's packing until that has its own answer.
         */
        if (seats.length === 2) {
          const room = Math.round(haloRoomFor(width, height));
          return pairShapes(
            seats.map((s) => s.seed),
            {
              x: room,
              y: room,
              w: Math.max(0, width - 2 * room),
              h: Math.max(0, height - 2 * room),
            },
            seats.map((s) => (s.speaking ? SPEAKING_WEIGHT : 1)),
          ).map((spot, i) => ({
            id: seats[i].model.id,
            mediaId: seats[i].mediaId,
            model: seats[i].model,
            x: spot.x,
            y: spot.y,
            width: spot.size,
            height: spot.size,
            shape: { radius: spot.blob, tilt: Number(spot.tilt) },
            speaking: seats[i].speaking,
          }));
        }

        // The grove is built around a square, which is what the handoff
        // draws and what `packShapes` assumes. In a wide window it is
        // centred rather than stretched: stretching would turn every
        // organic form into an ellipse. Inset by the room a speaking halo
        // needs — see `groveBox`.
        const { box, offsetX, offsetY } = groveBox(width, height);
        return packShapes(
          seats.map((s) => s.seed),
          box,
          seats.map((s) => (s.speaking ? SPEAKING_WEIGHT : 1)),
        ).map((spot, i) => ({
          id: seats[i].model.id,
          mediaId: seats[i].mediaId,
          model: seats[i].model,
          x: spot.x + offsetX,
          y: spot.y + offsetY,
          width: spot.size,
          height: spot.size,
          shape: { radius: spot.blob, tilt: Number(spot.tilt) },
          speaking: seats[i].speaking,
        }));
      }

      const speaker = seats.findIndex((s) => s.speaking);
      /*
       * The fields divide an INSET rectangle, for the grove's reason.
       *
       * An edge cell is only half a gutter from the stage edge — three
       * pixels — while a speaking form's halo paints `HALO_ROOM_PX` past its
       * tile and the rise moves it further. `.inRoom` clips horizontally, so
       * anybody along an outer edge lost most of their speaking signal. The
       * inset goes into the rectangle `splitCells` divides, so every cell
       * comes back already inside it.
       */
      const room = Math.round(haloRoomFor(width, height));
      return splitCells(
        seats.map((_, i) => i),
        {
          x: room,
          y: room,
          w: Math.max(0, width - 2 * room),
          h: Math.max(0, height - 2 * room),
        },
        speaker,
      ).map((cell) => ({
        id: seats[cell.i].model.id,
        mediaId: seats[cell.i].mediaId,
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
        speaking: seats[cell.i].speaking,
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
          map.set(seat.mediaId, {
            radius: FIELD_RADIUS,
            tilt: 0,
            body: false,
            contentShare: FIELD_FACE_SHARE,
          });
      else for (const p of placed) map.set(p.mediaId, p.shape);
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
          style={
            {
              "--oriso-field-gutter": `${FIELD_GUTTER}px`,
              // The sheet pads rather than insets; see the stylesheet.
              "--oriso-halo-room": `${Math.round(haloRoomFor(width, height))}px`,
            } as never
          }
        >
          {sheet.map((seat) => (
            <Slot
              key={seat.model.id}
              className={styles.slot}
              id={seat.model.id}
              model={seat.model}
              layer={seat.speaking ? SPEAKING_LAYER : undefined}
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
            layer={p.speaking ? SPEAKING_LAYER : undefined}
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
