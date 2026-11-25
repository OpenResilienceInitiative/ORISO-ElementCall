/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  Status as RTCMemberStatus,
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, vi } from "vitest";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
import { BehaviorSubject, map, of } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type LocalParticipant,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";

import { MatrixRTCMode } from "../../../settings/settings";
import {
  flushPromises,
  mockConfig,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMuteStates,
  withTestScheduler,
} from "../../../utils/test";
import {
  TransportState,
  createLocalMembership$,
  enterRTCSession,
  PublishState,
  TrackState,
} from "./LocalMember";
import {
  LocalMediaEncryptionError,
  MatrixRTCTransportMissingError,
  MediaPermissionDeniedError,
} from "../../../utils/errors";
import { Epoch, ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import { ConnectionManagerData } from "../remoteMembers/ConnectionManager";
import { ConnectionState, type Connection } from "../remoteMembers/Connection";
import { type Publisher } from "./Publisher";

const MATRIX_RTC_MODE = MatrixRTCMode.Legacy;
const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("../../../UrlParams", () => ({ getUrlParams }));
vi.mock("@livekit/components-core", () => ({
  observeParticipantEvents: vi
    .fn()
    .mockReturnValue(of({ isScreenShareEnabled: false })),
}));

describe("LocalMembership", () => {
  describe("enterRTCSession", () => {
    it("It joins the correct Session", () => {
      const focusFromOlderMembership = {
        type: "livekit",
        livekit_service_url: "http://my-oldest-member-service-url.com",
        livekit_alias: "my-oldest-member-service-alias",
      };

      const focusConfigFromWellKnown = {
        type: "livekit",
        livekit_service_url: "http://my-well-known-service-url.com",
      };
      const focusConfigFromWellKnown2 = {
        type: "livekit",
        livekit_service_url: "http://my-well-known-service-url2.com",
      };
      const clientWellKnown = {
        "org.matrix.msc4143.rtc_foci": [
          focusConfigFromWellKnown,
          focusConfigFromWellKnown2,
        ],
      };

      mockConfig({
        livekit: { livekit_service_url: "http://my-default-service-url.com" },
      });

      vi.spyOn(AutoDiscovery, "getRawClientConfig").mockImplementation(
        async (domain) => {
          if (domain === "example.org") {
            return Promise.resolve(clientWellKnown);
          }
          return Promise.resolve({});
        },
      );

      const mockedSession = vi.mocked({
        room: {
          roomId: "roomId",
          client: {
            getDomain: vi.fn().mockReturnValue("example.org"),
            getOpenIdToken: vi.fn().mockResolvedValue({
              access_token: "ACCCESS_TOKEN",
              token_type: "Bearer",
              matrix_server_name: "localhost",
              expires_in: 10000,
            }),
          },
        },
        memberships: [],
        getFocusInUse: vi.fn().mockReturnValue(focusFromOlderMembership),
        getOldestMembership: vi.fn().mockReturnValue({
          getPreferredFoci: vi.fn().mockReturnValue([focusFromOlderMembership]),
        }),
        joinRoomSession: vi.fn(),
      }) as unknown as MatrixRTCSession;

      enterRTCSession(
        mockedSession,
        {
          livekit_alias: "roomId",
          livekit_service_url: "http://my-well-known-service-url.com",
          type: "livekit",
        },
        {
          encryptMedia: true,
          matrixRTCMode: MATRIX_RTC_MODE,
        },
      );

      expect(mockedSession.joinRoomSession).toHaveBeenLastCalledWith(
        [
          {
            livekit_alias: "roomId",
            livekit_service_url: "http://my-well-known-service-url.com",
            type: "livekit",
          },
        ],
        undefined,
        expect.objectContaining({
          manageMediaKeys: true,
          useLegacyMemberEvents: false,
        }),
      );
    });

    it("It should not fail with configuration error if homeserver config has livekit url but not fallback", () => {
      mockConfig({});
      vi.spyOn(AutoDiscovery, "getRawClientConfig").mockResolvedValue({
        "org.matrix.msc4143.rtc_foci": [
          {
            type: "livekit",
            livekit_service_url: "http://my-well-known-service-url.com",
          },
        ],
      });

      const mockedSession = vi.mocked({
        room: {
          roomId: "roomId",
          client: {
            getDomain: vi.fn().mockReturnValue("example.org"),
            getOpenIdToken: vi.fn().mockResolvedValue({
              access_token: "ACCCESS_TOKEN",
              token_type: "Bearer",
              matrix_server_name: "localhost",
              expires_in: 10000,
            }),
          },
        },
        memberships: [],
        getFocusInUse: vi.fn(),
        joinRoomSession: vi.fn(),
      }) as unknown as MatrixRTCSession;

      enterRTCSession(
        mockedSession,
        {
          livekit_alias: "roomId",
          livekit_service_url: "http://my-well-known-service-url.com",
          type: "livekit",
        },
        {
          encryptMedia: true,
          matrixRTCMode: MATRIX_RTC_MODE,
        },
      );
    });
  });

  const defaultCreateLocalMemberValues = {
    options: constant({
      encryptMedia: false,
      matrixRTCMode: MatrixRTCMode.Matrix_2_0,
    }),
    matrixRTCSession: {
      updateCallIntent: () => {},
      leaveRoomSession: () => {},
    } as unknown as MatrixRTCSession,
    muteStates: mockMuteStates(),
    ownMembershipPresent$: constant(true),
    trackProcessorState$: constant({
      supported: false,
      processor: undefined,
    }),
    logger: logger,
    createPublisherFactory: vi.fn(),
    joinMatrixRTC: async (): Promise<void> => {},
    homeserverConnected: {
      combined$: constant(true),
      rtsSession$: constant(RTCMemberStatus.Connected),
    },
  };

  it("waits for the local device membership before updating call intent", async () => {
    const scope = new ObservableScope();
    const ownMembershipPresent$ = new BehaviorSubject(false);
    const firstUpdate = Promise.withResolvers<void>();
    const updateCallIntent = vi
      .fn()
      .mockReturnValueOnce(firstUpdate.promise)
      .mockResolvedValue(undefined);
    createLocalMembership$({
      ...defaultCreateLocalMemberValues,
      scope,
      ownMembershipPresent$,
      matrixRTCSession: {
        updateCallIntent,
        leaveRoomSession: vi.fn(),
      },
      connectionManager: {
        connectionManagerData$: constant(
          new Epoch(new ConnectionManagerData()),
        ),
      },
      localTransport$: constant(null),
    });

    await flushPromises();
    expect(updateCallIntent).not.toHaveBeenCalled();

    ownMembershipPresent$.next(true);
    expect(updateCallIntent).not.toHaveBeenCalled();
    await flushPromises();
    expect(updateCallIntent).toHaveBeenCalledOnce();

    ownMembershipPresent$.next(false);
    ownMembershipPresent$.next(true);
    await flushPromises();
    expect(updateCallIntent).toHaveBeenCalledOnce();
    firstUpdate.reject(new Error("Membership left while updating intent"));
    await flushPromises();
    expect(updateCallIntent).toHaveBeenCalledTimes(2);
    expect(updateCallIntent).toHaveBeenLastCalledWith("video");

    ownMembershipPresent$.next(false);
    ownMembershipPresent$.next(true);
    scope.end();
    await flushPromises();
    expect(updateCallIntent).toHaveBeenCalledTimes(2);
  });

  it("throws error on missing RTC config error", () => {
    withTestScheduler(({ scope, hot, expectObservable }) => {
      const localTransport$ = scope.behavior<null | LivekitTransport>(
        hot("1ms #", {}, new MatrixRTCTransportMissingError("domain.com")),
        null,
      );

      // we do not need any connection data since we want to fail before reaching that.
      const mockConnectionManager = {
        transports$: scope.behavior(
          localTransport$.pipe(map((t) => new Epoch([t]))),
        ),
        connectionManagerData$: constant(
          new Epoch(new ConnectionManagerData()),
        ),
      };

      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        connectionManager: mockConnectionManager,
        localTransport$,
      });
      localMembership.requestJoinAndPublish();

      expectObservable(localMembership.localMemberState$).toBe("ne", {
        n: TransportState.Waiting,
        e: expect.toSatisfy((e) => e instanceof MatrixRTCTransportMissingError),
      });
    });
  });

  const aTransport = {
    livekit_service_url: "a",
  } as LivekitTransport;
  const bTransport = {
    livekit_service_url: "b",
  } as LivekitTransport;

  const connectionTransportAConnected = {
    livekitRoom: mockLivekitRoom({
      localParticipant: {
        isScreenShareEnabled: false,
        trackPublications: [],
      } as unknown as LocalParticipant,
    }),
    state$: constant(ConnectionState.LivekitConnected),
    transport: aTransport,
  } as unknown as Connection;
  const connectionTransportAConnecting = {
    ...connectionTransportAConnected,
    state$: constant(ConnectionState.LivekitConnecting),
  } as unknown as Connection;
  const connectionTransportBConnected = {
    state$: constant(ConnectionState.LivekitConnected),
    transport: bTransport,
  } as unknown as Connection;

  it("recreates publisher if new connection is used and ENDS always unpublish and end tracks", async () => {
    const scope = new ObservableScope();

    const localTransport$ = new BehaviorSubject(aTransport);

    const publishers: Publisher[] = [];

    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          retire: vi.fn(),
          stopPublishing: vi.fn(),
          stopTracks: vi.fn(),
          publishing$: constant(false),
        };
        publishers.push(p as unknown as Publisher);
        return p;
      },
    );
    const publisherFactory =
      defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
        typeof vi.fn
      >;

    const connectionManagerData = new ConnectionManagerData();
    connectionManagerData.add(connectionTransportAConnected, []);
    connectionManagerData.add(connectionTransportBConnected, []);
    createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$,
    });
    await flushPromises();
    localTransport$.next(bTransport);
    await flushPromises();
    expect(publisherFactory).toHaveBeenCalledTimes(2);
    expect(publishers.length).toBe(2);
    // stop the first Publisher and let the second one life.
    expect(publishers[0].stopTracks).toHaveBeenCalled();
    expect(publishers[1].stopTracks).not.toHaveBeenCalled();
    expect(publishers[0].stopPublishing).toHaveBeenCalled();
    expect(publishers[1].stopPublishing).not.toHaveBeenCalled();
    expect(publisherFactory.mock.calls[0][0].transport).toBe(aTransport);
    expect(publisherFactory.mock.calls[1][0].transport).toBe(bTransport);
    scope.end();
    await flushPromises();
    // stop all tracks after ending scopes
    expect(publishers[1].stopPublishing).toHaveBeenCalled();
    expect(publishers[1].stopTracks).toHaveBeenCalled();

    defaultCreateLocalMemberValues.createPublisherFactory.mockReset();
  });

  it("only start tracks if requested", async () => {
    const scope = new ObservableScope();

    const localTransport$ = new BehaviorSubject(aTransport);

    const publishers: Publisher[] = [];

    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = new BehaviorSubject<boolean>(false);
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          retire: vi.fn(),
          stopPublishing: vi.fn(),
          stopTracks: vi.fn(),
          createAndSetupTracks: vi.fn().mockImplementation(async () => {
            tracks$.next([{}, {}] as LocalTrack[]);
            return Promise.resolve();
          }),
          tracks$,
          publishing$,
        };
        publishers.push(p as unknown as Publisher);
        return p;
      },
    );
    const publisherFactory =
      defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
        typeof vi.fn
      >;

    const connectionManagerData = new ConnectionManagerData();
    connectionManagerData.add(connectionTransportAConnected, []);
    // connectionManagerData.add(connectionTransportB, []);
    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$,
    });
    await flushPromises();
    expect(publisherFactory).toHaveBeenCalledOnce();
    expect(localMembership.tracks$.value.length).toBe(0);
    localMembership.startTracks();
    await flushPromises();
    expect(localMembership.tracks$.value.length).toBe(2);
    scope.end();
    await flushPromises();
    // stop all tracks after ending scopes
    expect(publishers[0].stopPublishing).toHaveBeenCalled();
    expect(publishers[0].stopTracks).toHaveBeenCalled();
    publisherFactory.mockClear();
  });

  it("surfaces a media permission failure and retries track creation", async () => {
    const scope = new ObservableScope();
    const localTransport$ = new BehaviorSubject(aTransport);
    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = new BehaviorSubject(false);
    const permissionError = new DOMException(
      "Permission denied",
      "NotAllowedError",
    );
    const createAndSetupTracks = vi
      .fn()
      .mockRejectedValueOnce(permissionError)
      .mockImplementationOnce(async () => {
        await Promise.resolve();
        tracks$.next([{}, {}] as LocalTrack[]);
      });

    defaultCreateLocalMemberValues.createPublisherFactory.mockReturnValue({
      retire: vi.fn(),
      stopPublishing: vi.fn(),
      stopTracks: vi.fn(),
      createAndSetupTracks,
      tracks$,
      publishing$,
    } as unknown as Publisher);

    const connectionManagerData = new ConnectionManagerData();
    connectionManagerData.add(connectionTransportAConnected, []);
    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$,
    });

    localMembership.startTracks();
    await flushPromises();
    expect(createAndSetupTracks).toHaveBeenCalledOnce();
    expect(localMembership.mediaError$.value).toBeInstanceOf(
      MediaPermissionDeniedError,
    );

    localMembership.startTracks();
    await flushPromises();
    expect(createAndSetupTracks).toHaveBeenCalledTimes(2);
    expect(localMembership.mediaError$.value).toBeNull();
    expect(localMembership.tracks$.value).toHaveLength(2);

    scope.end();
    defaultCreateLocalMemberValues.createPublisherFactory.mockClear();
  });
  interface EncryptedMembershipFixture {
    localMembership: ReturnType<typeof createLocalMembership$>;
    localTransport$: BehaviorSubject<LivekitTransport>;
    participant: LocalParticipant;
    replacement: LocalParticipant;
    participantEvents$: BehaviorSubject<LocalParticipant>;
    encryptionState$: BehaviorSubject<
      "pending" | "ready" | LocalMediaEncryptionError
    >;
    startPublishing: ReturnType<typeof vi.fn>;
    stopPublishing: ReturnType<typeof vi.fn>;
    stopTracks: ReturnType<typeof vi.fn>;
    retryEncryption: ReturnType<typeof vi.fn>;
    joinMatrixRTC: ReturnType<typeof vi.fn>;
    end: () => void;
  }

  const setupEncryptedMembership = (
    initialState: "pending" | "ready",
  ): EncryptedMembershipFixture => {
    const scope = new ObservableScope();
    const encryptionState$ = new BehaviorSubject<
      "pending" | "ready" | LocalMediaEncryptionError
    >(initialState);
    const tracks$ = new BehaviorSubject<LocalTrack[]>([{} as LocalTrack]);
    const publishing$ = new BehaviorSubject(false);
    const participant = mockLocalParticipant({
      isScreenShareEnabled: false,
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
    });
    const replacement = mockLocalParticipant({
      isScreenShareEnabled: false,
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
    });
    const participantEvents$ = new BehaviorSubject<LocalParticipant>(
      participant,
    );
    const observeEvents = vi.mocked(observeParticipantEvents);
    observeEvents.mockImplementation((current) =>
      current === participant ? participantEvents$ : of(current),
    );
    const startPublishing = vi.fn(async (): Promise<void> => {
      await Promise.resolve();
      publishing$.next(true);
    });
    const stopPublishing = vi.fn(async (): Promise<void> => {
      await Promise.resolve();
      publishing$.next(false);
    });
    const stopTracks = vi.fn(() => tracks$.next([]));
    const createAndSetupTracks = vi.fn(async (): Promise<void> => {
      await Promise.resolve();
      tracks$.next([{} as LocalTrack]);
    });
    const retryEncryption = vi.fn(() => encryptionState$.next("ready"));
    const connectionManagerData = new ConnectionManagerData();
    connectionManagerData.add(
      {
        ...connectionTransportAConnected,
        livekitRoom: mockLivekitRoom({ localParticipant: participant }),
      } as Connection,
      [],
    );
    connectionManagerData.add(
      {
        ...connectionTransportBConnected,
        livekitRoom: mockLivekitRoom({ localParticipant: replacement }),
      } as Connection,
      [],
    );
    const joinMatrixRTC = vi.fn();
    const localTransport$ = new BehaviorSubject(aTransport);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn() } });
    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      joinMatrixRTC,
      requiresMediaEncryption: true,
      createPublisherFactory: vi.fn().mockReturnValue({
        retire: vi.fn(),
        stopPublishing,
        stopTracks,
        startPublishing,
        createAndSetupTracks,
        retryEncryption,
        tracks$,
        publishing$,
        encryptionState$,
      }),
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$,
    });
    return {
      localMembership,
      localTransport$,
      participant,
      replacement,
      participantEvents$,
      encryptionState$,
      startPublishing,
      stopPublishing,
      stopTracks,
      retryEncryption,
      joinMatrixRTC,
      end: (): void => {
        scope.end();
        vi.unstubAllGlobals();
        observeEvents.mockReset();
        observeEvents.mockReturnValue(
          of({ isScreenShareEnabled: false } as LocalParticipant),
        );
      },
    };
  };

  it("continues Matrix join but blocks publication and screen share until encryption is ready", async () => {
    const fixture = setupEncryptedMembership("pending");
    const {
      localMembership,
      encryptionState$,
      participant,
      participantEvents$,
    } = fixture;
    try {
      localMembership.requestJoinAndPublish();
      await flushPromises();
      expect(fixture.joinMatrixRTC).toHaveBeenCalledOnce();
      expect(fixture.startPublishing).not.toHaveBeenCalled();
      localMembership.toggleScreenSharing?.();
      expect(participant.setScreenShareEnabled).not.toHaveBeenCalled();

      const error = new LocalMediaEncryptionError(
        new Error("key import failure"),
      );
      encryptionState$.next(error);
      expect(localMembership.mediaError$.value).toBe(error);
      localMembership.retryMedia();
      await flushPromises();
      expect(fixture.retryEncryption).toHaveBeenCalledExactlyOnceWith(false);
      expect(localMembership.mediaError$.value).toBeNull();
      expect(fixture.startPublishing).toHaveBeenCalledOnce();
      localMembership.toggleScreenSharing?.();
      expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(
        true,
        expect.anything(),
      );

      const track = {
        pauseUpstream: vi.fn().mockResolvedValue(undefined),
        resumeUpstream: vi.fn().mockResolvedValue(undefined),
      };
      participant.trackPublications.set("screen", {
        track,
      } as unknown as LocalTrackPublication);
      participantEvents$.next(
        mockLocalParticipant({ isScreenShareEnabled: true }),
      );
      expect(track.resumeUpstream).toHaveBeenCalledOnce();
      encryptionState$.next("pending");
      expect(track.pauseUpstream).toHaveBeenCalledOnce();
      localMembership.toggleScreenSharing?.();
      expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(
        false,
        expect.anything(),
      );
    } finally {
      fixture.end();
    }
  });

  it("starts the encryption timeout when Matrix join is attempted and retries pending setup", async () => {
    vi.useFakeTimers();
    const fixture = setupEncryptedMembership("pending");
    const { localMembership } = fixture;
    try {
      await vi.advanceTimersByTimeAsync(20_000);
      expect(localMembership.mediaError$.value).toBeNull();

      localMembership.requestJoinAndPublish();
      await vi.advanceTimersByTimeAsync(14_999);
      expect(fixture.joinMatrixRTC).toHaveBeenCalledOnce();
      expect(localMembership.mediaError$.value).toBeNull();

      await vi.advanceTimersByTimeAsync(1);
      expect(localMembership.mediaError$.value).toBeInstanceOf(
        LocalMediaEncryptionError,
      );
      localMembership.retryMedia();
      await vi.advanceTimersByTimeAsync(0);
      expect(fixture.retryEncryption).toHaveBeenCalledExactlyOnceWith(true);
      expect(fixture.joinMatrixRTC).toHaveBeenCalledOnce();
      expect(localMembership.mediaError$.value).toBeNull();
      expect(fixture.startPublishing).toHaveBeenCalledOnce();
    } finally {
      fixture.end();
      vi.useRealTimers();
    }
  });

  it("stops and unpublishes a track whose encryption suspension was rejected", async () => {
    const fixture = setupEncryptedMembership("ready");
    const {
      localMembership,
      participant,
      participantEvents$,
      encryptionState$,
    } = fixture;
    try {
      localMembership.requestJoinAndPublish();
      await flushPromises();
      const track = {
        pauseUpstream: vi
          .fn()
          .mockRejectedValue(new Error("replaceTrack rejected")),
        resumeUpstream: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      };
      participant.trackPublications.set("screen", {
        track,
      } as unknown as LocalTrackPublication);
      participantEvents$.next(participant);
      encryptionState$.next("pending");
      await flushPromises();

      expect(track.stop).toHaveBeenCalledOnce();
      expect(participant.unpublishTrack).toHaveBeenCalledExactlyOnceWith(track);
      expect(localMembership.mediaError$.value).toBeInstanceOf(
        LocalMediaEncryptionError,
      );
      participant.trackPublications.delete("screen");
      localMembership.retryMedia();
      await flushPromises();
      expect(fixture.stopPublishing).toHaveBeenCalledOnce();
      expect(fixture.stopTracks).toHaveBeenCalledOnce();
      expect(localMembership.mediaError$.value).toBeNull();
      expect(fixture.startPublishing).toHaveBeenCalledTimes(2);
    } finally {
      fixture.end();
    }
  });

  it("stops a late screen picker on its original participant after the transport switches", async () => {
    const fixture = setupEncryptedMembership("ready");
    const { localMembership, localTransport$, participant, replacement } =
      fixture;
    const picker = Promise.withResolvers<LocalTrackPublication | undefined>();
    vi.mocked(participant.setScreenShareEnabled).mockReturnValueOnce(
      picker.promise,
    );
    try {
      localMembership.requestJoinAndPublish();
      await flushPromises();
      localMembership.toggleScreenSharing?.();
      expect(participant.setScreenShareEnabled).toHaveBeenCalledExactlyOnceWith(
        true,
        expect.anything(),
      );

      localTransport$.next(bTransport);
      await flushPromises();
      picker.resolve(undefined);
      await flushPromises();
      expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(false);
      expect(replacement.setScreenShareEnabled).not.toHaveBeenCalled();
    } finally {
      fixture.end();
    }
  });
  // TODO add an integration test combining publisher and localMembership
  //
  it("tracks livekit state correctly", async () => {
    const scope = new ObservableScope();

    const connectionManagerData = new ConnectionManagerData();
    const localTransport$ = new BehaviorSubject<null | LivekitTransport>(null);
    const connectionManagerData$ = new BehaviorSubject(
      new Epoch(connectionManagerData),
    );
    const publishers: Publisher[] = [];

    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = new BehaviorSubject<boolean>(false);
    const createTrackResolver = Promise.withResolvers<void>();
    const publishResolver = Promise.withResolvers<void>();
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          retire: vi.fn(),
          stopPublishing: vi.fn(),
          stopTracks: vi.fn().mockImplementation(() => {
            logger.info("stopTracks");
            tracks$.next([]);
          }),
          createAndSetupTracks: vi.fn().mockImplementation(async () => {
            await createTrackResolver.promise;
            tracks$.next([{}, {}] as LocalTrack[]);
          }),
          startPublishing: vi.fn().mockImplementation(async () => {
            await publishResolver.promise;
            publishing$.next(true);
          }),
          tracks$,
          publishing$,
        };
        publishers.push(p as unknown as Publisher);
        return p;
      },
    );

    const publisherFactory =
      defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
        typeof vi.fn
      >;

    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$,
      },
      localTransport$,
    });

    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual(
      TransportState.Waiting,
    );
    localTransport$.next(aTransport);
    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: { connection: null, tracks: TrackState.WaitingForUser },
    });

    const connectionManagerData2 = new ConnectionManagerData();
    connectionManagerData2.add(
      // clone because we will mutate this later.
      { ...connectionTransportAConnecting } as unknown as Connection,
      [],
    );

    connectionManagerData$.next(new Epoch(connectionManagerData2));
    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: {
        connection: ConnectionState.LivekitConnecting,
        tracks: TrackState.WaitingForUser,
      },
    });

    (
      connectionManagerData2.getConnectionForTransport(aTransport)!
        .state$ as BehaviorSubject<ConnectionState>
    ).next(ConnectionState.LivekitConnected);
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: {
        connection: ConnectionState.LivekitConnected,
        tracks: TrackState.WaitingForUser,
      },
    });

    expect(publisherFactory).toHaveBeenCalledOnce();
    expect(localMembership.tracks$.value.length).toBe(0);

    // -------
    localMembership.startTracks();
    // -------

    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: {
        tracks: TrackState.Creating,
        connection: ConnectionState.LivekitConnected,
      },
    });
    createTrackResolver.resolve();
    await flushPromises();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.WaitingForUser);

    // -------
    localMembership.requestJoinAndPublish();
    // -------

    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Starting);

    publishResolver.resolve();
    await flushPromises();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);

    expect(publishers[0].stopPublishing).not.toHaveBeenCalled();

    expect(localMembership.localMemberState$.isStopped).toBe(false);
    scope.end();
    await flushPromises();
    // stays in connected state because it is stopped before the update to tracks update the state.
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);
    // stop all tracks after ending scopes
    expect(publishers[0].stopPublishing).toHaveBeenCalled();
    expect(publishers[0].stopTracks).toHaveBeenCalled();
  });
  // TODO add tests for matrix local matrix participation.
});
