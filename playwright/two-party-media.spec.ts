/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, type Page } from "@playwright/test";

import { installReceiverObserver, observeMedia } from "./fixtures/rtc-observer";

const app = "https://localhost:3000";
const matrix = "https://synapse.m.localhost";
const gateway = "https://matrix-rtc.m.localhost";
const playing = { audio: true, video: true };
const silent = { audio: false, video: false };

type AuthenticationEvidence = {
  subjects: string[];
  devices: string[];
  signIns: number;
};

function authenticationEvidence(page: Page): () => AuthenticationEvidence {
  const subjects: string[] = [];
  const devices: string[] = [];
  let signIns = 0;

  page.on("response", (response) => {
    if (!response.ok() || response.request().method() !== "POST") return;
    const url = new URL(response.url());
    if (url.origin === matrix) {
      const parts = url.pathname.split("/");
      if (parts.includes("login") || parts.includes("register")) signIns++;
      if (parts.at(-1) === "request_token" && parts.at(-2) === "openid") {
        const subject = parts.at(-3);
        if (subject) subjects.push(decodeURIComponent(subject));
      }
    }
    if (url.origin === gateway && url.pathname === "/livekit/jwt/sfu/get") {
      const device = response.request().postDataJSON()?.device_id;
      if (typeof device === "string" && device) devices.push(device);
    }
  });

  return () => ({
    subjects: [...subjects],
    devices: [...devices],
    signIns,
  });
}

async function expectTwoWayPlayback(creator: Page, guest: Page): Promise<void> {
  await Promise.all(
    [creator, guest].map(async (page) =>
      expect(page.getByTestId("roomHeader_participants_count")).toHaveText("2"),
    ),
  );
  await expect
    .poll(
      async () => Promise.all([observeMedia(creator), observeMedia(guest)]),
      {
        timeout: 15_000,
      },
    )
    .toEqual([
      { received: playing, played: playing },
      { received: playing, played: playing },
    ]);
}

test("two standalone callers exchange audio and video and rejoin a version 12 room", async ({
  browser,
}) => {
  test.setTimeout(80_000);
  const contexts = await Promise.all([
    browser.newContext({ reducedMotion: "reduce" }),
    browser.newContext({ reducedMotion: "reduce" }),
  ]);
  try {
    await Promise.all(
      contexts.map(async (context) =>
        context.addInitScript(installReceiverObserver, app),
      ),
    );
    const [creator, guest] = await Promise.all(
      contexts.map(async (context) => context.newPage()),
    );
    const guestSession = authenticationEvidence(guest);

    const inviteLink =
      await test.step("Create a version 12 room and copy its local invitation", async () => {
        await creator.goto(app);
        await creator
          .getByTestId("home_callName")
          .fill(`CI media ${Date.now()}`);
        await creator.getByTestId("home_displayName").fill("Test inviter");
        const creation = creator.waitForResponse(
          (response) =>
            response.url() === `${matrix}/_matrix/client/v3/createRoom` &&
            response.request().method() === "POST",
        );
        await creator.getByTestId("home_go").click();
        const room = await creation;
        expect(room.status()).toBe(200);
        const { room_id: roomId } = await room.json();
        // Version 12 room IDs are hashes with no homeserver suffix.
        expect(typeof roomId === "string" && /^![\w-]{43}$/u.test(roomId)).toBe(
          true,
        );

        await creator.getByTestId("lobby_joinCall").click();
        await creator.getByRole("button", { name: "Invite" }).click();
        await creator.getByTestId("modal_inviteLink").click();
        const link = new URL(
          await creator.evaluate(async () => navigator.clipboard.readText()),
        );
        expect(link.origin === app && /^\/room\/?$/u.test(link.pathname)).toBe(
          true,
        );
        await creator.keyboard.press("Escape");
        return link.href;
      });

    await test.step("Receive and play both media directions", async () => {
      await guest.goto(inviteLink);
      await guest.getByTestId("joincall_displayName").fill("Test invitee");
      await guest.getByTestId("joincall_joincall").click();
      await guest.getByTestId("lobby_joinCall").click();
      await expectTwoWayPlayback(creator, guest);
    });

    await test.step("Reject muted audio and hidden video while packets still arrive", async () => {
      const original = await guest.evaluate(() => ({
        audio: [...document.querySelectorAll("audio")].map((element) => {
          const muted = element.muted;
          element.muted = true;
          return muted;
        }),
        video: [...document.querySelectorAll("video")].map((element) => {
          const visibility = element.style.visibility;
          element.style.visibility = "hidden";
          return visibility;
        }),
      }));
      await expect
        .poll(async () => observeMedia(guest), { timeout: 5_000 })
        .toEqual({
          received: playing,
          played: silent,
        });
      await guest.evaluate(({ audio, video }) => {
        document.querySelectorAll("audio").forEach((element, index) => {
          element.muted = audio[index] ?? element.muted;
        });
        document.querySelectorAll("video").forEach((element, index) => {
          element.style.visibility = video[index] ?? element.style.visibility;
        });
      }, original);
      await expectTwoWayPlayback(creator, guest);
    });
    const joined = guestSession();
    expect(new Set(joined.subjects).size).toBe(1);
    expect(new Set(joined.devices).size).toBe(1);
    expect(joined.signIns).toBeGreaterThan(0);

    await test.step("Stop receiving peer media when the guest leaves", async () => {
      await guest.getByTestId("incall_leave").click();
      await expect(
        creator.getByTestId("roomHeader_participants_count"),
      ).toHaveText("1");
      await expect
        .poll(async () => (await observeMedia(creator)).received)
        .toEqual(silent);
    });

    await test.step("Rejoin with the same Matrix identity and restore both directions", async () => {
      await guest.goto(inviteLink);
      // The same URL fragment can leave the ended view mounted.
      await guest.reload({ waitUntil: "domcontentloaded" });
      await guest.getByTestId("lobby_joinCall").click();
      await expectTwoWayPlayback(creator, guest);

      const returned = guestSession();
      const returnedSubjects = returned.subjects.slice(joined.subjects.length);
      const returnedDevices = returned.devices.slice(joined.devices.length);
      expect(returnedSubjects.length).toBeGreaterThan(0);
      expect(returnedDevices.length).toBeGreaterThan(0);
      expect(
        returnedSubjects.every((subject) => subject === joined.subjects[0]),
      ).toBe(true);
      expect(
        returnedDevices.every((device) => device === joined.devices[0]),
      ).toBe(true);
      expect(returned.signIns).toBe(joined.signIns);
    });
  } finally {
    await Promise.allSettled(contexts.map(async (context) => context.close()));
  }
});
