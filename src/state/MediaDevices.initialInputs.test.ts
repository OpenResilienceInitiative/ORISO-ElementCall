/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import { ObservableScope } from "./ObservableScope";
import { type MediaDevices } from "./MediaDevices";

// The browser's device lists, one per kind, as LiveKit would report them.
const lists = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@livekit/components-core", () => ({
  createMediaDeviceObserver: (kind: string): unknown => lists.get(kind),
}));

const getUrlParams = vi.hoisted(() => vi.fn());
vi.mock("../UrlParams", () => ({ getUrlParams }));

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        values.set(key, value);
      },
      removeItem: (key: string): void => {
        values.delete(key);
      },
      clear: (): void => values.clear(),
    },
  });
});

const device = (
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
): MediaDeviceInfo =>
  ({ kind, deviceId, label, groupId: deviceId }) as MediaDeviceInfo;

describe("MediaDevices: the host's devices by label (#116)", () => {
  let scope: ObservableScope;
  let microphones$: BehaviorSubject<MediaDeviceInfo[]>;
  let cameras$: BehaviorSubject<MediaDeviceInfo[]>;

  beforeEach(() => {
    localStorage.clear();
    scope = new ObservableScope();
    microphones$ = new BehaviorSubject([
      device("audioinput", "mic-builtin", "MacBook Pro Microphone"),
      device("audioinput", "mic-jabra", "Jabra Evolve2 65"),
    ]);
    cameras$ = new BehaviorSubject([
      device("videoinput", "cam-builtin", "FaceTime HD Camera"),
      device("videoinput", "cam-usb-1", "USB Camera"),
      device("videoinput", "cam-usb-2", "USB Camera"),
    ]);
    lists.set("audioinput", microphones$);
    lists.set("videoinput", cameras$);
    lists.set("audiooutput", new BehaviorSubject([]));
  });

  afterEach(() => {
    scope.end();
    vi.resetModules();
  });

  const create = async (
    params: Record<string, unknown>,
  ): Promise<MediaDevices> => {
    getUrlParams.mockReturnValue({ controlledAudioDevices: false, ...params });
    const { MediaDevices } = await import("./MediaDevices");
    return new MediaDevices(scope);
  };

  it("starts on the microphone and camera the host picked", async () => {
    const devices = await create({
      audioInput: "Jabra Evolve2 65",
      videoInput: "USB Camera",
    });
    expect(devices.audioInput.selected$.value?.id).toBe("mic-jabra");
    // Two cameras with the same label: the first one.
    expect(devices.videoInput.selected$.value?.id).toBe("cam-usb-1");
    expect(devices.unmatchedInitialInputs$.value).toEqual([]);
  });

  it("keeps the default and reports an unknown label", async () => {
    const devices = await create({ audioInput: "Headset that left" });
    expect(devices.audioInput.selected$.value?.id).toBe("mic-builtin");
    expect(devices.unmatchedInitialInputs$.value).toEqual(["audioinput"]);
  });

  it("waits for labels before deciding", async () => {
    microphones$.next([
      device("audioinput", "mic-builtin", ""),
      device("audioinput", "mic-jabra", ""),
    ]);
    const devices = await create({ audioInput: "Jabra Evolve2 65" });
    expect(devices.unmatchedInitialInputs$.value).toEqual([]);

    microphones$.next([
      device("audioinput", "mic-builtin", "MacBook Pro Microphone"),
      device("audioinput", "mic-jabra", "Jabra Evolve2 65"),
    ]);
    expect(devices.audioInput.selected$.value?.id).toBe("mic-jabra");
  });

  it("leaves everything alone when the host names no device", async () => {
    const devices = await create({});
    expect(devices.audioInput.selected$.value?.id).toBe("mic-builtin");
    expect(devices.videoInput.selected$.value?.id).toBe("cam-builtin");
    expect(devices.unmatchedInitialInputs$.value).toEqual([]);
  });
});
