/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Does a camera survive being cut into an organic form?
 *
 * The handoff shows video in the FIELDS and nowhere else. The decision to
 * let the new design replace video as well puts a live frame inside a
 * `border-radius` blob with a lean, and inside a `clip-path` half — and a
 * clip path on a 30fps surface is a performance question, not only a visual
 * one. This measures it rather than assuming either way.
 *
 * Three arrangements, same number of streams, same stage, 6 seconds each:
 *   plain   — square frames, no radius, no lean, no clip. The control.
 *   blob    — the grove: eight-value radius, a lean, counter-rotated and
 *             scaled to cover.
 *   clip    — the Einzelgespräch: an SVG clip path per frame.
 *
 * The streams are canvas captures rather than a camera, so the numbers are
 * about compositing rather than about decode: a real call adds decode on top
 * of whatever this shows, equally in all three arrangements.
 */
import { packShapes } from "../src/oriso/layout";
import { coverScale } from "../src/oriso/shape";

const NAMES = [
  "ruhiger Fuchs 432",
  "naher Otter 303",
  "helle Eule 118",
  "weiche Katze 870",
  "feiner Dachs 255",
  "klare Biene 641",
];
const SECONDS = 6;
const BOX = 640;

/** A moving picture, cheap to produce and never the bottleneck. */
function stream(hue: number): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 360;
  const context = canvas.getContext("2d")!;
  let frame = 0;
  const draw = (): void => {
    frame += 1;
    context.fillStyle = `hsl(${(hue + frame) % 360} 60% 45%)`;
    context.fillRect(0, 0, 480, 360);
    context.fillStyle = "#fff";
    context.fillRect((frame * 7) % 480, 0, 60, 360);
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(30);
}

function mount(kind: "plain" | "blob" | "clip"): void {
  const stage = document.getElementById("stage")!;
  stage.innerHTML = "";
  const spots = packShapes(
    NAMES,
    BOX,
    NAMES.map(() => 1),
  );

  if (kind === "clip") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.innerHTML = spots
      .map(
        (_, i) =>
          `<defs><clipPath id="c${i}" clipPathUnits="objectBoundingBox">` +
          `<path d="M0,0 L0.62,0 Q0.8,0.5 0.62,1 L0,1 Z"/></clipPath></defs>`,
      )
      .join("");
    stage.append(svg);
  }

  spots.forEach((spot, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.style.left = `${spot.x}px`;
    slot.style.top = `${spot.y}px`;
    slot.style.width = `${spot.size}px`;
    slot.style.height = `${spot.size}px`;
    if (kind === "blob") {
      slot.style.borderRadius = spot.blob;
      slot.style.transform = `rotate(${spot.tilt}deg)`;
    }
    if (kind === "clip") slot.style.clipPath = `url(#c${i})`;

    const holder = document.createElement("div");
    holder.style.position = "absolute";
    holder.style.inset = "0";
    if (kind === "blob") {
      const tilt = Number(spot.tilt);
      holder.style.transform = `rotate(${-tilt}deg) scale(${coverScale(tilt)})`;
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream(i * 57);
    holder.append(video);
    slot.append(holder);
    stage.append(slot);
  });
}

/** Frame intervals over a fixed window, in ms. */
async function measure(): Promise<{
  frames: number;
  p50: number;
  p95: number;
  worst: number;
}> {
  const gaps: number[] = [];
  let last = performance.now();
  const until = last + SECONDS * 1000;
  await new Promise<void>((resolve) => {
    const tick = (now: number): void => {
      gaps.push(now - last);
      last = now;
      if (now < until) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  // The first interval is the mount, not the steady state.
  const sorted = gaps.slice(5).sort((a, b) => a - b);
  return {
    frames: sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    worst: sorted[sorted.length - 1],
  };
}

const results: Record<string, unknown> = {};
for (const kind of ["plain", "blob", "clip"] as const) {
  mount(kind);
  await new Promise((resolve) => setTimeout(resolve, 800));
  results[kind] = await measure();
}
(window as unknown as { __spike: unknown }).__spike = results;
document.getElementById("out")!.textContent = JSON.stringify(results, null, 2);
document.title = "done";
