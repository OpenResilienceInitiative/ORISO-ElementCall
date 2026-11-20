/*
Copyright 2026 OpenResilienceInitiative.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * ORISO-Frontend#2170: what the Frontend calls a call room when the
 * conversation did not come through a named direct link. The Frontend writes
 * it in German whatever the viewer reads, so it is shown as the localized
 * label rather than as written. Keep it in step with
 * `DEFAULT_CALL_ROOM_NAME` in the Frontend's `callRoomName.ts`.
 */
const NEUTRAL_CALL_NAME = "anruf";

export function roomDisplayName(
  name: string,
  roomId: string,
  localizedCallLabel: string,
  isEmbeddedOrisoCall: boolean,
): string {
  if (
    isEmbeddedOrisoCall &&
    (!name ||
      name === roomId ||
      name.trim().toLowerCase() === NEUTRAL_CALL_NAME ||
      /^Group call for !\S+$/u.test(name))
  ) {
    return localizedCallLabel;
  }
  return name;
}
