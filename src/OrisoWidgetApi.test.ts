/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  WidgetApiDirection,
  WidgetApiFromWidgetAction,
} from "matrix-widget-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrisoWidgetApi } from "./OrisoWidgetApi";

const widgetId = "oriso-call-test";
const hostOrigin = "https://host.example";
const generic = { message: "Error updating delayed event" };
const matrixError = {
  ...generic,
  matrix_api_error: {
    http_status: 404,
    http_headers: {},
    url: "",
    response: { errcode: "M_NOT_FOUND", error: "Delayed event not found" },
  },
};

const prototypeEnvelope = Object.fromEntries([
  ["message", generic.message],
  ["__proto__", { matrix_api_error: matrixError.matrix_api_error }],
]);

describe("OrisoWidgetApi error replies", () => {
  let api: OrisoWidgetApi;
  let receive: EventListener;

  beforeEach(() => {
    const listen = vi.spyOn(globalThis, "addEventListener");
    api = new OrisoWidgetApi(widgetId, hostOrigin);
    const listener = listen.mock.calls.find(
      ([type, , options]) =>
        type === "message" && typeof options === "object" && options.capture,
    )?.[1];
    listen.mockRestore();
    if (typeof listener !== "function") {
      throw new Error("Widget API did not register its capture listener");
    }
    receive = listener;
    api.transport.start();
  });

  afterEach(() => {
    api.transport.stop();
    globalThis.removeEventListener("message", receive, true);
  });

  function reply({
    source = globalThis.parent as MessageEventSource | null,
    origin = hostOrigin,
    isTrusted = true,
    action = WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
    id = widgetId,
    error = matrixError as object,
  } = {}): ReturnType<typeof vi.fn> {
    const stopImmediatePropagation = vi.fn();
    receive({
      source,
      origin,
      isTrusted,
      stopImmediatePropagation,
      data: {
        api: WidgetApiDirection.FromWidget,
        action,
        widgetId: id,
        requestId: "widgetapi-test",
        response: { error },
      },
    } as unknown as MessageEvent);
    return stopImmediatePropagation;
  }

  it.each([
    { source: null },
    { origin: "https://other.example" },
    { isTrusted: false },
    { source: null, action: WidgetApiFromWidgetAction.SendEvent },
  ])(
    "blocks untrusted typed replies before the SDK can decode them",
    (input) => {
      expect(reply(input)).toHaveBeenCalledOnce();
    },
  );

  it("lets the SDK decode a genuine parent's Matrix error", () => {
    expect(reply()).not.toHaveBeenCalled();
  });

  it("blocks errors that can acquire Matrix metadata during decoding", () => {
    expect(
      reply({ source: null, error: prototypeEnvelope }),
    ).toHaveBeenCalledOnce();
  });

  it("only accepts a generic error from the configured parent", () => {
    expect(reply({ error: generic })).not.toHaveBeenCalled();
    expect(reply({ source: null, error: generic })).toHaveBeenCalledOnce();
  });

  it("leaves messages for other widgets alone", () => {
    expect(reply({ source: null, id: "other-widget" })).not.toHaveBeenCalled();
  });

  it("leaves a stopped transport alone", () => {
    api.transport.stop();
    expect(reply({ source: null })).not.toHaveBeenCalled();
  });
});
