/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The two-person call, whole: the real `Grid` with the real
 * `EinzelgespraechLayout`, real `MediaView` tiles in the shape store, the
 * call's own stylesheet and the real control bar — at the viewport's size.
 *
 * `orisoStage.tsx` draws the forms directly and cannot show where a name or
 * a toolbar lands, which is what the one-to-one design is about. There is
 * still no LiveKit and no Matrix: who speaks comes from the URL.
 *
 *   ?speaking=none|first|second   who holds the floor
 *   ?muted=first|second           show that person's microphone as off
 *   ?waiting=<n>                  people knocking, with the Anklopfen switch (#108)
 */
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BehaviorSubject } from "rxjs";
import { animated } from "@react-spring/web";
import { TooltipProvider } from "@vector-im/compound-web";
import {
  MicOffSolidIcon,
  MicOnSolidIcon,
  OverflowVerticalIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { Grid, type TileProps } from "../src/grid/Grid";
import { makeEinzelgespraechLayout } from "../src/grid/EinzelgespraechLayout";
import {
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../src/grid/CallLayout";
import { type OneOnOneLayout } from "../src/state/layout-types";
import { MediaView } from "../src/tile/MediaView";
import { EncryptionStatus } from "../src/state/MediaViewModel";
import {
  OrisoShapeStore,
  OrisoShapesContext,
  useOrisoShape,
} from "../src/oriso/useOrisoShape";
import { Atmosphere } from "../src/oriso/Atmosphere";
import { OrisoToolbar } from "../src/oriso/OrisoToolbar";
import { type OrisoIdentity } from "../src/oriso/identity";
import styles from "../src/room/InCallView.module.css";
import de from "../locales/de/app.json";
import en from "../locales/en/app.json";
import "../src/index.css";
import "../src/oriso-theme.css";

// German, as the call runs for ORISO's people; English where a key is missing.
void i18n.use(initReactI18next).init({
  lng: new URLSearchParams(window.location.search).get("lang") ?? "de",
  fallbackLng: "en",
  defaultNS: "app",
  keySeparator: ".",
  nsSeparator: false,
  resources: { de: { app: de }, en: { app: en } },
  interpolation: { escapeValue: false },
});

const params = new URLSearchParams(window.location.search);
const speaking = params.get("speaking") ?? "first";
const muted = params.get("muted");
const waiting = params.get("waiting");

const PEOPLE: Record<string, { name: string; identity: OrisoIdentity }> = {
  remote: {
    name: "ruhiger Fuchs 432",
    identity: {
      kind: "animal",
      file: "fox.svg",
      bg: "#62937A",
      ink: "#FBF4D3",
    },
  },
  local: {
    name: "Beraterin · Frau Keller",
    identity: {
      kind: "animal",
      file: "hedgehog.svg",
      bg: "#EAD9C2",
      ink: "#4D4000",
    },
  },
};

const seat = (
  id: string,
  talking: boolean,
): {
  id: string;
  media$: BehaviorSubject<{ id: string; speaking$: BehaviorSubject<boolean> }>;
} => ({
  id,
  media$: new BehaviorSubject({ id, speaking$: new BehaviorSubject(talking) }),
});

const model = {
  type: "one-on-one",
  remote: seat("remote", speaking === "first"),
  local: seat("local", speaking === "second"),
} as unknown as OneOnOneLayout;

function Tile({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  model: tile,
}: TileProps<{ id: string }, HTMLDivElement>): React.ReactNode {
  const person = PEOPLE[tile.id];
  const shape = useOrisoShape(tile.id);
  const off = muted === (tile.id === "remote" ? "first" : "second");
  const Mic = off ? MicOffSolidIcon : MicOnSolidIcon;
  return (
    <MediaView
      ref={ref}
      className={classNames(className, styles.tile)}
      style={style}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      video={undefined}
      videoFit="cover"
      mirror={false}
      userId={`@${tile.id}:oriso.test`}
      videoEnabled={false}
      unencryptedWarning={false}
      encryptionStatus={EncryptionStatus.Okay}
      nameTagLeadingIcon={
        <Mic width={20} height={20} aria-hidden data-muted={off} />
      }
      displayName={person.name}
      mxcAvatarUrl={undefined}
      focusable
      primaryButton={
        <button aria-label="Optionen">
          <OverflowVerticalIcon aria-hidden width={20} height={20} />
        </button>
      }
      orisoIdentity={person.identity}
      orisoShape={shape}
      orisoSpeaking={
        (tile.id === "remote" && speaking === "first") ||
        (tile.id === "local" && speaking === "second")
      }
      orisoParentUrl={window.location.origin}
    />
  );
}

function Footer(): React.ReactNode {
  const [audioMuted, setAudioMuted] = useState(muted === "second");
  const [videoMuted, setVideoMuted] = useState(true);
  const [hand, setHand] = useState(false);
  const [knock, setKnock] = useState(true);
  return (
    <OrisoToolbar
      waitingCount={Number(waiting ?? 0)}
      knock={waiting === null ? null : knock}
      onKnockChange={waiting === null ? null : setKnock}
      className={styles.orisoToolbar}
      audioMuted={audioMuted}
      onToggleAudio={() => setAudioMuted((m) => !m)}
      videoMuted={videoMuted}
      onToggleVideo={() => setVideoMuted((m) => !m)}
      handRaised={hand}
      onToggleHand={() => setHand((h) => !h)}
      onToggleNotes={() => {}}
      onHangup={() => {}}
      participantCount={2}
      view="einzelgespraech"
      offer={["einzelgespraech", "spotlight"]}
      onViewChange={() => {}}
      onToggleScreenShare={() => {}}
      sharingScreen={false}
      onOpenSoundSettings={() => {}}
      onOpenSettings={() => {}}
    />
  );
}

/** What `InCallView` subtracts for its footer before handing on the stage. */
const FOOTER_BLOCK = 144;

function Call(): React.ReactNode {
  const shapes = useMemo(() => new OrisoShapeStore(), []);
  const bounds$ = useMemo(
    () =>
      new BehaviorSubject({
        width: window.innerWidth,
        height: window.innerHeight - FOOTER_BLOCK,
      }),
    [],
  );
  const layout = useMemo(
    () =>
      makeEinzelgespraechLayout({
        minBounds$: bounds$,
        spotlightAlignment$: new BehaviorSubject(defaultSpotlightAlignment),
        pipAlignment$: new BehaviorSubject(defaultPipAlignment),
      }),
    [bounds$],
  );
  return (
    <OrisoShapesContext value={shapes}>
      <div className={styles.inRoom} data-oriso="true">
        <div className={styles.orisoBackdrop} aria-hidden="true">
          <Atmosphere palette="duene" />
        </div>
        <Grid
          className={styles.scrollingGrid}
          model={model}
          Layout={layout.scrolling}
          Tile={Tile as never}
        />
        <div className={classNames(styles.footer, styles.orisoFooter)}>
          <Footer />
        </div>
      </div>
    </OrisoShapesContext>
  );
}

// `animated` is imported so the spring host is registered before Grid.
void animated;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <div className="cpd-theme-dark" style={{ height: "100vh" }}>
        <Call />
      </div>
    </TooltipProvider>
  </StrictMode>,
);
