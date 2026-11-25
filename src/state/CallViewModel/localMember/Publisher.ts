/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  LocalVideoTrack,
  type Room as LivekitRoom,
  Track,
  type LocalTrack,
  type LocalTrackPublication,
  ConnectionState as LivekitConnectionState,
} from "livekit-client";
import {
  BehaviorSubject,
  combineLatest,
  map,
  NEVER,
  type Observable,
  type Subscription,
  switchMap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type Behavior, constant } from "../../Behavior.ts";
import type { MediaDevices, SelectedDevice } from "../../MediaDevices.ts";
import type { MuteStates } from "../../MuteStates.ts";
import {
  type ProcessorState,
  trackProcessorSync,
} from "../../../livekit/TrackProcessorContext.tsx";
import { getUrlParams } from "../../../UrlParams.ts";
import { observeTrackReference$ } from "../../MediaViewModel.ts";
import { type Connection } from "../remoteMembers/Connection.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import {
  type LocalMediaEncryptionState,
  type LocalMediaKey,
} from "../../../e2ee/matrixKeyProvider.ts";
import { LocalMediaEncryptionError } from "../../../utils/errors.ts";

/**
 * A wrapper for a Connection object.
 * This wrapper will manage the connection used to publish to the LiveKit room.
 * The Publisher is also responsible for creating the media tracks.
 */
export class Publisher {
  private muteStatesObserved = false;
  private retired = false;
  private activationRevision = 0;
  private readonly activationState$ =
    new BehaviorSubject<LocalMediaEncryptionState>("pending");
  public readonly encryptionState$: Behavior<LocalMediaEncryptionState>;

  /**
   * Creates a new Publisher.
   * @param scope - The observable scope to use for managing the publisher.
   * @param connection - The connection to use for publishing.
   * @param devices - The media devices to use for audio and video input.
   * @param muteStates - The mute states for audio and video.
   * @param trackerProcessorState$ - The processor state for the video track processor (e.g. background blur).
   * @param logger - The logger scoped to this media connection.
   * @param localMediaKey - The required call key, if media encryption is required.
   */
  public constructor(
    private scope: ObservableScope,
    private connection: Pick<Connection, "livekitRoom" | "state$">, //setE2EEEnabled,
    devices: MediaDevices,
    private readonly muteStates: MuteStates,
    trackerProcessorState$: Behavior<ProcessorState>,
    private logger: Logger,
    private readonly localMediaKey?: LocalMediaKey,
  ) {
    this.logger.info("Create LiveKit room");
    const { controlledAudioDevices } = getUrlParams();

    const room = connection.livekitRoom;
    this.encryptionState$ = scope.behavior(
      combineLatest([
        localMediaKey?.localKeyState$ ?? constant("ready" as const),
        this.activationState$,
      ]).pipe(
        map(([key, activation]) => {
          if (key instanceof LocalMediaEncryptionError) return key;
          if (activation instanceof LocalMediaEncryptionError)
            return activation;
          return key === "ready" && activation === "ready"
            ? "ready"
            : "pending";
        }),
      ),
    );
    if (localMediaKey || room.hasE2EESetup) void this.enableEncryption();
    else this.activationState$.next("ready");

    // Setup track processor syncing (blur)
    this.observeTrackProcessors(scope, room, trackerProcessorState$);
    // Observe media device changes and update LiveKit active devices accordingly
    this.observeMediaDevices(scope, devices, controlledAudioDevices);

    this.workaroundRestartAudioInputTrackChrome(devices, scope);
    this.scope.onEnd(() => {
      this.retire();
      this.logger.info("Scope ended -> stop publishing all tracks");
      void this.stopPublishing().catch((error: unknown) =>
        this.logger.error("Failed to stop retired publisher", error),
      );
    });

    // TODO move mute state handling here using reconcile (instead of inside the mute state class)
    // this.scope.reconcile(
    //   this.scope.behavior(
    //     combineLatest([this.muteStates.video.enabled$, this.tracks$]),
    //   ),
    //   async ([videoEnabled, tracks]) => {
    //     const track = tracks.find((t) => t.kind == Track.Kind.Video);
    //     if (!track) return;

    //     if (videoEnabled) {
    //       await track.unmute();
    //     } else {
    //       await track.mute();
    //     }
    //   },
    // );
  }

  private async enableEncryption(): Promise<void> {
    const revision = ++this.activationRevision;
    this.activationState$.next("pending");
    try {
      await this.connection.livekitRoom.setE2EEEnabled(true);
      if (!this.retired && revision === this.activationRevision) {
        this.activationState$.next("ready");
      }
    } catch (error) {
      if (this.retired || revision !== this.activationRevision) return;
      this.logger.error("Failed to enable E2EE on LiveKit room", error);
      this.activationState$.next(new LocalMediaEncryptionError(error));
    }
  }

  public retryEncryption(retryPending = false): void {
    if (this.retired) return;
    this.localMediaKey?.retryLocalKey(retryPending);
    const activation = this.activationState$.value;
    if (
      activation instanceof LocalMediaEncryptionError ||
      (retryPending && activation === "pending")
    ) {
      void this.enableEncryption();
    }
  }

  public retire(): void {
    this.retired = true;
  }

  private get canPublishMedia(): boolean {
    return !this.retired && this.encryptionState$.value === "ready";
  }

  private _tracks$ = new BehaviorSubject<LocalTrack<Track.Kind>[]>([]);
  public tracks$ = this._tracks$ as Behavior<LocalTrack<Track.Kind>[]>;

  /**
   * Start the connection to LiveKit and publish local tracks.
   *
   * This will:
   * wait for the connection to be ready.
   // * 1. Request an OpenId token `request_token` (allows matrix users to verify their identity with a third-party service.)
   // * 2. Use this token to request the SFU config to the MatrixRtc authentication service.
   // * 3. Connect to the configured LiveKit room.
   // * 4. Create local audio and video tracks based on the current mute states and publish them to the room.
   *
   * @throws {InsufficientCapacityError} if the LiveKit server indicates that it has insufficient capacity to accept the connection.
   * @throws {SFURoomCreationRestrictedError} if the LiveKit server indicates that the room does not exist and cannot be created.
   */
  public async createAndSetupTracks(): Promise<void> {
    this.logger.debug("createAndSetupTracks called");
    const lkRoom = this.connection.livekitRoom;
    // Observe mute state changes and update LiveKit microphone/camera states accordingly
    if (!this.muteStatesObserved) {
      this.observeMuteStates(this.scope);
      this.muteStatesObserved = true;
    }

    // TODO-MULTI-SFU: Prepublish a microphone track
    const audio = this.muteStates.audio.enabled$.value;
    const video = this.muteStates.video.enabled$.value;
    // createTracks throws if called with audio=false and video=false
    if (audio || video) {
      // TODO this can still throw errors? It will also prompt for permissions if not already granted
      return lkRoom.localParticipant
        .createTracks({
          audio,
          video,
        })
        .then((tracks) => {
          this.logger.info(
            "created track",
            tracks.map((t) => t.kind + ", " + t.id),
          );
          this.setCapturedTracks(tracks);
        })
        .catch((error) => {
          this.logger.error("Failed to create tracks", error);
          throw error;
        });
    }
    // Both off — chosen in the host's pre-join check (ORISO-ElementCall#116),
    // or the microphone muted for a large call while the camera is off. The
    // call needs a track to join with, and LiveKit cannot create none, so it
    // joins with a microphone that is muted before it is ever published:
    // nothing is heard until the person unmutes, and no camera is opened.
    const tracks = await lkRoom.localParticipant
      .createTracks({ audio: true, video: false })
      .catch((error) => {
        this.logger.error("Failed to create the muted microphone", error);
        throw error;
      });
    try {
      for (const track of tracks) await track.mute();
    } catch (error) {
      tracks.forEach((track) => track.stop());
      this.logger.error("Failed to mute the microphone before joining", error);
      throw error;
    }
    this.logger.info(
      "created muted track",
      tracks.map((t) => t.kind + ", " + t.id),
    );
    this.setCapturedTracks(tracks);
  }

  private setCapturedTracks(tracks: LocalTrack[]): void {
    if (this.retired) tracks.forEach((track) => track.stop());
    else this._tracks$.next(tracks);
  }

  private _publishing$ = new BehaviorSubject<boolean>(false);
  public publishing$ = this.scope.behavior(this._publishing$);
  /**
   *
   * @returns
   * @throws ElementCallError
   */
  public async startPublishing(): Promise<LocalTrack[]> {
    this.logger.debug("startPublishing called");
    const lkRoom = this.connection.livekitRoom;

    for (const track of this.tracks$.value) {
      if (!this.canPublishMedia) return [];
      this.logger.info("publish ", this.tracks$.value.length, "tracks");
      await lkRoom.localParticipant
        .publishTrack(track)
        .catch((error: unknown) => {
          this.logger.error("Failed to publish track", error);
          throw error;
        });
      if (this.retired) {
        await lkRoom.localParticipant.unpublishTrack(track);
        return [];
      }
      this.logger.info("published track ", track.kind, track.id);
    }
    if (!this.canPublishMedia) return [];
    this._publishing$.next(true);
    return this.tracks$.value;
  }

  public async stopPublishing(): Promise<void> {
    this.logger.debug("stopPublishing called");
    // TODO-MULTI-SFU: Move these calls back to ObservableScope.onEnd once scope
    // actually has the right lifetime
    this.muteStates.audio.unsetHandler();
    this.muteStates.video.unsetHandler();
    this.muteStatesObserved = false;

    const localParticipant = this.connection.livekitRoom.localParticipant;
    const tracks: LocalTrack[] = [];
    const addToTracksIfDefined = (p: LocalTrackPublication): void => {
      if (p.track !== undefined) tracks.push(p.track);
    };
    localParticipant.trackPublications.forEach(addToTracksIfDefined);
    this.logger.debug(
      "list of tracks to unpublish:",
      tracks.map((t) => t.kind + ", " + t.id),
      "start unpublishing now",
    );
    await localParticipant.unpublishTracks(tracks).catch((error) => {
      this.logger.error("Failed to unpublish tracks", error);
      throw error;
    });
    this.logger.debug(
      "unpublished tracks",
      tracks.map((t) => t.kind + ", " + t.id),
    );
    this._publishing$.next(false);
  }

  /**
   * Stops all tracks that are currently running
   */
  public stopTracks(): void {
    this.tracks$.value.forEach((t) => t.stop());
    this._tracks$.next([]);
  }

  /// Private methods

  // Restart the audio input track whenever we detect that the active media
  // device has changed to refer to a different hardware device. We do this
  // for the sake of Chrome, which provides a "default" device that is meant
  // to match the system's default audio input, whatever that may be.
  // This is special-cased for only audio inputs because we need to dig around
  // in the LocalParticipant object for the track object and there's not a nice
  // way to do that generically. There is usually no OS-level default video capture
  // device anyway, and audio outputs work differently.
  private workaroundRestartAudioInputTrackChrome(
    devices: MediaDevices,
    scope: ObservableScope,
  ): void {
    const lkRoom = this.connection.livekitRoom;
    devices.audioInput.selected$
      .pipe(
        switchMap((device) => device?.hardwareDeviceChange$ ?? NEVER),
        scope.bind(),
      )
      .subscribe(() => {
        if (lkRoom.state != LivekitConnectionState.Connected) return;
        const activeMicTrack = Array.from(
          lkRoom.localParticipant.audioTrackPublications.values(),
        ).find((d) => d.source === Track.Source.Microphone)?.track;

        if (
          activeMicTrack &&
          // only restart if the stream is still running: LiveKit will detect
          // when a track stops & restart appropriately, so this is not our job.
          // Plus, we need to avoid restarting again if the track is already in
          // the process of being restarted.
          activeMicTrack.mediaStreamTrack.readyState !== "ended"
        ) {
          this.logger?.info(
            "Restarting audio device track due to active media device changed (workaroundRestartAudioInputTrackChrome)",
          );
          // Restart the track, which will cause Livekit to do another
          // getUserMedia() call with deviceId: default to get the *new* default device.
          // Note that room.switchActiveDevice() won't work: Livekit will ignore it because
          // the deviceId hasn't changed (was & still is default).
          lkRoom.localParticipant
            .getTrackPublication(Track.Source.Microphone)
            ?.audioTrack?.restartTrack()
            .catch((e) => {
              this.logger.error(`Failed to restart audio device track`, e);
            });
        }
      });
  }

  // Observe changes in the selected media devices and update the LiveKit room accordingly.
  private observeMediaDevices(
    scope: ObservableScope,
    devices: MediaDevices,
    controlledAudioDevices: boolean,
  ): void {
    const lkRoom = this.connection.livekitRoom;
    const syncDevice = (
      kind: MediaDeviceKind,
      selected$: Observable<SelectedDevice | undefined>,
    ): Subscription =>
      selected$.pipe(scope.bind()).subscribe((device) => {
        if (lkRoom.state != LivekitConnectionState.Connected) return;
        // if (this.connectionState$.value !== ConnectionState.Connected) return;
        this.logger.info(
          "[LivekitRoom] syncDevice room.getActiveDevice(kind) !== d.id :",
          lkRoom.getActiveDevice(kind),
          " !== ",
          device?.id,
        );
        if (
          device !== undefined &&
          lkRoom.getActiveDevice(kind) !== device.id
        ) {
          lkRoom
            .switchActiveDevice(kind, device.id)
            .catch((e: Error) =>
              this.logger.error(
                `Failed to sync ${kind} device with LiveKit`,
                e,
              ),
            );
        }
      });

    syncDevice("audioinput", devices.audioInput.selected$);
    if (!controlledAudioDevices)
      syncDevice("audiooutput", devices.audioOutput.selected$);
    syncDevice("videoinput", devices.videoInput.selected$);
  }

  /**
   * Observe changes in the mute states and update the LiveKit room accordingly.
   * @param scope
   * @private
   */
  private observeMuteStates(scope: ObservableScope): void {
    const lkRoom = this.connection.livekitRoom;
    this.muteStates.audio.setHandler(async (desired) => {
      try {
        if (!desired || this.canPublishMedia) {
          await lkRoom.localParticipant.setMicrophoneEnabled(desired);
          if (desired && !this.canPublishMedia) {
            await lkRoom.localParticipant.setMicrophoneEnabled(false);
          }
        }
      } catch (e) {
        this.logger.error("Failed to update LiveKit audio input mute state", e);
      }
      return lkRoom.localParticipant.isMicrophoneEnabled;
    });
    this.muteStates.video.setHandler(async (desired) => {
      try {
        if (!desired || this.canPublishMedia) {
          await lkRoom.localParticipant.setCameraEnabled(desired);
          if (desired && !this.canPublishMedia) {
            await lkRoom.localParticipant.setCameraEnabled(false);
          }
        }
      } catch (e) {
        this.logger.error("Failed to update LiveKit video input mute state", e);
      }
      return lkRoom.localParticipant.isCameraEnabled;
    });
  }

  private observeTrackProcessors(
    scope: ObservableScope,
    room: LivekitRoom,
    trackerProcessorState$: Behavior<ProcessorState>,
  ): void {
    const track$ = scope.behavior(
      observeTrackReference$(room.localParticipant, Track.Source.Camera).pipe(
        map((trackRef) => {
          const track = trackRef?.publication.track;
          return track instanceof LocalVideoTrack ? track : null;
        }),
      ),
      null,
    );
    trackProcessorSync(scope, track$, trackerProcessorState$);
  }
}
