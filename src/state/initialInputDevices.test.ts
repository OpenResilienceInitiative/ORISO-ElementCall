/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";

import { type DeviceLabel } from "./MediaDevices";
import { deviceIdForLabel, initialInputDevice$ } from "./initialInputDevices";

const named = (
  ...devices: [id: string, name: string][]
): Map<string, DeviceLabel> =>
  new Map(devices.map(([id, name]) => [id, { type: "name", name }]));

const numbered = (...ids: string[]): Map<string, DeviceLabel> =>
  new Map(ids.map((id, i) => [id, { type: "number", number: i + 1 }]));

describe("deviceIdForLabel", () => {
  it("finds the device with that label", () => {
    expect(
      deviceIdForLabel(
        named(["mic-1", "MacBook Pro Microphone"], ["mic-2", "Jabra Evolve2"]),
        "Jabra Evolve2",
      ),
    ).toBe("mic-2");
  });

  it("takes the first of two devices with the same label", () => {
    expect(
      deviceIdForLabel(
        named(["cam-a", "USB Camera"], ["cam-b", "USB Camera"]),
        "USB Camera",
      ),
    ).toBe("cam-a");
  });

  it("finds nothing for an unknown label", () => {
    expect(
      deviceIdForLabel(named(["mic-1", "Built-in"]), "Jabra"),
    ).toBeUndefined();
  });

  it("never matches a numbered (label-less) device", () => {
    expect(deviceIdForLabel(numbered("mic-1"), "1")).toBeUndefined();
  });
});

describe("initialInputDevice$", () => {
  const outcomes = (
    available$: BehaviorSubject<Map<string, DeviceLabel>>,
    label: string,
  ): unknown[] => {
    const seen: unknown[] = [];
    initialInputDevice$(available$, label).subscribe((o) => seen.push(o));
    return seen;
  };

  it("selects the device once labels are known", () => {
    const available$ = new BehaviorSubject(numbered("mic-1", "mic-2"));
    const seen = outcomes(available$, "Jabra Evolve2");
    // Before media permission: no labels, so no verdict yet.
    expect(seen).toEqual([]);

    available$.next(named(["mic-1", "Built-in"], ["mic-2", "Jabra Evolve2"]));
    expect(seen).toEqual([{ outcome: "selected", id: "mic-2" }]);

    // Once only: a later device change is the person's business.
    available$.next(named(["mic-3", "Jabra Evolve2"]));
    expect(seen).toHaveLength(1);
  });

  it("reports an unknown label once", () => {
    const available$ = new BehaviorSubject(named(["mic-1", "Built-in"]));
    const seen = outcomes(available$, "Jabra Evolve2");
    expect(seen).toEqual([{ outcome: "unmatched" }]);
    available$.next(named(["mic-1", "Built-in"], ["mic-2", "Other"]));
    expect(seen).toHaveLength(1);
  });

  it("says nothing while the list is empty", () => {
    const available$ = new BehaviorSubject(new Map<string, DeviceLabel>());
    expect(outcomes(available$, "Jabra Evolve2")).toEqual([]);
  });
});
