/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The pointer's wire format on the LiveKit data channel.
 *
 * Deliberately tiny and deliberately dumb: which shared screen (the sharer's
 * LiveKit identity, the same on every client), and where on it as fractions
 * of the video frame, or nulls for "my pointer left the screen". WHO points
 * is not in the message — the receiver takes it from the participant the SFU
 * delivered the packet from, so nobody can point in somebody else's name.
 */

export const POINTER_TOPIC = "org.oriso.call.pointer";

export interface PointerMessage {
  /** The sharer's LiveKit participant identity. */
  share: string;
  /** Null together with `y`: the pointer left the screen. */
  x: number | null;
  y: number | null;
}

const VERSION = 1;
const round = (n: number): number => Math.round(n * 10_000) / 10_000;

export function encodePointer(msg: PointerMessage): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      v: VERSION,
      s: msg.share,
      x: msg.x === null ? null : round(msg.x),
      y: msg.y === null ? null : round(msg.y),
    }),
  );
}

const isFraction = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

export function decodePointer(bytes: Uint8Array): PointerMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { v, s, x, y } = raw as Record<string, unknown>;
  if (v !== VERSION || typeof s !== "string" || s === "") return null;
  if (x === null && y === null) return { share: s, x: null, y: null };
  if (!isFraction(x) || !isFraction(y)) return null;
  return { share: s, x, y };
}

/**
 * The Matrix user behind a LiveKit identity, which Element Call builds as
 * `${userId}:${deviceId}` (see `getParticipantId`). A user id contains
 * colons itself, a device id does not, so the user is everything before the
 * last one.
 */
export function userIdOfParticipant(identity: string): string | null {
  const i = identity.lastIndexOf(":");
  if (i <= 0 || !identity.startsWith("@")) return null;
  return identity.slice(0, i);
}
