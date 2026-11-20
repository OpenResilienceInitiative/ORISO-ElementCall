/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

/**
 * How long a hand has been up, as the design's status capsule shows it:
 * "0:07", "1:40", "12:03". Minutes are not padded, seconds always are.
 */
export function formatHandDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The hand's duration, ticking once a second; null while no hand is up. */
export function useHandDuration(raisedAt: Date | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (raisedAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return (): void => clearInterval(timer);
  }, [raisedAt]);
  return raisedAt === undefined
    ? null
    : formatHandDuration(now - raisedAt.getTime());
}
