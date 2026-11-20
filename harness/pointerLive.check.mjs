// The laser pointer over a real LiveKit server with real E2EE (#2233).
//
//   docker run --rm -d --name lk-pointer -p 7880:7880 -p 7881:7881 \
//     -p 7882:7882/udp livekit/livekit-server:v1.9.4 --dev --bind 0.0.0.0 \
//     --node-ip 127.0.0.1
//   npx vite --config harness/vite.harness.config.ts --port 6250 &
//   node harness/pointerLive.check.mjs http://127.0.0.1:6250 ws://127.0.0.1:7880
//
// Anna and Ben join one room with E2EE, Mallory joins WITHOUT it. Exit code 0
// only if Anna's pointer reaches Ben marked encrypted, and Mallory's
// plain-text pointer is dropped.
import { createHmac } from "node:crypto";

import { chromium } from "@playwright/test";

const [base = "http://127.0.0.1:6250", ws = "ws://127.0.0.1:7880"] =
  process.argv.slice(2);
const ROOM = `pointer-${Date.now()}`;
const KEY = "harness-shared-key-not-a-secret";
const SHARE = "@cyrus:oriso.test:SHARE";

/** A LiveKit access token for the `--dev` server (devkey / secret). */
function token(identity) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    iss: "devkey",
    sub: identity,
    nbf: now - 10,
    exp: now + 600,
    video: {
      room: ROOM,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  })}`;
  const sig = createHmac("sha256", "secret").update(body).digest("base64url");
  return `${body}.${sig}`;
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
async function join(identity, plain) {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) =>
    console.log(`[${identity}] pageerror`, e.message),
  );
  const u = new URL(`${base}/harness/pointerLive.html`);
  u.searchParams.set("url", ws);
  u.searchParams.set("token", token(identity));
  if (plain) u.searchParams.set("plain", "1");
  else u.searchParams.set("key", KEY);
  await page.goto(u.toString());
  await page.evaluate(() => window.pointer.ready);
  return page;
}

const anna = await join("@anna:oriso.test:A", false);
const ben = await join("@ben:oriso.test:B", false);
const mallory = await join("@mallory:oriso.test:M", true);
await ben.waitForTimeout(1500);

const e2ee = {
  anna: await anna.evaluate(() => window.pointer.e2ee()),
  ben: await ben.evaluate(() => window.pointer.e2ee()),
};
for (let i = 0; i <= 10; i++) {
  await anna.evaluate(
    ([s, x]) => window.pointer.point(s, x, 0.5),
    [SHARE, 0.2 + i * 0.03],
  );
  await anna.waitForTimeout(40);
}
await mallory.evaluate((s) => window.pointer.sendPlain(s, 0.9, 0.9), SHARE);
await ben.waitForTimeout(800);

const result = {
  e2ee,
  benReceived: await ben.evaluate(() => window.pointer.received),
  benShows: await ben.evaluate(() => window.pointer.pointers()),
};
console.log(JSON.stringify(result, null, 2));

const fromAnna = result.benReceived.filter((r) => r.from.startsWith("@anna"));
const fromMallory = result.benReceived.filter((r) =>
  r.from.startsWith("@mallory"),
);
const shown = result.benShows[SHARE] ?? [];
const ok =
  e2ee.anna &&
  e2ee.ben &&
  fromAnna.length > 0 &&
  fromAnna.every((r) => r.encryption === 1) &&
  fromMallory.every((r) => r.encryption === 0) &&
  shown.length === 1 &&
  shown[0].from.startsWith("@anna") &&
  Math.abs(shown[0].x - 0.5) < 0.001;
console.log(ok ? "PASS" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
