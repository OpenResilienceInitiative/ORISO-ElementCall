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
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
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
import { OrisoStageContext } from "../oriso/useOrisoIdentities";
import type { OrisoIdentity } from "../oriso/identity";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof IntersectionObserver;

const USER = "@cyrus:oriso.org";

const renderTile = (identity: OrisoIdentity | undefined): void => {
  const vm = createRemoteMedia(
    mockRtcMembership(USER, "AAAA"),
    // What the homeserver holds for an ORISO account: nothing, so the SDK
    // hands the tile the user id as the member's name.
    { rawDisplayName: USER, getMxcAvatarUrl: () => null },
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
        <GridTile
          vm={new GridTileViewModel(constant(vm))}
          onOpenProfile={() => {}}
          targetWidth={300}
          targetHeight={200}
        />
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
  expect(tagText()).toBe("cyrus");
});
