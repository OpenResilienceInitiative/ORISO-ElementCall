/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { type IWidgetApiRequest } from "matrix-widget-api";

import { OrisoWidgetActions, widget } from "../widget";

// The host only sends on change, and leaving to the lobby unmounts the call
// view: keep its last answer for the next mount. null: it has not spoken.
let lastAvailable: boolean | null = null;

/** Tests only: start without a word from the host. */
export const forgetInviteAvailable = (): void => {
  lastAvailable = null;
};

/**
 * Whether the call may offer its link ("Link teilen", "Einladelink senden").
 *
 * `orisoInvite` in the URL is the start. The host may learn during the call
 * that this call gets no guest link (#1662: a group call nobody may share)
 * and says so with `org.oriso.call.invite_available`; the entries then go
 * away, or come back, without reloading the call.
 */
export const useOrisoInviteAvailable = (initial: boolean): boolean => {
  const [available, setAvailable] = useState(lastAvailable ?? initial);

  useEffect(() => {
    if (!widget) return;
    const onInviteAvailable = (ev: CustomEvent<IWidgetApiRequest>): void => {
      ev.preventDefault();
      const data = ev.detail.data as { available?: unknown } | undefined;
      if (typeof data?.available === "boolean") {
        lastAvailable = data.available;
        setAvailable(data.available);
      }
      widget!.api.transport.reply(ev.detail, {});
    };
    widget.lazyActions.on(
      OrisoWidgetActions.InviteAvailable,
      onInviteAvailable,
    );
    return (): void => {
      widget!.lazyActions.off(
        OrisoWidgetActions.InviteAvailable,
        onInviteAvailable,
      );
    };
  }, []);

  return available;
};
