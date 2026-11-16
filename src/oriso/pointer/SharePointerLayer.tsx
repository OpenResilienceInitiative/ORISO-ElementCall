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
import {
  fromVideoPoint,
  layoutScale,
  localBox,
  localPoint,
  toVideoPoint,
  type VideoPoint,
} from "./geometry";
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
  /**
   * My own Matrix user ID: while I point, I see my own dot too (the others
   * see exactly this one), in my colour and with my name.
   */
  ownUserId?: string | null;
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

/**
 * The shared video inside the tile this layer sits in, if any, in the
 * layer's OWN pixels — not the viewport's. The tile may be scaled (it grows
 * in from `scale(0)`), and the dots are placed with a `translate()` that the
 * same scale applies to again; see `layoutScale`.
 */
function measure(layer: HTMLElement): Box {
  const own = layer.getBoundingClientRect();
  const video = layer.parentElement?.querySelector("video") ?? null;
  const scale = layoutScale(own.width, layer.offsetWidth);
  const b = localBox(own, video?.getBoundingClientRect() ?? own, scale);
  return {
    ...b,
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
  // My own position, drawn locally: the others see it, so should I.
  const [mine, setMine] = useState<(VideoPoint & { at: number }) | null>(null);

  // Keep the box current: the tile resizes (grove band, spotlight,
  // maximised) and the video's own size arrives with its metadata.
  useLayoutEffect(() => {
    const layer = ref.current;
    if (layer === null) return;
    const update = (): void => setBox(measure(layer));
    update();
    // A ResizeObserver does not see transforms, so a box first measured
    // mid-animation would never be corrected by it; `measure` works in the
    // layer's own pixels for that reason, and this keeps it current anyway.
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
      const at = localPoint(
        own,
        e.clientX,
        e.clientY,
        layoutScale(own.width, layer.offsetWidth),
      );
      const p = toVideoPoint(
        at.x - b.left,
        at.y - b.top,
        b.width,
        b.height,
        b.videoWidth,
        b.videoHeight,
      );
      channel.point(share, p);
      setMine(p === null ? null : { ...p, at: Date.now() });
    };
    const onLeave = (): void => {
      channel.point(share, null);
      setMine(null);
    };
    tile.addEventListener("pointermove", onMove);
    tile.addEventListener("pointerleave", onLeave);
    return (): void => {
      tile.removeEventListener("pointermove", onMove);
      tile.removeEventListener("pointerleave", onLeave);
      channel.point(share, null);
      setMine(null);
    };
  }, [sending, channel, share]);

  // Re-measure whenever there is something new to draw: cheap, and it
  // never trusts a box from an earlier frame of an animation.
  useLayoutEffect(() => {
    if (ref.current !== null && (pointers !== undefined || mine !== null))
      setBox(measure(ref.current));
  }, [pointers, mine]);

  const own = ctx.ownUserId ?? null;
  const echo: RemotePointer | null =
    sending && mine !== null && own !== null
      ? { identity: LOCAL_ECHO, userId: own, ...mine }
      : null;

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
      {echo && (
        <PointerDot
          key={LOCAL_ECHO}
          pointer={echo}
          box={box}
          displayName={ctx.displayNameOf(echo.userId)}
          mine
        />
      )}
    </div>
  );
};

/** The key of my own dot; no LiveKit identity looks like this. */
const LOCAL_ECHO = "local-echo";

const FLIP_X = 0.6;
const FLIP_Y = 0.9;
const FALLBACK_BG = "#5e4491";
const FALLBACK_INK = "#ffffff";

const PointerDot: FC<{
  pointer: RemotePointer;
  box: Box;
  displayName: string;
  mine?: boolean;
}> = ({ pointer, box, displayName, mine }) => {
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
      // Near the right or bottom edge the name hangs the other way, so it
      // is not cut off by the tile.
      data-flip-x={pointer.x > FLIP_X ? "true" : undefined}
      data-flip-y={pointer.y > FLIP_Y ? "true" : undefined}
      data-testid="oriso-pointer"
      data-user={pointer.userId}
      data-mine={mine ? "true" : undefined}
    >
      <span className={styles.spot} />
      <span className={styles.label}>{name}</span>
    </div>
  );
};
