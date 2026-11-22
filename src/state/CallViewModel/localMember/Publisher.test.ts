/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { ConnectionState as LivekitConenctionState } from "livekit-client";
import { type BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import {
  flushPromises,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMediaDevices,
} from "../../../utils/test";
import { LocalMediaEncryptionError } from "../../../utils/errors";
import { Publisher } from "./Publisher";
import { type Connection } from "../remoteMembers/Connection";
import { type MuteStates } from "../../MuteStates";

describe("Publisher", () => {
  let scope: ObservableScope;
  let connection: Connection;
  let muteStates: MuteStates;
  beforeEach(() => {
    muteStates = {
      audio: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
      video: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
    } as unknown as MuteStates;
    scope = new ObservableScope();
    connection = {
      state$: constant(LivekitConenctionState.Connected),
      livekitRoom: mockLivekitRoom({
        localParticipant: mockLocalParticipant({}),
      }),
    } as unknown as Connection;
  });

  afterEach(() => scope.end());

  it("enables E2EE when the LiveKit room has E2EE configured", () => {
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: true,
      localParticipant: mockLocalParticipant({}),
      setE2EEEnabled: vi.fn().mockResolvedValue(undefined),
    });
    connection = {
      state$: constant(LivekitConenctionState.Connected),
      livekitRoom,
    } as unknown as Connection;

    new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    expect(livekitRoom.setE2EEEnabled).toHaveBeenCalledOnce();
    expect(livekitRoom.setE2EEEnabled).toHaveBeenCalledWith(true);
  });

  it("withholds local publication until the room acknowledges encryption", async () => {
    const activation = Promise.withResolvers<void>();
    const localParticipant = mockLocalParticipant({
      createTracks: vi
        .fn()
        .mockResolvedValue([{ kind: "audio", mute: vi.fn() }]),
      publishTrack: vi.fn().mockResolvedValue(undefined),
    });
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: true,
      localParticipant,
      setE2EEEnabled: vi.fn().mockReturnValue(activation.promise),
    });
    const publisher = new Publisher(
      scope,
      { livekitRoom, state$: connection.state$ },
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
    await publisher.createAndSetupTracks();
    await publisher.startPublishing();
    expect(localParticipant.publishTrack).not.toHaveBeenCalled();

    activation.resolve();
    await flushPromises();
    await publisher.startPublishing();
    expect(localParticipant.publishTrack).toHaveBeenCalledOnce();
  });

  it("blocks the mic and camera from starting before encryption but still allows muting", async () => {
    const activation = Promise.withResolvers<void>();
    const setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
    const setCameraEnabled = vi.fn().mockResolvedValue(undefined);
    const localParticipant = mockLocalParticipant({
      createTracks: vi.fn().mockResolvedValue([]),
      setMicrophoneEnabled,
      setCameraEnabled,
    });
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: true,
      localParticipant,
      setE2EEEnabled: vi.fn().mockReturnValue(activation.promise),
    });
    const publisher = new Publisher(
      scope,
      { livekitRoom, state$: connection.state$ },
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
    await publisher.createAndSetupTracks();
    const [updateMic] = vi.mocked(muteStates.audio.setHandler).mock.calls[0];
    const [updateCamera] = vi.mocked(muteStates.video.setHandler).mock.calls[0];
    await updateMic(true);
    await updateCamera(true);
    await updateMic(false);
    await updateCamera(false);
    expect(setMicrophoneEnabled.mock.calls).toEqual([[false]]);
    expect(setCameraEnabled.mock.calls).toEqual([[false]]);

    activation.resolve();
    await flushPromises();
    await updateMic(true);
    await updateCamera(true);
    expect(setMicrophoneEnabled.mock.calls).toEqual([[false], [true]]);
    expect(setCameraEnabled.mock.calls).toEqual([[false], [true]]);

    const lateMic = Promise.withResolvers<undefined>();
    const lateCamera = Promise.withResolvers<undefined>();
    setMicrophoneEnabled.mockReturnValueOnce(lateMic.promise);
    setCameraEnabled.mockReturnValueOnce(lateCamera.promise);
    const enablingMic = updateMic(true);
    const enablingCamera = updateCamera(true);
    publisher.retire();
    lateMic.resolve(undefined);
    lateCamera.resolve(undefined);
    await Promise.all([enablingMic, enablingCamera]);
    expect(setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(setCameraEnabled).toHaveBeenLastCalledWith(false);
  });

  it("exposes activation failure and retries without turning encryption off", async () => {
    const activation = vi
      .fn()
      .mockRejectedValueOnce(new Error("enable failed"))
      .mockResolvedValueOnce(undefined);
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: true,
      localParticipant: mockLocalParticipant({}),
      setE2EEEnabled: activation,
    });
    const publisher = new Publisher(
      scope,
      { livekitRoom, state$: connection.state$ },
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
    await flushPromises();
    expect(publisher.encryptionState$.value).toBeInstanceOf(
      LocalMediaEncryptionError,
    );

    publisher.retryEncryption();
    await flushPromises();
    expect(publisher.encryptionState$.value).toBe("ready");
    expect(activation.mock.calls).toEqual([[true], [true]]);
  });

  it("retries pending SDK activation and ignores rejection from the timed-out attempt", async () => {
    const earlier = Promise.withResolvers<void>();
    const activation = vi
      .fn()
      .mockReturnValueOnce(earlier.promise)
      .mockResolvedValueOnce(undefined);
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: true,
      localParticipant: mockLocalParticipant({}),
      setE2EEEnabled: activation,
    });
    const publisher = new Publisher(
      scope,
      { livekitRoom, state$: connection.state$ },
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
    publisher.retryEncryption(true);
    await flushPromises();
    earlier.reject(new Error("older setup"));
    await flushPromises();
    expect(publisher.encryptionState$.value).toBe("ready");
    expect(activation.mock.calls).toEqual([[true], [true]]);
  });

  it("ignores delayed activation completion after retiring the publisher", async () => {
    const activation = Promise.withResolvers<void>();
    const localParticipant = mockLocalParticipant({});
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: true,
      localParticipant,
      setE2EEEnabled: vi.fn().mockReturnValue(activation.promise),
    });
    const publisher = new Publisher(
      scope,
      { livekitRoom, state$: connection.state$ },
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
    publisher.retire();
    activation.reject(new Error("old connection"));
    await flushPromises();
    expect(publisher.encryptionState$.value).toBe("pending");
    publisher.retryEncryption();
    expect(livekitRoom.setE2EEEnabled).toHaveBeenCalledOnce();
  });

  it("does not toggle E2EE when the LiveKit room has no E2EE setup", () => {
    const livekitRoom = mockLivekitRoom({
      hasE2EESetup: false,
      localParticipant: mockLocalParticipant({}),
    });
    connection = {
      state$: constant(LivekitConenctionState.Connected),
      livekitRoom,
    } as unknown as Connection;

    new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    expect(livekitRoom.setE2EEEnabled).not.toHaveBeenCalled();
  });

  it("throws if livekit room could not publish", async () => {
    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    // should do nothing if no tracks have been created yet.
    await publisher.startPublishing();
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).not.toHaveBeenCalled();

    (muteStates.audio.enabled$ as BehaviorSubject<boolean>).next(true);

    (
      connection.livekitRoom.localParticipant.createTracks as Mock
    ).mockResolvedValue([{}, {}]);

    await expect(publisher.createAndSetupTracks()).resolves.not.toThrow();
    expect(
      connection.livekitRoom.localParticipant.createTracks,
    ).toHaveBeenCalledOnce();

    // failiour due to localParticipant.publishTrack
    (
      connection.livekitRoom.localParticipant.publishTrack as Mock
    ).mockRejectedValue(Error("testError"));

    await expect(publisher.startPublishing()).rejects.toThrow(
      new Error("testError"),
    );

    // does not try other conenction after the first one failed
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(1);

    // does not try other conenction after the first one failed
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(1);

    // success case
    (
      connection.livekitRoom.localParticipant.publishTrack as Mock
    ).mockResolvedValue({});

    await expect(publisher.startPublishing()).resolves.not.toThrow();

    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(3);
  });

  it("joins with microphone and camera both off: a muted microphone, no camera (#116)", async () => {
    // The host's pre-join check said "both off". The call must still join,
    // and nothing may be heard or seen until the person switches it on.
    const micTrack = {
      kind: "audio",
      mute: vi.fn().mockResolvedValue(undefined),
    };
    (
      connection.livekitRoom.localParticipant.createTracks as Mock
    ).mockResolvedValue([micTrack]);
    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    await expect(publisher.createAndSetupTracks()).resolves.toBeUndefined();

    expect(
      connection.livekitRoom.localParticipant.createTracks,
    ).toHaveBeenCalledExactlyOnceWith({ audio: true, video: false });
    expect(micTrack.mute).toHaveBeenCalledOnce();
    expect(publisher.tracks$.value).toEqual([micTrack]);
  });

  it("does not hand over a microphone it could not mute (#116)", async () => {
    const micTrack = {
      kind: "audio",
      mute: vi.fn().mockRejectedValue(new Error("no")),
      stop: vi.fn(),
    };
    (
      connection.livekitRoom.localParticipant.createTracks as Mock
    ).mockResolvedValue([micTrack]);
    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    await expect(publisher.createAndSetupTracks()).rejects.toThrow("no");
    expect(micTrack.stop).toHaveBeenCalledOnce();
    expect(publisher.tracks$.value).toEqual([]);
  });

  it("propagates media permission failures to the caller", async () => {
    (muteStates.audio.enabled$ as BehaviorSubject<boolean>).next(true);
    const permissionError = new DOMException(
      "Permission denied",
      "NotAllowedError",
    );
    (
      connection.livekitRoom.localParticipant.createTracks as Mock
    ).mockRejectedValue(permissionError);

    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    await expect(publisher.createAndSetupTracks()).rejects.toBe(
      permissionError,
    );
  });

  it("retries track creation without installing mute handlers twice", async () => {
    (muteStates.audio.enabled$ as BehaviorSubject<boolean>).next(true);
    const permissionError = new DOMException(
      "Permission denied",
      "NotAllowedError",
    );
    (connection.livekitRoom.localParticipant.createTracks as Mock)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce([{}, {}]);

    const makeHandlerInstaller = (): Mock => {
      const installer = vi.fn(() => {
        if (installer.mock.calls.length > 1) {
          throw new Error("Multiple mute state handlers are not supported");
        }
      });
      return installer;
    };
    muteStates.audio.setHandler = makeHandlerInstaller();
    muteStates.video.setHandler = makeHandlerInstaller();

    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    await expect(publisher.createAndSetupTracks()).rejects.toBe(
      permissionError,
    );
    await expect(publisher.createAndSetupTracks()).resolves.not.toThrow();
    expect(muteStates.audio.setHandler).toHaveBeenCalledOnce();
    expect(muteStates.video.setHandler).toHaveBeenCalledOnce();
  });
});
