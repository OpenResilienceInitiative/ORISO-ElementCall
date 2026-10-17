/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect, vi } from "vitest";
import { isInaccessible, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import userEvent from "@testing-library/user-event";

import { SpotlightTile } from "./SpotlightTile";
import {
  mockLocalParticipant,
  mockMediaDevices,
  mockRtcMembership,
  createLocalMedia,
  createRemoteMedia,
  mockRemoteParticipant,
} from "../utils/test";
import { SpotlightTileViewModel } from "../state/TileViewModel";
import { constant } from "../state/Behavior";
import { OrisoStageContext } from "../oriso/useOrisoIdentities";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
} as unknown as typeof IntersectionObserver;

test("SpotlightTile is accessible", async () => {
  const vm1 = createRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    mockRemoteParticipant({}),
  );

  const vm2 = createLocalMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    {
      rawDisplayName: "Bob",
      getMxcAvatarUrl: () => "mxc://dlskf",
    },
    mockLocalParticipant({}),
    mockMediaDevices({}),
  );

  const user = userEvent.setup();
  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={new SpotlightTileViewModel(constant([vm1, vm2]), constant(false))}
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      focusable={true}
    />,
  );

  expect(await axe(container)).toHaveNoViolations();
  // Alice should be in the spotlight, with her name and avatar on the
  // first page
  screen.getByText("Alice");
  const aliceAvatar = screen.getByRole("img");
  expect(screen.queryByRole("button", { name: "common.back" })).toBe(null);
  // Bob should be out of the spotlight, and therefore invisible
  expect(isInaccessible(screen.getByText("Bob"))).toBe(true);
  // Now navigate to Bob
  await user.click(screen.getByRole("button", { name: "Next" }));
  screen.getByText("Bob");
  expect(screen.getByRole("img")).not.toBe(aliceAvatar);
  expect(isInaccessible(screen.getByText("Alice"))).toBe(true);
  // Can toggle whether the tile is expanded
  await user.click(screen.getByRole("button", { name: "Expand" }));
  expect(toggleExpanded).toHaveBeenCalled();
});

test("the spotlight shows a person as their ORISO form", () => {
  /*
   * The spotlight layouts were the last place the design did not reach. They
   * are what upstream falls back to on a flat window — flipping a phone into
   * landscape, on purpose — and they are the third view ORISO's own rail
   * offers, so the big tile was a black rectangle while the rail beside it
   * showed everybody as a form.
   *
   * No `TileShape` here and none wanted: the spotlight is one form filling the
   * stage, which is the default circle.
   */
  const alice = createRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    { rawDisplayName: "ruhiger Fuchs 432" },
    mockRemoteParticipant({}),
  );
  const identities = new Map([
    [
      "@alice:example.org",
      {
        kind: "animal" as const,
        file: "fox.svg",
        bg: "#165e83",
        ink: "#ffffff",
      },
    ],
  ]);

  render(
    <OrisoStageContext value={{ identities, parentUrl: null, enabled: true }}>
      <SpotlightTile
        vm={new SpotlightTileViewModel(constant([alice]), constant(false))}
        targetWidth={300}
        targetHeight={200}
        expanded={false}
        onToggleExpanded={vi.fn()}
        showIndicators
        focusable={true}
      />
    </OrisoStageContext>,
  );

  const face = screen.getByTestId("oriso-face");
  expect(face.style.background).toBe("rgb(22, 94, 131)");
  // The default circle, because no layout publishes a shape for a spotlight.
  expect(face.style.borderRadius).toBe("50%");
});

/*
 * A shared screen stays a rectangle, and that is structural rather than
 * tested: the identity is attached in `SpotlightUserMediaItem`, and
 * `SpotlightItem` sends a `ScreenShareViewModel` straight to `MediaView`
 * without going through it. There is no path that gives a screen a face.
 */
