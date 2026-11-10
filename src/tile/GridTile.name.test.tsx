/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * What the name tag on a tile actually reads.
 *
 * `shownNameFor` is unit-tested next door; this is the half that matters to
 * the person in the call, and the half the live test photographed. The tag
 * is fed from `RoomMember.name`, which matrix-js-sdk answers with the user
 * id when a profile carries no display name — the normal state of an ORISO
 * account, whose pseudonym lives in the userservice and was never written to
 * the homeserver.
 */
import { type RemoteTrackPublication } from "livekit-client";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { type ReactNode } from "react";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { GridTile } from "./GridTile";
import {
  mockRtcMembership,
  createRemoteMedia,
  mockRemoteParticipant,
} from "../utils/test";
import { GridTileViewModel } from "../state/TileViewModel";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import type { CallViewModel } from "../state/CallViewModel/CallViewModel";
import { constant } from "../state/Behavior";
import { OrisoStageContext, readIdentities } from "../oriso/useOrisoIdentities";
import { type OrisoPins, OrisoPinsContext } from "../oriso/useOrisoView";
import {
  ORISO_IDENTITY_EVENT_TYPE,
  type OrisoIdentity,
} from "../oriso/identity";
import type { Room } from "matrix-js-sdk";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof IntersectionObserver;
// The tile's menu (Radix) measures itself.
global.ResizeObserver ??= class MockResizeObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof ResizeObserver;

const USER = "@cyrus:oriso.org";

const renderTile = (
  identity: OrisoIdentity | undefined,
  wrap: (tile: ReactNode) => ReactNode = (tile): ReactNode => tile,
): void => {
  const vm = createRemoteMedia(
    mockRtcMembership(USER, "AAAA"),
    // What the homeserver holds for an ORISO account: nothing, so the SDK
    // hands the tile the user id as the member's name.
    { rawDisplayName: USER, getMxcAvatarUrl: () => undefined },
    mockRemoteParticipant({
      setVolume() {},
      getTrackPublication: () =>
        ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
    }),
  );
  const fakeRtcSession = {
    on: () => {},
    off: () => {},
    room: {
      on: () => {},
      off: () => {},
      client: {
        getUserId: () => null,
        getDeviceId: () => null,
        on: () => {},
        off: () => {},
      },
    },
    memberships: [],
  } as unknown as MatrixRTCSession;
  const cVm = {
    reactions$: constant({}),
    handsRaised$: constant({}),
  } as Partial<CallViewModel> as CallViewModel;

  render(
    <OrisoStageContext
      value={{
        identities: new Map(identity ? [[USER, identity]] : []),
        parentUrl: null,
        enabled: true,
      }}
    >
      <ReactionsSenderProvider vm={cVm} rtcSession={fakeRtcSession}>
        {wrap(
          <GridTile
            vm={new GridTileViewModel(constant(vm))}
            onOpenProfile={() => {}}
            targetWidth={300}
            targetHeight={200}
            showSpeakingIndicators={false}
            focusable
          />,
        )}
      </ReactionsSenderProvider>
    </OrisoStageContext>,
  );
};

/*
 * Read off the tag as a whole, not with `getByText`.
 *
 * The ORISO tag renders the name in two spans — the head ellipsises and the
 * tail never does, so that "ruhiger Fuchs 432" does not lose the number that
 * tells two foxes apart. A `queryByText(USER)` therefore finds nothing
 * whether or not the id is shown: the first version of this test asserted
 * exactly that and passed against the unfixed code.
 */
const tagText = (): string =>
  screen.getByTestId("name_tag").textContent?.trim() ?? "";

test("the tag shows the name the host published", () => {
  renderTile({
    kind: "animal",
    file: "fox.svg",
    bg: "#F7CAC9",
    ink: "#1A1A1A",
    name: "ruhiger Fuchs 432",
  });
  expect(tagText()).toBe("ruhiger Fuchs 432");
});

test("no Matrix id reaches the tag when nothing was published", () => {
  renderTile({
    kind: "animal",
    file: "fox.svg",
    bg: "#F7CAC9",
    ink: "#1A1A1A",
  });
  // The neutral label, translated; nothing read off `@cyrus:oriso.org`.
  expect(tagText()).toBe("Participant");
});

/*
 * S6, design 2a: a person's ⋮ offers "Anheften — bleibt groß". The design
 * also gives counsellors "Stummschalten" and "Entfernen"; Element Call and
 * the widget API have no way to mute or remove another person, so those are
 * not offered to anybody until the host and backend can do it.
 */
test("a person's menu offers Anheften, and nothing it cannot do", async () => {
  const user = userEvent.setup();
  const pins: OrisoPins = { pinned: new Set(), toggle: vi.fn() };
  renderTile(
    { kind: "animal", file: "fox.svg", bg: "#F7CAC9", ink: "#1A1A1A" },
    (tile) => (
      <TooltipProvider>
        <OrisoPinsContext value={pins}>{tile}</OrisoPinsContext>
      </TooltipProvider>
    ),
  );
  await user.click(screen.getByRole("button", { name: "Options" }));
  const pin = await screen.findByRole("menuitemcheckbox", { name: "Pin" });
  expect(pin).toHaveAttribute("aria-checked", "false");
  expect(screen.queryByRole("menuitem", { name: /remove/i })).toBeNull();
  await user.click(pin);
  expect(pins.toggle).toHaveBeenCalledOnce();
});

test("outside the ORISO stage a person's menu has no Anheften", async () => {
  const user = userEvent.setup();
  renderTile(
    { kind: "animal", file: "fox.svg", bg: "#F7CAC9", ink: "#1A1A1A" },
    (tile) => <TooltipProvider>{tile}</TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Options" }));
  await screen.findByRole("menu");
  expect(screen.queryByRole("menuitemcheckbox", { name: "Pin" })).toBeNull();
});

/*
 * Design 2a: under the name in a person's ⋮ stands their side of the
 * conversation, from the role the host published — never guessed.
 */
test.each([
  ["asker", "anonymous · seeking advice"],
  ["counsellor", "Counselling"],
] as const)(
  "a person's menu names the %s role under the name",
  async (role, line) => {
    const user = userEvent.setup();
    renderTile(
      {
        kind: "animal",
        file: "fox.svg",
        bg: "#F7CAC9",
        ink: "#1A1A1A",
        name: "ruhiger Fuchs 432",
        role,
      },
      (tile) => <TooltipProvider>{tile}</TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Options" }));
    await screen.findByRole("menu");
    const header = screen.getByTestId("participant_menu_header");
    expect(header).toHaveTextContent("ruhiger Fuchs 432");
    expect(header).toHaveTextContent(line);
  },
);

test("without a published role a person's menu has no role line", async () => {
  const user = userEvent.setup();
  renderTile(
    {
      kind: "animal",
      file: "fox.svg",
      bg: "#F7CAC9",
      ink: "#1A1A1A",
      name: "ruhiger Fuchs 432",
    },
    (tile) => <TooltipProvider>{tile}</TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Options" }));
  await screen.findByRole("menu");
  expect(screen.queryByTestId("participant_menu_header")).toBeNull();
});

/*
 * The role is self-published. A record claiming "counsellor" from somebody
 * the room gives only the default power level is read through the same path
 * the call uses (`readIdentities`) and shows no "Beratung" line.
 */
test.each([
  [0, null],
  [50, "Counselling"],
] as const)(
  "a counsellor claim at power level %s reads %s in the menu",
  async (level, line) => {
    const user = userEvent.setup();
    const room = {
      roomId: "!call:oriso.org",
      getLiveTimeline: () => ({
        getEvents: (): unknown[] => [
          {
            getType: (): string => ORISO_IDENTITY_EVENT_TYPE,
            getSender: (): string => USER,
            getId: (): string => "$1",
            getContent: (): unknown => ({
              kind: "animal",
              file: "fox.svg",
              bg: "#F7CAC9",
              ink: "#1A1A1A",
              name: "ruhiger Fuchs 432",
              role: "counsellor",
            }),
          },
        ],
      }),
      getMember: (): { powerLevel: number } => ({ powerLevel: level }),
    } as unknown as Room;
    renderTile(readIdentities(room).get(USER), (tile) => (
      <TooltipProvider>{tile}</TooltipProvider>
    ));
    await user.click(screen.getByRole("button", { name: "Options" }));
    await screen.findByRole("menu");
    if (line === null) {
      expect(screen.queryByTestId("participant_menu_header")).toBeNull();
      expect(screen.queryByText("Counselling")).toBeNull();
    } else {
      expect(screen.getByTestId("participant_menu_header")).toHaveTextContent(
        line,
      );
    }
  },
);
