/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How often a pointer is sent: about 16 times a second.
 *
 * A mouse reports 60–1000 times a second; sending each one would flood every
 * participant's data channel for a dot nobody can follow that fast. 16 Hz is
 * smooth to the eye once the receiver eases between positions.
 */
export const POINTER_SEND_INTERVAL_MS = 60;

export interface Throttle<T> {
  /** Offer the newest value; it is sent now or at the end of the interval. */
  push: (value: T) => void;
  /** Send a pending value now. */
  flush: () => void;
  /** Drop a pending value and stop the timer. */
  cancel: () => void;
}

/**
 * Leading-and-trailing throttle: the first value goes at once, then at most
 * one per interval, and the LAST value offered is always delivered — so the
 * dot comes to rest where the mouse came to rest, not one step before it.
 */
export function createThrottle<T>(
  send: (value: T) => void,
  intervalMs: number = POINTER_SEND_INTERVAL_MS,
): Throttle<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const tick = (): void => {
    if (pending === null) {
      timer = null;
      return;
    }
    const { value } = pending;
    pending = null;
    send(value);
    timer = setTimeout(tick, intervalMs);
  };

  return {
    push(value: T): void {
      pending = { value };
      if (timer === null) tick();
    },
    flush(): void {
      if (pending === null) return;
      if (timer !== null) clearTimeout(timer);
      tick();
    },
    cancel(): void {
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
