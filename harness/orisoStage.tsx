/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Visual proof for the ORISO call design.
 *
 * What this IS: the real `OrisoFace`, the real `packShapes` / `splitCells` /
 * `shareFor` / `seamFor`, the real `Atmosphere`, and the real `ViewSwitcher`,
 * arranged exactly as the layouts arrange them, against inherited artwork.
 *
 * What this is NOT: a screenshot of a running call. There is no LiveKit here,
 * no Matrix, and no `Grid`, so the spring animation and the dragging are not
 * exercised. Saying so plainly matters more than the picture does: a
 * screenshot that quietly leaves out the part that could break is worse than
 * no screenshot.
 *
 * The artwork is fetched from a real ORISO static directory, so the animals
 * and the per-motif padding are the ones the chat draws, not stand-ins.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { OrisoFace } from "../src/oriso/OrisoFace";
import { Atmosphere } from "../src/oriso/Atmosphere";
import { ViewSwitcher } from "../src/oriso/ViewSwitcher";
import { type OrisoIdentity } from "../src/oriso/identity";
import { packShapes, splitCells } from "../src/oriso/layout";
import { shareFor, seamFor, type Speaking } from "../src/oriso/einzelgespraech";
import { FIELD_RADIUS } from "../src/oriso/shape";
import { liftFor } from "../src/oriso/lift";
import "../src/index.css";

/** Nine people, with the palette and the animals ORISO would give them. */
const CAST: { name: string; identity: OrisoIdentity }[] = [
  { name: "ruhiger Fuchs 432", file: "fox.svg", bg: "#165E83", ink: "#ffffff" },
  { name: "naher Otter 303", file: "otter.svg", bg: "#FCE7E6", ink: "#1a1a1a" },
  { name: "helle Eule 118", file: "owl.svg", bg: "#007B43", ink: "#ffffff" },
  { name: "weiche Katze 870", file: "cat.svg", bg: "#EEBBCB", ink: "#1a1a1a" },
  {
    name: "feiner Dachs 255",
    file: "okapi.svg",
    bg: "#4F284B",
    ink: "#ffffff",
  },
  { name: "klare Biene 641", file: "bee.svg", bg: "#EAD56B", ink: "#1a1a1a" },
  {
    name: "stiller Igel 507",
    file: "hedgehog.svg",
    bg: "#1D697C",
    ink: "#ffffff",
  },
  { name: "warmer Hase 962", file: "hare.svg", bg: "#F6DE9B", ink: "#1a1a1a" },
  {
    name: "leiser Delfin 774",
    file: "dolphin.svg",
    bg: "#002147",
    ink: "#ffffff",
  },
].map(({ name, file, bg, ink }) => ({
  name,
  identity: { kind: "animal", file, bg, ink },
}));

const SPEAKING_WEIGHT = 1.6;
const FIELD_GUTTER = 6;

function Plate({
  caption,
  width,
  height,
  children,
  atmosphere = true,
  id,
}: {
  caption: string;
  width: number;
  height: number;
  children: React.ReactNode;
  atmosphere?: boolean;
  id: string;
}): React.ReactNode {
  return (
    <div className="plate" data-shot={id} style={{ width, height }}>
      {atmosphere && <Atmosphere palette="fluss" />}
      <span className="caption">{caption}</span>
      {children}
    </div>
  );
}

/** The grove, placed by `packShapes` exactly as `OrisoGroveLayout` places it. */
function Hain({
  count,
  speaker,
  box,
}: {
  count: number;
  speaker: number | null;
  box: number;
}): React.ReactNode {
  const cast = CAST.slice(0, count);
  const spots = packShapes(
    cast.map((person) => person.name),
    box,
    cast.map((_, i) => (i === speaker ? SPEAKING_WEIGHT : 1)),
  );
  return (
    <>
      {spots.map((spot, i) => (
        <div
          key={cast[i].name}
          style={{
            position: "absolute",
            left: spot.x,
            top: spot.y,
            width: spot.size,
            height: spot.size,
            ...(i === speaker
              ? { transform: "translateY(-4px)", zIndex: 3 }
              : {}),
          }}
        >
          <OrisoFace
            identity={cast[i].identity}
            size={spot.size}
            shape={{ radius: spot.blob, tilt: Number(spot.tilt) }}
            speaking={i === speaker}
            parentUrl=""
          />
        </div>
      ))}
    </>
  );
}

/** The fields, cut by `splitCells` exactly as the layout cuts them. */
function Felder({
  count,
  speaker,
  width,
  height,
}: {
  count: number;
  speaker: number | null;
  width: number;
  height: number;
}): React.ReactNode {
  const cast = CAST.slice(0, count);
  return (
    <>
      {splitCells(
        cast.map((_, i) => i),
        { x: 0, y: 0, w: width, h: height },
        speaker ?? -1,
      ).map((cell) => (
        <div
          key={cast[cell.i].name}
          style={{
            position: "absolute",
            left: cell.x + FIELD_GUTTER / 2,
            top: cell.y + FIELD_GUTTER / 2,
            width: Math.max(1, cell.w - FIELD_GUTTER),
            height: Math.max(1, cell.h - FIELD_GUTTER),
          }}
        >
          <OrisoFace
            identity={cast[cell.i].identity}
            size={Math.min(cell.w, cell.h) - FIELD_GUTTER}
            shape={{ radius: FIELD_RADIUS, tilt: 0, body: false }}
            contentSize={Math.round(
              (Math.min(cell.w, cell.h) - FIELD_GUTTER) * 0.56,
            )}
            speaking={cell.i === speaker}
            parentUrl=""
          />
        </div>
      ))}
    </>
  );
}

/** One circle, two bowed halves — the same two clip paths the layout emits. */
function Einzelgespraech({
  speaking,
  box,
  seamId,
}: {
  speaking: Speaking;
  box: number;
  seamId: string;
}): React.ReactNode {
  const share = shareFor(speaking);
  const tip = share + seamFor(share);
  const circle = Math.round(box * 0.86);
  const [first, second] = CAST;
  const common = {
    radius: "50%",
    tilt: 0,
    speakingAs: "rim" as const,
    lifted: false,
  };
  // The animal belongs to its half, not to the whole circle: the handoff's
  // 22% of the stage, expressed against the circle that is 86% of it.
  const face = Math.round(circle * (0.22 / 0.86));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg width="0" height="0" aria-hidden="true">
        <defs>
          <clipPath id={seamId} clipPathUnits="objectBoundingBox">
            <path d={`M0,0 L${share},0 Q${tip},0.5 ${share},1 L0,1 Z`} />
          </clipPath>
          <clipPath
            id={`${seamId}-rest`}
            clipPathUnits="objectBoundingBox"
            clipRule="evenodd"
          >
            <path
              clipRule="evenodd"
              d={`M0,0 L1,0 L1,1 L0,1 Z M0,0 L${share},0 Q${tip},0.5 ${share},1 L0,1 Z`}
            />
          </clipPath>
        </defs>
      </svg>
      <div
        style={{
          position: "relative",
          width: circle,
          height: circle,
          borderRadius: "50%",
          boxShadow: liftFor(circle),
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <OrisoFace
            identity={second.identity}
            size={circle}
            contentSize={face}
            shape={{
              ...common,
              clipPath: `url(#${seamId}-rest)`,
              focusX: share + (1 - share) / 2,
            }}
            speaking={speaking === "second"}
            parentUrl=""
          />
        </div>
        <div style={{ position: "absolute", inset: 0 }}>
          <OrisoFace
            identity={first.identity}
            size={circle}
            contentSize={face}
            shape={{
              ...common,
              clipPath: `url(#${seamId})`,
              focusX: share / 2,
            }}
            speaking={speaking === "first"}
            parentUrl=""
          />
        </div>
      </div>
    </div>
  );
}

function Harness(): React.ReactNode {
  const stage = { width: 960, height: 640 };
  const box = Math.min(stage.width, stage.height);
  const offset = Math.round((stage.width - box) / 2);
  const grove = (count: number, speaker: number | null) => (
    <div style={{ position: "absolute", inset: 0, left: offset, width: box }}>
      <Hain count={count} speaker={speaker} box={box} />
    </div>
  );

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}
    >
      <Plate id="hain-2" caption="Hain · 2 · niemand spricht" {...stage}>
        {grove(2, null)}
      </Plate>
      <Plate id="hain-3" caption="Hain · 3 · einer spricht" {...stage}>
        {grove(3, 1)}
      </Plate>
      <Plate id="hain-5" caption="Hain · 5 · einer spricht" {...stage}>
        {grove(5, 2)}
      </Plate>
      <Plate id="hain-9" caption="Hain · 9 · einer spricht" {...stage}>
        {grove(9, 4)}
      </Plate>
      <Plate id="felder-4" caption="Felder · 4 · einer spricht" {...stage}>
        <Felder
          count={4}
          speaker={1}
          width={stage.width}
          height={stage.height}
        />
      </Plate>
      <Plate id="felder-8" caption="Felder · 8 · einer spricht" {...stage}>
        <Felder
          count={8}
          speaker={5}
          width={stage.width}
          height={stage.height}
        />
      </Plate>
      <Plate id="einzel-still" caption="Einzelgespräch · Stille" {...stage}>
        <Einzelgespraech speaking="none" box={box} seamId="seam-still" />
      </Plate>
      <Plate
        id="einzel-first"
        caption="Einzelgespräch · links spricht"
        {...stage}
      >
        <Einzelgespraech speaking="first" box={box} seamId="seam-first" />
      </Plate>
      <Plate
        id="einzel-second"
        caption="Einzelgespräch · rechts spricht"
        {...stage}
      >
        <Einzelgespraech speaking="second" box={box} seamId="seam-second" />
      </Plate>
      <Plate
        id="switcher"
        caption="Ansichtswähler"
        width={960}
        height={120}
        atmosphere={false}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <ViewSwitcher active="hain" onChange={() => {}} />
          <ViewSwitcher active="felder" onChange={() => {}} />
          <ViewSwitcher active="spotlight" onChange={() => {}} />
        </div>
      </Plate>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
