/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { type IWidgetApiRequest } from "matrix-widget-api";

import { OrisoWidgetActions, widget } from "../widget";

// The host sends on change only, and leaving to the lobby unmounts the call
// view: keep its last answer for the next mount.
let lastCounsellors: ReadonlySet<string> | null = null;

/** Tests only: start without a list from the host. */
export const forgetCounsellors = (): void => {
  lastCounsellors = null;
};

/**
 * The host's list of counsellors in this call (`org.oriso.call.counsellors`
 * `{ userIds: string[] }`), or null until it has sent one.
 *
 * A malformed message is answered and ignored: it neither clears a list
 * that arrived before nor makes anybody a counsellor.
 */
export function readCounsellors(data: unknown): ReadonlySet<string> | null {
  const ids = (data as { userIds?: unknown } | undefined)?.userIds;
  if (!Array.isArray(ids)) return null;
  return new Set(ids.filter((id): id is string => typeof id === "string"));
}

export const useOrisoCounsellors = (): ReadonlySet<string> | null => {
  const [counsellors, setCounsellors] = useState(lastCounsellors);

  useEffect(() => {
    if (!widget) return;
    const onCounsellors = (ev: CustomEvent<IWidgetApiRequest>): void => {
      ev.preventDefault();
      const next = readCounsellors(ev.detail.data);
      if (next !== null) {
        lastCounsellors = next;
        setCounsellors(next);
      }
      widget!.api.transport.reply(ev.detail, {});
    };
    widget.lazyActions.on(OrisoWidgetActions.Counsellors, onCounsellors);
    return (): void => {
      widget!.lazyActions.off(OrisoWidgetActions.Counsellors, onCounsellors);
    };
  }, []);

  return counsellors;
};
