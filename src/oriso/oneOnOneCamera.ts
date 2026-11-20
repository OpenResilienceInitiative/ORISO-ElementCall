/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, distinctUntilChanged, type Observable, of } from "rxjs";

import { type OneOnOneLayoutMedia } from "../state/layout-types";

/**
 * Whether a camera is on in a 1:1 (#2233, D1/D5): either person's is enough.
 *
 * The cameras, not the call's intent, decide what two people see: both off
 * is the split circle, one on is the video stage with the other person
 * large. No 1:1, no camera.
 */
export function cameraOnInOneOnOne$(
  media: OneOnOneLayoutMedia | null,
): Observable<boolean> {
  if (media === null) return of(false);
  return combineLatest(
    [media.local.videoEnabled$, media.remote.videoEnabled$],
    (local, remote) => local || remote,
  ).pipe(distinctUntilChanged());
}
