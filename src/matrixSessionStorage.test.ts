/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import {
  clearStandaloneMatrixSession,
  MATRIX_AUTH_STORE_KEY,
} from "./matrixSessionStorage";

describe("widget boot storage migration", () => {
  it("removes the legacy standalone Matrix session", () => {
    const removeItem = vi.fn();

    clearStandaloneMatrixSession({ removeItem });

    expect(removeItem).toHaveBeenCalledWith(MATRIX_AUTH_STORE_KEY);
  });
});
