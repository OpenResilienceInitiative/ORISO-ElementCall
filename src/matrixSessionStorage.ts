/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export const MATRIX_AUTH_STORE_KEY = "matrix-auth-store";

export const clearStandaloneMatrixSession = (
  storage: Pick<Storage, "removeItem"> = localStorage,
): void => storage.removeItem(MATRIX_AUTH_STORE_KEY);
