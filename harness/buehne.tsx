/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The group stage, whole (slices S5–S7): the real `OrisoHeader` with the
 * real view rail and atmosphere popover, the real `Grid` with the real
 * `OrisoGroveLayout` (Kreis, Hain, Felder, Kacheln), real `MediaView` tiles,
 * the real control bar with its menu and the real docked notes card.
 *
 * Still no LiveKit and no Matrix: who speaks, whose hand is up and who is
 * muted come from the URL, and there is no camera picture — a video call
 * shows its rail and its capsules, but the forms carry the animal, because
 * there is no video track to put into them.
 *
 *   ?n=<count>                    people on the stage (default 9)
 *   ?view=kreis|hain|felder|kacheln   the arrangement (default from the plan)
 *   ?call=audio|video             the call intent (default audio)
 *   ?type=group|single            `orisoCallType` (default group)
 *   ?speaking=<i>                 index of the person speaking (default 0)
 *   ?hand=<i>[,<i>]               raised hands, up for 1:40 and 0:12
 *   ?muted=<i>[,<i>]              microphones off
 *   ?pinned=<i>                   pinned ("Anheften — bleibt groß")
 *   ?open=atmosphere|tilemenu     a popover open for the picture
 *                                 (tilemenu: the first person's ⋮); the call
 *                                 menu is opened by clicking its ⋮
 *   ?notes=1                      the notes card docked on the right
 *   ?names=dezent|popout          "Namen & Symbole"
 *   ?atmosphere=<motif>|traeger   the person's stored choice
 *   ?invite=1|error               "Link teilen" in the header (S8); the fake
 *                                 host answers with a link, or with an error
 *   ?mobile=1                     the phone's full screen (S9, 5b): compact
 *                                 header with ⋮, wave band, short bar;
 *                                 ?notes=1 then opens the bottom sheet
 */
import {
  type CSSProperties,
  type FC,
  StrictMode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import useMeasure from "react-use-measure";
import { BehaviorSubject } from "rxjs";
import { animated } from "@react-spring/web";
import { Menu, ToggleMenuItem, TooltipProvider } from "@vector-im/compound-web";
import {
  MicOffSolidIcon,
  MicOnSolidIcon,
  OverflowVerticalIcon,
  PinIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { Grid, type TileProps } from "../src/grid/Grid";
import { makeOrisoGroveLayout } from "../src/grid/OrisoGroveLayout";
import {
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../src/grid/CallLayout";
import { type GridLayout } from "../src/state/layout-types";
import { MediaView } from "../src/tile/MediaView";
import { EncryptionStatus } from "../src/state/MediaViewModel";
import {
  OrisoShapeStore,
  OrisoShapesContext,
  useOrisoShape,
} from "../src/oriso/useOrisoShape";
import { Atmosphere } from "../src/oriso/Atmosphere";
import { AtmospherePicker } from "../src/oriso/AtmospherePicker";
import {
  type AtmosphereChoice,
  readAtmosphereChoice,
  resolveAtmosphere,
} from "../src/oriso/atmosphereChoice";
import { readNameStyle } from "../src/oriso/nameStyle";
import { OrisoMobileMenu, OrisoToolbar } from "../src/oriso/OrisoToolbar";
import { InviteLinkButton } from "../src/oriso/InviteLinkButton";
import { type InviteLinkReply } from "../src/oriso/inviteLink";
import { WaveBand } from "../src/oriso/WaveBand";
import { OrisoNotes } from "../src/oriso/OrisoNotes";
import { OrisoHeader } from "../src/oriso/OrisoHeader";
import { ViewSwitcher, type StageView } from "../src/oriso/ViewSwitcher";
import { KachelnPager } from "../src/oriso/KachelnPager";
import { type OrisoIdentity } from "../src/oriso/identity";
import { OrisoStageContext } from "../src/oriso/useOrisoIdentities";
import {
  OrisoPinsContext,
  OrisoViewContext,
  type OrisoView,
} from "../src/oriso/useOrisoView";
import { arrangementFor, stagePlan } from "../src/oriso/stageViews";
import styles from "../src/room/InCallView.module.css";
import de from "../locales/de/app.json";
import en from "../locales/en/app.json";
import "../src/index.css";
import "../src/oriso-theme.css";

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
const indices = (name: string): Set<number> =>
  new Set(
    (params.get(name) ?? "")
      .split(",")
      .filter((v) => v !== "")
      .map(Number),
  );
const count = Number(params.get("n") ?? 9);
const intent = params.get("call") === "video" ? "video" : "audio";
const callType = params.get("type") === "single" ? "single" : "group";
const speakingIndex = Number(params.get("speaking") ?? 0);
const hands = indices("hand");
const muted = indices("muted");
const pinnedIndex = params.get("pinned");
const open = params.get("open");
const notesShown = params.get("notes") === "1";
const nameStyle = readNameStyle(params.get("names"));
const invite = params.get("invite");
const mobile = params.get("mobile") === "1";

/** The host's side of `org.oriso.call.invite_link`, faked. */
const fakeInvite = async (): Promise<InviteLinkReply> =>
  invite === "error"
    ? { error: "This call has no link to share" }
    : { url: "https://app.oriso.org/call/join/7f3a9c2e" };

/** The design's group (2a): one counsellor, the rest animals. */
const CAST: { name: string; identity: OrisoIdentity }[] = [
  {
    name: "ruhiger Fuchs 432",
    identity: {
      kind: "animal",
      file: "fox.svg",
      bg: "#62937A",
      ink: "#FBF4D3",
    },
  },
  {
    name: "Susanne P. · Beraterin",
    identity: { kind: "initials", bg: "#A5000A", ink: "#fff", initials: "SP" },
  },
  {
    name: "wacher Igel 118",
    identity: {
      kind: "animal",
      file: "hedgehog.svg",
      bg: "#EAD9C2",
      ink: "#4D4000",
    },
  },
  {
    name: "stilles Pferd 907",
    identity: {
      kind: "animal",
      file: "horse.svg",
      bg: "#E5C66B",
      ink: "#3D2E00",
    },
  },
  {
    name: "heitere Lerche 24",
    identity: {
      kind: "animal",
      file: "lark.svg",
      bg: "#B5D6A7",
      ink: "#1E3A12",
    },
  },
  {
    name: "weiter Bär 651",
    identity: {
      kind: "animal",
      file: "bear.svg",
      bg: "#B8A991",
      ink: "#2E2418",
    },
  },
  {
    name: "klarer Schwan 77",
    identity: {
      kind: "animal",
      file: "swan.svg",
      bg: "#C9D8E4",
      ink: "#1A2B4C",
    },
  },
  {
    name: "naher Otter 303",
    identity: {
      kind: "animal",
      file: "otter.svg",
      bg: "#F2C7C0",
      ink: "#5C1A12",
    },
  },
  {
    name: "später Kauz 512",
    identity: {
      kind: "animal",
      file: "owl.svg",
      bg: "#4F8A6E",
      ink: "#FBF4D3",
    },
  },
  {
    name: "feiner Dachs 255",
    identity: { kind: "animal", file: "okapi.svg", bg: "#4F284B", ink: "#fff" },
  },
  {
    name: "klare Biene 641",
    identity: {
      kind: "animal",
      file: "bee.svg",
      bg: "#EAD56B",
      ink: "#1a1a1a",
    },
  },
  {
    name: "warmer Hase 962",
    identity: {
      kind: "animal",
      file: "hare.svg",
      bg: "#F6DE9B",
      ink: "#1a1a1a",
    },
  },
];

const people = Array.from({ length: count }, (_, i) => CAST[i % CAST.length]);
const idOf = (i: number): string => `p${i}`;
const indexOf = (id: string): number => Number(id.slice(1));

// What `OrisoGroveLayout` subscribes to on each tile: the media's id, its
// user, the name and whether that person speaks.
const model: GridLayout = {
  type: "grid",
  grid: people.map((person, i) => ({
    id: idOf(i),
    media$: new BehaviorSubject({
      id: idOf(i),
      userId: `@${idOf(i)}:oriso.test`,
      displayName$: new BehaviorSubject(person.name),
      speaking$: new BehaviorSubject(i === speakingIndex),
    }),
  })) as unknown as GridLayout["grid"],
  setVisibleTiles: () => {},
};

const startedAt = Date.now();

const Tile: FC<TileProps<{ id: string }, HTMLDivElement>> = ({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  model: tile,
}) => {
  const i = indexOf(tile.id);
  const person = people[i];
  const shape = useOrisoShape(tile.id);
  const off = muted.has(i);
  const Mic = off ? MicOffSolidIcon : MicOnSolidIcon;
  const handAt = hands.has(i)
    ? new Date(startedAt - ([...hands].indexOf(i) === 0 ? 100_000 : 12_000))
    : undefined;
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
        // The same composition as `GridTile`'s menu: Compound's menu with
        // the ORISO "Anheften" entry first (S6).
        <Menu
          open={open === "tilemenu" && i === 0}
          onOpenChange={() => {}}
          title={person.name}
          trigger={
            <button aria-label="Optionen">
              <OverflowVerticalIcon aria-hidden width={20} height={20} />
            </button>
          }
          side="right"
          align="start"
        >
          <ToggleMenuItem
            Icon={PinIcon}
            label={i18n.t("oriso.participant_pin")}
            checked={pinnedIndex !== null && Number(pinnedIndex) === i}
            onSelect={() => {}}
          />
        </Menu>
      }
      raisedHandTime={handAt}
      orisoIdentity={person.identity}
      orisoShape={shape}
      orisoSpeaking={i === speakingIndex}
      orisoParentUrl={window.location.origin}
    />
  );
};

function Stage(): React.ReactNode {
  const shapes = useMemo(() => new OrisoShapeStore(), []);
  const plan = stagePlan({ alone: false, callType, intent });
  const requested = params.get("view") as StageView | null;
  const [view, setView] = useState<StageView>(
    requested !== null && plan.offer.includes(requested)
      ? requested
      : plan.fallback,
  );
  const orisoView: OrisoView = arrangementFor(view, plan);
  const [choice, setChoice] = useState<AtmosphereChoice>(
    readAtmosphereChoice(params.get("atmosphere")),
  );
  const atmosphere = resolveAtmosphere(choice, "fluss");
  const [atmosphereOpen, setAtmosphereOpen] = useState(open === "atmosphere");
  const [notesOpen, setNotesOpen] = useState(notesShown);
  const pins = useMemo(
    () => ({
      pinned: new Set(pinnedIndex === null ? [] : [idOf(Number(pinnedIndex))]),
      toggle: (): void => {},
    }),
    [],
  );

  // On a phone the header carries the wave band under it (5b).
  const HEADER = mobile ? 72 + 64 : 72;
  const FOOTER = mobile ? 104 : 144;
  const DOCK = 352 + 32;
  const [sheetRef, sheetBounds] = useMeasure();
  const width = window.innerWidth - (notesOpen && !mobile ? DOCK : 0);
  const height =
    window.innerHeight -
    HEADER -
    FOOTER -
    (mobile && notesOpen && sheetBounds.height > 0
      ? sheetBounds.height + 12
      : 0);
  const bounds$ = useMemo(
    () => new BehaviorSubject({ width, height }),
    // Created once; the effect below moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => bounds$.next({ width, height }), [bounds$, width, height]);
  const layout = useMemo(
    () =>
      makeOrisoGroveLayout({
        minBounds$: bounds$,
        spotlightAlignment$: new BehaviorSubject(defaultSpotlightAlignment),
        pipAlignment$: new BehaviorSubject(defaultPipAlignment),
      }),
    [bounds$],
  );
  const stage = useMemo(
    () => ({
      identities: new Map(),
      parentUrl: window.location.origin,
      enabled: true,
      audioOnly: intent === "audio",
      rectangular: false,
    }),
    [],
  );

  return (
    <OrisoStageContext value={stage}>
      <OrisoShapesContext value={shapes}>
        <OrisoViewContext value={orisoView}>
          <OrisoPinsContext value={pins}>
            <div
              className={styles.inRoom}
              data-oriso="true"
              data-notes-docked={notesOpen && !mobile ? "true" : undefined}
              data-oriso-names={intent === "video" ? "popout" : nameStyle}
            >
              <div className={styles.orisoBackdrop} aria-hidden="true">
                <Atmosphere palette={atmosphere} />
              </div>
              {mobile ? (
                <div className={styles.orisoMobileHeader}>
                  <OrisoHeader
                    compact
                    tone="light"
                    title="Suchtberatung · Gruppe"
                    encrypted
                    meta={
                      <span>
                        {i18n.t("oriso.participants_count", { count })}
                      </span>
                    }
                    onWindow={(): void => {}}
                    fullscreen
                    actions={
                      <>
                        {invite !== null && (
                          <InviteLinkButton
                            request={fakeInvite}
                            tone="light"
                            compact
                          />
                        )}
                        <OrisoMobileMenu
                          participantCount={count}
                          onToggleNotes={() => setNotesOpen((o) => !o)}
                          onHangup={() => {}}
                          onToggleScreenShare={() => {}}
                          sharingScreen={false}
                          onOpenSoundSettings={() => {}}
                          onOpenSettings={() => {}}
                          nameStyle={nameStyle}
                          onNameStyleChange={
                            intent === "video" ? null : (): void => {}
                          }
                          views={{
                            offer: plan.offer,
                            active: view,
                            onChange: setView,
                          }}
                          onToggleWindow={(): void => {}}
                          fullscreen
                        />
                      </>
                    }
                  />
                  <WaveBand
                    speaker={
                      speakingIndex >= 0 && speakingIndex < count
                        ? {
                            userId: idOf(speakingIndex),
                            displayName: CAST[speakingIndex % CAST.length].name,
                          }
                        : null
                    }
                  />
                </div>
              ) : (
                <OrisoHeader
                  className={styles.header}
                  tone="light"
                  title="Gruppengespräch"
                  encrypted
                  meta={<span>{count} Teilnehmende</span>}
                  onWindow={(): void => {}}
                  fullscreen={false}
                  actions={
                    <>
                      <AtmospherePicker
                        choice={choice}
                        current={atmosphere}
                        onChoose={setChoice}
                        open={atmosphereOpen}
                        onOpenChange={setAtmosphereOpen}
                      />
                      <ViewSwitcher
                        tone="light"
                        active={view}
                        offer={plan.offer}
                        onChange={setView}
                      />
                      {invite !== null && (
                        <InviteLinkButton request={fakeInvite} tone="light" />
                      )}
                    </>
                  }
                />
              )}
              <Grid
                className={styles.scrollingGrid}
                model={model}
                Layout={layout.scrolling}
                Tile={Tile as never}
              />
              {/* The fixed layer, as InCallView draws it: the shared screen
                  and the Kacheln's pager (#2233) stay put over the sheet. */}
              <Grid
                className={styles.fixedGrid}
                style={{ insetBlockStart: HEADER, height }}
                model={model}
                Layout={layout.fixed}
                Tile={Tile as never}
              />
              <div className={classNames(styles.footer, styles.orisoFooter)}>
                {view === "kacheln" && <KachelnPager count={count} />}
                <Footer
                  compact={mobile}
                  notesOpen={notesOpen}
                  onToggleNotes={() => setNotesOpen((o) => !o)}
                  onOpenBackground={() => setAtmosphereOpen(true)}
                  backgroundLabel={
                    choice === "traeger"
                      ? i18n.t("oriso.atmosphere_carrier")
                      : i18n.t(`oriso.atmosphere_${choice}`)
                  }
                />
              </div>
              <OrisoNotes
                ref={sheetRef}
                open={notesOpen}
                onClose={() => setNotesOpen(false)}
                layout={mobile ? "sheet" : "docked"}
                compact={mobile && window.innerWidth <= 400}
                startedAt={startedAt}
                style={
                  {
                    "--oriso-notes-top": `${HEADER + 16}px`,
                    "--oriso-footer-h": `${FOOTER}px`,
                    "--oriso-toolbar-h": mobile ? "72px" : "64px",
                  } as CSSProperties
                }
              />
            </div>
          </OrisoPinsContext>
        </OrisoViewContext>
      </OrisoShapesContext>
    </OrisoStageContext>
  );
}

function Footer({
  compact,
  notesOpen,
  onToggleNotes,
  onOpenBackground,
  backgroundLabel,
}: {
  compact: boolean;
  notesOpen: boolean;
  onToggleNotes: () => void;
  onOpenBackground: () => void;
  backgroundLabel: string;
}): React.ReactNode {
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(intent === "audio");
  const [hand, setHand] = useState(false);
  const [names, setNames] = useState(nameStyle);
  return (
    <OrisoToolbar
      className={styles.orisoToolbar}
      compact={compact}
      audioMuted={audioMuted}
      onToggleAudio={() => setAudioMuted((m) => !m)}
      showVideo={intent === "video"}
      videoMuted={videoMuted}
      onToggleVideo={() => setVideoMuted((m) => !m)}
      handRaised={hand}
      onToggleHand={() => setHand((h) => !h)}
      onToggleNotes={onToggleNotes}
      notesOpen={notesOpen}
      onHangup={() => {}}
      participantCount={count}
      nameStyle={names}
      onNameStyleChange={intent === "video" ? null : setNames}
      backgroundLabel={backgroundLabel}
      onOpenBackground={onOpenBackground}
      onToggleScreenShare={() => {}}
      sharingScreen={false}
      screenShareInBar
      onOpenSoundSettings={() => {}}
      onOpenSettings={() => {}}
    />
  );
}

// `animated` is imported so the spring host is registered before Grid.
void animated;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <div className="cpd-theme-light" style={{ height: "100vh" }}>
        <Stage />
      </div>
    </TooltipProvider>
  </StrictMode>,
);
