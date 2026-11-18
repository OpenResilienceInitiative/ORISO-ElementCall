/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Visual proof for the selection ring (#171).
 *
 * What this IS: real `MediaView` tiles carrying the real `GridTile` box class
 * (whose hover outline drew the rectangle), placed by the real `packShapes`
 * (Hain), `kreisPlan` + `ownShape` (Kreis) and the field radius (Felder), in
 * the call's dark scheme or, with `?scheme=light`, the light one.
 *
 * What this is NOT: a running call. No LiveKit, no Matrix, no `Grid`.
 *
 * `?open=1` opens the first form's menu in every plate (a real
 * `data-state="open"` button), which shows the ring without a pointer, so a
 * screenshot can show it. Hover and Tab work as in the call.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MediaView } from "../src/tile/MediaView";
import gridStyles from "../src/tile/GridTile.module.css";
import { OrisoStageContext } from "../src/oriso/useOrisoIdentities";
import { type OrisoIdentity } from "../src/oriso/identity";
import { type TileShape, FIELD_RADIUS } from "../src/oriso/shape";
import { ownShape, packShapes } from "../src/oriso/layout";
import { kreisPlan } from "../src/oriso/kreis";
import "../src/index.css";

const params = new URLSearchParams(location.search);
const scheme = params.get("scheme") === "light" ? "light" : "dark";
const openFirst = params.get("open") === "1";
document.body.classList.add(`cpd-theme-${scheme}`);

const CAST = [
  ["Beratung", "fox.svg", "#165E83", "#ffffff"],
  ["Schildkröte", "turtle.svg", "#FCE7E6", "#1a1a1a"],
  ["helle Eule 118", "owl.svg", "#007B43", "#ffffff"],
  ["weiche Katze 870", "cat.svg", "#EEBBCB", "#1a1a1a"],
  ["feiner Dachs 255", "okapi.svg", "#4F284B", "#ffffff"],
  ["klare Biene 641", "bee.svg", "#EAD56B", "#1a1a1a"],
].map(([name, file, bg, ink], i) => ({
  name,
  userId: `@p${i}:oriso.org`,
  identity: { kind: "animal", file, bg, ink, name } as OrisoIdentity,
}));

function Tile({
  index,
  x,
  y,
  size,
  shape,
}: {
  index: number;
  x: number;
  y: number;
  size: number;
  shape: TileShape | undefined;
}): React.ReactNode {
  const person = CAST[index];
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        inlineSize: size,
        blockSize: size,
      }}
    >
      <MediaView
        className={gridStyles.tile}
        targetWidth={size}
        targetHeight={size}
        video={undefined}
        videoFit="cover"
        mirror={false}
        userId={person.userId}
        videoEnabled={false}
        unencryptedWarning={false}
        encryptionStatus={"Okay" as never}
        displayName={person.name}
        mxcAvatarUrl={undefined}
        focusable
        orisoIdentity={person.identity}
        orisoShape={shape}
        orisoParentUrl={null}
        primaryButton={
          <button
            aria-label={`Optionen für ${person.name}`}
            data-state={openFirst && index === 0 ? "open" : "closed"}
          >
            ⋯
          </button>
        }
        style={{ inlineSize: "100%", blockSize: "100%" }}
      />
    </div>
  );
}

function Plate({
  caption,
  width,
  height,
  children,
}: {
  caption: string;
  width: number;
  height: number;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="plate" data-shot={caption} style={{ width, height }}>
      <span className="caption">{caption}</span>
      {children}
    </div>
  );
}

function Hain({ box }: { box: number }): React.ReactNode {
  const names = CAST.map((p) => p.name);
  return packShapes(
    names,
    box,
    names.map(() => 1),
  ).map((spot, i) => (
    <Tile
      key={i}
      index={i}
      x={spot.x}
      y={spot.y}
      size={spot.size}
      shape={{ radius: spot.blob, tilt: Number(spot.tilt) }}
    />
  ));
}

function Kreis({ side }: { side: number }): React.ReactNode {
  const plan = kreisPlan(CAST.length, { width: side, height: side });
  return plan.seats.map((spot, i) => {
    const shape = ownShape(CAST[i].name);
    return (
      <Tile
        key={i}
        index={i}
        x={spot.x}
        y={spot.y}
        size={spot.size}
        shape={{ radius: shape.blob, tilt: Number(shape.tilt) }}
      />
    );
  });
}

function Felder({ cell }: { cell: number }): React.ReactNode {
  return CAST.slice(0, 4).map((_, i) => (
    <Tile
      key={i}
      index={i}
      x={(i % 2) * (cell + 8) + 8}
      y={Math.floor(i / 2) * (cell + 8) + 32}
      size={cell}
      shape={{ radius: FIELD_RADIUS, tilt: 0, body: false }}
    />
  ));
}

/** Round forms as in the 1:1 rail of Frank's screenshot: shapeless circles. */
function Round({ size }: { size: number }): React.ReactNode {
  return CAST.slice(0, 2).map((_, i) => (
    <Tile
      key={i}
      index={i}
      x={16}
      y={32 + i * (size + 12)}
      size={size}
      shape={undefined}
    />
  ));
}

function App(): React.ReactNode {
  const narrow = window.innerWidth < 600;
  const box = narrow ? 340 : 420;
  return (
    <OrisoStageContext
      value={{
        enabled: true,
        parentUrl: null,
        identities: new Map(CAST.map((p) => [p.userId, p.identity])),
      }}
    >
      <div className="plates">
        <Plate caption={`Hain · ${scheme}`} width={box} height={box}>
          <Hain box={box} />
        </Plate>
        <Plate caption={`Kreis · ${scheme}`} width={box} height={box}>
          <Kreis side={box} />
        </Plate>
        <Plate caption={`Felder · ${scheme}`} width={box} height={box}>
          <Felder cell={Math.floor((box - 24) / 2)} />
        </Plate>
        <Plate caption={`Rund · ${scheme}`} width={220} height={box}>
          <Round size={180} />
        </Plate>
      </div>
    </OrisoStageContext>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
