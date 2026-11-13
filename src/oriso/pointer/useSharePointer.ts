/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Room as MatrixRoom } from "matrix-js-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBehavior } from "../../useBehavior";
import { type CallViewModel } from "../../state/CallViewModel/CallViewModel";
import { ScreenShareViewModel } from "../../state/MediaViewModel";
import { PointerChannel } from "./PointerChannel";
import { type PointerContextValue } from "./SharePointerLayer";

export interface SharePointer {
  /** For `PointerContext`; null until the channel exists. */
  context: PointerContextValue | null;
  /** For the ⋮ switch; null hides it. */
  pointing: boolean | null;
  onPointingChange: ((pointing: boolean) => void) | null;
}

/**
 * The laser pointer for one call: its channel, the rooms it uses, and the ⋮
 * switch, which is only offered while somebody ELSE shares a screen and only
 * in an end-to-end encrypted call. The switch turns itself off when the
 * share ends, so the next share does not start with my mouse on air.
 */
export function useSharePointer(
  vm: CallViewModel,
  encrypted: boolean,
  matrixRoom: MatrixRoom,
): SharePointer {
  const [channel, setChannel] = useState<PointerChannel | null>(null);
  useEffect(() => {
    const ch = new PointerChannel({ encrypted });
    setChannel(ch);
    return (): void => {
      ch.destroy();
      setChannel(null);
    };
  }, [encrypted]);

  const rooms = useBehavior(vm.pointerRooms$);
  useEffect(() => {
    channel?.setRooms(rooms.publish, rooms.listen);
  }, [channel, rooms]);

  const spotlight = useBehavior(vm.spotlight$);
  const othersShare = spotlight.some(
    (m) => m instanceof ScreenShareViewModel && !m.local,
  );
  const [pointing, setPointing] = useState(false);
  useEffect(() => {
    if (!othersShare) setPointing(false);
  }, [othersShare]);

  const displayNameOf = useCallback(
    (userId: string): string =>
      matrixRoom.getMember(userId)?.rawDisplayName ?? userId,
    [matrixRoom],
  );
  const context = useMemo(
    () =>
      channel === null
        ? null
        : { channel, pointing: pointing && othersShare, displayNameOf },
    [channel, pointing, othersShare, displayNameOf],
  );

  const offered = channel?.available === true && othersShare;
  return {
    context,
    pointing: offered ? pointing : null,
    onPointingChange: offered ? setPointing : null,
  };
}
