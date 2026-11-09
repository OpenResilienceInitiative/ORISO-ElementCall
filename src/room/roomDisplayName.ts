/*
Copyright 2026 OpenResilienceInitiative.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export function roomDisplayName(
  name: string,
  roomId: string,
  localizedCallLabel: string,
  isEmbeddedOrisoCall: boolean,
): string {
  if (
    isEmbeddedOrisoCall &&
    (!name || name === roomId || /^Group call for !\S+$/u.test(name))
  ) {
    return localizedCallLabel;
  }
  return name;
}
