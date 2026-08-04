/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import { isBrowserMediaPermissionDenied } from "./errors.ts";

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
