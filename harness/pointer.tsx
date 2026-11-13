/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The laser pointer, end to end in one page: three people in a call, one of
 * them (Cyrus) sharing a 16:9 slide. Each pane is the REAL `SpotlightTile`
 * as that person's call draws the shared screen, at a different size —
 * a wide band (the grove), a 4:3 box (the spotlight) and a phone in portrait
 * — and each has its own REAL `PointerChannel`.
 *
 * What stands in: the SFU. A tiny in-memory bus delivers each channel's
 * `publishData` to the others' `DataReceived`, marked GCM-encrypted as the
 * real rooms do under `encryption`. Everything from the mouse event to the
 * dot — geometry, throttle, wire format, decoding, colour, name, fade — is
 * the production code.
 *
 *   ?demo=1   points automatically (Anna and Ben) instead of waiting for
 *             the mouse, for screenshots
 */
import { StrictMode, useEffect, useMemo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@vector-im/compound-web";
import {
  Encryption_Type as EncryptionType,
  type Room as LivekitRoom,
  RoomEvent,
  Track,
} from "livekit-client";
import { EventEmitter } from "events";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import {
  EncryptionStatus,
  ScreenShareViewModel,
  type RemoteUserMediaViewModel,
} from "../src/state/MediaViewModel";
import { SpotlightTileViewModel } from "../src/state/TileViewModel";
import { constant } from "../src/state/Behavior";
import { SpotlightTile } from "../src/tile/SpotlightTile";
import { type OrisoIdentity } from "../src/oriso/identity";
import { OrisoStageContext } from "../src/oriso/useOrisoIdentities";
import { PointerChannel } from "../src/oriso/pointer/PointerChannel";
import { CallMenuPanel } from "../src/oriso/OrisoToolbar";
import { ReactionsSenderProvider } from "../src/reactions/useReactionsSender";
import { type CallViewModel } from "../src/state/CallViewModel/CallViewModel";
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

const demo = new URLSearchParams(window.location.search).get("demo") === "1";

interface Person {
  userId: string;
  identity: string;
  name: string;
  oriso: OrisoIdentity;
}

const PEOPLE: Person[] = [
  ["@cyrus:oriso.test", "Beratung · Frau Keller", "#EAD9C2", "#4D4000"],
  ["@anna:oriso.test", "ruhiger Fuchs 432", "#165E83", "#FFFFFF"],
  ["@ben:oriso.test", "klare Biene 641", "#A22041", "#FFFFFF"],
].map(([userId, name, bg, ink]) => ({
  userId,
  identity: `${userId}:HARNESS`,
  name,
  oriso: { kind: "initials", bg, ink, name },
}));
const [CYRUS, ANNA, BEN] = PEOPLE;

/* ---------------------------------------------------------------- the SFU */

type FakeRoom = LivekitRoom & EventEmitter;
const rooms = new Map<string, FakeRoom>();
for (const p of PEOPLE) {
  const room = new EventEmitter() as FakeRoom;
  Object.assign(room, {
    // As a real room reports it once the call's keys are in place.
    isE2EEEnabled: true,
    localParticipant: {
      identity: p.identity,
      publishData: async (
        payload: Uint8Array,
        opts: { topic?: string },
      ): Promise<void> => {
        for (const [identity, other] of rooms) {
          if (identity === p.identity) continue;
          other.emit(
            RoomEvent.DataReceived,
            payload,
            { identity: p.identity, isLocal: false },
            undefined,
            opts.topic,
            EncryptionType.GCM,
          );
        }
        return Promise.resolve();
      },
    },
  });
  rooms.set(p.identity, room);
}

/* ----------------------------------------------------------- the picture */

/** The shared screen: a slide, 16:9. */
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
    ctx.font = "400 30px Inter, sans-serif";
    [
      "Einnahmen",
      "Miete",
      "Strom & Heizung",
      "Lebensmittel",
      "Rücklagen",
    ].forEach((row, i) => {
      ctx.fillStyle = "#2d2c28";
      ctx.fillText(row, 72, 190 + i * 96);
      ctx.fillStyle = ["#62937A", "#E9C3C0", "#E2C46B", "#C8D7E6", "#5E8C6A"][
        i
      ];
      ctx.fillRect(480, 160 + i * 96, 220 + ((i * 173) % 480), 44);
    });
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  return canvas.captureStream(15);
}

const stream = screenStream();

/** Just enough of a LiveKit track reference for `VideoTrack`. */
function trackRef(
  identity: string,
): RemoteUserMediaViewModel["video$"]["value"] {
  const source = Track.Source.ScreenShare;
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
    trackSid: "TR_share",
    source,
    kind: "video",
    isMuted: false,
    isSubscribed: true,
    track,
    dimensions: { width: 1280, height: 720 },
  };
  const participant = {
    sid: "PA_share",
    identity,
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

function shareTile(local: boolean): SpotlightTileViewModel {
  const vm = Object.create(ScreenShareViewModel.prototype) as object;
  const fields: Record<string, unknown> = {
    id: "share",
    userId: CYRUS.userId,
    local,
    video$: constant(trackRef(CYRUS.identity)),
    videoEnabled$: constant(true),
    unencryptedWarning$: constant(false),
    encryptionStatus$: constant(EncryptionStatus.Okay),
    focusUrl$: constant(undefined),
    displayName$: constant(CYRUS.name),
    mxcAvatarUrl$: constant(undefined),
  };
  for (const [k, v] of Object.entries(fields))
    Object.defineProperty(vm, k, { value: v, enumerable: true });
  return new SpotlightTileViewModel(
    constant([vm as ScreenShareViewModel]),
    constant(false),
  );
}

/* ------------------------------------------------------------ the panes */

const rtcSession = {
  room: {
    roomId: "!pointer:oriso.test",
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

const identities = new Map(PEOPLE.map((p) => [p.userId, p.oriso]));
const nameOf = (userId: string): string =>
  PEOPLE.find((p) => p.userId === userId)?.name ?? userId;

const channels = new Map(
  PEOPLE.map((p) => {
    const ch = new PointerChannel({ encrypted: true });
    const room = rooms.get(p.identity)!;
    ch.setRooms(room, [room]);
    return [p.identity, ch];
  }),
);

function Pane({
  who,
  width,
  height,
  title,
}: {
  who: Person;
  width: number;
  height: number;
  title: string;
}): ReactNode {
  const local = who === CYRUS;
  const vm = useMemo(() => shareTile(local), [local]);
  const stage = useMemo(
    () => ({
      identities,
      parentUrl: null,
      enabled: true,
      rectangular: true,
      pointer: {
        channel: channels.get(who.identity)!,
        pointing: !local,
        displayNameOf: nameOf,
      },
    }),
    [who, local],
  );
  return (
    <figure style={{ margin: 0 }} data-testid={`pane-${who.userId}`}>
      <figcaption
        style={{ font: "500 13px/1.4 Inter, sans-serif", opacity: 0.8 }}
      >
        {title}
      </figcaption>
      <div style={{ position: "relative", width, height, marginTop: 6 }}>
        <OrisoStageContext value={stage}>
          <SpotlightTile
            vm={vm}
            expanded={false}
            onToggleExpanded={null}
            targetWidth={width}
            targetHeight={height}
            showIndicators={false}
            focusable
            style={{ position: "absolute", inset: 0, width, height }}
          />
        </OrisoStageContext>
      </div>
    </figure>
  );
}

/** Anna and Ben trace a path over the slide, through the real channels. */
function useDemo(): void {
  useEffect(() => {
    if (!demo) return;
    const share = CYRUS.identity;
    const anna = channels.get(ANNA.identity)!;
    const ben = channels.get(BEN.identity)!;
    let t = 0;
    const id = setInterval(() => {
      t += 1;
      const k = Math.min(t / 40, 1);
      // Anna on "Miete"'s bar, Ben on "Rücklagen"'s bar.
      anna.point(share, { x: 0.3 + 0.25 * k, y: 0.36 });
      ben.point(share, { x: 0.75 - 0.05 * k, y: 0.88 });
      // Then they hold still and keep pointing, so the dots stay lit.
    }, 60);
    return (): void => clearInterval(id);
  }, []);
}

function Page(): ReactNode {
  useDemo();
  return (
    <ReactionsSenderProvider rtcSession={rtcSession} vm={callVm}>
      <div
        className="cpd-theme-dark"
        style={{
          padding: 24,
          minHeight: "100vh",
          boxSizing: "border-box",
          background: "#2d2c28",
          color: "#fff",
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          alignItems: "flex-start",
        }}
      >
        <Pane
          who={ANNA}
          width={760}
          height={300}
          title="Anna sieht — Laserpointer an (Band wie in der Grove)"
        />
        <Pane
          who={BEN}
          width={480}
          height={360}
          title="Ben sieht — Laserpointer an (Spotlight 4:3)"
        />
        <Pane
          who={CYRUS}
          width={300}
          height={520}
          title="Frau Keller (teilt) sieht in der Vorschau (Handy hochkant)"
        />
        <figure style={{ margin: 0 }} data-testid="menu">
          <figcaption
            style={{ font: "500 13px/1.4 Inter, sans-serif", opacity: 0.8 }}
          >
            Das ⋮-Menü, solange jemand anderes teilt
          </figcaption>
          <div style={{ position: "relative", width: 304, height: 470 }}>
            <div style={{ position: "absolute", inset: "auto 0 0 auto" }}>
              <CallMenuPanel
                id="harness-menu"
                onClose={() => {}}
                participantCount={3}
                onToggleNotes={() => {}}
                onHangup={() => {}}
                onToggleScreenShare={() => {}}
                sharingScreen={false}
                onOpenSoundSettings={() => {}}
                onOpenSettings={null}
                pointing
                onPointingChange={() => {}}
                className={undefined}
              />
            </div>
          </div>
        </figure>
      </div>
    </ReactionsSenderProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  </StrictMode>,
);
