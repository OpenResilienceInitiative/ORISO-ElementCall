// Screenshots for the laser pointer PR (#2233). Usage:
//   npx vite --config harness/vite.harness.config.ts --port 6250 &
//   node harness/pointer.shots.mjs http://127.0.0.1:6250 <out-dir>
import { chromium } from "@playwright/test";

const [base = "http://127.0.0.1:6250", out = "."] = process.argv.slice(2);
// PW_CHROMIUM: an already-installed browser, if this playwright's is not.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

// 1. Real mouse: point in Anna's pane, then in Ben's; the dots arrive in the
//    other panes through the real channel, encoded, throttled and decoded.
await page.goto(`${base}/harness/pointer.html`);
await page.waitForTimeout(1500);
const pane = (u) => page.getByTestId(`pane-${u}`).getByTestId("videoTile");
const anna = await pane("@anna:oriso.test").boundingBox();
const ben = await pane("@ben:oriso.test").boundingBox();
// Anna: on the end of the "Strom & Heizung" bar; Ben: on "Einnahmen".
await page.mouse.move(anna.x + anna.width * 0.4, anna.y + anna.height * 0.5);
await page.mouse.move(anna.x + anna.width * 0.59, anna.y + anna.height * 0.56, {
  steps: 12,
});
await page.mouse.move(ben.x + ben.width * 0.2, ben.y + ben.height * 0.3, {
  steps: 12,
});
await page.mouse.move(ben.x + ben.width * 0.4, ben.y + ben.height * 0.28, {
  steps: 12,
});
// One mouse cannot be in two panes; Anna keeps pointing through a pointer
// event on her tile (same handler, same maths) while the mouse is at Ben's.
await page
  .getByTestId("pane-@anna:oriso.test")
  .getByTestId("videoTile")
  .dispatchEvent("pointermove", {
    clientX: anna.x + anna.width * 0.59,
    clientY: anna.y + anna.height * 0.56,
    bubbles: true,
  });
await page.waitForTimeout(150);
const counts = {};
for (const u of ["@anna:oriso.test", "@ben:oriso.test", "@cyrus:oriso.test"])
  counts[u] = await page
    .getByTestId(`pane-${u}`)
    .getByTestId("oriso-pointer")
    .count();
console.log("dots per pane after real mouse:", JSON.stringify(counts));
await shot("01-real-mouse-two-viewers");
await page
  .getByTestId("menu")
  .screenshot({ path: `${out}/04-menu-switch.png` });

// 2. Fade: 1.5 s without movement and the dots go.
await page.mouse.move(5, 5);
await page.waitForTimeout(2000);
const visible = await page.$$eval(
  '[data-testid="oriso-pointer"]',
  (els) => els.filter((e) => getComputedStyle(e).opacity !== "0").length,
);
console.log("visible dots 2 s after leaving:", visible);
await shot("02-faded-after-idle");

// 3. Scripted demo (Anna and Ben both pointing), one frame per tile shape.
await page.goto(`${base}/harness/pointer.html?demo=1`);
await page.waitForTimeout(3500);
await shot("03-demo-same-spot-in-three-tile-shapes");
await browser.close();
