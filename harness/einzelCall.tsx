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
 *   ?notes=sheet|docked           open "Meine Gesprächsnotiz" (#112) in the
 *                                 view (2b) or docked beside the stage (2a)
 *   ?waiting=<n>                  people knocking, with the Anklopfen switch (#108)
 *   ?call=audio|video             audio: no camera in the bar (2b); video: the
 *                                 dark stage with screen sharing in the bar (5a)
 *   ?header=1                     the ORISO header (title, chip, duration)
 *   ?chrome=call|host             call: the header's own window buttons;
 *                                 host: the host's four corner buttons drawn
 *                                 over the iframe, as ORISO-Frontend does
 *   ?names=login|bare             the homeserver holds the login name; with
 *                                 "bare" nobody published a name either
 *   ?artwork=none                 the animal drawings never arrive
 *   ?mobile=1                     the phone's full screen (S9, 5d): compact
 *                                 header with ⋮, short bar; in video my own
 *                                 picture top right
 */
import {
  type CSSProperties,
  StrictMode,
  useEffect,
  useMemo,
  useState,
} from "react";
import useMeasure from "react-use-measure";
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
import { initReactI18next, useTranslation } from "react-i18next";

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
import { OrisoMobileMenu, OrisoToolbar } from "../src/oriso/OrisoToolbar";
import { OrisoNotes } from "../src/oriso/OrisoNotes";
import { Toast } from "../src/Toast";
import { type OrisoIdentity, shownNameFor } from "../src/oriso/identity";
import { OrisoHeader } from "../src/oriso/OrisoHeader";
import { readTopic, stageTitle } from "../src/oriso/stageTitle";
import { formatCallDuration } from "../src/oriso/useCallDuration";
import { OrisoStageContext } from "../src/oriso/useOrisoIdentities";
import { makeOneOnOneLayout } from "../src/grid/OneOnOneLayout";
import styles from "../src/room/InCallView.module.css";
import de from "../locales/de/app.json";
import en from "../locales/en/app.json";
import "../src/index.css";
// oriso-theme.css comes with index.css, inside layer(compound.custom) as in
// the app; imported again here unlayered it would outrank the brand tag.
import { getUrlParams } from "../src/UrlParams";
import { applyBrandTheme } from "../src/oriso/theme/applyBrandTheme";

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
// As main.tsx does: the Träger's colours and logo from the call address
// (`orisoPrimary`, `orisoAccent`, `orisoSignal`, `orisoLogo`, read from the
// hash like the real call).
// Applied on load: the Vite dev server injects each CSS import as a <style>
// after the last one it inserted, which would land the default theme after
// the brand tag. The built call loads its CSS as <link>s in <head> first.
const brand = getUrlParams();
window.addEventListener("load", () => applyBrandTheme(brand));
const speaking = params.get("speaking") ?? "first";
const muted = params.get("muted");
const waiting = params.get("waiting");
const callKind = params.get("call");
const video = callKind === "video";
const showHeader = params.get("header") === "1";
const chrome = params.get("chrome");
const names = params.get("names");
const noArtwork = params.get("artwork") === "none";
const mobile = params.get("mobile") === "1";
/** `?shareFailed=system|blocked|failed`: the notice a failed share shows. */
const shareFailed = params.get("shareFailed");

const PEOPLE: Record<
  string,
  { name: string; login: string; identity: OrisoIdentity }
> = {
  remote: {
    name: "ruhiger Fuchs 432",
    login: "hugo.simpson_at_trail.ist",
    identity: {
      kind: "animal",
      file: "fox.svg",
      bg: "#62937A",
      ink: "#FBF4D3",
      name: "ruhiger Fuchs 432",
    },
  },
  local: {
    name: "Beratung · Frau Keller",
    login: "krusty.clown_at_openresilience.cc",
    identity: {
      kind: "animal",
      file: "hedgehog.svg",
      bg: "#EAD9C2",
      ink: "#4D4000",
      name: "Beratung · Frau Keller",
    },
  },
};

/** What the tile is given, as `GridTile` would resolve it. */
function resolved(id: string): { name: string; identity: OrisoIdentity } {
  const person = PEOPLE[id];
  const identity: OrisoIdentity = {
    ...person.identity,
    ...(noArtwork ? { file: "not-deployed.svg" } : {}),
    ...(names === "bare" ? { name: undefined } : {}),
  };
  if (names === null) return { name: person.name, identity };
  const userId = `@${person.login}:oriso.test`;
  return {
    name: shownNameFor(person.login, identity, userId, "Teilnehmende Person"),
    identity,
  };
}

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
  const person = resolved(tile.id);
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

const notesParam = new URLSearchParams(window.location.search).get("notes");
const notesLayout = notesParam === "docked" ? "docked" : "sheet";
const startedAt = Date.now();

function Footer({
  notesOpen,
  onToggleNotes,
}: {
  notesOpen: boolean;
  onToggleNotes: () => void;
}): React.ReactNode {
  const [audioMuted, setAudioMuted] = useState(muted === "second");
  const [videoMuted, setVideoMuted] = useState(true);
  const [hand, setHand] = useState(false);
  const [knock, setKnock] = useState(true);
  return (
    <OrisoToolbar
      compact={mobile}
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
      onToggleNotes={onToggleNotes}
      notesOpen={notesOpen}
      onHangup={() => {}}
      participantCount={2}
      onToggleScreenShare={() => {}}
      sharingScreen={false}
      showVideo={callKind !== "audio"}
      screenShareInBar
      onOpenSoundSettings={() => {}}
      onOpenSettings={() => {}}
    />
  );
}

/** What `InCallView` subtracts for its footer before handing on the stage. */
const FOOTER_BLOCK = mobile ? 104 : 144;
/** The ORISO header's height, when it is shown. */
const HEADER_BLOCK = mobile ? 72 : showHeader ? 64 : 0;

/** The four buttons ORISO-Frontend draws over the iframe without `orisoHostChrome`. */
function HostCornerButtons(): React.ReactNode {
  return (
    <>
      {[10, 50, 90, 130].map((right) => (
        <span
          key={right}
          aria-hidden="true"
          data-testid="host-corner-button"
          style={{
            position: "absolute",
            top: 10,
            right,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgb(0 0 0 / 60%)",
            zIndex: 100,
          }}
        />
      ))}
    </>
  );
}

/*
 * #2233 R6: the title the call builds from the host's topic
 * (`?topic=Schuldnerberatung`), through the same `stageTitle` and strings.
 */
function useHarnessTitle(): string {
  const { t } = useTranslation();
  const parts = stageTitle({
    roomName: "",
    defaultRoomName: t("oriso_call_title"),
    callType: "single",
    topic: readTopic(params.get("topic")),
    group: false,
  });
  return parts.kind === "one-on-one" && parts.topic !== null
    ? t("oriso.one_on_one_title", { topic: parts.topic })
    : t("oriso.view_one_on_one");
}

function Header(): React.ReactNode {
  const title = useHarnessTitle();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return (): void => clearInterval(timer);
  }, []);
  return (
    <OrisoHeader
      className={styles.header}
      logo={brand.orisoLogo}
      compact={mobile}
      tone={video ? "dark" : "light"}
      title={title}
      encrypted
      meta={
        video && !mobile ? undefined : (
          <span>{formatCallDuration(now - startedAt + 724_000)}</span>
        )
      }
      actions={
        mobile ? (
          <OrisoMobileMenu
            participantCount={2}
            onToggleNotes={() => {}}
            onHangup={() => {}}
            onToggleScreenShare={() => {}}
            sharingScreen={false}
            onOpenSoundSettings={() => {}}
            onOpenSettings={() => {}}
            views={{
              offer: ["einzelgespraech", "spotlight"],
              active: "einzelgespraech",
              onChange: () => {},
            }}
            onToggleWindow={(): void => {}}
            fullscreen
          />
        ) : video ? (
          <button type="button" className={styles.videoNotesButton}>
            Notizen
          </button>
        ) : undefined
      }
      onWindow={chrome === "call" ? (): void => {} : null}
      fullscreen={false}
    />
  );
}

function Call(): React.ReactNode {
  const shapes = useMemo(() => new OrisoShapeStore(), []);
  const [notesOpen, setNotesOpen] = useState(notesParam !== null);
  const docked = notesOpen && notesLayout === "docked";
  const compact = window.innerWidth <= 400;
  const [notesRef, notesBounds] = useMeasure();
  // InCallView's grid gives the card its room the same way: the docked
  // card's width, or the in-view card's height plus 12px of air.
  const width =
    window.innerWidth -
    (docked ? (video ? 312 + 16 : 352 + 32) : 0) -
    (video ? 2 * (mobile ? 12 : 20) : 0);
  const height =
    window.innerHeight -
    FOOTER_BLOCK -
    HEADER_BLOCK -
    (notesOpen && !docked && notesBounds.height > 0
      ? notesBounds.height + 12
      : 0);
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
      pipAlignment$: new BehaviorSubject<typeof defaultPipAlignment>(
        // 5d: on a phone my own picture sits top right.
        video
          ? { inline: "end", block: mobile ? "start" : "end" }
          : defaultPipAlignment,
      ),
    };
    return video
      ? makeOneOnOneLayout({ ...inputs, fillStage: true })
      : makeEinzelgespraechLayout(inputs);
  }, [bounds$]);
  const stage = useMemo(
    () => ({
      identities: new Map(),
      parentUrl: window.location.origin,
      enabled: true,
      audioOnly: callKind === "audio",
      rectangular: video,
    }),
    [],
  );
  const gutter = video ? (mobile ? 12 : 20) : 0;
  return (
    <OrisoStageContext value={stage}>
      <OrisoShapesContext value={shapes}>
        <div
          className={styles.inRoom}
          data-oriso="true"
          data-oriso-video-stage={video ? "true" : undefined}
          data-notes-docked={docked ? "true" : undefined}
          style={
            video
              ? ({
                  "--oriso-stage-gutter": `${gutter}px`,
                  "--oriso-video-notes-width": "312px",
                  "--oriso-video-notes-inset": `${312 + 16}px`,
                } as CSSProperties)
              : undefined
          }
        >
          {chrome === "host" && <HostCornerButtons />}
          {!video && (
            <div className={styles.orisoBackdrop} aria-hidden="true">
              <Atmosphere palette="duene" />
            </div>
          )}
          {(showHeader || mobile) && <Header />}
          <Grid
            className={styles.scrollingGrid}
            style={{
              marginBlockEnd:
                window.innerHeight - FOOTER_BLOCK - HEADER_BLOCK - height,
            }}
            model={model}
            Layout={layout.scrolling}
            Tile={Tile as never}
          />
          <div className={classNames(styles.footer, styles.orisoFooter)}>
            <Footer
              notesOpen={notesOpen}
              onToggleNotes={() => setNotesOpen((o) => !o)}
            />
          </div>
          <OrisoNotes
            ref={notesRef}
            open={notesOpen}
            onClose={() => setNotesOpen(false)}
            layout={notesLayout}
            compact={notesLayout === "sheet" && compact}
            startedAt={startedAt}
            style={
              {
                "--oriso-notes-top": `${HEADER_BLOCK + (video && docked ? 0 : 16)}px`,
                "--oriso-notes-dock-bottom": video
                  ? `${FOOTER_BLOCK}px`
                  : undefined,
                "--oriso-footer-h": `${FOOTER_BLOCK}px`,
                "--oriso-toolbar-h": mobile
                  ? "72px"
                  : compact
                    ? "56px"
                    : "64px",
              } as CSSProperties
            }
          />
        </div>
      </OrisoShapesContext>
    </OrisoStageContext>
  );
}

// `animated` is imported so the spring host is registered before Grid.
void animated;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <div className="cpd-theme-dark" style={{ height: "100vh" }}>
        <Call />
        {shareFailed !== null && (
          <Toast open onDismiss={() => {}} modal={false}>
            {shareFailed === "system"
              ? i18n.t("oriso.share_failed_system")
              : shareFailed === "blocked"
                ? i18n.t("oriso.share_failed_blocked")
                : i18n.t("oriso.share_failed")}
          </Toast>
        )}
      </div>
    </TooltipProvider>
  </StrictMode>,
);
