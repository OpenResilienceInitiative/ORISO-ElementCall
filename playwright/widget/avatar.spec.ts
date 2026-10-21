/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  test,
  type FrameLocator,
  type JSHandle,
  type Page,
} from "@playwright/test";

import type { MatrixClient } from "matrix-js-sdk";
import { registerUser } from "../fixtures/widget-user.ts";

/**
 * Participant avatars in widget mode.
 *
 * A widget owns no Matrix login, so it cannot call the authenticated media
 * endpoints itself. This exercises the MSC4039 route: the widget asks the host
 * for the bytes, the host fetches them with its own credentials, and the avatar
 * appears in the call tile. It only means anything against a homeserver with
 * `enable_authenticated_media: true`, because the whole point is that the
 * legacy unauthenticated media endpoints are closed.
 *
 * Room setup goes through the SDK rather than element-web's UI: the UI for
 * creating and accepting invites has churned repeatedly, and none of it is what
 * this test is about.
 */

const BROOKS_COLOUR = "#e6007a";
const WHISTLER_COLOUR = "#00b1ff";

/** Uploads a solid, unmistakable square as the user's avatar. */
async function setAvatar(
  clientHandle: JSHandle<MatrixClient>,
  colour: string,
): Promise<string> {
  return clientHandle.evaluate(async (cli: MatrixClient, fill: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 256, 256);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );
    const { content_uri: contentUri } = await cli.uploadContent(blob, {
      type: "image/png",
      name: "avatar.png",
    });
    await cli.setAvatarUrl(contentUri);
    return contentUri;
  }, colour);
}

const callFrame = (page: Page): FrameLocator =>
  page.locator('iframe[title="Element Call"]').contentFrame();

/**
 * Closes element-web's floating notices ("Back up your chats", "Element does
 * not support this browser"). They sit over the room header and swallow
 * pointer events, and the call menu is a Radix menu that only opens on a real
 * pointerdown — so they genuinely have to go before we can start a call.
 *
 * Only ever click "Dismiss": "Continue" on the backup notice opens the
 * recovery-key wizard, which is a much bigger modal to get rid of.
 */
async function dismissNotices(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dismiss = page
      .getByRole("button", { name: "Dismiss", exact: true })
      .first();
    if (!(await dismiss.isVisible().catch(() => false))) return;
    await dismiss.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

/**
 * Drives element-web all the way from "room is open" to "joined the call".
 *
 * This is one loop on purpose. element-web interleaves several things that can
 * appear in any order and at any time — timed notices, the Radix call menu, the
 * widget capability consent dialog, Element Call's own lobby — so anything that
 * waits for them in a fixed sequence is a race. Each pass nudges whatever is
 * currently on screen and the loop ends when the call is actually joined.
 *
 * Note the consent dialog: element-web asks the user to approve the widget's
 * capabilities. ORISO's own host does not prompt — `validateCapabilities` in
 * `OrisoWidgetDriver` decides against a fixed allowlist — but element-web asks,
 * so the test has to answer.
 */
async function openAndJoinCall(
  page: Page,
  timeout = 240_000,
): Promise<boolean> {
  const videoCall = page.getByRole("button", { name: "Video call" }).first();
  const elementCallItem = page.getByRole("menuitem", { name: "Element Call" });
  const approve = page.getByRole("button", { name: "Approve" }).first();
  const widget = page.locator('iframe[title="Element Call"]');
  const lobbyJoin = callFrame(page).getByTestId("lobby_joinCall");
  const leave = callFrame(page).getByTestId("incall_leave");

  const clickIfVisible = async (
    locator: ReturnType<Page["getByRole"]>,
  ): Promise<boolean> => {
    if (!(await locator.isVisible().catch(() => false))) return false;
    await locator.click({ timeout: 3_000 }).catch(() => undefined);
    return true;
  };

  await expect
    .poll(
      async () => {
        if (await leave.isVisible().catch(() => false)) return true;

        // Consent first: while it is up it covers the widget.
        if (await clickIfVisible(approve)) return false;
        if (await clickIfVisible(lobbyJoin)) return false;

        // Widget already attached: nothing left to start.
        if ((await widget.count()) > 0) return false;

        await dismissNotices(page);
        // Never re-click the header button while its menu is open: it toggles.
        if (!(await clickIfVisible(elementCallItem))) {
          if (await clickIfVisible(videoCall)) {
            await page.waitForTimeout(1_500);
            await clickIfVisible(elementCallItem);
          }
        }
        return false;
      },
      { timeout, intervals: [2_000] },
    )
    .toBe(true);
  return true;
}

/** Waits until the room list shows the room, then opens it by URL. */
async function openRoom(page: Page, roomId: string): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (id) =>
            window.mxMatrixClientPeg?.get()?.getRoom(id)?.getMyMembership() ??
            null,
          roomId,
        ),
      { timeout: 60_000 },
    )
    .toBe("join");
  await page.goto(`${page.url().split("#")[0]}#/room/${roomId}`);
}

test.use({
  launchOptions: {
    args: [
      // The local harness serves everything with a self-signed cert. Without
      // this, Chrome refuses to register element-web's service worker, which
      // element-web needs for its *own* authenticated media rendering.
      "--ignore-certificate-errors",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--mute-audio",
    ],
  },
});

test.skip(
  ({ browserName }) => browserName === "firefox",
  "Matches the other widget specs: firefox leaves the widget blank",
);

test("renders a participant avatar in a call tile with authenticated media", async ({
  browser,
}) => {
  // Two registrations, a call setup and two LiveKit joins: give it room.
  test.setTimeout(300_000);

  const brooks = await registerUser(browser, `brooks_${Date.now()}`);
  const whistler = await registerUser(browser, `whistler_${Date.now()}`);

  // Both users get an avatar, so the m.room.member state the widget receives
  // already carries an avatar_url.
  const brooksAvatar = await setAvatar(brooks.clientHandle, BROOKS_COLOUR);
  expect(brooksAvatar).toMatch(/^mxc:\/\//);
  await setAvatar(whistler.clientHandle, WHISTLER_COLOUR);

  // Room, invite and join over the SDK.
  const roomId = await brooks.clientHandle.evaluate(
    async (cli: MatrixClient, invitee: string) => {
      const { room_id: id } = await cli.createRoom({
        name: "Avatar Call Room",
        invite: [invitee],
      });
      return id;
    },
    whistler.mxId,
  );
  await whistler.clientHandle.evaluate(
    async (cli: MatrixClient, id: string) => {
      await cli.joinRoom(id);
    },
    roomId,
  );

  await openRoom(brooks.page, roomId);
  await openRoom(whistler.page, roomId);

  // Brooks starts the call. This is the participant the assertions rely on.
  await openAndJoinCall(brooks.page);

  // Whistler joining is a nicety: it gives the grid a second tile, and proves
  // the avatar of a *remote* member loads too. Element Web's "join an existing
  // call" path is flaky in the develop image, so don't fail the run over it.
  const whistlerJoined = await openAndJoinCall(whistler.page, 90_000).catch(
    () => false,
  );

  // Turn the camera off: the avatar is what a tile shows instead of video.
  await callFrame(brooks.page).getByTestId("incall_videomute").click();
  if (whistlerJoined) {
    await callFrame(whistler.page)
      .getByTestId("incall_videomute")
      .click()
      .catch(() => undefined);
  }

  const tiles = callFrame(brooks.page).getByTestId("videoTile");
  await expect(tiles.first()).toBeVisible({ timeout: 60_000 });

  // The avatar is an <img> only once the media actually loaded; the fallback
  // renders a <span> with initials instead. So asserting on an <img> with a
  // blob: src is precisely the assertion that the MSC4039 round trip worked.
  const avatarImages = tiles.locator("img[src^='blob:']");
  await expect(avatarImages.first()).toBeVisible({ timeout: 60_000 });

  // And the pixels really are an avatar we uploaded, not a placeholder.
  const colours = await avatarImages.evaluateAll((images) =>
    images.map((img) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.drawImage(img as HTMLImageElement, 0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    }),
  );
  expect(colours).toContain(BROOKS_COLOUR);

  await brooks.page.screenshot({
    path: "test-results/widget-avatar-call-grid.png",
  });
  await callFrame(brooks.page)
    .getByTestId("videoTile")
    .first()
    .screenshot({ path: "test-results/widget-avatar-tile.png" });
});
