/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * What the host tells the call about knocking (#108): how many people wait
 * on this call's link, and its "Anklopfen" setting. `knock: null` means the
 * host has no link to switch, so the call shows no switch.
 */
export interface KnockState {
  waiting: number;
  knock: boolean | null;
}

export const parseKnockState = (data: unknown): KnockState | null => {
  if (!data || typeof data !== "object") return null;
  const { waiting, knock } = data as Record<string, unknown>;
  if (typeof waiting !== "number" || !Number.isInteger(waiting) || waiting < 0)
    return null;
  if (knock !== null && typeof knock !== "boolean") return null;
  return { waiting, knock };
};
