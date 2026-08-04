/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from "vitest";
import {
  fireEvent,
  render,
  screen,
  type RenderResult,
} from "@testing-library/react";
import { type MatrixClient, JoinRule, type RoomState } from "matrix-js-sdk";
import { type RelationsContainer } from "matrix-js-sdk/lib/models/relations-container";
import { type LocalParticipant } from "livekit-client";
import { BehaviorSubject, of } from "rxjs";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@vector-im/compound-web";
import { RoomContext, useLocalParticipant } from "@livekit/components-react";

import { InCallView } from "./InCallView";
import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockMediaDevices,
  mockMuteStates,
  mockRemoteParticipant,
  mockRtcMembership,
  type MockRTCSession,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local } from "../utils/test-fixtures";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { HeaderStyle } from "../UrlParams";
import {
  type ElementCallError,
  MediaPermissionDeniedError,
} from "../utils/errors";

vi.hoisted(
  () =>
    (global.ImageData = class MockImageData {
      public data: number[] = [];
    } as unknown as typeof ImageData),
);

vi.mock("../soundUtils");
vi.mock("../useAudioContext");
vi.mock("../tile/GridTile");
vi.mock("../tile/SpotlightTile");
vi.mock("@livekit/components-react");
vi.mock("livekit-client/e2ee-worker?worker");
vi.mock("../e2ee/sharedKeyManagement");
vi.mock("../livekit/MatrixAudioRenderer");
vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => [(): void => {}, {}],
}));

const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
const localParticipant = mockLocalParticipant({
  identity: "@local:example.org:AAAAAA",
});
const remoteParticipant = mockRemoteParticipant({
  identity: "@alice:example.org:AAAAAA",
});
const carol = mockMatrixRoomMember(localRtcMember);
const roomMembers = new Map([carol].map((p) => [p.userId, p]));

const roomId = "!foo:bar";
let useRoomEncryptionSystemMock: MockedFunction<typeof useRoomEncryptionSystem>;

beforeEach(() => {
  vi.clearAllMocks();

  // MatrixAudioRenderer is tested separately.
  (
    LivekitRoomAudioRenderer as MockedFunction<typeof LivekitRoomAudioRenderer>
  ).mockImplementation((_props) => {
    return <div>mocked: MatrixAudioRenderer</div>;
  });
  (
    useLocalParticipant as MockedFunction<typeof useLocalParticipant>
  ).mockImplementation(
    () =>
      ({
        isScreenShareEnabled: false,
        localParticipant: localRtcMember as unknown as LocalParticipant,
      }) as unknown as ReturnType<typeof useLocalParticipant>,
  );
  useRoomEncryptionSystemMock =
    useRoomEncryptionSystem as typeof useRoomEncryptionSystemMock;
  useRoomEncryptionSystemMock.mockReturnValue({ kind: E2eeType.NONE });
});

function createInCallView(
  mediaError: ElementCallError | null = null,
): RenderResult & {
  rtcSession: MockRTCSession;
  retryMedia: ReturnType<typeof vi.fn>;
} {
  const client = {
    getUser: () => null,
    getUserId: () => localRtcMember.userId,
    getDeviceId: () => localRtcMember.deviceId,
    getRoom: (rId) => (rId === roomId ? room : null),
    getDomain: () => "example.com",
  } as Partial<MatrixClient> as MatrixClient;
  const room = mockMatrixRoom({
    relations: {
      getChildEventsForEvent: () =>
        vi.mocked({
          getRelations: () => [],
        }),
    } as unknown as RelationsContainer,
    client,
    roomId,
    // getMember: (userId) => roomMembers.get(userId) ?? null,
    getMembers: () => Array.from(roomMembers.values()),
    getMxcAvatarUrl: () => null,
    hasEncryptionStateEvent: vi.fn().mockReturnValue(true),
    getCanonicalAlias: () => null,
    currentState: {
      getJoinRule: () => JoinRule.Invite,
    } as Partial<RoomState> as RoomState,
  });

  const muteState = mockMuteStates();
  const livekitRoom = mockLivekitRoom(
    {
      localParticipant,
    },
    {
      remoteParticipants$: of([remoteParticipant]),
    },
  );
  const { vm, rtcSession } = getBasicCallViewModelEnvironment([local, alice]);
  const retryMedia = vi.fn();
  Object.assign(vm, {
    mediaError$: new BehaviorSubject(mediaError),
    retryMedia,
  });

  rtcSession.joined = true;
  const renderResult = render(
    <BrowserRouter>
      <MediaDevicesContext value={mockMediaDevices({})}>
        <ReactionsSenderProvider
          vm={vm}
          rtcSession={rtcSession.asMockedSession()}
        >
          <TooltipProvider>
            <RoomContext value={livekitRoom}>
              <InCallView
                client={client}
                header={HeaderStyle.Standard}
                rtcSession={rtcSession.asMockedSession()}
                muteStates={muteState}
                vm={vm}
                matrixInfo={{
                  userId: "",
                  displayName: "",
                  avatarUrl: "",
                  roomId: "",
                  roomName: "",
                  roomAlias: null,
                  roomAvatar: null,
                  e2eeSystem: {
                    kind: E2eeType.NONE,
                  },
                }}
                matrixRoom={room}
                onShareClick={null}
              />
            </RoomContext>
          </TooltipProvider>
        </ReactionsSenderProvider>
      </MediaDevicesContext>
    </BrowserRouter>,
  );
  return {
    ...renderResult,
    rtcSession,
    retryMedia,
  };
}

describe("InCallView", () => {
  describe("rendering", () => {
    it("renders", () => {
      const { container } = createInCallView();
      expect(container).toMatchSnapshot();
    });

    it("explains denied media permissions, reflects muted media, and retries", () => {
      const { retryMedia } = createInCallView(new MediaPermissionDeniedError());

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Media access blocked",
      );
      expect(
        screen.getByRole("button", { name: "Unmute microphone" }),
      ).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.getByRole("button", { name: "Start video" }),
      ).toHaveAttribute("aria-disabled", "true");

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(retryMedia).toHaveBeenCalledOnce();
    });
  });
});
