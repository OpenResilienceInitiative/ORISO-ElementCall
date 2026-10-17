/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The ORISO design, in the real call view.
 *
 * The closest thing to "a call in the new design" that can be shown without a
 * homeserver and an SFU. Everything from `InCallView` down is the production
 * tree: the layout registry picks the ORISO grove, the grove places slots,
 * `Grid` measures them and springs the real tiles in, `GridTile` resolves the
 * identity out of room state, and `MediaView` renders the form.
 *
 * `InCallView.test.tsx` mocks `GridTile` away, which is right for what that
 * file tests and useless for this — so this file does not, and that is the
 * only structural difference between the two.
 *
 * What it still cannot prove: that media flows. There is no LiveKit here.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from "vitest";
import { render, screen, type RenderResult } from "@testing-library/react";
import { type MatrixClient, JoinRule, type RoomState } from "matrix-js-sdk";
import { type RelationsContainer } from "matrix-js-sdk/lib/models/relations-container";
import { type LocalParticipant } from "livekit-client";
import { BehaviorSubject, of } from "rxjs";
import { MemoryRouter } from "react-router-dom";
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
  mockEmitter,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import {
  alice,
  aliceRtcMember,
  bob,
  bobRtcMember,
  local,
  localRtcMember as localMember,
} from "../utils/test-fixtures";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { HeaderStyle } from "../UrlParams";
import { type ElementCallError } from "../utils/errors";

vi.hoisted(
  () =>
    (global.ImageData = class MockImageData {
      public data: number[] = [];
    } as unknown as typeof ImageData),
);

vi.mock("../soundUtils");
vi.mock("../useAudioContext");
vi.mock("@livekit/components-react");
vi.mock("livekit-client/e2ee-worker?worker");
vi.mock("../e2ee/sharedKeyManagement");
vi.mock("../livekit/MatrixAudioRenderer");
/*
 * The grid asks how big it is and lays nothing out if the answer is nothing.
 *
 * `InCallView` measures three things in order — the container, the header and
 * the footer — and the stage is the container minus the other two. Handing
 * the same rect to all three makes the stage negative, so the mock answers in
 * that order with sizes a real window would give.
 */
let measured = 0;
vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => {
    const rect = [
      { width: 960, height: 760 },
      { width: 960, height: 60 },
      { width: 960, height: 100 },
    ][measured++ % 3];
    return [(): void => {}, { ...rect, top: 0, left: 0 }];
  },
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

/*
 * jsdom has no layout, so every `offsetWidth` is 0 — and `Grid` skips a slot
 * it measures as empty, which means NO tiles render at all. That is why
 * `InCallView.test.tsx` mocks the tile away, and it is the one thing this
 * file has to stand in for.
 *
 * The stand-in is faithful rather than a constant: it reads back the inline
 * size the layout itself wrote onto the slot. So the numbers the grid works
 * from are the layout's own numbers, and everything downstream — the shape,
 * the identity, the form — is real.
 */
const readInlineSize = (
  element: HTMLElement | null,
  axis: "inline" | "block",
): number => {
  for (let node = element; node !== null; node = node.parentElement) {
    const style = node.style;
    const value =
      axis === "inline"
        ? style.inlineSize || style.width
        : style.blockSize || style.height;
    const size = Number.parseFloat(value);
    // Walking up models `inset: 0`, which is how the Einzelgespraech's two
    // halves get their size — from the circle they share, through a
    // stylesheet jsdom does not apply.
    if (Number.isFinite(size) && size > 0) return size;
  }
  return 0;
};
/*
 * Patched through an element the DOCUMENT made, not through the global
 * `HTMLElement`. Vitest's jsdom environment and the `global-jsdom/register`
 * in the setup file are two different realms, and patching the wrong one is
 * silent: the getter simply never fires.
 */
const elementPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf(document.createElement("div")),
) as object;

for (const [property, axis] of [
  ["offsetWidth", "inline"],
  ["offsetHeight", "block"],
] as const) {
  Object.defineProperty(elementPrototype, property, {
    configurable: true,
    get(this: HTMLElement) {
      return readInlineSize(this, axis);
    },
  });
}

const roomId = "!foo:bar";

/** Exactly what ORISO-Frontend's `ownCallIdentity` puts on the wire. */
const PUBLISHED: Record<string, Record<string, string>> = {
  "@alice:example.org": {
    kind: "animal",
    file: "fox.svg",
    bg: "#165E83",
    ink: "#ffffff",
  },
};

/** The host origin that turns the ORISO design on. */
const HOST = "https://oriso.test";
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

function createInCallView({
  mediaError = null,
  published = PUBLISHED,
  embedded = true,
  crowd = false,
}: {
  mediaError?: ElementCallError | null;
  published?: Record<string, Record<string, string>>;
  embedded?: boolean;
  /** Three or more puts the grove on; two gives the Einzelgespräch. */
  crowd?: boolean;
} = {}): RenderResult & {
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
      // RoomState is an event emitter and the ORISO stage subscribes to it,
      // exactly as GroupCallView's own mock already does.
      ...mockEmitter(),
      getJoinRule: () => JoinRule.Invite,
      // A real RoomState always has this and returns [] for a type nobody
      // has written. The ORISO stage reads identities out of room state, so
      // the mock has to answer rather than be absent.
      getStateEvents: (type: string) =>
        type !== "org.oriso.call.identity"
          ? []
          : Object.entries(published).map(([userId, content]) => ({
              getStateKey: (): string => userId,
              getContent: (): unknown => content,
            })),
    } as unknown as RoomState,
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
  const { vm, rtcSession } = getBasicCallViewModelEnvironment(
    crowd ? [local, alice, bob] : [local, alice],
    crowd
      ? [localMember, aliceRtcMember, bobRtcMember]
      : [localMember, aliceRtcMember],
  );
  const retryMedia = vi.fn();
  Object.assign(vm, {
    mediaError$: new BehaviorSubject(mediaError),
    retryMedia,
  });

  rtcSession.joined = true;
  measured = 0;
  const renderResult = render(
    <MemoryRouter
      initialEntries={[
        embedded
          ? `/room/#?widgetId=w&parentUrl=${encodeURIComponent(HOST)}`
          : "/room/",
      ]}
    >
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
    </MemoryRouter>,
  );
  return {
    ...renderResult,
    rtcSession,
    retryMedia,
  };
}

describe("the call, in the ORISO design", () => {
  it("draws every person as a form in their own colour", async () => {
    createInCallView();

    const faces = await screen.findAllByTestId("oriso-face");
    expect(faces.length).toBeGreaterThan(0);
    // Alice published JP Ai; jsdom reports it back as rgb().
    expect(faces.map((face) => face.style.background)).toContain(
      "rgb(22, 94, 131)",
    );
  });

  it("gives each grove form its own eight-value radius and its own lean", async () => {
    /*
     * The whole chain, end to end: the layout ran `packShapes`, published
     * the blob it produced, the tile read it back off the store and
     * `MediaView` put it on the element. A plain `50%` here means the shape
     * never arrived; identical radii mean the engine was rewritten into
     * something that draws bubbles.
     *
     * Three participants, because two is the Einzelgespräch — one circle,
     * and a circle is exactly `50%`.
     */
    createInCallView({ crowd: true });
    const faces = await screen.findAllByTestId("oriso-face");

    const radii = faces.map((face) => face.style.borderRadius);
    expect(radii.length).toBeGreaterThanOrEqual(2);
    expect(radii.every((radius) => radius.includes("/"))).toBe(true);
    expect(new Set(radii).size).toBe(radii.length);
    expect(
      faces.every((face) => /rotate\(-?\d/.test(face.style.transform)),
    ).toBe(true);
  });

  it("gives the two-person call one circle, not two shapes that meet", async () => {
    createInCallView();
    const faces = await screen.findAllByTestId("oriso-face");

    expect(faces).toHaveLength(2);
    // Same box, two clips, one curve: that is what makes them one body.
    expect(faces.every((face) => face.style.borderRadius === "50%")).toBe(true);
    expect(new Set(faces.map((face) => face.style.clipPath)).size).toBe(2);
    expect(faces.every((face) => face.style.clipPath.startsWith("url("))).toBe(
      true,
    );
  });

  it("inherits the artwork from the host rather than drawing its own", async () => {
    // The artwork never arrives. The point is only that it was asked for,
    // and asked for from the host rather than from anywhere in here.
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline in a test"));
    createInCallView();
    await screen.findAllByTestId("oriso-face");

    const asked = fetch.mock.calls.map(([input]) =>
      input instanceof Request ? input.url : String(input),
    );
    expect(
      asked.some((url) =>
        url.startsWith(`${HOST}/static/anon-animals/fox.svg`),
      ),
    ).toBe(true);
  });

  it("offers the three views, with one of them spelled out", async () => {
    createInCallView();
    const rail = await screen.findByTestId("view-switcher");
    expect(
      rail.querySelectorAll('[role="radio"][aria-checked="false"]'),
    ).toHaveLength(2);
    expect(
      rail.querySelector('[role="radio"][aria-checked="true"]')?.textContent,
    ).toBeTruthy();
  });

  it("shows initials for somebody nobody published anything for", async () => {
    createInCallView({ published: {} });

    const initials = await screen.findAllByTestId("oriso-initials");
    expect(initials.length).toBeGreaterThan(0);
    // Never an invented animal.
    expect(screen.queryByTestId("oriso-artwork")).toBeNull();
  });

  it("leaves upstream's tile alone when the call is not embedded in ORISO", async () => {
    const { container } = createInCallView({ embedded: false });

    await screen.findAllByTestId("videoTile");
    expect(container.querySelector('[data-testid="oriso-face"]')).toBeNull();
    expect(container.querySelector('[data-oriso="true"]')).toBeNull();
  });
});
