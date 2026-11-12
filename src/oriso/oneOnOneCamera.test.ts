/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { BehaviorSubject, firstValueFrom } from "rxjs";

import { cameraOnInOneOnOne$ } from "./oneOnOneCamera";
import { type OneOnOneLayoutMedia } from "../state/layout-types";

const person = (on: boolean): { videoEnabled$: BehaviorSubject<boolean> } => ({
  videoEnabled$: new BehaviorSubject(on),
});

const pair = (local: boolean, remote: boolean): OneOnOneLayoutMedia =>
  ({
    type: "one-on-one",
    local: person(local),
    remote: person(remote),
  }) as unknown as OneOnOneLayoutMedia;

/*
 * #2233 (D1, D5): two people with both cameras off share the split circle;
 * as soon as one camera is on, the 1:1 is a video stage.
 */
describe("a camera in the 1:1 (#2233)", () => {
  it("is off when both cameras are off", async () => {
    expect(await firstValueFrom(cameraOnInOneOnOne$(pair(false, false)))).toBe(
      false,
    );
  });

  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])("is on when mine is %s and theirs is %s", async (local, remote) => {
    expect(await firstValueFrom(cameraOnInOneOnOne$(pair(local, remote)))).toBe(
      true,
    );
  });

  it("follows a camera turned on during the call", () => {
    const media = pair(false, false);
    const seen: boolean[] = [];
    const sub = cameraOnInOneOnOne$(media).subscribe((on) => seen.push(on));
    (media.remote.videoEnabled$ as BehaviorSubject<boolean>).next(true);
    (media.remote.videoEnabled$ as BehaviorSubject<boolean>).next(false);
    sub.unsubscribe();
    expect(seen).toEqual([false, true, false]);
  });

  it("is off when there is no 1:1", async () => {
    expect(await firstValueFrom(cameraOnInOneOnOne$(null))).toBe(false);
  });
});
