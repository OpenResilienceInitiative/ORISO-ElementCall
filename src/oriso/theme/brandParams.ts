/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * One brand colour from the call address: exactly six lowercase hex digits,
 * no `#`. The app (ORISO-Frontend) writes it in that form; anything else is
 * ignored rather than repaired, so a stray value can neither become a colour
 * nor reach a stylesheet. Returns the seed in the form the colour engine
 * takes (`#rrggbb`), or null.
 */
const BRAND_HEX = /^[0-9a-f]{6}$/;

export const parseBrandHex = (
  value: string | null | undefined,
): string | null =>
  typeof value === "string" && BRAND_HEX.test(value) ? `#${value}` : null;
