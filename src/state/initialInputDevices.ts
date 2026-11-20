/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { filter, map, type Observable, take } from "rxjs";

import { type DeviceLabel } from "./MediaDevices";

/**
 * Starting the call on the microphone and camera the person picked in the
 * host app's own pre-join check (ORISO-ElementCall#116).
 *
 * The host passes them by label (`audioInput` / `videoInput` on the widget
 * URL): device ids are scoped to the origin that asked for them, and the host
 * runs on another origin than the call. Labels are the same on both once
 * media permission is granted.
 */

/** The input kinds the host can choose a device for. */
export type InitialInputKind = "audioinput" | "videoinput";

/** What became of one requested device. */
export type InitialInputOutcome = "selected" | "unmatched";

/**
 * The id of the device labelled `label`.
 *
 * Two devices with the same label (two identical webcams): the first one in
 * the browser's own order wins. The label is all the host can tell us, so
 * there is nothing better to tell them apart by.
 */
export function deviceIdForLabel(
  available: ReadonlyMap<string, DeviceLabel>,
  label: string,
): string | undefined {
  for (const [id, deviceLabel] of available) {
    if (deviceLabel.type === "name" && deviceLabel.name === label) return id;
  }
  return undefined;
}

/**
 * Once the device list carries labels, the id of the device labelled `label`
 * (`selected`), or `unmatched` when no device has that label. Emits once,
 * then completes.
 *
 * Waiting for labels rather than deciding on the first list: browsers report
 * numbered, label-less devices until media permission is granted, and an
 * `unmatched` on such a list would be a false alarm. Should labels never come
 * (no permission), nothing is emitted and the call keeps its default.
 */
export function initialInputDevice$(
  available$: Observable<ReadonlyMap<string, DeviceLabel>>,
  label: string,
): Observable<{ outcome: InitialInputOutcome; id?: string }> {
  return available$.pipe(
    filter((available) =>
      [...available.values()].some(
        (deviceLabel) => deviceLabel.type === "name",
      ),
    ),
    take(1),
    map((available) => {
      const id = deviceIdForLabel(available, label);
      return id === undefined
        ? { outcome: "unmatched" as const }
        : { outcome: "selected" as const, id };
    }),
  );
}
