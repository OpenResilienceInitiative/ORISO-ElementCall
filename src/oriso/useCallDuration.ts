/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

/** `m:ss` under an hour, `h:mm:ss` from then on, as in the design's "12:04". */
export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * When the call began: the oldest membership in it, so both people see the
 * same duration — not the moment this window happened to join. `fallback`
 * when the session cannot say.
 */
export function callStartOf(
  memberships: readonly { createdTs(): number }[] | undefined,
  fallback: number,
): number {
  let start = fallback;
  for (const membership of memberships ?? []) {
    try {
      const ts = membership.createdTs();
      if (Number.isFinite(ts) && ts > 0 && ts < start) start = ts;
    } catch {
      // A membership without a timestamp says nothing about the start.
    }
  }
  return start;
}

/**
 * How long the call has been running, for the header (design 2b:
 * "verschlüsselt · 12:04"). Null while switched off, and then no timer runs.
 */
export function useCallDuration(
  rtcSession: Pick<MatrixRTCSession, "memberships"> | undefined,
  enabled: boolean,
): string | null {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return (): void => clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;
  return formatCallDuration(
    now - callStartOf(rtcSession?.memberships, mountedAt),
  );
}
