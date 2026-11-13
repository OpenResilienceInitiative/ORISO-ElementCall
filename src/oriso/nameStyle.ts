/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";

import { useLocalStorage } from "../useLocalStorage";

/**
 * How names stand on the stage (design 2a, "Namen & Symbole").
 *
 * `popout` is the dark capsule, the default and what the handoff calls its
 * one name specification. `dezent` drops the capsule for plain text on the
 * atmosphere. A name over a running camera is always a capsule, whatever is
 * chosen: bare text on a moving picture cannot be read. That rule lives in
 * the stylesheet (`MediaView.module.css`), so it cannot be chosen away.
 *
 * Stored per person in this browser and chosen in the settings dialog's
 * preferences (`OrisoNameStyleSetting`); a running call follows at once.
 */
export type NameStyle = "dezent" | "popout";

export const NAME_STYLE_KEY = "oriso-call-names";

export function readNameStyle(raw: string | null): NameStyle {
  return raw === "dezent" ? "dezent" : "popout";
}

/** The stored choice and its setter, shared by the call and the settings. */
export function useNameStyle(): [NameStyle, (style: NameStyle) => void] {
  const [stored, setStored] = useLocalStorage(NAME_STYLE_KEY);
  const choose = useCallback(
    (style: NameStyle) => setStored(style),
    [setStored],
  );
  return [readNameStyle(stored), choose];
}
