/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import {
  ErrorCategory,
  ErrorCode,
  LiveKitAuthDeniedError,
  UnknownCallError,
  isBrowserMediaPermissionDenied,
} from "./errors.ts";

describe("isBrowserMediaPermissionDenied", () => {
  it("recognises Chromium's embedded NotSupportedError when media permission is denied", async () => {
    const queryPermission = vi
      .fn<(name: "microphone" | "camera") => Promise<PermissionState>>()
      .mockResolvedValueOnce("denied")
      .mockResolvedValueOnce("prompt");

    await expect(
      isBrowserMediaPermissionDenied(
        new DOMException("Not supported", "NotSupportedError"),
        queryPermission,
      ),
    ).resolves.toBe(true);
    expect(queryPermission).toHaveBeenCalledWith("microphone");
    expect(queryPermission).toHaveBeenCalledWith("camera");
  });

  it("does not relabel a genuine unsupported-media error", async () => {
    const queryPermission = vi
      .fn<(name: "microphone" | "camera") => Promise<PermissionState>>()
      .mockResolvedValue("prompt");

    await expect(
      isBrowserMediaPermissionDenied(
        new DOMException("Not supported", "NotSupportedError"),
        queryPermission,
      ),
    ).resolves.toBe(false);
  });

  it("does not inspect permissions for unrelated errors", async () => {
    const queryPermission = vi
      .fn<(name: "microphone" | "camera") => Promise<PermissionState>>()
      .mockResolvedValue("denied");

    await expect(
      isBrowserMediaPermissionDenied(
        new Error("device failed"),
        queryPermission,
      ),
    ).resolves.toBe(false);
    expect(queryPermission).not.toHaveBeenCalled();
  });
});

describe("UnknownCallError", () => {
  it("surfaces the underlying error's name and message in the localised body", () => {
    const cause = new TypeError("Failed to fetch");
    const error = new UnknownCallError(cause);
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(error.category).toBe(ErrorCategory.UNKNOWN);
    expect(error.cause).toBe(cause);
    expect(error.localisedMessage).toBeDefined();
    expect(error.localisedMessage).toContain("TypeError");
    expect(error.localisedMessage).toContain("Failed to fetch");
  });

  it("falls back to no localised body when the cause carries no detail", () => {
    const cause = new Error("");
    cause.name = "";
    const error = new UnknownCallError(cause);
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(error.localisedMessage).toBeUndefined();
  });
});

describe("LiveKitAuthDeniedError", () => {
  it("carries the HTTP status and classifies as a configuration issue", () => {
    const cause = new Error("Forbidden");
    const error = new LiveKitAuthDeniedError(403, cause);
    expect(error.code).toBe(ErrorCode.LIVEKIT_AUTH_DENIED_ERROR);
    expect(error.category).toBe(ErrorCategory.CONFIGURATION_ISSUE);
    expect(error.status).toBe(403);
    expect(error.cause).toBe(cause);
    expect(error.localisedMessage).toContain("403");
  });

  it("accepts 401 too", () => {
    const error = new LiveKitAuthDeniedError(401);
    expect(error.status).toBe(401);
    expect(error.localisedMessage).toContain("401");
  });
});
