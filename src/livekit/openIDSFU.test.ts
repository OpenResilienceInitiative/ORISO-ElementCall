/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { afterEach, expect, it, vi } from "vitest";

import { getSFUConfigWithOpenID, type OpenIDClientParts } from "./openIDSFU";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("sends OpenID to the SFU gateway without logging the credential", async () => {
  const token = {
    access_token: "synthetic-openid-canary",
    token_type: "Bearer",
    matrix_server_name: "matrix.example",
    expires_in: 300,
  } as const;
  const service = "https://call.example/livekit/jwt";
  const room = "!fixture:matrix.example";
  const device = "ORISO_WEB_FIXTURE";
  const logs = (
    ["trace", "debug", "log", "info", "warn", "error"] as const
  ).map((level) => vi.spyOn(logger, level).mockImplementation(() => {}));
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      url: "wss://call.example/livekit/sfu",
      jwt: "synthetic-livekit-canary",
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const getOpenIdToken = vi
    .fn<OpenIDClientParts["getOpenIdToken"]>()
    .mockResolvedValue(token);

  await expect(
    getSFUConfigWithOpenID(
      {
        getOpenIdToken,
        getDeviceId: () => device,
      },
      service,
      room,
    ),
  ).resolves.toEqual({
    url: "wss://call.example/livekit/sfu",
    jwt: "synthetic-livekit-canary",
  });

  expect(fetch).toHaveBeenCalledWith(service + "/sfu/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, openid_token: token, device_id: device }),
  });
  const diagnostics = JSON.stringify(logs.flatMap((log) => log.mock.calls));
  expect(diagnostics).not.toContain(token.access_token);
  expect(diagnostics).not.toContain("synthetic-livekit-canary");
});
