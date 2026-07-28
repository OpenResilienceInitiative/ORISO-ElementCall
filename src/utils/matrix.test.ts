/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as MatrixSdk from "matrix-js-sdk";
import type * as UrlParams from "../UrlParams";
import { initClient } from "./matrix";

const createClientMock = vi.hoisted(() => vi.fn());
const getUrlParamsMock = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({
    widgetId: null,
    parentUrl: null,
    e2eEnabled: true,
  })),
);

vi.mock("matrix-js-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof MatrixSdk>();
  return { ...actual, createClient: createClientMock };
});
vi.mock("../UrlParams", async (importOriginal) => {
  const actual = await importOriginal<typeof UrlParams>();
  return { ...actual, getUrlParams: getUrlParamsMock };
});

describe("standalone Matrix client boundary", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("rejects widget URLs before creating a second Matrix client", async () => {
    getUrlParamsMock.mockReturnValue({
      widgetId: "oriso-call",
      parentUrl: "https://app.oriso.example",
      accessToken: "must-never-be-consumed",
    });
    localStorage.setItem(
      "matrix-auth-store",
      JSON.stringify({
        access_token: "legacy-token",
        device_id: "ORISO_CALL_legacy",
      }),
    );

    await expect(
      initClient(
        {
          baseUrl: "https://matrix.oriso.example",
          accessToken: "legacy-token",
          deviceId: "ORISO_CALL_legacy",
        },
        true,
      ),
    ).rejects.toThrow("Standalone Matrix clients are disabled in widget mode");

    expect(createClientMock).not.toHaveBeenCalled();
  });
});
