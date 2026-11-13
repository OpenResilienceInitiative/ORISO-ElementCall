/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CSSProperties,
  type FC,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useBehavior } from "../../useBehavior";
import {
  useOrisoIdentity,
  useOrisoStage,
  useShownName,
} from "../useOrisoIdentities";
import { fromVideoPoint, toVideoPoint } from "./geometry";
import { type PointerChannel, type RemotePointer } from "./PointerChannel";
import styles from "./SharePointerLayer.module.css";

/** How long a pointer stays visible after it last moved. */
export const POINTER_IDLE_MS = 1500;

export interface PointerContextValue {
  channel: PointerChannel;
  /** Whether MY pointer is being shown to the others (the ⋮ switch). */
  pointing: boolean;
  /** The Matrix display name for a user, for the label. */
  displayNameOf: (userId: string) => string;
}

interface Box {
  /** The video element's box, relative to this layer. */
  left: number;
  top: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
}

const NO_BOX: Box = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  videoWidth: 0,
  videoHeight: 0,
};

/** The shared video inside the tile this layer sits in, if any. */
function measure(layer: HTMLElement): Box {
  const own = layer.getBoundingClientRect();
  const video = layer.parentElement?.querySelector("video") ?? null;
  const rect = video?.getBoundingClientRect() ?? own;
  return {
    left: rect.left - own.left,
    top: rect.top - own.top,
    width: rect.width,
    height: rect.height,
    videoWidth: video?.videoWidth ?? 0,
    videoHeight: video?.videoHeight ?? 0,
  };
}

interface Props {
  /** The sharer's LiveKit identity: which screen these pointers are on. */
  share: string;
  /** My own share: I see the others' pointers but do not point at it. */
  local: boolean;
}

/**
 * The laser pointers on one shared screen.
 *
 * Sits over the screen-share tile with `pointer-events: none`, so it never
 * takes a click from the tile under it. When the ⋮ switch is on, it follows
 * the mouse over the tile — listening on the TILE, not on itself — and sends
 * where on the shared picture it is; it draws everybody else's pointer as a
 * dot in their ORISO colour with their name.
 */
export const SharePointerLayer: FC<Props> = (props) => {
  const ctx = useOrisoStage().pointer ?? null;
  return ctx === null ? null : <Layer {...props} ctx={ctx} />;
};

const Layer: FC<Props & { ctx: PointerContextValue }> = ({
  share,
  local,
  ctx,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>(NO_BOX);
  const pointers = useBehavior(ctx.channel.pointers$).get(share);
  const sending = ctx.pointing && !local;
  const { channel } = ctx;

  // Keep the box current: the tile resizes (grove band, spotlight,
  // maximised) and the video's own size arrives with its metadata.
  useLayoutEffect(() => {
    const layer = ref.current;
    if (layer === null) return;
    const update = (): void => setBox(measure(layer));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(layer);
    const video = layer.parentElement?.querySelector("video") ?? null;
    video?.addEventListener("loadedmetadata", update);
    video?.addEventListener("resize", update);
    return (): void => {
      ro.disconnect();
      video?.removeEventListener("loadedmetadata", update);
      video?.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const layer = ref.current;
    const tile = layer?.parentElement;
    if (!sending || !layer || !tile) return;
    const onMove = (e: PointerEvent): void => {
      const b = measure(layer);
      const own = layer.getBoundingClientRect();
      const p = toVideoPoint(
        e.clientX - own.left - b.left,
        e.clientY - own.top - b.top,
        b.width,
        b.height,
        b.videoWidth,
        b.videoHeight,
      );
      channel.point(share, p);
    };
    const onLeave = (): void => channel.point(share, null);
    tile.addEventListener("pointermove", onMove);
    tile.addEventListener("pointerleave", onLeave);
    return (): void => {
      tile.removeEventListener("pointermove", onMove);
      tile.removeEventListener("pointerleave", onLeave);
      channel.point(share, null);
    };
  }, [sending, channel, share]);

  return (
    <div
      ref={ref}
      className={styles.layer}
      data-testid="oriso-pointer-layer"
      data-pointing={sending ? "true" : undefined}
      aria-hidden="true"
    >
      {pointers?.map((p) => (
        <PointerDot
          key={p.identity}
          pointer={p}
          box={box}
          displayName={ctx.displayNameOf(p.userId)}
        />
      ))}
    </div>
  );
};

const FALLBACK_BG = "#5e4491";
const FALLBACK_INK = "#ffffff";

const PointerDot: FC<{
  pointer: RemotePointer;
  box: Box;
  displayName: string;
}> = ({ pointer, box, displayName }) => {
  const identity = useOrisoIdentity(pointer.userId, displayName);
  const name = useShownName(displayName, identity, pointer.userId);
  const [idle, setIdle] = useState(false);

  // Every new position wakes the dot; it fades when nothing new comes.
  useEffect(() => {
    setIdle(false);
    const t = setTimeout(() => setIdle(true), POINTER_IDLE_MS);
    return (): void => clearTimeout(t);
  }, [pointer.at, pointer.x, pointer.y]);

  const { left, top } = fromVideoPoint(
    pointer,
    box.width,
    box.height,
    box.videoWidth,
    box.videoHeight,
  );
  const style = {
    transform: `translate(${box.left + left}px, ${box.top + top}px)`,
    "--oriso-pointer-bg": identity?.bg ?? FALLBACK_BG,
    "--oriso-pointer-ink": identity?.ink ?? FALLBACK_INK,
  } as CSSProperties;

  return (
    <div
      className={styles.pointer}
      style={style}
      data-idle={idle ? "true" : undefined}
      data-testid="oriso-pointer"
      data-user={pointer.userId}
    >
      <span className={styles.spot} />
      <span className={styles.label}>{name}</span>
    </div>
  );
};
