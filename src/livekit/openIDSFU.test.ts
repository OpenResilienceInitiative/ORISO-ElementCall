/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSFUConfigWithOpenID, type OpenIDClientParts } from "./openIDSFU";
import {
  CallStartRequiresCounsellorError,
  ErrorCode,
  LiveKitAuthDeniedError,
} from "../utils/errors";

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

describe("only counsellors start calls (Frank, 17 Nov 2026)", () => {
  const token = {
    access_token: "synthetic-openid-canary",
    token_type: "Bearer",
    matrix_server_name: "matrix.example",
    expires_in: 300,
  } as const;
  const service = "https://call.example/livekit/jwt";
  const room = "!fixture:matrix.example";
  const client: OpenIDClientParts = {
    getOpenIdToken: vi
      .fn<OpenIDClientParts["getOpenIdToken"]>()
      .mockResolvedValue(token),
    getDeviceId: () => "ORISO_WEB_FIXTURE",
  };
  const refusal = (): Response =>
    Response.json(
      { error: "forbidden", reason: "call_start_requires_counsellor" },
      { status: 403 },
    );
  const granted = (): Response =>
    Response.json({ url: "wss://call.example/livekit/sfu", jwt: "jwt" });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a join refused for want of a counsellor once, after two seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(granted());
    vi.stubGlobal("fetch", fetch);

    const config = getSFUConfigWithOpenID(client, service, room);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(config).resolves.toEqual({
      url: "wss://call.example/livekit/sfu",
      jwt: "jwt",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("says so when the call is still refused after the retry", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(refusal());
    vi.stubGlobal("fetch", fetch);

    const config = getSFUConfigWithOpenID(client, service, room);
    const settled = expect(config).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof CallStartRequiresCounsellorError &&
        error.code === ErrorCode.CALL_START_REQUIRES_COUNSELLOR,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await settled;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry any other refusal", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "forbidden" }, { status: 403 }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(
      getSFUConfigWithOpenID(client, service, room),
    ).rejects.toBeInstanceOf(LiveKitAuthDeniedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
