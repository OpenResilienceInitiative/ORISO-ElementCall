/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CSSProperties, type FC, type ReactNode, useMemo } from "react";
import classNames from "classnames";

import styles from "./OrisoFace.module.css";
import { type OrisoIdentity } from "./identity";
import { useArtwork } from "./artwork";
import { haloFor } from "./halo";
import { liftFor } from "./lift";
import { coverScale, type TileShape } from "./shape";

/**
 * Padding around the artwork, as a share of the form's smaller side.
 *
 * ORISO-Frontend's values, judged by eye on a 104px avatar against the real
 * glyphs. Flat or delicate motifs read too small at 16% and get less. Keys
 * are file names without the extension, lower-case.
 */
const DEFAULT_ARTWORK_PADDING = 0.16;
const ARTWORK_PADDING: Readonly<Record<string, number>> = {
  alpaca: 0.14,
  dolphin: 0.12,
  giraffe: 0.12,
  nightingale: 0.12,
  turtle: 0.12,
};

export function artworkPaddingFor(file?: string): number {
  if (file === undefined) return DEFAULT_ARTWORK_PADDING;
  return (
    ARTWORK_PADDING[file.replace(/\.svg$/i, "").toLowerCase()] ??
    DEFAULT_ARTWORK_PADDING
  );
}

/**
 * Share of the diameter the artwork fills, for a given padding.
 *
 * ORISO-Frontend's formula, including the 4% it subtracts for the ring that
 * exists on a chat avatar and not here. Keeping the subtraction is deliberate:
 * the padding values were judged by eye on a 104px avatar that HAD that ring,
 * so dropping it would make every animal in the call 4% larger than the same
 * animal in the chat beside it.
 */
const BORDER_SHARE_AT_REFERENCE = 0.04;
const artworkFraction = (padding: number): number =>
  1 - 2 * padding - BORDER_SHARE_AT_REFERENCE;

interface Props {
  identity: OrisoIdentity;
  /** The form's smaller side in px. Drives the lift and the halo. */
  size: number;
  /**
   * What the artwork is sized against, when that is not the whole form.
   *
   * The Einzelgespräch needs it: both halves occupy the whole circle's box,
   * so sizing the animal off `size` gave each one an animal nearly as wide as
   * the circle — clipped at the seam on one side and running off the rim on
   * the other. The half is what the animal belongs to, so the half is what it
   * is measured against.
   */
  contentSize?: number;
  shape?: TileShape;
  speaking?: boolean;
  /** The host's origin, for inheriting the artwork. */
  parentUrl?: string | null;
  /** The camera, when there is one. Replaces the artwork, keeps the form. */
  video?: ReactNode;
  videoFit?: "cover" | "contain";
  className?: string;
}

/**
 * One person's form on the call stage.
 *
 * The same shape in all three arrangements — only its radius, its lean and
 * its size change, which is why there is one of these rather than three. It
 * carries the identity it was given and draws nothing of its own: the animal
 * is fetched from the host, the circle is the host's colour, the ink is the
 * host's ink. Where a camera is on, the camera takes the artwork's place and
 * the form is unchanged.
 *
 * Speaking is the person's own colour brightening, never a system accent.
 * `halo.ts` says why at length; the short version is that a shared accent
 * reads as the system flagging somebody and their own colour reads as them.
 */
export const OrisoFace: FC<Props> = ({
  identity,
  size,
  contentSize,
  shape,
  speaking = false,
  parentUrl = null,
  video,
  videoFit = "cover",
  className,
}) => {
  const artwork = useArtwork(identity, parentUrl);
  const tilt = shape?.tilt ?? 0;
  const rim = speaking && shape?.speakingAs === "rim";
  const lifted = shape?.lifted ?? true;

  /*
   * How big the drawing is, and who decides.
   *
   * With no `contentSize` the form decides: the handoff's padding off the
   * whole shape, per motif. With one, the LAYOUT has already decided — its
   * `contentShare` IS the handoff's target artwork fraction (0.56 of a field,
   * 0.22/0.86 of the shared circle) — so applying the padding again on top
   * shrank the animal to 36% of a field and 14% of the stage, well under both
   * targets. The supplied size is taken as the target for a default-padded
   * motif, and a flat one still gets its relative boost: the dolphin's 0.12
   * padding is 1.125x the default's 0.16 either way.
   */
  /** What the contents belong to: the half, the field, or the whole form. */
  const artworkBox = contentSize ?? size;
  const fraction = artworkFraction(artworkPaddingFor(identity.file));
  const inner = Math.max(
    0,
    Math.round(
      contentSize === undefined
        ? size * fraction
        : contentSize * (fraction / artworkFraction(DEFAULT_ARTWORK_PADDING)),
    ),
  );

  const style: CSSProperties = useMemo(
    () => ({
      borderRadius: shape?.radius ?? "50%",
      clipPath: shape?.clipPath,
      /*
       * With no shape of its own, the form is a CIRCLE — not an ellipse.
       *
       * `.face` fills its tile, which is what the grove and the fields want:
       * there the engine supplies an eight-value radius meant for that exact
       * box. With no shape the radius falls back to `50%`, and 50% of a
       * 300x200 spotlight is a 300x200 oval with the camera stretched into
       * it. The handoff's default is a circle, so take the smaller side —
       * `size` is already `min(width, height)` — and centre it.
       *
       * `inset: 0` with `margin: auto` centres on both axes against the tile
       * root, which is a containing block for it: `container-type: size`
       * implies `contain: layout`.
       */
      ...(shape === undefined
        ? {
            position: "absolute" as const,
            inset: 0,
            margin: "auto",
            inlineSize: size,
            blockSize: size,
          }
        : {}),
      transform: tilt === 0 ? undefined : `rotate(${tilt}deg)`,
      background: identity.bg,
      // The lift scales with the form; the halo replaces it outright, because
      // the handoff gives the speaking state as a whole stack rather than as
      // something added to the quiet one. A form that is one half of a
      // shared circle carries neither: a clip path clips a shadow, so both
      // would be cut along the seam.
      boxShadow: !lifted
        ? undefined
        : speaking
          ? haloFor(identity.bg, true)
          : liftFor(size),
    }),
    [shape, tilt, identity.bg, speaking, size, lifted],
  );

  // The contents stay upright while the form leans, and sit over their own
  // half rather than over the shared box when a layout says where.
  const focusShift =
    shape?.focusX === undefined ? 0 : (shape.focusX - 0.5) * size;
  const uprightTransforms = [
    focusShift === 0 ? "" : `translateX(${Math.round(focusShift)}px)`,
    tilt === 0 ? "" : `rotate(${-tilt}deg)`,
  ].filter(Boolean);
  const upright: CSSProperties = {
    transform:
      uprightTransforms.length === 0 ? undefined : uprightTransforms.join(" "),
  };

  return (
    <div
      className={classNames(styles.face, className)}
      style={style}
      data-testid="oriso-face"
      data-speaking={speaking ? "true" : "false"}
      data-kind={identity.kind}
    >
      {video === undefined ? (
        artwork === null ? (
          <span
            className={styles.initials}
            style={{
              ...upright,
              color: identity.ink,
              // Letters are not padded artwork; 0.34 of the box they sit in
              // was judged directly, and the drawing's own padding above does
              // not apply to them.
              fontSize: Math.round(artworkBox * 0.34),
            }}
            data-testid="oriso-initials"
            aria-hidden="true"
          >
            {identity.initials ?? ""}
          </span>
        ) : (
          /*
           * An `<img>`, not inlined markup.
           *
           * The drawing is fetched from whatever host `parentUrl` names, and
           * `parentUrl` is a URL parameter — anybody can open this call
           * pointed at a host of their own and have it fetch a drawing of
           * their own. Inlined through `dangerouslySetInnerHTML` that ran in
           * the call's origin. Referenced by an `<img>` it is loaded in image
           * context, where scripts do not execute, handlers do not fire and
           * external references are not followed, so the whole class of
           * attack is gone by construction rather than by a list of tags to
           * strip. (`artwork.ts` strips them anyway.)
           */
          <img
            className={styles.content}
            style={{ ...upright, width: inner, height: inner }}
            data-testid="oriso-artwork"
            src={artwork}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        )
      ) : (
        <div
          className={styles.video}
          data-fit={videoFit}
          data-testid="oriso-video"
          /*
           * The same shift the artwork and the letters get.
           *
           * In the Einzelgespräch both halves occupy the whole circle and are
           * clipped to their own side, so a camera centred on the box is
           * centred on the SEAM: the remote half showed the left of its
           * frame and the local half the right, which cuts both faces in two.
           * `focusX` is where this half's middle actually is.
           */
          style={{
            transform:
              [
                focusShift === 0
                  ? ""
                  : `translateX(${Math.round(focusShift)}px)`,
                tilt === 0
                  ? ""
                  : // Counter-rotated like the artwork, and grown by exactly
                    // enough to still cover the leaning frame.
                    `rotate(${-tilt}deg) scale(${coverScale(tilt).toFixed(4)})`,
              ]
                .filter(Boolean)
                .join(" ") || undefined,
          }}
        >
          {video}
        </div>
      )}
      {(shape?.body ?? true) && (
        <span className={styles.sphere} data-testid="oriso-sphere" />
      )}
      {rim && <span className={styles.rim} data-testid="oriso-rim" />}
    </div>
  );
};

OrisoFace.displayName = "OrisoFace";
