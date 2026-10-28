/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";
import { type IWidgetApiRequest } from "matrix-widget-api";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { OrisoWidgetActions, widget } from "../widget";
import { type KnockState, parseKnockState } from "./knockState";

const logger = rootLogger.getChild("[useOrisoKnock]");

/**
 * Knocking in the call (#108). The link and its queue belong to the host:
 * the call shows what the host sends and asks it to flip "Anklopfen".
 * Outside a widget, or before the host has a link, there is no switch.
 */
export const useOrisoKnock = (): {
  waiting: number;
  knock: boolean | null;
  setKnock: ((knock: boolean) => void) | null;
} => {
  const [state, setState] = useState<KnockState>({ waiting: 0, knock: null });

  useEffect(() => {
    if (!widget) return;
    const onKnockState = (ev: CustomEvent<IWidgetApiRequest>): void => {
      ev.preventDefault();
      const next = parseKnockState(ev.detail.data);
      if (next) setState(next);
      widget!.api.transport.reply(ev.detail, {});
    };
    widget.lazyActions.on(OrisoWidgetActions.KnockState, onKnockState);
    return (): void => {
      widget!.lazyActions.off(OrisoWidgetActions.KnockState, onKnockState);
    };
  }, []);

  const setKnock = useCallback((knock: boolean): void => {
    // Flip at once; the host confirms with its next knock state.
    setState((current) => ({ ...current, knock }));
    widget!.api.transport
      .send(OrisoWidgetActions.SetKnock, { knock })
      .catch((e) => {
        logger.warn("The host did not change Anklopfen", e);
        setState((current) => ({ ...current, knock: !knock }));
      });
  }, []);

  return {
    waiting: state.waiting,
    knock: state.knock,
    setKnock: widget !== null && state.knock !== null ? setKnock : null,
  };
};
