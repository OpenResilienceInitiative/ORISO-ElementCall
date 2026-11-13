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
 * identity out of the room's encrypted timeline, and `MediaView` renders the
 * form.
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
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react";
import {
  type EventTimeline,
  type MatrixClient,
  JoinRule,
  type RoomState,
} from "matrix-js-sdk";
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
import { setLocalStorageItemReactive } from "../useLocalStorage";
import { type ElementCallError } from "../utils/errors";
import { type ScreenShareFailure } from "../oriso/screenShareFailure";

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
 * The host's window channel. Null (no buttons) unless a test says the host
 * leaves the window to the call; there is no widget in this file.
 */
const hostWindow = vi.hoisted(() => ({
  send: null as null | ((command: string) => void),
  fullscreen: true,
}));
vi.mock("../oriso/useOrisoWindow", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrisoWindow: (): typeof hostWindow => hostWindow,
}));
/*
 * The grid asks how big it is and lays nothing out if the answer is nothing.
 *
 * `InCallView` measures three things in order — the container, the header and
 * the footer — and the stage is the container minus the other two. Handing
 * the same rect to all three makes the stage negative, so the mock answers in
 * that order with sizes a real window would give.
 */
let measured = 0;
// A phone's width for S9's tests; reset to a desktop's before each test.
const view = vi.hoisted(() => ({ width: 960 }));
vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => {
    const rect = [
      { width: view.width, height: 760 },
      { width: view.width, height: 60 },
      { width: view.width, height: 100 },
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
  view.width = 960;
  hostWindow.send = null;
  hostWindow.fullscreen = true;
  // Views, atmosphere and name style are remembered per person (S5, S6);
  // one test's choice must not become the next test's start.
  localStorage.clear();

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
  orisoDesign = true,
  crowd = false,
  callIntent,
  callType,
  encrypted = false,
  orisoLogo,
  cameraOn = false,
  solo = false,
  canShare = false,
  shareFailure = null,
  roomName = "Schuldnerberatung",
  topic,
}: {
  mediaError?: ElementCallError | null;
  published?: Record<string, Record<string, string>>;
  embedded?: boolean;
  /** Whether the host asked for the design. A widget embed on its own does
   *  not: `parentUrl` is generic and every Element Web embedding has one. */
  orisoDesign?: boolean;
  /** Three or more puts the grove on; two gives the Einzelgespräch. */
  crowd?: boolean;
  callIntent?: "audio" | "video";
  /** `orisoCallType` on the URL, and in the view model as InCallView passes it. */
  callType?: "group" | "circle" | "single";
  encrypted?: boolean;
  /** The Träger's logo, as the app puts it into the call address. */
  orisoLogo?: string;
  /** Whether either camera in a 1:1 is on (#2233 D1/D5). */
  cameraOn?: boolean;
  /** Nobody else in the call yet: the person waits alone. */
  solo?: boolean;
  /** Whether this browser can capture a screen (jsdom cannot). */
  canShare?: boolean;
  /** Why the last attempt to share did not start. */
  shareFailure?: ScreenShareFailure | null;
  /** The room's display name; "" is a room without a real name. */
  roomName?: string;
  /** `orisoTopic` on the URL (#2233 R6). */
  topic?: string;
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
      // RoomState is an event emitter and parts of the view subscribe to it,
      // exactly as GroupCallView's own mock already does.
      ...mockEmitter(),
      getJoinRule: () => JoinRule.Invite,
      // A real RoomState always has this and returns [] for a type nobody
      // has written.
      getStateEvents: () => [],
    } as unknown as RoomState,
    /*
     * Identities come off the TIMELINE, not out of room state.
     *
     * Room state is not encrypted, in an encrypted room or any other, so an
     * identity in state was a record the homeserver could read — which
     * advice seeker chose which animal. The host sends each one as an
     * ordinary room event, sealed by the room's Megolm session and decrypted
     * before it reaches the widget, and the reader files it under the
     * event's SENDER: there is no state key left to claim, so one person
     * cannot write another's face.
     */
    getLiveTimeline: () =>
      ({
        getEvents: () =>
          Object.entries(published).map(([userId, content]) => ({
            getType: (): string => "org.oriso.call.identity",
            getSender: (): string => userId,
            getContent: (): unknown => content,
          })),
        getState: () => undefined,
      }) as unknown as EventTimeline,
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
    solo ? [local] : crowd ? [local, alice, bob] : [local, alice],
    solo
      ? [localMember]
      : crowd
        ? [localMember, aliceRtcMember, bobRtcMember]
        : [localMember, aliceRtcMember],
    {
      orisoDesign,
      orisoCallType: callType ?? null,
      orisoCallIntent: callIntent ?? null,
    },
  );
  const retryMedia = vi.fn();
  Object.assign(vm, {
    mediaError$: new BehaviorSubject(mediaError),
    retryMedia,
    orisoCameraOn$: new BehaviorSubject(cameraOn),
    screenShareFailure$: new BehaviorSubject(shareFailure),
    dismissScreenShareFailure: vi.fn(),
    ...(canShare ? { toggleScreenSharing: vi.fn() } : {}),
  });

  rtcSession.joined = true;
  measured = 0;
  const renderResult = render(
    <MemoryRouter
      initialEntries={[
        embedded
          ? `/room/#?widgetId=w${orisoDesign ? "&orisoDesign=true" : ""}` +
            `&parentUrl=${encodeURIComponent(HOST)}` +
            (callIntent === undefined ? "" : `&callIntent=${callIntent}`) +
            (callType === undefined ? "" : `&orisoCallType=${callType}`) +
            (topic === undefined
              ? ""
              : `&orisoTopic=${encodeURIComponent(topic)}`) +
            (orisoLogo === undefined
              ? ""
              : `&orisoLogo=${encodeURIComponent(orisoLogo)}`)
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
                header={
                  callIntent === "video"
                    ? HeaderStyle.None
                    : HeaderStyle.Standard
                }
                rtcSession={rtcSession.asMockedSession()}
                muteStates={muteState}
                vm={vm}
                matrixInfo={{
                  userId: "",
                  displayName: "",
                  avatarUrl: "",
                  roomId: "",
                  roomName,
                  roomAlias: null,
                  roomAvatar: null,
                  e2eeSystem: {
                    kind: encrypted ? E2eeType.PER_PARTICIPANT : E2eeType.NONE,
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

  it("keeps the audio circle with participant symbols and hides the camera control", async () => {
    createInCallView({ callIntent: "audio", published: {} });

    expect(await screen.findByTestId("einzelgespraech")).toBeInTheDocument();
    const symbols = await screen.findAllByTestId("oriso-initials");
    expect(symbols).toHaveLength(2);
    expect(symbols.every((symbol) => symbol.textContent?.trim())).toBe(true);
    expect(screen.queryByTestId("incall_videomute")).not.toBeInTheDocument();
  });

  /*
   * S3, design 2b: the audio 1:1 has a header — the title, the encryption
   * chip and the call's duration — over the atmosphere.
   */
  it("gives the audio 1:1 a header with title, encryption and duration", async () => {
    createInCallView({ callIntent: "audio", published: {}, encrypted: true });
    await screen.findByTestId("einzelgespraech");
    const header = screen.getByTestId("oriso-header");
    expect(header.dataset.tone).toBe("light");
    expect(within(header).getByText("Schuldnerberatung")).toBeInTheDocument();
    expect(
      within(header).getByText("End-to-end encrypted"),
    ).toBeInTheDocument();
    expect(
      within(header).getByTestId("oriso-call-duration").textContent,
    ).toMatch(/^\d+:\d\d$/);
    const toolbar = screen.getByTestId("oriso-toolbar");
    expect(within(toolbar).queryByTestId("incall_videomute")).toBeNull();
    expect(within(toolbar).getByTestId("incall_leave")).toHaveTextContent(
      "Hang up",
    );
  });

  it("keeps the split circle in a video call while both cameras are off (#2233 D5)", async () => {
    createInCallView({ callIntent: "video", published: {} });
    expect(await screen.findByTestId("einzelgespraech")).toBeInTheDocument();
    expect(screen.getByTestId("incall_videomute")).toBeInTheDocument();
    const symbols = await screen.findAllByTestId("oriso-initials");
    expect(symbols).toHaveLength(2);
  });

  it.each(["video", undefined] as const)(
    "turns a %s 1:1 into the video stage once a camera is on, me round at the bottom left (#2233 D1)",
    async (callIntent) => {
      const { container } = createInCallView({
        callIntent,
        published: {},
        cameraOn: true,
      });
      expect(screen.queryByTestId("einzelgespraech")).not.toBeInTheDocument();
      const own = container.querySelector(
        '[data-block-alignment="end"][data-inline-alignment="start"]',
      );
      expect(own).toBeInTheDocument();
      // The slot marks the place; the tile itself is drawn in the tile layer.
      await waitFor(() =>
        expect(
          container.querySelectorAll('[data-oriso-round="true"]'),
        ).toHaveLength(1),
      );
    },
  );

  it("opens docked notes from the header of an embedded video call", () => {
    const { container } = createInCallView({
      callIntent: "video",
      published: {},
      cameraOn: true,
    });
    expect(screen.getByText("Schuldnerberatung")).toBeInTheDocument();

    const headerButton = screen.getByTestId("incall_video_header_notes");
    expect(headerButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(headerButton);

    expect(
      screen.getByRole("region", { name: "Scratchpad" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-notes-docked="true"]'),
    ).toBeInTheDocument();
    expect(screen.getByTestId("incall_notes")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByTestId("incall_notes"));
    expect(
      screen.queryByRole("region", { name: "Scratchpad" }),
    ).not.toBeInTheDocument();
    expect(headerButton).toHaveAttribute("aria-pressed", "false");
  });

  /*
   * S2. On Dev the host's window buttons lay over the video header's
   * "Notizen". Without `orisoHostChrome` the host still draws them, so the
   * header keeps their corner free; the notes button sits inside it.
   */
  it("keeps the host's window corner free of the header's own buttons", () => {
    createInCallView({ callIntent: "video", published: {}, cameraOn: true });
    const header = screen.getByTestId("oriso-header");
    expect(header.dataset.hostChrome).toBe("host");
    expect(header.dataset.tone).toBe("dark");
    expect(
      within(header).getByTestId("incall_video_header_notes"),
    ).toBeInTheDocument();
    expect(within(header).queryByTestId("oriso-window-minimise")).toBeNull();
  });

  /*
   * S4, design 5a: the video 1:1 names itself in the header, and its notes
   * dock beside the stage instead of lying over the person on it.
   */
  it("titles the video 1:1 and docks the notes beside the stage", () => {
    const { container } = createInCallView({
      callIntent: "video",
      published: {},
      cameraOn: true,
    });
    const header = screen.getByTestId("oriso-header");
    expect(within(header).getByText("Schuldnerberatung")).toBeInTheDocument();
    fireEvent.click(within(header).getByTestId("incall_video_header_notes"));
    expect(
      container.querySelector(
        '[data-oriso-video-stage="true"][data-notes-docked="true"]',
      ),
    ).toBeInTheDocument();
  });

  describe("the Träger's logo in the header (#137)", () => {
    // The call page's own origin: where a logo may come from by default.
    const LOGO = `${window.location.origin}/service/tenant/public/branding/12/logo`;

    it("sits left of the title in the header of an embedded video call", () => {
      createInCallView({
        callIntent: "video",
        published: {},
        orisoLogo: LOGO,
      });
      const header = screen
        .getByText("Schuldnerberatung")
        .closest("header") as HTMLElement;
      const logo = within(header).getByTestId("oriso_header_logo");
      expect(logo).toHaveAttribute("src", LOGO);
      fireEvent.load(logo);
      expect(logo).toBeVisible();
      // DOCUMENT_POSITION_FOLLOWING: the title comes after the logo.
      expect(
        logo.compareDocumentPosition(screen.getByText("Schuldnerberatung")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("draws no image when the address carries no logo", () => {
      const { container } = createInCallView({
        callIntent: "video",
        published: {},
      });
      expect(screen.getByText("Schuldnerberatung")).toBeInTheDocument();
      expect(screen.queryByTestId("oriso_header_logo")).not.toBeInTheDocument();
      expect(container.querySelector("header img")).toBeNull();
    });

    it("draws no image when the logo cannot be loaded", () => {
      createInCallView({
        callIntent: "video",
        published: {},
        orisoLogo: LOGO,
      });
      fireEvent.error(screen.getByTestId("oriso_header_logo"));
      expect(screen.queryByTestId("oriso_header_logo")).not.toBeInTheDocument();
    });

    it("rejects a script address instead of putting it into the page", () => {
      const { container } = createInCallView({
        callIntent: "video",
        published: {},
        orisoLogo: "javascript:alert(1)",
      });
      expect(screen.queryByTestId("oriso_header_logo")).not.toBeInTheDocument();
      expect(container.querySelector("img[src^='javascript']")).toBeNull();
    });

    it("draws no image for a logo on a host nobody listed", () => {
      const { container } = createInCallView({
        callIntent: "video",
        published: {},
        orisoLogo:
          "https://tracker.example.org/service/tenant/public/branding/12/logo",
      });
      expect(screen.queryByTestId("oriso_header_logo")).not.toBeInTheDocument();
      expect(container.querySelector("header img")).toBeNull();
    });

    it("rejects a data address", () => {
      createInCallView({
        callIntent: "video",
        published: {},
        orisoLogo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      });
      expect(screen.queryByTestId("oriso_header_logo")).not.toBeInTheDocument();
    });

    // The v2 header is in every call (2a, 2b, 5a), so the logo is too.
    it("sits in the header of an audio call as well", () => {
      createInCallView({
        callIntent: "audio",
        published: {},
        orisoLogo: LOGO,
      });
      const header = screen.getByTestId("oriso-header");
      expect(within(header).getByTestId("oriso_header_logo")).toHaveAttribute(
        "src",
        LOGO,
      );
    });

    it("sits in the header of a group video call as well", () => {
      createInCallView({
        callIntent: "video",
        crowd: true,
        published: {},
        orisoLogo: LOGO,
      });
      const header = screen.getByTestId("oriso-header");
      expect(within(header).getByTestId("oriso_header_logo")).toHaveAttribute(
        "src",
        LOGO,
      );
    });
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

  it("offers the five views, with one of them spelled out", async () => {
    createInCallView({ crowd: true });
    const rail = await openViewRail();
    expect(
      [...rail.querySelectorAll('[role="radio"]')].map((r) =>
        r.getAttribute("data-view"),
      ),
    ).toEqual(["kreis", "hain", "felder", "kacheln", "spotlight"]);
    expect(
      rail.querySelectorAll('[role="radio"][aria-checked="false"]'),
    ).toHaveLength(4);
    expect(
      rail.querySelector('[role="radio"][aria-checked="true"]')?.textContent,
    ).toBeTruthy();
  });

  it.each([undefined, "single", "group"] as const)(
    "shows no view rail and no atmosphere to two people (%s) (#2233 D2, D7)",
    async (callType) => {
      createInCallView({ callType });
      const header = await screen.findByTestId("oriso-header");
      expect(await screen.findByTestId("einzelgespraech")).toBeInTheDocument();
      expect(within(header).queryByTestId("view-switcher")).toBeNull();
      expect(
        within(header).queryByTestId("oriso-atmosphere-button"),
      ).toBeNull();
    },
  );

  it("keeps the view rail and the atmosphere for a person waiting alone (#2233 D2)", async () => {
    /*
     * Alone, the stage is a group arrangement, not the Einzelgespräch. Without
     * the rail, a stored spotlight held the person there until somebody came.
     */
    createInCallView({ solo: true });
    const header = await screen.findByTestId("oriso-header");
    expect(screen.queryByTestId("einzelgespraech")).toBeNull();
    expect(within(header).getByTestId("view-switcher")).toBeInTheDocument();
    expect(
      within(header).getByTestId("oriso-atmosphere-button"),
    ).toBeInTheDocument();
  });

  it("takes focus along the rail when the arrows move the selection", async () => {
    /*
     * With a roving tabindex it has to. The first version only reported the
     * new view: the browser left focus on the old button, which the
     * re-render then set to `tabIndex={-1}`, so an arrow press lost the
     * user's place in the rail and announced nothing.
     */
    createInCallView({ crowd: true });
    const rail = await openViewRail();
    const buttons = [...rail.querySelectorAll<HTMLElement>('[role="radio"]')];
    // The Hain is on (nothing stored), the second of five.
    buttons[1].focus();

    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(rail, { key: "End" });
    expect(document.activeElement).toBe(buttons[4]);
  });

  it("shows initials for somebody nobody published anything for", async () => {
    createInCallView({ published: {} });

    const initials = await screen.findAllByTestId("oriso-initials");
    expect(initials.length).toBeGreaterThan(0);
    // Never an invented animal.
    expect(screen.queryByTestId("oriso-artwork")).toBeNull();
  });

  it("leaves upstream's tile alone when the call is standalone", async () => {
    const { container } = createInCallView({ embedded: false });

    await screen.findAllByTestId("videoTile");
    expect(container.querySelector('[data-testid="oriso-face"]')).toBeNull();
    expect(container.querySelector('[data-oriso="true"]')).toBeNull();
  });

  it("leaves upstream's tile alone for a widget host that did not ask", async () => {
    /*
     * `parentUrl` is not an ORISO discriminator.
     *
     * It is the generic widget parameter every embedded Element Call carries,
     * so the first version of the gate handed the grove, the backdrop and the
     * animals to any Element Web embedding of this build. The design is on
     * only when the host says `orisoDesign`.
     */
    const { container } = createInCallView({ orisoDesign: false });

    await screen.findAllByTestId("videoTile");
    expect(container.querySelector('[data-testid="oriso-face"]')).toBeNull();
    expect(container.querySelector('[data-oriso="true"]')).toBeNull();
    expect(container.querySelector('[data-testid="view-switcher"]')).toBeNull();
    expect(container.querySelector('[data-testid="oriso-toolbar"]')).toBeNull();
  });

  it("puts one ORISO bar in the footer, not upstream's buttons", async () => {
    /*
     * Section 1c: one white bar with the microphone, the camera, the hand and
     * a `⋮`, and the hang-up beside it rather than in it. Dev still showed
     * Element Call's black round buttons and the view rail bottom-right.
     */
    const { container } = createInCallView({ crowd: true });
    const toolbar = await screen.findByTestId("oriso-toolbar");
    const bar = within(toolbar).getByRole("toolbar");

    expect(within(bar).getByTestId("incall_mute")).toBeTruthy();
    expect(within(bar).getByTestId("incall_videomute")).toBeTruthy();
    expect(within(bar).getByTestId("incall_menu")).toBeTruthy();
    const hangup = within(toolbar).getByTestId("incall_leave");
    expect(bar.contains(hangup)).toBe(false);

    // Upstream's settings button and the rail are gone from the footer; the
    // rail lives in the header now (S5).
    expect(toolbar.querySelector('[data-testid="view-switcher"]')).toBeNull();
    expect(
      within(screen.getByTestId("oriso-header")).getByTestId("view-switcher"),
    ).toBeTruthy();
    void container;
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  /*
   * S5, design 2a: the header carries the view rail, the atmosphere and the
   * window; the call menu holds "Namen & Symbole" and "Hintergrund".
   */
  it("puts the view rail and the atmosphere into the header", async () => {
    createInCallView({ crowd: true });
    const header = await screen.findByTestId("oriso-header");
    expect(within(header).getByTestId("view-switcher")).toBeTruthy();
    expect(within(header).getByTestId("oriso-atmosphere-button")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("incall_menu"));
    const menu = screen.getByTestId("oriso-call-menu");
    expect(menu.querySelector('[data-entry="view"]')).toBeNull();
    // "Namen & Symbole" moved into the settings (#2233).
    expect(menu.querySelector('[data-entry="names"]')).toBeNull();
  });

  it("keeps the chosen atmosphere for the person, carrier's motif by default", async () => {
    localStorage.removeItem("oriso-call-atmosphere");
    const { container, unmount } = createInCallView({ crowd: true });
    await screen.findByTestId("oriso-header");
    const pond = (): string | null =>
      container.querySelector("oriso-pond")?.getAttribute("palette") ?? null;
    expect(pond()).toBe("fluss");

    // "Hintergrund" in the menu opens the header's popover.
    fireEvent.click(screen.getByTestId("incall_menu"));
    fireEvent.click(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="background"]')!,
    );
    const popover = screen.getByTestId("oriso-atmosphere-popover");
    fireEvent.click(popover.querySelector('[data-motif="lichtung"]')!);
    expect(pond()).toBe("lichtung");
    expect(localStorage.getItem("oriso-call-atmosphere")).toBe("lichtung");
    unmount();

    // The next call starts in it.
    const again = createInCallView({ crowd: true });
    await screen.findByTestId("oriso-header");
    expect(
      again.container.querySelector("oriso-pond")?.getAttribute("palette"),
    ).toBe("lichtung");
    localStorage.removeItem("oriso-call-atmosphere");
  });

  it("follows the names setting while the call runs", async () => {
    localStorage.removeItem("oriso-call-names");
    const { container } = createInCallView({ crowd: true });
    await screen.findByTestId("incall_menu");
    expect(container.querySelector('[data-oriso-names="popout"]')).toBeTruthy();
    // What the settings dialog does when "Namen dezent" is picked.
    act(() => setLocalStorageItemReactive("oriso-call-names", "dezent"));
    expect(container.querySelector('[data-oriso-names="dezent"]')).toBeTruthy();
    expect(localStorage.getItem("oriso-call-names")).toBe("dezent");
    localStorage.removeItem("oriso-call-names");
  });

  /*
   * S6: the Kreis has the room's sound in the middle; the choice survives
   * the next call, the spotlight included (it used to be memory only).
   */
  it("draws the Kreis with its centre and remembers it", async () => {
    localStorage.removeItem("oriso-call-view");
    const { container, unmount } = createInCallView({ crowd: true });
    const rail = await openViewRail();
    fireEvent.click(rail.querySelector('[data-view="kreis"]')!);
    expect(
      container.querySelector('[data-view="kreis"][data-testid="oriso-grove"]'),
    ).toBeTruthy();
    expect(screen.getByTestId("oriso-kreis-centre")).toBeTruthy();
    expect(localStorage.getItem("oriso-call-view")).toBe("kreis");
    unmount();

    createInCallView({ crowd: true });
    const again = await openViewRail();
    expect(
      again
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("kreis");
    localStorage.removeItem("oriso-call-view");
  });

  /*
   * R27: who speaks, in every view. On a desktop the band is condensed into
   * the header's middle; a Kreis whose centre already names the speaker
   * leaves it to the centre rather than saying it twice.
   */
  it("names whoever speaks in the desktop header, the 1:1 included", async () => {
    createInCallView({ callIntent: "audio", published: {} });
    await screen.findByTestId("einzelgespraech");
    const band = within(screen.getByTestId("oriso-header")).getByTestId(
      "oriso-wave-band",
    );
    expect(band.dataset.variant).toBe("header");
  });

  it("names whoever speaks in the header of the Hain, and of a Kreis whose centre cannot", async () => {
    localStorage.removeItem("oriso-call-view");
    createInCallView({ crowd: true });
    const rail = await openViewRail();
    fireEvent.click(rail.querySelector('[data-view="hain"]')!);
    expect(
      within(screen.getByTestId("oriso-header")).getByTestId("oriso-wave-band")
        .dataset.variant,
    ).toBe("header");

    // jsdom measures no stage, so the centre here is too small for a name
    // and the header keeps the band; a centre that names the speaker takes
    // it over (`speakerBandPlace`, `kreisCentreNamesSpeaker`).
    fireEvent.click(rail.querySelector('[data-view="kreis"]')!);
    expect(screen.queryByTestId("oriso-kreis-speaker")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("oriso-header")).getByTestId("oriso-wave-band"),
    ).toBeInTheDocument();
    localStorage.removeItem("oriso-call-view");
  });

  it("starts in the spotlight when the spotlight was the last choice", async () => {
    localStorage.setItem("oriso-call-view", "spotlight");
    createInCallView({ crowd: true });
    const rail = await openViewRail();
    expect(
      rail
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("spotlight");
    localStorage.removeItem("oriso-call-view");
  });

  /*
   * S6b: from three people on, the conversation type decides where a call
   * starts (#2233 D9); at two, everybody gets the Einzelgespräch (D7).
   */
  it("starts a Gesprächskreis of three in the Kreis (#2233 D9)", async () => {
    const { container } = createInCallView({ callType: "circle", crowd: true });
    const rail = await openViewRail();
    expect(
      rail
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("kreis");
    expect(
      container.querySelector('[data-testid="oriso-grove"][data-view="kreis"]'),
    ).toBeTruthy();
  });

  it("starts an internal group of three in the Felder (#2233 D9)", async () => {
    const { container } = createInCallView({ callType: "group", crowd: true });
    const rail = await openViewRail();
    expect(
      [...rail.querySelectorAll('[role="radio"]')].map((r) =>
        r.getAttribute("data-view"),
      ),
    ).toEqual(["kreis", "hain", "felder", "kacheln", "spotlight"]);
    expect(
      rail
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("felder");
    expect(
      container.querySelector(
        '[data-testid="oriso-grove"][data-view="felder"]',
      ),
    ).toBeTruthy();
  });

  /*
   * S8: a single conversation that somebody joined through the shared link
   * is a group now — the rail offers the group views and the stage starts
   * in the default for a grown 1:1, the Felder (#2233 D9).
   */
  it("gives a single conversation of three the group rail, in the Felder", async () => {
    const { container } = createInCallView({
      callType: "single",
      crowd: true,
    });
    const rail = await openViewRail();
    expect(
      [...rail.querySelectorAll('[role="radio"]')].map((r) =>
        r.getAttribute("data-view"),
      ),
    ).toEqual(["kreis", "hain", "felder", "kacheln", "spotlight"]);
    expect(
      container.querySelector(
        '[data-testid="oriso-grove"][data-view="felder"]',
      ),
    ).toBeTruthy();
  });

  it("keeps the choice per conversation type", async () => {
    const { unmount } = createInCallView({ callType: "group", crowd: true });
    fireEvent.click(
      (await openViewRail()).querySelector('[data-view="kacheln"]')!,
    );
    expect(localStorage.getItem("oriso-call-view-group")).toBe("kacheln");
    expect(localStorage.getItem("oriso-call-view-single")).toBeNull();
    unmount();

    // A single conversation is not affected by the group's choice: grown
    // to three, it starts in its own default, the Felder (#2233 D9)…
    const single = createInCallView({ callType: "single", crowd: true });
    expect(
      (await openViewRail())
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("felder");
    single.unmount();

    // …and the next group conversation starts in the Kacheln.
    createInCallView({ callType: "group", crowd: true });
    expect(
      (await openViewRail())
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("kacheln");
  });

  /*
   * #2233: a video group gets all five views, the Kreis too — a
   * Gesprächskreis meets in the Kreis with cameras or without. A stored
   * Kreis is kept.
   */
  it("offers a video group all five views and keeps a stored Kreis", async () => {
    localStorage.setItem("oriso-call-view-group", "kreis");
    const { container } = createInCallView({
      crowd: true,
      callIntent: "video",
      callType: "group",
    });
    const rail = await openViewRail();
    expect(
      [...rail.querySelectorAll('[role="radio"]')].map((r) =>
        r.getAttribute("data-view"),
      ),
    ).toEqual(["kreis", "hain", "felder", "kacheln", "spotlight"]);
    expect(
      rail
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-view"),
    ).toBe("kreis");
    expect(
      container.querySelector('[data-testid="oriso-grove"][data-view="kreis"]'),
    ).toBeTruthy();
    localStorage.removeItem("oriso-call-view-group");
  });

  it("puts the Kacheln's pager with the head count above the bar (#2233)", async () => {
    localStorage.setItem("oriso-call-view-group", "kacheln");
    createInCallView({ crowd: true, callType: "group" });
    expect(await screen.findByTestId("oriso-kacheln-pager")).toHaveTextContent(
      "3 participants",
    );
    localStorage.removeItem("oriso-call-view-group");
  });

  it("keeps names as capsules in a video group, whatever is stored", async () => {
    localStorage.setItem("oriso-call-names", "dezent");
    const { container } = createInCallView({
      crowd: true,
      callIntent: "video",
      callType: "group",
    });
    await openViewRail();
    expect(container.querySelector('[data-oriso-names="popout"]')).toBeTruthy();
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="names"]'),
    ).toBeNull();
  });

  it("offers an audio group the Kreis", async () => {
    createInCallView({ crowd: true, callIntent: "audio", callType: "group" });
    const rail = await openViewRail();
    expect(rail.querySelector('[data-view="kreis"]')).toBeTruthy();
  });

  it("lays the Kacheln out as equal tiles", async () => {
    localStorage.setItem("oriso-call-view", "kacheln");
    const { container } = createInCallView({ crowd: true });
    await openViewRail();
    const sheet = container.querySelector(
      '[data-testid="oriso-grove"][data-view="kacheln"]',
    );
    expect(sheet?.getAttribute("data-mode")).toBe("scroll");
    localStorage.removeItem("oriso-call-view");
  });

  it("opens my call note in the call itself, and closes it again (#112)", async () => {
    // The design's "Meine Gesprächsnotiz" lives in the call; the host app is
    // no longer asked for a notepad of its own.
    createInCallView();
    const button = await screen.findByTestId("incall_notes");
    expect(screen.queryByRole("region", { name: "Scratchpad" })).toBeNull();

    fireEvent.click(button);
    const card = screen.getByRole("region", { name: "Scratchpad" });
    expect(button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(card).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Scratchpad" })).toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});

/** The view rail sits in the call header (S5), no longer in the `⋮` menu. */
/*
 * S9, designs 5b/5d: a phone in full screen. Compact header with the ⋮,
 * the wave band for a group, a bar of four or five buttons; the view rail
 * and the window move into the header's ⋮.
 */
describe("the call on a phone (S9)", () => {
  beforeEach(() => {
    view.width = 375;
  });

  it("gives a group the compact header, the wave band and the short bar", async () => {
    createInCallView({ crowd: true, callIntent: "audio" });
    const header = await screen.findByTestId("oriso-header");
    expect(header.dataset.compact).toBe("true");
    expect(
      within(header).getByTestId("oriso-header-participants"),
    ).toHaveTextContent("3 participants");
    // The rail and the window buttons are not in a phone's header.
    expect(within(header).queryByTestId("view-switcher")).toBeNull();
    expect(within(header).queryByTestId("oriso-window-fullscreen")).toBeNull();
    expect(within(header).getByTestId("oriso-mobile-menu")).toBeInTheDocument();
    expect(screen.getByTestId("oriso-wave-band")).toBeInTheDocument();

    const toolbar = screen.getByTestId("oriso-toolbar");
    expect(toolbar.dataset.compact).toBe("true");
    expect(within(toolbar).queryByTestId("incall_menu")).toBeNull();
    // An audio group: microphone, hand, notes, hang-up — no camera.
    expect(within(toolbar).getByTestId("incall_mute")).toBeInTheDocument();
    expect(within(toolbar).queryByTestId("incall_videomute")).toBeNull();
    expect(within(toolbar).getByTestId("incall_notes")).toBeInTheDocument();
    expect(within(toolbar).getByTestId("incall_leave")).toBeInTheDocument();
  });

  it("puts the view rail and Schweben into the header's ⋮, and asks the host", async () => {
    const send = vi.fn();
    hostWindow.send = send;
    hostWindow.fullscreen = true;
    createInCallView({ crowd: true });
    fireEvent.click(await screen.findByTestId("oriso-mobile-menu"));
    const menu = screen.getByTestId("oriso-call-menu");
    expect(menu.dataset.placement).toBe("header");
    expect(within(menu).getByTestId("view-switcher")).toBeInTheDocument();
    const float = within(menu).getByRole("button", { name: "Float" });
    fireEvent.click(float);
    expect(send).toHaveBeenCalledWith("toggle_fullscreen");
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();
  });

  it("offers Vollbild while the call floats", async () => {
    hostWindow.send = vi.fn();
    hostWindow.fullscreen = false;
    createInCallView({ crowd: true });
    fireEvent.click(await screen.findByTestId("oriso-mobile-menu"));
    expect(
      within(screen.getByTestId("oriso-call-menu")).getByRole("button", {
        name: "Full screen",
      }),
    ).toBeInTheDocument();
  });

  it("has no window entry while the host keeps its own buttons", async () => {
    createInCallView({ crowd: true });
    fireEvent.click(await screen.findByTestId("oriso-mobile-menu"));
    expect(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="window"]'),
    ).toBeNull();
  });

  it("keeps the 1:1 in the shared circle, with the wave band too (R27)", async () => {
    const { container } = createInCallView({
      callIntent: "audio",
      published: {},
      encrypted: true,
    });
    await screen.findByTestId("einzelgespraech");
    // 5d: "verschlüsselt · 12:04".
    expect(
      within(screen.getByTestId("oriso-header")).getByText("encrypted"),
    ).toBeInTheDocument();
    // Who speaks, in every view: the 1:1 no longer leaves it out.
    expect(screen.getByTestId("oriso-wave-band").dataset.variant).toBe("phone");
    expect(container.querySelector('[data-testid="oriso-grove"]')).toBeNull();
  });

  it("gives a video 1:1 the camera in the bar, and no screen share there", async () => {
    // The phone keeps the share in the ⋮ menu, even where it can capture.
    createInCallView({ callIntent: "video", published: {}, canShare: true });
    const toolbar = await screen.findByTestId("oriso-toolbar");
    expect(within(toolbar).getByTestId("incall_videomute")).toBeInTheDocument();
    expect(within(toolbar).queryByTestId("incall_screenshare")).toBeNull();
    expect(
      within(screen.getByTestId("oriso-header")).queryByTestId(
        "incall_video_header_notes",
      ),
    ).toBeNull();
  });
  /*
   * #2233 R6: a 1:1 is titled by its topic, not "Anruf"; grown into a group
   * it is the topic's group call; a real room name stays.
   */
  describe("the header title from the topic", () => {
    it("titles a 1:1 'Einzelgespräch · <topic>'", () => {
      createInCallView({
        callType: "single",
        roomName: "",
        topic: "Schuldnerberatung",
      });
      const header = screen.getByTestId("oriso-header");
      expect(
        within(header).getByText("Conversation · Schuldnerberatung"),
      ).toBeInTheDocument();
    });

    it("titles a 1:1 grown into a group '<topic> · Group call'", () => {
      createInCallView({
        callType: "single",
        crowd: true,
        roomName: "",
        topic: "Schuldnerberatung",
      });
      const header = screen.getByTestId("oriso-header");
      expect(
        within(header).getByText("Schuldnerberatung · Group call"),
      ).toBeInTheDocument();
    });

    it("keeps a real room name over the topic", () => {
      createInCallView({
        callType: "single",
        roomName: "Flyer Schule",
        topic: "Schuldnerberatung",
      });
      const header = screen.getByTestId("oriso-header");
      expect(within(header).getByText("Flyer Schule")).toBeInTheDocument();
    });
  });
});

/*
 * #2233 (R8): "Bildschirm teilen fehlt komplett". The share sat in the bar of
 * a video call only; an audio call — most of the calls on this platform —
 * hid it in the ⋮ menu, and a share that did not start said nothing.
 */
describe("sharing a screen", () => {
  it.each(["audio", "video"] as const)(
    "puts the share in the bar of a %s call on a desktop",
    async (callIntent) => {
      createInCallView({ callIntent, published: {}, canShare: true });
      const toolbar = await screen.findByTestId("oriso-toolbar");
      expect(
        within(toolbar).getByTestId("incall_screenshare"),
      ).toBeInTheDocument();
    },
  );

  it("offers no share where the browser cannot capture a screen", async () => {
    createInCallView({ callIntent: "audio", published: {} });
    const toolbar = await screen.findByTestId("oriso-toolbar");
    expect(within(toolbar).queryByTestId("incall_screenshare")).toBeNull();
  });

  it.each([
    ["system", /allow screen recording for the browser/i],
    ["blocked", /blocked on this page/i],
    ["failed", /could not be shared/i],
  ] as const)(
    "tells the person why a share did not start (%s)",
    async (failure, message) => {
      createInCallView({
        callIntent: "audio",
        published: {},
        canShare: true,
        shareFailure: failure,
      });
      expect(await screen.findByText(message)).toBeInTheDocument();
    },
  );

  it("says nothing while no share has failed", async () => {
    createInCallView({ callIntent: "audio", published: {}, canShare: true });
    await screen.findByTestId("oriso-toolbar");
    expect(
      screen.queryByText(/could not be shared|screen recording/i),
    ).toBeNull();
  });
});

async function openViewRail(): Promise<HTMLElement> {
  const header = await screen.findByTestId("oriso-header");
  return within(header).getByTestId("view-switcher");
}
