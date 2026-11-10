/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type IWidgetApiResponse,
  isErrorResponse,
  WidgetApi,
  WidgetApiDirection,
} from "matrix-widget-api";

export class OrisoWidgetApi extends WidgetApi {
  public constructor(widgetId: string, parentOrigin: string) {
    super(widgetId, parentOrigin);
    const parent = globalThis.parent;
    const transport = this.transport;

    // RoomWidgetClient decodes errors from the transport, whose error copy
    // can expose inherited fields. Validate the sender before it sees the
    // reply. The widget owns one API per iframe document.
    globalThis.addEventListener(
      "message",
      (event: MessageEvent<Partial<IWidgetApiResponse> | null>) => {
        const data = event.data;
        if (
          !transport.ready ||
          data?.widgetId !== widgetId ||
          data.api !== WidgetApiDirection.FromWidget
        ) {
          return;
        }
        if (
          event.isTrusted &&
          event.source === parent &&
          event.origin === parentOrigin
        ) {
          return;
        }

        const { response } = data;
        if (response && isErrorResponse(response)) {
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
  }
}
