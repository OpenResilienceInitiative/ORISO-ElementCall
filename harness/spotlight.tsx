/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The spotlight, whole: the real `Grid` with upstream's real spotlight
 * layouts, the real `SpotlightTile` for the big form and the real `GridTile`
 * for the rail — as `InCallView` renders them when "Spotlight" is chosen.
 *
 * `buehne.html?view=spotlight` only draws the fallback arrangement, so it
 * could not show what #2233 is about. What this is NOT: a running call. The
 * view models are stand-ins carrying constant behaviours, and the cameras and
 * the shared screen are canvas captures rather than LiveKit tracks.
 *
 *   ?people=<n>          how many people are in the call (default 3)
 *   ?call=audio|video    video: everybody but the third person has a camera
 *   ?share=1             the first person shares their screen
 *   ?speaking=<i>        who holds the floor (default 0)
 *
 *   ?pip=1               the minimised call: the one form, maximised, with
 *                        the speaker band above it (R27), as InCallView
 *                        renders `layout.type === "pip"`
 *
 * The layout follows the window as `CallViewModel` does: at most 600px wide
 * is the portrait spotlight, anything wider the landscape one.
 */
import { StrictMode, useEffect, useMemo } from "react";
import useMeasure from "react-use-measure";
import { createRoot } from "react-dom/client";
import { BehaviorSubject, of } from "rxjs";
import { animated } from "@react-spring/web";
import { TooltipProvider } from "@vector-im/compound-web";
import { Track } from "livekit-client";
import classNames from "classnames";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { Grid, type TileProps } from "../src/grid/Grid";
import { makeSpotlightLandscapeLayout } from "../src/grid/SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "../src/grid/SpotlightPortraitLayout";
import {
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../src/grid/CallLayout";
import { type SpotlightLandscapeLayout } from "../src/state/layout-types";
import {
  EncryptionStatus,
  type MediaViewModel,
  RemoteUserMediaViewModel,
  ScreenShareViewModel,
} from "../src/state/MediaViewModel";
import {
  GridTileViewModel,
  SpotlightTileViewModel,
} from "../src/state/TileViewModel";
import { constant } from "../src/state/Behavior";
import { GridTile } from "../src/tile/GridTile";
import { SpotlightTile } from "../src/tile/SpotlightTile";
import {
  OrisoShapeStore,
  OrisoShapesContext,
} from "../src/oriso/useOrisoShape";
import { Atmosphere } from "../src/oriso/Atmosphere";
import { type OrisoIdentity } from "../src/oriso/identity";
import { rectangularStage } from "../src/oriso/shape";
import { OrisoStageContext } from "../src/oriso/useOrisoIdentities";
import { ReactionsSenderProvider } from "../src/reactions/useReactionsSender";
import { type CallViewModel } from "../src/state/CallViewModel/CallViewModel";
import styles from "../src/room/InCallView.module.css";
import { WaveBand } from "../src/oriso/WaveBand";
import { PIP_BAND_BLOCK } from "../src/oriso/speakerBand";
import de from "../locales/de/app.json";
import en from "../locales/en/app.json";
import "../src/index.css";

void i18n.use(initReactI18next).init({
  lng: "de",
  fallbackLng: "en",
  defaultNS: "app",
  keySeparator: ".",
  nsSeparator: false,
  resources: { de: { app: de }, en: { app: en } },
  interpolation: { escapeValue: false },
});

const params = new URLSearchParams(window.location.search);
const count = Math.max(1, Number(params.get("people") ?? 3));
const video = params.get("call") === "video";
const share = params.get("share") === "1";
const speakingIndex = Number(params.get("speaking") ?? 0);
const portrait = window.innerWidth <= 600;
const pip = params.get("pip") === "1";

const CAST: { name: string; identity: OrisoIdentity }[] = [
  ["ruhiger Fuchs 432", "fox.svg", "#62937A", "#FBF4D3"],
  ["Beratung · Frau Keller", "hedgehog.svg", "#EAD9C2", "#4D4000"],
  ["naher Otter 303", "otter.svg", "#E9C3C0", "#410001"],
  ["helle Eule 118", "owl.svg", "#5E8C6A", "#FBF4D3"],
  ["klare Biene 641", "bee.svg", "#E2C46B", "#4D4000"],
  ["warmer Hase 962", "hare.svg", "#C8D7E6", "#233B63"],
].map(([name, file, bg, ink]) => ({
  name,
  identity: { kind: "animal", file, bg, ink, name },
}));

/** A moving picture standing in for a camera: the person's colour, a head. */
function cameraStream(bg: string, seed: number): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d")!;
  const paint = (t: number): void => {
    const g = ctx.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, "#3b4250");
    g.addColorStop(1, bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);
    const sway = Math.sin(t / 900 + seed) * 12;
    ctx.fillStyle = "#e8c9a8";
    ctx.beginPath();
    ctx.arc(320 + sway, 200, 86, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f3a4a";
    ctx.beginPath();
    ctx.ellipse(320 + sway, 470, 190, 150, 0, Math.PI, 0);
    ctx.fill();
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  return canvas.captureStream(30);
}

/** A shared screen: a slide, 16:9. */
function screenStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  const paint = (): void => {
    ctx.fillStyle = "#fbfaf8";
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = "#a5000a";
    ctx.fillRect(0, 0, 1280, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 44px Inter, sans-serif";
    ctx.fillText("Haushaltsplan – Übersicht", 56, 64);
    ctx.fillStyle = "#2d2c28";
    ctx.font = "400 30px Inter, sans-serif";
    [
      "Einnahmen",
      "Miete",
      "Strom & Heizung",
      "Lebensmittel",
      "Rücklagen",
    ].forEach((row, i) => {
      ctx.fillText(row, 72, 190 + i * 96);
      ctx.fillStyle = ["#62937A", "#E9C3C0", "#E2C46B", "#C8D7E6", "#5E8C6A"][
        i
      ];
      ctx.fillRect(480, 160 + i * 96, 220 + ((i * 173) % 480), 44);
      ctx.fillStyle = "#2d2c28";
    });
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  return canvas.captureStream(15);
}

/**
 * Just enough of a LiveKit track reference for `VideoTrack`: it reads the
 * publication, listens to the participant and attaches the track.
 */
function trackRef(
  id: string,
  stream: MediaStream,
  source: Track.Source,
): RemoteUserMediaViewModel["video$"]["value"] {
  const track = {
    kind: "video",
    source,
    attach(el: HTMLMediaElement): HTMLMediaElement {
      el.srcObject = stream;
      void el.play().catch(() => {});
      return el;
    },
    detach(el: HTMLMediaElement): HTMLMediaElement {
      el.srcObject = null;
      return el;
    },
  };
  const publication = {
    trackSid: `TR_${id}_${source}`,
    source,
    kind: "video",
    isMuted: false,
    isSubscribed: true,
    track,
    dimensions:
      source === Track.Source.ScreenShare
        ? { width: 1280, height: 720 }
        : { width: 640, height: 480 },
  };
  const participant = {
    sid: `PA_${id}`,
    identity: id,
    isLocal: false,
    on(): unknown {
      return participant;
    },
    off(): unknown {
      return participant;
    },
    getTrackPublication: (): unknown => publication,
  };
  return {
    participant,
    publication,
    source,
  } as unknown as RemoteUserMediaViewModel["video$"]["value"];
}

/** A view model with the real class's prototype, so `instanceof` holds. */
function fake<T extends object>(
  prototype: T,
  fields: Record<string, unknown>,
): T {
  const vm = Object.create(prototype) as T;
  for (const [key, value] of Object.entries(fields))
    Object.defineProperty(vm, key, { value, enumerable: true });
  return vm;
}

function person(i: number): RemoteUserMediaViewModel {
  const { name } = CAST[i % CAST.length];
  const id = `person-${i}`;
  const camera = video && i !== 2;
  return fake(RemoteUserMediaViewModel.prototype, {
    id,
    userId: `@${id}:oriso.test`,
    local: false,
    video$: constant(
      camera
        ? trackRef(
            id,
            cameraStream(CAST[i % CAST.length].identity.bg, i),
            Track.Source.Camera,
          )
        : undefined,
    ),
    videoEnabled$: constant(camera),
    unencryptedWarning$: constant(false),
    encryptionStatus$: constant(EncryptionStatus.Okay),
    focusUrl$: constant(undefined),
    displayName$: constant(name),
    mxcAvatarUrl$: constant(undefined),
    speaking$: constant(i === speakingIndex),
    audioEnabled$: constant(i !== 3),
    cropVideo$: constant(true),
    handRaised$: constant(null),
    reaction$: constant(null),
    audioStreamStats$: of(undefined),
    videoStreamStats$: of(undefined),
    waitingForMedia$: constant(false),
    localVolume$: constant(1),
    locallyMuted$: constant(false),
    toggleFitContain: () => {},
    toggleLocallyMuted: () => {},
    setLocalVolume: () => {},
    commitLocalVolume: () => {},
  });
}

const people = Array.from({ length: count }, (_, i) => person(i));

const sharedScreen = fake(ScreenShareViewModel.prototype, {
  id: "share-0",
  userId: people[0].userId,
  local: false,
  video$: constant(
    trackRef("person-0", screenStream(), Track.Source.ScreenShare),
  ),
  videoEnabled$: constant(true),
  unencryptedWarning$: constant(false),
  encryptionStatus$: constant(EncryptionStatus.Okay),
  focusUrl$: constant(undefined),
  displayName$: constant(CAST[0].name),
  mxcAvatarUrl$: constant(undefined),
});

/*
 * Who is where, as `CallViewModel` arranges the spotlight: the shared screen
 * when there is one, else whoever speaks; everybody else in the rail.
 */
const speaker = people[speakingIndex] ?? people[0];
const spotlightMedia: MediaViewModel[] = share ? [sharedScreen] : [speaker];
const rail = share ? people : people.filter((p) => p !== speaker);

const model = {
  type: portrait ? "spotlight-portrait" : "spotlight-landscape",
  spotlight: new SpotlightTileViewModel(
    constant(spotlightMedia),
    constant(false),
  ),
  grid: rail.map((p) => new GridTileViewModel(constant(p))),
  setVisibleTiles: () => {},
  // The portrait model is the same object with another `type`; one type
  // keeps `Grid` from having to be told about the union.
} as unknown as SpotlightLandscapeLayout;

function Tile({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  model: tile,
}: TileProps<
  GridTileViewModel | SpotlightTileViewModel,
  HTMLDivElement
>): React.ReactNode {
  return tile instanceof GridTileViewModel ? (
    <GridTile
      ref={ref}
      vm={tile}
      onOpenProfile={null}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      className={classNames(className, styles.tile)}
      style={style}
      showSpeakingIndicators
      focusable
    />
  ) : (
    <SpotlightTile
      ref={ref}
      vm={tile}
      expanded={false}
      onToggleExpanded={null}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      showIndicators={false}
      focusable
      className={classNames(className, styles.tile)}
      style={style}
    />
  );
}

const shapes = new OrisoShapeStore();

/** Enough of a session for the hand-raise provider the tiles ask for. */
const rtcSession = {
  room: {
    roomId: "!spotlight:oriso.test",
    client: {
      getUserId: (): string => "@me:oriso.test",
      getDeviceId: (): string => "HARNESS",
    },
  },
  memberships: [],
  on(): unknown {
    return rtcSession;
  },
  off(): unknown {
    return rtcSession;
  },
} as unknown as MatrixRTCSession;
const callVm = {
  reactions$: constant({}),
  handsRaised$: constant({}),
} as unknown as CallViewModel;

const HEADER_BLOCK = 72;
const FOOTER_BLOCK = 96;

function Call(): React.ReactNode {
  const [measure, { width }] = useMeasure();
  const height = window.innerHeight - HEADER_BLOCK - FOOTER_BLOCK;
  const bounds$ = useMemo(
    () => new BehaviorSubject({ width, height }),
    // Created once; the effect below moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => bounds$.next({ width, height }), [bounds$, width, height]);
  const layout = useMemo(() => {
    const inputs = {
      minBounds$: bounds$,
      spotlightAlignment$: new BehaviorSubject(defaultSpotlightAlignment),
      pipAlignment$: new BehaviorSubject(defaultPipAlignment),
    };
    return portrait
      ? (makeSpotlightPortraitLayout(inputs) as unknown as ReturnType<
          typeof makeSpotlightLandscapeLayout
        >)
      : makeSpotlightLandscapeLayout(inputs);
  }, [bounds$]);
  const stage = useMemo(
    () => ({
      identities: new Map(
        people.map((p, i) => [p.userId, CAST[i % CAST.length].identity]),
      ),
      parentUrl: window.location.origin,
      enabled: true,
      audioOnly: !video,
      // As InCallView decides it, from the layout's type; the
      // minimised call is "pip", which is not rectangular.
      rectangular: rectangularStage(pip ? "pip" : model.type, false),
    }),
    [],
  );
  return (
    <OrisoStageContext value={stage}>
      <OrisoShapesContext value={shapes}>
        <ReactionsSenderProvider rtcSession={rtcSession} vm={callVm}>
          <div ref={measure} className={styles.inRoom} data-oriso="true">
            <div className={styles.orisoBackdrop} aria-hidden="true">
              <Atmosphere palette="duene" />
            </div>
            {pip ? (
              <>
                <WaveBand
                  variant="pip"
                  speaker={{
                    userId: speaker.userId,
                    displayName: CAST[speakingIndex % CAST.length].name,
                  }}
                />
                <SpotlightTile
                  className={classNames(styles.tile, styles.maximised)}
                  vm={model.spotlight}
                  expanded
                  onToggleExpanded={null}
                  targetWidth={window.innerHeight - PIP_BAND_BLOCK}
                  targetHeight={window.innerWidth}
                  showIndicators={false}
                  focusable
                />
              </>
            ) : (
              <>
                <Grid
                  className={styles.scrollingGrid}
                  style={{
                    marginBlockStart: HEADER_BLOCK,
                    marginBlockEnd: FOOTER_BLOCK,
                  }}
                  model={model}
                  Layout={layout.scrolling}
                  Tile={Tile as never}
                />
                <Grid
                  className={styles.fixedGrid}
                  style={{ insetBlockStart: HEADER_BLOCK, height }}
                  model={model}
                  Layout={layout.fixed}
                  Tile={Tile as never}
                />
              </>
            )}
          </div>
        </ReactionsSenderProvider>
      </OrisoShapesContext>
    </OrisoStageContext>
  );
}

// `animated` is imported so the spring host is registered before Grid.
void animated;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <div className="cpd-theme-light" style={{ height: "100vh" }}>
        <Call />
      </div>
    </TooltipProvider>
  </StrictMode>,
);
