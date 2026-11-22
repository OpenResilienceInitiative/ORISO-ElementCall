/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalTrack,
  type Participant,
  ParticipantEvent,
  type LocalParticipant,
  type ScreenShareCaptureOptions,
  MediaDeviceFailure,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";
import {
  Status as RTCSessionStatus,
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  pairwise,
  startWith,
  switchMap,
  tap,
  timer,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { deepCompare } from "matrix-js-sdk/lib/utils";

import { constant, type Behavior } from "../../Behavior.ts";
import { type IConnectionManager } from "../remoteMembers/ConnectionManager.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import { type Publisher } from "./Publisher.ts";
import { type MuteStates } from "../../MuteStates.ts";
import {
  ElementCallError,
  FailToStartLivekitConnection,
  LocalMediaEncryptionError,
  MembershipManagerError,
  MediaPermissionDeniedError,
  isBrowserMediaPermissionDenied,
  UnknownCallError,
} from "../../../utils/errors.ts";
import { ElementWidgetActions, widget } from "../../../widget.ts";
import { getUrlParams } from "../../../UrlParams.ts";
import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics.ts";
import { MatrixRTCMode } from "../../../settings/settings.ts";
import { Config } from "../../../config/Config.ts";
import {
  ConnectionState,
  type Connection,
  type FailedToStartError,
} from "../remoteMembers/Connection.ts";
import { type HomeserverConnected } from "./HomeserverConnected.ts";
import {
  type ScreenShareFailure,
  screenShareFailure,
} from "../../../oriso/screenShareFailure.ts";
import { type LocalMediaEncryptionState } from "../../../e2ee/matrixKeyProvider.ts";
import { and$ } from "../../../utils/observable.ts";

const MEDIA_ENCRYPTION_WAIT_MS = 15_000;

export enum TransportState {
  /** Not even a transport is available to the LocalMembership */
  Waiting = "transport_waiting",
}

export enum PublishState {
  WaitingForUser = "publish_waiting_for_user",
  /** Implies lk connection is connected */
  Starting = "publish_start_publishing",
  /** Implies lk connection is connected */
  Publishing = "publish_publishing",
}

export enum TrackState {
  /** The track is waiting for user input to create tracks (waiting to call `startTracks()`) */
  WaitingForUser = "tracks_waiting_for_user",
  /** Implies lk connection is connected */
  Creating = "tracks_creating",
  /** Implies lk connection is connected */
  Ready = "tracks_ready",
}

export type LocalMemberMediaState =
  | {
      tracks: TrackState;
      connection: ConnectionState | FailedToStartError;
    }
  | PublishState
  | ElementCallError;
export type LocalMemberState =
  | ElementCallError
  | TransportState.Waiting
  | {
      media: LocalMemberMediaState;
      matrix: ElementCallError | RTCSessionStatus;
    };

/*
 * - get well known
 * - get oldest membership
 * - get transport to use
 * - get openId + jwt token
 * - wait for createTrack() call
 *    - create tracks
 * - wait for join() call
 *   - Publisher.publishTracks()
 *   - send join state/sticky event
 */

interface Props {
  // TODO add a comment into some code style readme or file header callviewmodel
  // that the inputs for those createSomething$() functions should NOT contain any js-sdk objectes
  scope: ObservableScope;
  muteStates: MuteStates;
  ownMembershipPresent$: Observable<boolean>;
  connectionManager: IConnectionManager;
  createPublisherFactory: (connection: Connection) => Publisher;
  requiresMediaEncryption?: boolean;
  joinMatrixRTC: (transport: LivekitTransport) => void;
  homeserverConnected: HomeserverConnected;
  localTransport$: Behavior<LivekitTransport | null>;
  matrixRTCSession: Pick<
    MatrixRTCSession,
    "updateCallIntent" | "leaveRoomSession"
  >;
  logger: Logger;
}

/**
 * This class is responsible for managing the own membership in a room.
 * We want
 *  - a publisher
 *  -
 * @param param0
 * @returns
 *  - publisher: The handle to create tracks and publish them to the room.
 *  - connected$: the current connection state. Including matrix server and livekit server connection. (only considering the livekit server we are using for our own media publication)
 *  - transport$: the transport object the ownMembership$ ended up using.
 *  - connectionState: the current connection state. Including matrix server and livekit server connection.
 *  - sharingScreen$: Whether we are sharing our screen. `undefined` if we cannot share the screen.
 */
export const createLocalMembership$ = ({
  scope,
  connectionManager,
  localTransport$: localTransportCanThrow$,
  homeserverConnected,
  createPublisherFactory,
  requiresMediaEncryption = false,
  joinMatrixRTC,
  logger: parentLogger,
  muteStates,
  ownMembershipPresent$,
  matrixRTCSession,
}: Props): {
  /**
   * This starts audio and video tracks. They will be reused when calling `requestPublish`.
   */
  startTracks: () => Behavior<LocalTrack[]>;
  /**
   * This sets a inner state (shouldPublish) to true and instructs the js-sdk and livekit to keep the user
   * connected to matrix and livekit.
   */
  requestJoinAndPublish: () => void;
  requestDisconnect: () => void;
  localMemberState$: Behavior<LocalMemberState>;
  /** A non-fatal media capture, encryption, or publishing error. */
  mediaError$: Behavior<ElementCallError | null>;
  retryMedia: () => void;
  sharingScreen$: Behavior<boolean>;
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  /** Why the last attempt to share the screen did not start, if it did not. */
  screenShareFailure$: Behavior<ScreenShareFailure | null>;
  dismissScreenShareFailure: () => void;
  tracks$: Behavior<LocalTrack[]>;
  participant$: Behavior<LocalParticipant | null>;
  connection$: Behavior<Connection | null>;
  /** Shorthand for homeserverConnected.rtcSession === Status.Reconnecting
   * Direct translation to the js-sdk membership manager connection `Status`.
   */
  reconnecting$: Behavior<boolean>;
  /** Shorthand for homeserverConnected.rtcSession === Status.Disconnected
   * Direct translation to the js-sdk membership manager connection `Status`.
   */
  disconnected$: Behavior<boolean>;
} => {
  const logger = parentLogger.getChild("[LocalMembership]");
  logger.debug(`Creating local membership..`);

  // Unwrap the local transport and set the state of the LocalMembership to error in case the transport is an error.
  const localTransport$ = scope.behavior(
    localTransportCanThrow$.pipe(
      catchError((e: unknown) => {
        let error: ElementCallError;
        if (e instanceof ElementCallError) {
          error = e;
        } else {
          error = new UnknownCallError(
            e instanceof Error
              ? e
              : new Error("Unknown error from localTransport"),
          );
        }
        setTransportError(error);
        return of(null);
      }),
    ),
  );

  // Drop Epoch data here since we will not combine this anymore
  const localConnection$ = scope.behavior(
    combineLatest([
      connectionManager.connectionManagerData$,
      localTransport$,
    ]).pipe(
      map(([{ value: connectionData }, localTransport]) => {
        if (localTransport === null) {
          return null;
        }

        return connectionData.getConnectionForTransport(localTransport);
      }),
      tap((connection) => {
        logger.info(
          `Local connection updated: ${connection?.transport?.livekit_service_url}`,
        );
      }),
    ),
  );

  // MATRIX RELATED

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const trackStartRequest$ = new BehaviorSubject(0);

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const joinAndPublishRequested$ = new BehaviorSubject(false);
  // Started by the Matrix join side effect, independent of media readiness.
  const encryptionWaitAttempt$ = new BehaviorSubject<symbol | null>(null);

  /**
   * The publisher is stored in here an abstracts creating and publishing tracks.
   */
  const createdPublisher$ = new BehaviorSubject<{
    connection: Connection;
    publisher: Publisher;
  } | null>(null);
  const publisher$ = scope.behavior(
    combineLatest([createdPublisher$, localConnection$]).pipe(
      map(([created, connection]) =>
        created && created.connection === connection ? created.publisher : null,
      ),
    ),
  );
  const publisherEncryptionState$ = scope.behavior(
    publisher$.pipe(
      switchMap(
        (publisher) =>
          publisher?.encryptionState$ ??
          constant<LocalMediaEncryptionState>(
            requiresMediaEncryption ? "pending" : "ready",
          ),
      ),
    ),
  );
  const encryptionWaitError$ = scope.behavior(
    combineLatest([
      publisher$,
      publisherEncryptionState$,
      joinAndPublishRequested$,
      encryptionWaitAttempt$,
    ]).pipe(
      switchMap(([publisher, state, joined, attempt]) =>
        publisher && state === "pending" && joined && attempt
          ? timer(MEDIA_ENCRYPTION_WAIT_MS).pipe(
              map(
                () =>
                  new LocalMediaEncryptionError(
                    new Error("Local media encryption readiness timed out"),
                  ),
              ),
              startWith(null),
            )
          : of(null),
      ),
    ),
  );
  const suspensionError$ =
    new BehaviorSubject<LocalMediaEncryptionError | null>(null);
  const encryptionState$ = scope.behavior(
    combineLatest([
      publisherEncryptionState$,
      encryptionWaitError$,
      suspensionError$,
    ]).pipe(
      map(([state, timeout, suspension]) => suspension ?? timeout ?? state),
    ),
  );
  /**
   * Extract the tracks from the published. Also reacts to changing publishers.
   */
  const tracks$ = scope.behavior(
    publisher$.pipe(switchMap((p) => (p?.tracks$ ? p.tracks$ : constant([])))),
  );
  const publishing$ = scope.behavior(
    publisher$.pipe(switchMap((p) => p?.publishing$ ?? constant(false))),
  );

  // Media errors are non-fatal: participants can still receive media even if
  // local track capture or publication failed.
  const publishError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setPublishError = (e: ElementCallError): void => {
    if (publishError$.value !== null) {
      logger.error("Replacing Media Error:", publishError$.value, e);
    }
    publishError$.next(e);
  };

  const clearPublishError = (): void => publishError$.next(null);

  const mediaError$ = scope.behavior(
    combineLatest([publishError$, encryptionState$]).pipe(
      map(([publishError, encryption]) =>
        encryption instanceof LocalMediaEncryptionError
          ? encryption
          : publishError,
      ),
    ),
  );

  const startTracks = (): Behavior<LocalTrack[]> => {
    trackStartRequest$.next(trackStartRequest$.value + 1);
    return tracks$;
  };

  let recoveringSuspension: Publisher | null = null;
  const retryMedia = (): void => {
    const publisher = publisher$.value;
    if (publisher && suspensionError$.value) {
      if (recoveringSuspension === publisher) return;
      recoveringSuspension = publisher;
      void publisher
        .stopPublishing()
        .then(() => {
          if (publisher$.value !== publisher) return;
          publisher.stopTracks();
          suspensionError$.next(null);
          publisher.retryEncryption(encryptionWaitError$.value !== null);
          encryptionWaitAttempt$.next(Symbol());
          startTracks();
        })
        .catch((error: unknown) => {
          logger.error("Failed to restore suspended local media", error);
        })
        .finally(() => {
          if (recoveringSuspension === publisher) recoveringSuspension = null;
        });
    } else if (encryptionState$.value instanceof LocalMediaEncryptionError) {
      publisher?.retryEncryption(encryptionWaitError$.value !== null);
      encryptionWaitAttempt$.next(Symbol());
    } else {
      startTracks();
    }
  };

  const requestJoinAndPublish = (): void => {
    if (trackStartRequest$.value === 0) trackStartRequest$.next(1);
    joinAndPublishRequested$.next(true);
  };

  const requestDisconnect = (): void => {
    joinAndPublishRequested$.next(false);
  };

  // Take care of the publisher$
  // create a new one as soon as a local Connection is available
  //
  // Recreate a new one once the local connection changes
  //  - stop publishing
  //  - destruct all current streams
  //  - overwrite current publisher
  scope.reconcile(localConnection$, async (connection) => {
    if (connection === null) return;
    const publisher = createPublisherFactory(connection);
    clearPublishError();
    suspensionError$.next(null);
    createdPublisher$.next({ connection, publisher });
    return Promise.resolve(async (): Promise<void> => {
      publisher.retire();
      createdPublisher$.next(null);
      try {
        await publisher.stopPublishing();
      } catch (error) {
        logger.error("Failed to unpublish retired connection", error);
      } finally {
        publisher.stopTracks();
      }
    });
  });

  // Use reconcile here to not run concurrent createAndSetupTracks calls
  // `tracks$` will update once they are ready.
  scope.reconcile(
    scope.behavior(combineLatest([publisher$, tracks$, trackStartRequest$])),
    async ([publisher, tracks, requestCount]) => {
      if (publisher && tracks.length === 0 && requestCount > 0) {
        try {
          await publisher.createAndSetupTracks();
          if (publisher$.value === publisher) clearPublishError();
        } catch (error) {
          const cause =
            error instanceof Error ? error : new Error(String(error));
          const permissionDenied =
            MediaDeviceFailure.getFailure(error) ===
              MediaDeviceFailure.PermissionDenied ||
            (await isBrowserMediaPermissionDenied(error));
          if (publisher$.value !== publisher) return;
          if (permissionDenied) {
            setPublishError(new MediaPermissionDeniedError(cause));
          } else {
            setPublishError(new UnknownCallError(cause));
          }
        }
      }
    },
  );

  // Keep Matrix join independent: the local sender key can arrive only after joining.
  scope.reconcile(
    scope.behavior(
      combineLatest([
        publisher$,
        tracks$,
        joinAndPublishRequested$,
        trackStartRequest$,
        encryptionState$,
      ]),
    ),
    async ([publisher, tracks, shouldJoinAndPublish, , encryption]) => {
      if (!publisher || shouldJoinAndPublish === publisher.publishing$.value)
        return;
      if (tracks.length === 0) return;
      try {
        if (shouldJoinAndPublish) {
          if (encryption !== "ready") return;
          await publisher.startPublishing();
          if (publisher$.value === publisher) clearPublishError();
        } else {
          await publisher.stopPublishing();
        }
      } catch (error) {
        if (publisher$.value !== publisher) return;
        const cause = error instanceof Error ? error : new Error(String(error));
        setPublishError(
          shouldJoinAndPublish
            ? new FailToStartLivekitConnection(cause.message)
            : new UnknownCallError(cause),
        );
      }
    },
  );

  // STATE COMPUTATION

  const fatalTransportError$ = new BehaviorSubject<ElementCallError | null>(
    null,
  );

  const setTransportError = (e: ElementCallError): void => {
    if (fatalTransportError$.value !== null) {
      logger.error("Multiple Transport Errors:", e);
    } else {
      fatalTransportError$.next(e);
    }
  };

  const localConnectionState$ = localConnection$.pipe(
    switchMap((connection) => (connection ? connection.state$ : of(null))),
  );

  const mediaState$: Behavior<LocalMemberMediaState> = scope.behavior(
    combineLatest([
      localConnectionState$,
      localTransport$,
      tracks$,
      publishing$,
      joinAndPublishRequested$,
      encryptionState$,
      trackStartRequest$.pipe(map((requestCount) => requestCount > 0)),
    ]).pipe(
      map(
        ([
          localConnectionState,
          localTransport,
          tracks,
          publishing,
          shouldPublish,
          encryption,
          shouldStartTracks,
        ]) => {
          if (!localTransport) return null;
          const hasTracks = tracks.length > 0;
          let trackState: TrackState = TrackState.WaitingForUser;
          if (hasTracks && shouldStartTracks) trackState = TrackState.Ready;
          if (!hasTracks && shouldStartTracks) trackState = TrackState.Creating;

          if (
            localConnectionState !== ConnectionState.LivekitConnected ||
            trackState !== TrackState.Ready
          )
            return {
              connection: localConnectionState,
              tracks: trackState,
            };
          if (!shouldPublish) return PublishState.WaitingForUser;
          if (!publishing || encryption !== "ready")
            return PublishState.Starting;
          return PublishState.Publishing;
        },
      ),
      distinctUntilChanged(deepCompare),
    ),
  );
  const fatalMatrixError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setMatrixError = (e: ElementCallError): void => {
    if (fatalMatrixError$.value !== null) {
      logger.error("Multiple Matrix Errors:", e);
    } else {
      fatalMatrixError$.next(e);
    }
  };

  const localMemberState$ = scope.behavior<LocalMemberState>(
    combineLatest([
      mediaState$,
      homeserverConnected.rtsSession$,
      fatalMatrixError$,
      fatalTransportError$,
      mediaError$,
    ]).pipe(
      map(
        ([
          mediaState,
          rtcSessionStatus,
          fatalMatrixError,
          fatalTransportError,
          mediaError,
        ]) => {
          if (fatalTransportError !== null) return fatalTransportError;
          // `mediaState` will be 'null' until the transport/connection appears.
          if (mediaState && rtcSessionStatus)
            return {
              matrix: fatalMatrixError ?? rtcSessionStatus,
              media: mediaError ?? mediaState,
            };
          return TransportState.Waiting;
        },
      ),
    ),
  );

  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  const matrixAndLivekitConnected$ = scope.behavior(
    and$(
      homeserverConnected.combined$,
      localConnectionState$.pipe(
        map((state) => state === ConnectionState.LivekitConnected),
      ),
    ).pipe(
      tap((v) => logger.debug("livekit+matrix: Connected state changed", v)),
    ),
  );

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  const reconnecting$ = scope.behavior(
    matrixAndLivekitConnected$.pipe(
      pairwise(),
      map(([prev, current]) => prev === true && current === false),
    ),
    false,
  );

  // inform the widget about the connect and disconnect intent from the user.
  scope
    .behavior(joinAndPublishRequested$.pipe(pairwise(), scope.bind()), [
      undefined,
      joinAndPublishRequested$.value,
    ])
    .subscribe(([prev, current]) => {
      if (!widget) return;
      // JOIN prev=false (was left) => current-true (now joiend)
      if (!prev && current) {
        widget.api.transport
          .send(ElementWidgetActions.JoinCall, {})
          .catch((e) => {
            logger.error("Failed to send join action", e);
          });
      }
      // LEAVE prev=false (was joined) => current-true (now left)
      if (prev && !current) {
        widget.api.transport
          .send(ElementWidgetActions.HangupCall, {})
          .catch((e) => {
            logger.error("Failed to send hangup action", e);
          });
      }
    });

  const callIntent$ = scope.behavior(
    combineLatest([
      muteStates.video.enabled$,
      homeserverConnected.combined$,
      ownMembershipPresent$,
    ]).pipe(
      map(([videoEnabled, connected, ownMembershipPresent]) => {
        if (!connected || !ownMembershipPresent) return null;
        return videoEnabled ? ("video" as const) : ("audio" as const);
      }),
      distinctUntilChanged(),
      // A rejoin needs its own update even if the media mode did not change.
      map((intent) => (intent === null ? null : { intent })),
    ),
  );

  // The SDK emits MembershipsChanged before updating its own membership.
  // Reconcile asynchronously so the intent update sees that membership.
  scope.reconcile(callIntent$, async (update) => {
    if (update === null) return;
    try {
      await matrixRTCSession.updateCallIntent(update.intent);
    } catch (error) {
      logger.warn("Failed to update call intent", error);
    }
  });

  // Keep matrix rtc session in sync with localTransport$, connectRequested$
  scope.reconcile(
    scope.behavior(combineLatest([localTransport$, joinAndPublishRequested$])),
    async ([transport, shouldConnect]) => {
      if (!transport) return;
      // if shouldConnect=false we will do the disconnect as the cleanup from the previous reconcile iteration.
      if (!shouldConnect) return;

      try {
        joinMatrixRTC(transport);
        encryptionWaitAttempt$.next(Symbol());
      } catch (error) {
        logger.error("Error entering RTC session", error);
        if (error instanceof Error)
          setMatrixError(new MembershipManagerError(error));
      }

      return Promise.resolve(async (): Promise<void> => {
        encryptionWaitAttempt$.next(null);
        try {
          // TODO Update matrixRTCSession to allow udpating the transport without leaving the session!
          await matrixRTCSession.leaveRoomSession(1000);
        } catch (e) {
          logger.error("Error leaving RTC session", e);
        }
      });
    },
  );

  const participant$ = scope.behavior(
    localConnection$.pipe(map((c) => c?.livekitRoom?.localParticipant ?? null)),
  );

  // A new publication, including screen share, can finish after the gate closes.
  const publicationChanges$ = participant$.pipe(
    switchMap((participant) =>
      participant === null
        ? of(null)
        : observeParticipantEvents(
            participant,
            ParticipantEvent.LocalTrackPublished,
            ParticipantEvent.LocalTrackUnpublished,
          ).pipe(map(() => participant)),
    ),
  );
  const canSendMedia$ = combineLatest([
    homeserverConnected.combined$,
    encryptionState$,
  ]).pipe(
    map(([connected, encryption]) => connected && encryption === "ready"),
    distinctUntilChanged(),
  );
  combineLatest([publicationChanges$, canSendMedia$])
    .pipe(scope.bind())
    .subscribe(([participant, canSend]) => {
      if (!participant) return;
      for (const { track } of participant.trackPublications.values()) {
        if (!track) continue;
        // LiveKit serializes both operations. Reading isUpstreamPaused here
        // can miss a pause that has already been requested but not yet applied.
        const publisher = publisher$.value;
        const update = canSend ? track.resumeUpstream() : track.pauseUpstream();
        void update.catch((error: unknown) => {
          logger.error("Failed to update local media upstream", error);
          if (canSend || !requiresMediaEncryption) return;
          // LiveKit sets its paused flag before replacing the sender track.
          // A rejected pause can leave that sender active despite the flag.
          if (publisher && publisher$.value === publisher) {
            suspensionError$.next(new LocalMediaEncryptionError(error));
          }
          track.stop();
          void participant
            .unpublishTrack(track)
            .catch((unpublishError: unknown) => {
              logger.error(
                "Failed to unpublish the stopped local track",
                unpublishError,
              );
            });
        });
      }
    });

  /**
   * Whether the user is currently sharing their screen.
   */
  const sharingScreen$ = scope.behavior(
    participant$.pipe(
      switchMap((p) => (p !== null ? observeSharingScreen$(p) : of(false))),
    ),
  );

  const screenShareFailure$ = new BehaviorSubject<ScreenShareFailure | null>(
    null,
  );
  let screenSharingActive = true;
  scope.onEnd(() => {
    screenSharingActive = false;
  });
  let toggleScreenSharing: (() => void) | null = null;
  if (
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !getUrlParams().hideScreensharing
  ) {
    toggleScreenSharing = (): void => {
      const screenshareSettings: ScreenShareCaptureOptions = {
        audio: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include",
      };
      const targetScreenshareState = !sharingScreen$.value;
      logger.info(
        `toggleScreenSharing called. Switching ${
          targetScreenshareState ? "On" : "Off"
        }`,
      );
      // The browser picker needs the click's transient activation.
      // Block a start synchronously and always allow stopping a running share.
      if (targetScreenshareState && encryptionState$.value !== "ready") return;
      const participant = participant$.value;
      if (!screenSharingActive || !participant) return;
      screenShareFailure$.next(null);
      void participant
        .setScreenShareEnabled(targetScreenshareState, screenshareSettings)
        .then(async () => {
          // A screen picker may outlive the transport or encryption state.
          if (
            targetScreenshareState &&
            (!screenSharingActive ||
              participant$.value !== participant ||
              encryptionState$.value !== "ready")
          ) {
            await participant.setScreenShareEnabled(false);
          }
        })
        .catch((error: unknown) => {
          logger.error("Failed to toggle screen sharing", error);
          // ORISO (#2233, R8): tell the person why the share did not start,
          // unless the picker was dismissed or belonged to an old connection.
          if (
            targetScreenshareState &&
            screenSharingActive &&
            participant$.value === participant
          ) {
            screenShareFailure$.next(screenShareFailure(error));
          }
        });
    };
  }

  return {
    startTracks,
    requestJoinAndPublish,
    requestDisconnect,
    localMemberState$,
    mediaError$,
    retryMedia,
    tracks$,
    participant$,
    reconnecting$,
    disconnected$: scope.behavior(
      homeserverConnected.rtsSession$.pipe(
        map((state) => state === RTCSessionStatus.Disconnected),
      ),
    ),
    sharingScreen$,
    toggleScreenSharing,
    screenShareFailure$,
    dismissScreenShareFailure: (): void => screenShareFailure$.next(null),
    connection$: localConnection$,
  };
};

export function observeSharingScreen$(p: Participant): Observable<boolean> {
  return observeParticipantEvents(
    p,
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished,
  ).pipe(map((p) => p.isScreenShareEnabled));
}

interface EnterRTCSessionOptions {
  encryptMedia: boolean;
  matrixRTCMode: MatrixRTCMode;
}

/**
 * Does the necessary steps to enter the RTC session on the matrix side:
 *  - Preparing the membership info (FOCUS to use, options)
 *  - Sends the matrix event to join the call, and starts the membership manager:
 *      - Delay events management
 *      - Handles retries (fails only after several attempts)
 *
 * @param rtcSession
 * @param transport
 * @param options
 * @throws If the widget could not send ElementWidgetActions.JoinCall action.
 */
// Exported for unit testing
export function enterRTCSession(
  rtcSession: MatrixRTCSession,
  transport: LivekitTransport,
  { encryptMedia, matrixRTCMode }: EnterRTCSessionOptions,
): void {
  PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
  PosthogAnalytics.instance.eventCallStarted.track(rtcSession.room.roomId);

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  // groupCallOTelMembership?.onJoinCall();

  const { features, matrix_rtc_session: matrixRtcSessionConfig } = Config.get();
  const useDeviceSessionMemberEvents =
    features?.feature_use_device_session_member_events;
  const { sendNotificationType: notificationType, callIntent } = getUrlParams();
  const multiSFU = matrixRTCMode !== MatrixRTCMode.Legacy;
  // Multi-sfu does not need a preferred foci list. just the focus that is actually used.
  // TODO where/how do we track errors originating from the ongoing rtcSession?
  rtcSession.joinRoomSession(
    multiSFU ? [] : [transport],
    multiSFU ? transport : undefined,
    {
      notificationType,
      // The ORISO widget only has permission to send the modern event.
      ...(widget && { sendLegacyNotification: false }),
      callIntent,
      manageMediaKeys: encryptMedia,
      ...(useDeviceSessionMemberEvents !== undefined && {
        useLegacyMemberEvents: !useDeviceSessionMemberEvents,
      }),
      delayedLeaveEventRestartMs:
        matrixRtcSessionConfig?.delayed_leave_event_restart_ms,
      delayedLeaveEventDelayMs:
        matrixRtcSessionConfig?.delayed_leave_event_delay_ms,
      delayedLeaveEventRestartLocalTimeoutMs:
        matrixRtcSessionConfig?.delayed_leave_event_restart_local_timeout_ms,
      networkErrorRetryMs: matrixRtcSessionConfig?.network_error_retry_ms,
      makeKeyDelay: matrixRtcSessionConfig?.wait_for_key_rotation_ms,
      membershipEventExpiryMs:
        matrixRtcSessionConfig?.membership_event_expiry_ms,
      useExperimentalToDeviceTransport: true,
      unstableSendStickyEvents: matrixRTCMode === MatrixRTCMode.Matrix_2_0,
    },
  );
}
