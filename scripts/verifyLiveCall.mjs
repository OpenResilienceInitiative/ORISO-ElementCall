/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Makes a real call, with real accounts and real media, and checks the five
 * things about the ORISO design that only a real call can show.
 *
 * The visual-proof harness (`scripts/shootOrisoStage.mjs`) mounts the pieces
 * on their own against invented data. It cannot answer whether identity
 * actually survives the trip between two clients, whether a person who joins
 * late is told who is already there, or whether the view rail is reachable on
 * a phone with four people in the call — those are properties of a running
 * call, not of a component.
 *
 * What it checks, and why each one needs a call:
 *
 *   1. Everybody's animal and circle colour are the ones their own client
 *      published. Identity is inherited, never derived, and the only way to
 *      see the inheritance is to have two clients and a homeserver between
 *      them.
 *   2. Somebody who joins a call in progress sees the others as their
 *      animals, not as initials. Identity is an encrypted TIMELINE event, so
 *      it reaches whoever is listening at the time; the people already in the
 *      call re-announce for a newcomer. Nothing short of a third client
 *      arriving late exercises that.
 *   3. The homeserver holds ciphertext. The identity records it stores are
 *      `m.room.encrypted`, which is the claim the whole transport rests on
 *      and the one a plaintext harness would quietly skip.
 *   4. The call room's STATE holds no identity. Matrix does not encrypt room
 *      state, which is the whole reason the record travels in the timeline.
 *   5. The view rail is on screen at phone width with four people in the
 *      call. jsdom applies no media queries and the harness mounts the rail
 *      on its own rather than inside `InCallView`'s footer.
 *   6. A form's square tile box does not swallow the clicks around it. The
 *      forms are inscribed in square tiles packed until they abut, so the
 *      corners had to be made transparent to pointers; CSS hit-testing is
 *      not something jsdom can exercise.
 *
 * It also reads back the spotlight's geometry and checks that the room the
 * form reserves for its halo is still there, since `SpotlightTile` clips.
 *
 * Standing the backend up:
 *
 *   yarn backend        # Synapse, LiveKit and lk-jwt-service
 *   yarn dev            # this fork, at http://localhost:3000
 *   node scripts/verifyLiveCall.mjs
 *
 * Any other Synapse + LiveKit + lk-jwt-service will do; point `HOMESERVER`,
 * `SERVER_NAME` and `EC_URL` at it. The dev stack serves a self-signed
 * certificate, so it needs `LIVE_CALL_INSECURE_TLS=1` (and
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` for this script's own requests) — never
 * against anything but a local stack.
 */
import { chromium } from "@playwright/test";
import { createClient } from "matrix-js-sdk";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const EC_URL = process.env.EC_URL ?? "http://localhost:3000";
const HOMESERVER = process.env.HOMESERVER ?? "https://synapse.m.localhost";
const SERVER_NAME = process.env.SERVER_NAME ?? "synapse.m.localhost";
const PASSWORD = process.env.LIVE_CALL_PASSWORD ?? "orisopass";
const OUT = process.env.SHOT_DIR ?? "_shots/live";
const INSECURE_TLS = process.env.LIVE_CALL_INSECURE_TLS === "1";

/**
 * Four people, and what their clients publish.
 *
 * The fourth publishes nothing on purpose: a member the call was told nothing
 * about gets initials in their own palette colour, and that path is as much
 * part of the design as the animals are.
 */
const CAST = [
  {
    localpart: process.env.LIVE_CALL_USER_1 ?? "orisoalice",
    displayName: "freundlicher Fuchs Mika",
    identity: {
      kind: "animal",
      file: "fox.svg",
      bg: "#F0908D",
      ink: "#1a1a1a",
    },
  },
  {
    localpart: process.env.LIVE_CALL_USER_2 ?? "orisobob",
    displayName: "ruhige Otter Sanne",
    identity: {
      kind: "animal",
      file: "otter.svg",
      bg: "#165E83",
      ink: "#ffffff",
    },
  },
  {
    localpart: process.env.LIVE_CALL_USER_3 ?? "orisocarol",
    displayName: "wache Eule Juno",
    identity: {
      kind: "animal",
      file: "owl.svg",
      bg: "#EAD56B",
      ink: "#1a1a1a",
    },
  },
  {
    localpart: process.env.LIVE_CALL_USER_4 ?? "orisodan",
    displayName: "stiller Igel Toni",
    identity: null,
  },
];

/** `HALO_ROOM_PX` from `src/oriso/halo.ts`. */
const HALO_ROOM_PX = 32;

const problems = [];
const say = (ok, what, detail) => {
  if (!ok) problems.push(`${what} — ${detail}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: ${detail}`);
};

/* ----------------------------------------------------------------------- *
 * The homeserver
 * ----------------------------------------------------------------------- */

async function cs(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${HOMESERVER}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(
      `${response.status} ${method} ${path}: ${text.slice(0, 300)}`,
    );
    error.body = parsed;
    throw error;
  }
  return parsed;
}

/** Logs the account in, registering it first if it does not exist yet. */
async function account(localpart) {
  const login = {
    type: "m.login.password",
    identifier: { type: "m.id.user", user: localpart },
    password: PASSWORD,
    initial_device_display_name: `oriso-live-${localpart}`,
  };
  try {
    return await cs("/_matrix/client/v3/login", {
      method: "POST",
      body: login,
    });
  } catch (error) {
    if (error.body?.errcode !== "M_FORBIDDEN") throw error;
  }
  try {
    return await cs("/_matrix/client/v3/register", {
      method: "POST",
      body: {
        username: localpart,
        password: PASSWORD,
        auth: { type: "m.login.dummy" },
      },
    });
  } catch (error) {
    throw new Error(
      `${localpart} cannot log in and cannot be registered (${error.message}). ` +
        `Create four accounts on ${SERVER_NAME} with the password in LIVE_CALL_PASSWORD, ` +
        `or open registration on the dev homeserver.`,
    );
  }
}

/**
 * One encrypting client per person, made the first time they speak.
 *
 * Not a raw `/send` request: the homeserver would then store the identity in
 * clear, and checks 1 to 3 would pass with the encrypted transport entirely
 * broken — which is the one thing this file exists to disprove. Matrix
 * encryption is client-side, so the publisher has to be a client.
 */
const publishers = new Map();

async function publisherFor(person) {
  const existing = publishers.get(person.user_id);
  if (existing) return existing;
  /*
   * Its OWN device, not the one the browser is signed in as.
   *
   * The browser contexts are signed in by writing this account's session into
   * local storage, so they already hold `person.device_id`. A second crypto
   * store on the same device id is two clients claiming one identity: each
   * uploads its own device keys over the other's, the one-time keys stop
   * verifying, and the Megolm key for the identity record never reaches the
   * browser — which looks exactly like the encrypted transport being broken,
   * and is not. Another device of the same person is also the truer model:
   * in production the record is published by a client, not by this script.
   */
  const session = await cs("/_matrix/client/v3/login", {
    method: "POST",
    body: {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: person.localpart },
      password: PASSWORD,
      initial_device_display_name: `oriso-live-publisher-${person.localpart}`,
    },
  });
  const client = createClient({
    baseUrl: HOMESERVER,
    accessToken: session.access_token,
    userId: session.user_id,
    deviceId: session.device_id,
  });
  await client.initRustCrypto({ useIndexedDB: false });
  await client.startClient({ initialSyncLimit: 1 });
  await new Promise((resolve) => client.once("sync", resolve));
  publishers.set(person.user_id, client);
  return client;
}

/**
 * What the ORISO host does: publish one person's identity into the call room
 * as a timeline event. The host does this when a call surface opens and again
 * whenever somebody new arrives, which is what keeps a late joiner from
 * seeing a room full of initials — and a late joiner is also a device that
 * could not have been given the earlier Megolm session, so the re-announce is
 * what the encryption makes necessary rather than merely tidy.
 */
async function announce(roomId, person) {
  if (!person.identity) return;
  const client = await publisherFor(person);
  /*
   * Ask who is holding a device first, and do not take a cached answer.
   *
   * The Megolm session is shared with the devices known at the moment of
   * sending. A browser that joined seconds ago is a device this client has
   * never queried for, and without the refresh the first record of a call
   * went out to nobody but its own sender — the stage showed initials until
   * the next re-announce happened to carry a fresher device list.
   */
  await client.getCrypto()?.getUserDeviceInfo(
    CAST.map((member) => member.user_id),
    true,
  );
  await client.sendEvent(roomId, "org.oriso.call.identity", person.identity);
}

/**
 * Everything this account logged in as before, gone.
 *
 * Each run — and each browser context inside it — is a new device, and they
 * are never signed out. Left to accumulate, the homeserver hands out one-time
 * keys for devices whose keys have moved on, every Olm session with them
 * fails to verify, and the Megolm key for an identity event reaches some
 * participants and not others. The run then reports that identity is broken
 * when what is broken is the leftovers.
 */
async function forgetOldDevices(person) {
  const { devices = [] } = await cs("/_matrix/client/v3/devices", {
    token: person.access_token,
  });
  const stale = devices
    .map((device) => device.device_id)
    .filter((id) => typeof id === "string" && id !== person.device_id);
  if (stale.length === 0) return;
  try {
    await cs("/_matrix/client/v3/delete_devices", {
      method: "POST",
      body: {
        devices: stale,
        auth: {
          type: "m.login.password",
          identifier: { type: "m.id.user", user: person.localpart },
          password: PASSWORD,
        },
      },
      token: person.access_token,
    });
  } catch (error) {
    // User-interactive auth differs between homeservers; a run with
    // leftovers is noisier, not wrong.
    console.log(
      `could not clear ${person.localpart}'s old devices: ${error.message}`,
    );
  }
}

console.log(`homeserver ${HOMESERVER} (${SERVER_NAME}), call at ${EC_URL}`);
for (const person of CAST)
  Object.assign(person, await account(person.localpart));
for (const person of CAST) await forgetOldDevices(person);
for (const person of CAST) {
  await cs(
    `/_matrix/client/v3/profile/${encodeURIComponent(person.user_id)}/displayname`,
    {
      method: "PUT",
      body: { displayname: person.displayName },
      token: person.access_token,
    },
  );
}

const [first, ...rest] = CAST;
const { room_id: roomId } = await cs("/_matrix/client/v3/createRoom", {
  method: "POST",
  body: {
    name: "ORISO live call",
    preset: "public_chat",
    visibility: "private",
    invite: rest.map((person) => person.user_id),
    /*
     * The two grants a call room cannot work without, which the ORISO host
     * writes when it provisions one (`CallManager.createElementCallRoom`).
     * Without the first, every participant but the creator is refused when
     * MatrixRTC writes their membership and the call drops with "Connection
     * lost"; without the second, nobody but the creator can send the
     * identity record in an encrypted room, because the power-level check
     * sees the outer `m.room.encrypted` type.
     */
    power_level_content_override: {
      events: {
        "org.matrix.msc3401.call.member": 0,
        "m.room.encrypted": 0,
      },
    },
    /*
     * Encrypted, because that is the entire argument for putting identity in
     * the timeline rather than in room state. A verification that published
     * into a plain room would pass with the encrypted transport completely
     * broken.
     */
    initial_state: [
      {
        type: "m.room.encryption",
        state_key: "",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      },
    ],
  },
  token: first.access_token,
});
for (const person of rest) {
  await cs(`/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
    method: "POST",
    body: {},
    token: person.access_token,
  });
}
console.log(`room ${roomId}`);

/* ----------------------------------------------------------------------- *
 * The calls
 * ----------------------------------------------------------------------- */

const callUrl =
  `${EC_URL}/room/#?roomId=${encodeURIComponent(roomId)}` +
  `&orisoDesign=true&skipLobby=true`;

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: [
    // A camera and a microphone that exist, answer immediately and need
    // nobody to click a permission prompt.
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
await mkdir(OUT, { recursive: true });

/** Opens one person's call surface, already signed in as them. */
async function openCall(person, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({
    viewport,
    permissions: ["camera", "microphone"],
    ignoreHTTPSErrors: INSECURE_TLS,
  });
  // The fork keeps its standalone session here; writing it is signing in.
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      "matrix-auth-store",
      JSON.stringify({
        user_id: person.user_id,
        device_id: person.device_id,
        access_token: person.access_token,
        passwordlessUser: false,
      }),
    ],
  );
  const page = await context.newPage();
  // Kept so that a failure can say what the call said, rather than only that
  // something did not appear.
  page.chatter = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      page.chatter.push(`[${message.type()}] ${message.text()}`.slice(0, 300));
  });
  page.on("pageerror", (error) =>
    page.chatter.push(`[pageerror] ${error.message}`.slice(0, 300)),
  );
  await page.goto(callUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="videoTile"]', { timeout: 90_000 });
  await page.waitForTimeout(9_000);
  return page;
}

/**
 * Turns one person's camera on or off.
 *
 * Read off the button's own kind: it is `secondary` while the camera is live
 * and `primary` once it is muted. There is no aria-pressed to read, and
 * counting video elements on the page counts the REMOTE tiles too, so both of
 * those flip the wrong way.
 */
async function camera(page, on) {
  const button = page.locator('[data-testid="incall_videomute"]');
  try {
    await button.waitFor({ timeout: 20_000 });
  } catch {
    // A call that fell over says so on the page; a bare locator timeout does
    // not, and that is the difference between a five-minute diagnosis and an
    // hour of one.
    throw new Error(
      `the call controls never appeared. The page says: ${(
        await page.evaluate(() => document.body.innerText)
      ).slice(0, 300)}\n${(page.chatter ?? []).slice(-12).join("\n")}`,
    );
  }
  const live = async () =>
    (await button.getAttribute("data-kind")) === "secondary";
  for (let attempt = 0; attempt < 3 && (await live()) !== on; attempt++) {
    await button.click();
    await page.waitForTimeout(1_500);
  }
  if ((await live()) !== on)
    throw new Error(`the camera would not go ${on ? "on" : "off"}`);
}

/**
 * Waits until nothing full-screen is sitting over the stage.
 *
 * A call that is reconnecting dims itself behind a backdrop that really does
 * take pointer events, which is correct — there is nothing to click while the
 * connection is gone — and which would otherwise be read as "every click
 * missed its form".
 */
async function settled(page, timeout = 45_000) {
  const covered = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("div")].some((el) => {
        const style = getComputedStyle(el);
        if (style.position !== "fixed" || style.pointerEvents === "none")
          return false;
        const box = el.getBoundingClientRect();
        return (
          box.width >= window.innerWidth * 0.8 &&
          box.height >= window.innerHeight * 0.8
        );
      }),
    );
  const until = Date.now() + timeout;
  while (await covered()) {
    if (Date.now() > until)
      throw new Error(
        `the call never came back: ${(await page.evaluate(() => document.body.innerText)).slice(0, 200)}`,
      );
    await page.waitForTimeout(1_000);
  }
}

/**
 * Waits until every tile has inherited artwork, or gives up and reports what
 * it has.
 *
 * Fixed sleeps are wrong here: the record is encrypted, so the tile shows
 * stand-in letters until the Megolm key has travelled to-device and the event
 * has been decrypted a second time. That is a race with no fixed length, and
 * a sleep long enough to always win is a sleep that wastes a minute on every
 * run.
 */
async function waitForArtwork(page, expected) {
  await page
    .waitForFunction(
      (want) => {
        const tiles = [
          ...document.querySelectorAll('[data-testid="videoTile"]'),
        ];
        return (
          tiles.length >= want &&
          tiles.every((tile) =>
            tile.querySelector('[data-testid="oriso-artwork"]'),
          )
        );
      },
      expected,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
}

const facesOn = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="videoTile"]')].map((tile) => ({
      name: tile.querySelector('[data-testid="name_tag"]')?.textContent ?? "",
      artwork: !!tile.querySelector('[data-testid="oriso-artwork"]'),
      initials:
        tile.querySelector('[data-testid="oriso-initials"]')?.textContent ??
        null,
      colour: getComputedStyle(tile.querySelector('[data-testid="oriso-face"]'))
        .backgroundColor,
    })),
  );

// ── Two people, and the colours they published ─────────────────────────────
const pages = [];
for (const person of CAST.slice(0, 2)) pages.push(await openCall(person));
for (const person of CAST.slice(0, 2)) await announce(roomId, person);
await pages[0].waitForTimeout(2_500);
for (const page of pages) await camera(page, false);
await settled(pages[0]);
await waitForArtwork(pages[0], 2);
await pages[0].screenshot({ path: join(OUT, "einzelgespraech.png") });

const hex = (colour) => {
  const [r, g, b] = colour.match(/\d+/g).map(Number);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};
const seen = await facesOn(pages[0]);
const expected = new Set(
  CAST.slice(0, 2).map((person) => person.identity.bg.toUpperCase()),
);
say(
  seen.length === 2 &&
    seen.every((face) => face.artwork && expected.has(hex(face.colour))),
  "1. each person wears the colour and animal their own client published",
  JSON.stringify(seen.map((face) => ({ ...face, colour: hex(face.colour) }))),
);

// ── A third person joins a call in progress ────────────────────────────────
const latecomer = await openCall(CAST[2]);
await camera(latecomer, false);
// The newcomer's own surface publishes for her; the others re-announce for her.
await announce(roomId, CAST[2]);
for (const person of CAST.slice(0, 2)) await announce(roomId, person);
await settled(latecomer);
await waitForArtwork(latecomer, 3);
const latecomerSees = await facesOn(latecomer);
await latecomer.screenshot({ path: join(OUT, "latecomer.png") });
say(
  latecomerSees.length === 3 &&
    latecomerSees.every((face) => face.artwork && face.initials === null),
  "2. somebody who joins a call in progress is told who is already there",
  JSON.stringify(
    latecomerSees.map((face) => ({
      name: face.name,
      artwork: face.artwork,
      initials: face.initials,
    })),
  ),
);

// ── What the server actually stored ───────────────────────────────────────
const stored = await cs(
  `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=60`,
  { token: first.access_token },
);
const identityShaped = (stored.chunk ?? []).filter(
  (event) =>
    event.type === "org.oriso.call.identity" ||
    (event.type === "m.room.encrypted" &&
      CAST.some((p) => p.user_id === event.sender)),
);
const inClear = identityShaped.filter(
  (event) => event.type !== "m.room.encrypted",
);
say(
  identityShaped.length > 0 && inClear.length === 0,
  "3. the homeserver holds ciphertext, not identities",
  `${identityShaped.length} candidate events, ${inClear.length} of them readable; ` +
    `types: ${[...new Set((stored.chunk ?? []).map((e) => e.type))].join(", ")}`,
);

// ── Identity is nowhere in the room's state ────────────────────────────────
const state = await cs(
  `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`,
  {
    token: first.access_token,
  },
);
const leaked = state.filter(
  (event) => event.type === "org.oriso.call.identity",
);
say(
  leaked.length === 0,
  "4. the call room's state holds no identity",
  `${state.length} state events, ${leaked.length} identity; ` +
    `types: ${[...new Set(state.map((event) => event.type))].join(", ")}`,
);

// ── The view rail, on a phone, with four in the call ───────────────────────
const fourth = await openCall(CAST[3]);
await camera(fourth, false);
for (const person of CAST.slice(0, 3)) await announce(roomId, person);
const phone = await openCall(CAST[0], { width: 390, height: 844 });
await settled(phone);
// Everybody has to be on the stage before the stage can be judged.
await phone
  .waitForFunction(
    () => document.querySelectorAll('[data-testid="videoTile"]').length >= 4,
    { timeout: 45_000 },
  )
  .catch(() => undefined);
await phone.waitForTimeout(2_000);
await phone.screenshot({ path: join(OUT, "phone-four.png") });
const rail = await phone.evaluate(() => {
  const el = document.querySelector('[data-testid="view-switcher"]');
  if (!el) return null;
  const box = el.getBoundingClientRect();
  const tiles = [...document.querySelectorAll('[data-testid="videoTile"]')];
  return {
    onScreen:
      box.width > 0 &&
      box.height > 0 &&
      getComputedStyle(el).display !== "none" &&
      box.left >= 0 &&
      box.right <= window.innerWidth &&
      box.top >= 0 &&
      box.bottom <= window.innerHeight,
    views: [...el.querySelectorAll("button, [role=button]")].map((b) =>
      b.getAttribute("aria-label"),
    ),
    tiles: tiles.length,
    // A form that runs off a phone is its own kind of wrong.
    overflow: tiles.reduce((worst, tile) => {
      const box2 = tile.getBoundingClientRect();
      return Math.max(
        worst,
        -box2.left,
        box2.right - window.innerWidth,
        -box2.top,
        box2.bottom - window.innerHeight,
      );
    }, 0),
  };
});
say(
  !!rail?.onScreen && rail.tiles === 4 && rail.overflow <= 1,
  "5. the view rail is reachable at 390px with four people, and no form runs off the screen",
  JSON.stringify(rail),
);

// ── A click on a form that lies under a neighbour's box ────────────────────
/*
 * To the front first, and this is not cosmetic: an occluded window runs no
 * CSS animations, so a dialog that has been dismissed never finishes fading
 * and Radix leaves its full-screen backdrop mounted. Hit-testing then reports
 * that every click lands on the backdrop — a property of the harness, not of
 * the call.
 */
const grove = fourth;
await grove.bringToFront();
await settled(grove);
await grove.waitForTimeout(2_000);
await grove.screenshot({ path: join(OUT, "grove.png") });

/*
 * What the rule actually says, measured in a browser.
 *
 * `MediaView.module.css` makes the square tile transparent to pointers in
 * every arrangement but the Einzelgespräch, and hands pointer events back to
 * the painted form, the name tag, the status and the buttons. The
 * Einzelgespräch is excluded because its root carries the seam's `clip-path`,
 * and a clipped-away region is not hit-testable to begin with.
 *
 * Checked two ways: the rule is in force, and a click in a corner of the
 * square — which no form inscribed in it paints — does not land on that tile.
 * Asking instead that a click "reaches the form you aimed at" would be
 * wrong once two forms genuinely overlap: there the one painted on top
 * rightly wins, and a test that says otherwise fails on correct behaviour.
 */
const pointerRule = await grove.evaluate(() => {
  const tiles = [...document.querySelectorAll('[data-testid="videoTile"]')];
  return tiles.map((tile) => {
    const box = tile.getBoundingClientRect();
    const corners = [
      [box.left + 2, box.top + 2],
      [box.right - 2, box.top + 2],
      [box.left + 2, box.bottom - 2],
      [box.right - 2, box.bottom - 2],
    ].filter(
      ([x, y]) =>
        x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight,
    );
    return {
      name: tile.querySelector('[data-testid="name_tag"]')?.textContent ?? "",
      half: tile.getAttribute("data-oriso-half"),
      rootPointerEvents: getComputedStyle(tile).pointerEvents,
      cornersThatStoleTheClick: corners.filter(
        ([x, y]) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[data-testid="videoTile"]') === tile,
      ).length,
      cornersTested: corners.length,
    };
  });
});
const stolen = pointerRule.filter(
  (tile) =>
    tile.rootPointerEvents !== "none" || tile.cornersThatStoleTheClick > 0,
);
say(
  pointerRule.length === 4 && stolen.length === 0,
  "6. a form's square box does not swallow the clicks around it",
  JSON.stringify(pointerRule),
);

// ── The halo, where the spotlight clips ────────────────────────────────────
await grove
  .locator('[data-testid="view-switcher"] [aria-label="Spotlight"]')
  .click();
await grove.waitForTimeout(6_000);
await grove.screenshot({ path: join(OUT, "spotlight.png") });
const halo = await grove.evaluate(() => {
  // The spotlighted tile is the one inside `SpotlightTile`'s scroller, which
  // is the element that clips. The strip beside it measures nothing.
  const clips = (el) => {
    const style = getComputedStyle(el);
    return (
      style.contain.includes("strict") ||
      style.overflowY === "hidden" ||
      style.overflowY === "clip"
    );
  };
  for (const tile of document.querySelectorAll('[data-testid="videoTile"]')) {
    let clipper = tile.parentElement;
    while (clipper && clipper !== document.body && !clips(clipper))
      clipper = clipper.parentElement;
    if (!clipper || clipper === document.body) continue;
    const face = tile.querySelector('[data-testid="oriso-face"]');
    if (!face) continue;
    const f = face.getBoundingClientRect();
    const c = clipper.getBoundingClientRect();
    return {
      room: {
        top: Math.round(f.top - c.top),
        bottom: Math.round(c.bottom - f.bottom),
        left: Math.round(f.left - c.left),
        right: Math.round(c.right - f.right),
      },
      face: { w: Math.round(f.width), h: Math.round(f.height) },
      shadow: getComputedStyle(face).boxShadow.slice(0, 160),
    };
  }
  return null;
});
say(
  !!halo && Math.min(...Object.values(halo.room)) >= HALO_ROOM_PX,
  `7. the spotlight still reserves ${HALO_ROOM_PX}px for the halo on every side`,
  JSON.stringify(halo),
);

await browser.close();
for (const client of publishers.values()) client.stopClient();

console.log(`\nplates in ${OUT}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("the call held up.");
// The crypto workers keep the process alive otherwise.
process.exit(0);
