/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";
import { type IWidgetApiRequest } from "matrix-widget-api";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { OrisoWidgetActions, widget } from "../widget";

const logger = rootLogger.getChild("[useOrisoWindow]");

export type OrisoWindowCommand = "minimise" | "toggle_fullscreen";

// The host only sends on change, and leaving to the lobby unmounts the call
// view: keep its last answer for the next mount.
let lastFullscreen = false;

/** Tests only: start without a state from the host. */
export const forgetWindowState = (): void => {
  lastFullscreen = false;
};

/**
 * The window controls in the call's header (`orisoHostChrome`).
 *
 * The window is the host's — the iframe cannot make itself smaller or fill
 * the screen — so the call asks with `org.oriso.call.window` and shows what
 * the host last said in `org.oriso.call.window_state`. Outside a widget, or
 * when the host keeps its own buttons, there are no controls: `send` is null.
 */
export const useOrisoWindow = (
  hostChrome: boolean,
): {
  fullscreen: boolean;
  send: ((command: OrisoWindowCommand) => void) | null;
} => {
  const [fullscreen, setFullscreen] = useState(lastFullscreen);

  useEffect(() => {
    if (!widget) return;
    const onWindowState = (ev: CustomEvent<IWidgetApiRequest>): void => {
      ev.preventDefault();
      const data = ev.detail.data as { fullscreen?: unknown } | undefined;
      if (typeof data?.fullscreen === "boolean") {
        lastFullscreen = data.fullscreen;
        setFullscreen(data.fullscreen);
      }
      widget!.api.transport.reply(ev.detail, {});
    };
    widget.lazyActions.on(OrisoWidgetActions.WindowState, onWindowState);
    return (): void => {
      widget!.lazyActions.off(OrisoWidgetActions.WindowState, onWindowState);
    };
  }, []);

  const send = useCallback((command: OrisoWindowCommand): void => {
    widget!.api.transport
      .send(OrisoWidgetActions.Window, { command })
      .catch((e) => logger.warn(`The host did not ${command}`, e));
  }, []);

  return {
    fullscreen,
    send: widget !== null && hostChrome ? send : null,
  };
};
