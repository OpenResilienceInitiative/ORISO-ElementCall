/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Button, IconButton, Text, Tooltip } from "@vector-im/compound-web";
import { type MatrixClient, type Room as MatrixRoom } from "matrix-js-sdk";
import {
  type CSSProperties,
  type FC,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import classNames from "classnames";
import { BehaviorSubject, map } from "rxjs";
import { useObservable } from "observable-hooks";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  ListBulletedIcon,
  VoiceCallSolidIcon,
  VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useTranslation } from "react-i18next";

import type { IWidgetApiRequest } from "matrix-widget-api";
import {
  EndCallButton,
  MicButton,
  VideoButton,
  ShareScreenButton,
  SettingsButton,
  ReactionToggleButton,
} from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { type HeaderStyle, useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./InCallView.module.css";
import { GridTile } from "../tile/GridTile";
import { type OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useWakeLock } from "../useWakeLock";
import { useMergedRefs } from "../useMergedRefs";
import { type MuteStates } from "../state/MuteStates";
import { type MatrixInfo } from "./VideoPreview";
import { InviteButton } from "../button/InviteButton";
import { LayoutToggle } from "./LayoutToggle";
import {
  type CallViewModel,
  createCallViewModel$,
  type GridMode,
} from "../state/CallViewModel/CallViewModel.ts";
import { Grid, type TileProps } from "../grid/Grid";
import { useInitial } from "../useInitial";
import { SpotlightTile } from "../tile/SpotlightTile";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { makeGridLayout } from "../grid/GridLayout";
import {
  type CallLayoutOutputs,
  type Alignment,
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../grid/CallLayout";
import { makeOneOnOneLayout } from "../grid/OneOnOneLayout";
import { makeSpotlightExpandedLayout } from "../grid/SpotlightExpandedLayout";
import { makeSpotlightLandscapeLayout } from "../grid/SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "../grid/SpotlightPortraitLayout";
import { makeOrisoGroveLayout } from "../grid/OrisoGroveLayout";
import { makeEinzelgespraechLayout } from "../grid/EinzelgespraechLayout";
import { type StageView, ViewSwitcher } from "../oriso/ViewSwitcher";
import { AtmospherePicker } from "../oriso/AtmospherePicker";
import {
  ATMOSPHERE_CHOICE_KEY,
  type AtmosphereChoice,
  readAtmosphereChoice,
  resolveAtmosphere,
} from "../oriso/atmosphereChoice";
import {
  NAME_STYLE_KEY,
  type NameStyle,
  readNameStyle,
} from "../oriso/nameStyle";
import {
  type CallMenuProps,
  OrisoMobileMenu,
  OrisoToolbar,
} from "../oriso/OrisoToolbar";
import { WaveBand } from "../oriso/WaveBand";
import { PIP_BAND_BLOCK, speakerBandPlace } from "../oriso/speakerBand";
import { kreisCentreNamesSpeaker } from "../oriso/kreis";
import { useStageScrolled } from "../oriso/useStageScrolled";
import { OrisoNotes } from "../oriso/OrisoNotes";
import { OrisoHeader } from "../oriso/OrisoHeader";
import { useOrisoWindow } from "../oriso/useOrisoWindow";
import { useOrisoCounsellors } from "../oriso/useOrisoCounsellors";
import { InviteLinkButton } from "../oriso/InviteLinkButton";
import { inviteLinkRequester } from "../oriso/inviteLink";
import { useCallDuration } from "../oriso/useCallDuration";
import { useOrisoKnock } from "../oriso/useOrisoKnock";
import {
  OrisoStageContext,
  useOrisoIdentities,
} from "../oriso/useOrisoIdentities";
import { OrisoShapeStore, OrisoShapesContext } from "../oriso/useOrisoShape";
import {
  type OrisoPins,
  OrisoPinsContext,
  OrisoViewContext,
  type OrisoView,
} from "../oriso/useOrisoView";
import {
  arrangementFor,
  resolveStageView,
  viewStorageKey,
} from "../oriso/stageViews";
import { useLocalStorage } from "../useLocalStorage";
import { Atmosphere } from "../oriso/Atmosphere";
import { GridTileViewModel, type TileViewModel } from "../state/TileViewModel";
import {
  ReactionsSenderProvider,
  useReactionsSender,
} from "../reactions/useReactionsSender";
import { ReactionsAudioRenderer } from "./ReactionAudioRenderer";
import { ReactionsOverlay } from "./ReactionsOverlay";
import { CallEventAudioRenderer } from "./CallEventAudioRenderer";
import {
  debugTileLayout as debugTileLayoutSetting,
  matrixRTCMode as matrixRTCModeSetting,
  useSetting,
} from "../settings/settings";
import { ReactionsReader } from "../reactions/ReactionsReader";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer.tsx";
import { muteAllAudio$ } from "../state/MuteAllAudioModel.ts";
import { useMediaDevices } from "../MediaDevicesContext.ts";
import { InitialDeviceNotice } from "./InitialDeviceNotice";
import { EarpieceOverlay } from "./EarpieceOverlay.tsx";
import { useAppBarHidden, useAppBarSecondaryButton } from "../AppBar.tsx";
import { useBehavior } from "../useBehavior.ts";
import { Toast } from "../Toast.tsx";
import overlayStyles from "../Overlay.module.css";
import { Avatar, Size as AvatarSize } from "../Avatar";
import waitingStyles from "./WaitingForJoin.module.css";
import { prefetchSounds } from "../soundUtils";
import { useAudioContext } from "../useAudioContext";
import ringtoneMp3 from "../sound/ringtone.mp3?url";
import ringtoneOgg from "../sound/ringtone.ogg?url";
import { useTrackProcessorObservable$ } from "../livekit/TrackProcessorContext.tsx";
import { type Layout } from "../state/layout-types.ts";
import { ObservableScope } from "../state/ObservableScope.ts";

const logger = rootLogger.getChild("[InCallView]");

const maxTapDurationMs = 400;

// The notepad docks beside a group stage from this width (#112): 352px card
// plus margins still leave the stage most of a laptop screen.
const NOTES_DOCK_MIN_WIDTH = 900;
// The video 1:1 docks its narrower card (5a) from here: a sheet over the
// video stage would cover the person one is talking to.
const VIDEO_NOTES_DOCK_MIN_WIDTH = 720;
// The phone card, the same width at which the toolbar turns compact.
const NOTES_COMPACT_MAX_WIDTH = 400;
/*
 * A phone (S9, designs 5b/5d): at or below this width the call is the
 * mobile full screen — compact header with the ⋮, the wave band for groups,
 * a four-to-five button bar. The header's own breakpoint is the same.
 */
const MOBILE_MAX_WIDTH = 550;
// What the docked card takes from the stage: 352px plus 16px either side.
const NOTES_DOCK_INSET = 352 + 2 * 16;
const VIDEO_NOTES_WIDTH = 312;
const VIDEO_NOTES_GAP = 16;
// The card in the view ends just above the control bar; this keeps 12px of
// air between it and whatever the stage draws above it.
const NOTES_SHEET_CLEARANCE = 12;

export interface ActiveCallProps extends Omit<
  InCallViewProps,
  "vm" | "livekitRoom" | "connState"
> {
  e2eeSystem: EncryptionSystem;
  // TODO refactor those reasons into an enum
  onLeft: (
    reason: "user" | "timeout" | "decline" | "allOthersLeft" | "error",
  ) => void;
}

export const ActiveCall: FC<ActiveCallProps> = (props) => {
  const [vm, setVm] = useState<CallViewModel | null>(null);

  const urlParams = useUrlParams();
  const mediaDevices = useMediaDevices();
  const trackProcessorState$ = useTrackProcessorObservable$();
  useEffect(() => {
    logger.info("START CALL VIEW SCOPE");
    const scope = new ObservableScope();
    const reactionsReader = new ReactionsReader(scope, props.rtcSession);
    const {
      autoLeaveWhenOthersLeft,
      waitForCallPickup,
      sendNotificationType,
      orisoDesign,
      orisoCallType,
      callIntent,
    } = urlParams;
    const vm = createCallViewModel$(
      scope,
      props.rtcSession,
      props.matrixRoom,
      mediaDevices,
      props.muteStates,
      {
        encryptionSystem: props.e2eeSystem,
        autoLeaveWhenOthersLeft,
        waitForCallPickup: waitForCallPickup && sendNotificationType === "ring",
        // Which arrangement each window size gets; see `CallViewModelOptions`.
        orisoDesign,
        // A group conversation stays a group at two people (S6b), and a
        // video group is offered the video arrangements only (S7).
        orisoCallType,
        orisoCallIntent:
          callIntent === "audio" || callIntent === "video" ? callIntent : null,
        matrixRTCMode$: matrixRTCModeSetting.value$,
      },
      reactionsReader.raisedHands$,
      reactionsReader.reactions$,
      scope.behavior(trackProcessorState$),
    );
    // TODO move this somewhere else once we use the callViewModel in the lobby as well!
    vm.join();
    setVm(vm);

    vm.leave$.pipe(scope.bind()).subscribe(props.onLeft);

    return (): void => {
      logger.info("END CALL VIEW SCOPE");
      scope.end();
    };
  }, [
    props.rtcSession,
    props.matrixRoom,
    props.muteStates,
    props.e2eeSystem,
    props.onLeft,
    urlParams,
    mediaDevices,
    trackProcessorState$,
  ]);

  if (vm === null) return null;

  return (
    <ReactionsSenderProvider vm={vm} rtcSession={props.rtcSession}>
      <InCallView {...props} vm={vm} />
    </ReactionsSenderProvider>
  );
};

export interface InCallViewProps {
  client: MatrixClient;
  vm: CallViewModel;
  matrixInfo: MatrixInfo;
  rtcSession: MatrixRTCSession;
  matrixRoom: MatrixRoom;
  muteStates: MuteStates;
  header: HeaderStyle;
  otelGroupCallMembership?: OTelGroupCallMembership;
  onShareClick: (() => void) | null;
}

export const InCallView: FC<InCallViewProps> = ({
  client,
  vm,
  matrixInfo,
  matrixRoom,
  muteStates,
  rtcSession,

  header: headerStyle,
  onShareClick,
}) => {
  const { t } = useTranslation();
  const { supportsReactions, sendReaction, toggleRaisedHand } =
    useReactionsSender();

  useWakeLock();
  // TODO-MULTI-SFU This is unused now??
  // const connectionState = useObservableEagerState(vm.livekitConnectionState$);

  // annoyingly we don't get the disconnection reason this way,
  // only by listening for the emitted event
  // This needs to be done differential. with the vm connection state we start with Disconnected.
  // TODO-MULTI-SFU decide how to handle this properly
  // @BillCarsonFr
  // if (connectionState === ConnectionState.Disconnected)
  //   throw new ConnectionLostError();

  const containerRef1 = useRef<HTMLDivElement | null>(null);
  const [containerRef2, bounds] = useMeasure();
  // Merge the refs so they can attach to the same element
  const containerRef = useMergedRefs(containerRef1, containerRef2);

  const { showControls } = useUrlParams();

  const muteAllAudio = useBehavior(muteAllAudio$);
  // Call pickup state and display names are needed for waiting overlay/sounds
  const callPickupState = useBehavior(vm.callPickupState$);

  // Preload a waiting and decline sounds
  const pickupPhaseSoundCache = useInitial(async () => {
    return prefetchSounds({
      waiting: { mp3: ringtoneMp3, ogg: ringtoneOgg },
    });
  });

  const pickupPhaseAudio = useAudioContext({
    sounds: pickupPhaseSoundCache,
    latencyHint: "interactive",
    muted: muteAllAudio,
  });

  const audioEnabled = useBehavior(muteStates.audio.enabled$);
  const videoEnabled = useBehavior(muteStates.video.enabled$);
  const toggleAudio = useBehavior(muteStates.audio.toggle$);
  const toggleVideo = useBehavior(muteStates.video.toggle$);
  const setAudioEnabled = useBehavior(muteStates.audio.setEnabled$);

  // This function incorrectly assumes that there is a camera and microphone, which is not always the case.
  // TODO: Make sure that this module is resilient when it comes to camera/microphone availability!
  useCallViewKeyboardShortcuts(
    containerRef1,
    toggleAudio,
    toggleVideo,
    setAudioEnabled,
    (reaction) => void sendReaction(reaction),
    () => void toggleRaisedHand(),
  );

  const audioParticipants = useBehavior(vm.audioParticipants$);
  const participantCount = useBehavior(vm.participantCount$);
  const reconnecting = useBehavior(vm.reconnecting$);
  const windowMode = useBehavior(vm.windowMode$);
  const layout = useBehavior(vm.layout$);
  const tileStoreGeneration = useBehavior(vm.tileStoreGeneration$);
  const [debugTileLayout] = useSetting(debugTileLayoutSetting);
  const gridMode = useBehavior(vm.gridMode$);
  const showHeader = useBehavior(vm.showHeader$);
  const showFooter = useBehavior(vm.showFooter$);
  const earpieceMode = useBehavior(vm.earpieceMode$);
  const audioOutputSwitcher = useBehavior(vm.audioOutputSwitcher$);
  const sharingScreen = useBehavior(vm.sharingScreen$);
  const localHandRaised = !!useBehavior(vm.handsRaised$)[
    `${client.getUserId()}:${client.getDeviceId()}`
  ];

  const ringOverlay = useBehavior(vm.ringOverlay$);
  const fatalCallError = useBehavior(vm.fatalError$);
  const mediaError = useBehavior(vm.mediaError$);
  const isPopupMode = windowMode === "pip" || windowMode === "flat";
  // Stop the rendering and throw for the error boundary
  if (fatalCallError) {
    logger.debug("fatalCallError stop rendering", fatalCallError);
    throw fatalCallError;
  }

  // We need to set the proper timings on the animation based upon the sound length.
  const ringDuration = pickupPhaseAudio?.soundDuration["waiting"] ?? 1;
  useEffect((): (() => void) => {
    // The CSS animation includes the delay, so we must double the length of the sound.
    window.document.body.style.setProperty(
      "--call-ring-duration-s",
      `${ringDuration * 2}s`,
    );
    window.document.body.style.setProperty(
      "--call-ring-delay-s",
      `${ringDuration}s`,
    );
    // Remove properties when we unload.
    return () => {
      window.document.body.style.removeProperty("--call-ring-duration-s");
      window.document.body.style.removeProperty("--call-ring-delay-s");
    };
  }, [pickupPhaseAudio?.soundDuration, ringDuration]);

  // When waiting for pickup, loop a waiting sound
  useEffect((): void | (() => void) => {
    if (callPickupState !== "ringing" || !pickupPhaseAudio) return;
    const endSound = pickupPhaseAudio.playSoundLooping("waiting", ringDuration);
    return () => {
      void endSound().catch((e) => {
        logger.error("Failed to stop ringing sound", e);
      });
    };
  }, [callPickupState, pickupPhaseAudio, ringDuration]);

  // Waiting UI overlay
  const waitingOverlay: JSX.Element | null = useMemo(() => {
    return ringOverlay ? (
      <div className={classNames(overlayStyles.bg, waitingStyles.overlay)}>
        <div
          className={classNames(overlayStyles.content, waitingStyles.content)}
        >
          <div className={waitingStyles.pulse}>
            <Avatar
              id={ringOverlay.idForAvatar}
              name={ringOverlay.name}
              src={ringOverlay.avatarMxc}
              size={AvatarSize.XL}
            />
          </div>
          <Text size="md" className={waitingStyles.text}>
            {ringOverlay.text}
          </Text>
        </div>
      </div>
    ) : null;
  }, [ringOverlay]);

  // Ideally we could detect taps by listening for click events and checking
  // that the pointerType of the event is "touch", but this isn't yet supported
  // in Safari: https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event#browser_compatibility
  // Instead we have to watch for sufficiently fast touch events.
  const touchStart = useRef<number | null>(null);
  const onTouchStart = useCallback(() => (touchStart.current = Date.now()), []);
  const onTouchEnd = useCallback(() => {
    const start = touchStart.current;
    if (start !== null && Date.now() - start <= maxTapDurationMs)
      vm.tapScreen();
    touchStart.current = null;
  }, [vm]);
  const onTouchCancel = useCallback(() => (touchStart.current = null), []);

  // We also need to tell the footer controls to prevent touch events from
  // bubbling up, or else the footer will be dismissed before a click/change
  // event can be registered on the control
  const onControlsTouchEnd = useCallback(
    (e: TouchEvent) => {
      // Somehow applying pointer-events: none to the controls when the footer
      // is hidden is not enough to stop clicks from happening as the footer
      // becomes visible, so we check manually whether the footer is shown
      if (showFooter) {
        e.stopPropagation();
        vm.tapControls();
      } else {
        e.preventDefault();
      }
    },
    [vm, showFooter],
  );

  // The ORISO header stays visible while the footer hides (flat windows,
  // inactivity), so its controls must not cancel their own click the way a
  // hidden footer does. A touch on it keeps the controls shown and does not
  // reach the stage's tap-to-toggle.
  const onHeaderTouchEnd = useCallback(
    (e: TouchEvent) => {
      e.stopPropagation();
      vm.tapControls();
    },
    [vm],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === "mouse") vm.hoverScreen();
    },
    [vm],
  );
  const onPointerOut = useCallback(() => vm.unhoverScreen(), [vm]);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  const openSettings = useCallback(
    () => setSettingsModalOpen(true),
    [setSettingsModalOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  const openSoundSettings = useCallback(() => {
    setSettingsTab("audio");
    setSettingsModalOpen(true);
  }, [setSettingsTab, setSettingsModalOpen]);

  /*
   * The Schmierzettel (#112, "Meine Gesprächsnotiz") lives in the call, for
   * everyone in it: the notes stay in this window and end with the call.
   */
  const [notesOpen, setNotesOpen] = useState(false);
  const toggleNotes = useCallback(() => setNotesOpen((was) => !was), []);
  const closeNotes = useCallback(() => setNotesOpen(false), []);

  // Who knocks on this call's link, and its switch: both from the host (#108).
  const orisoKnock = useOrisoKnock();

  const openProfile = useMemo(
    () =>
      // Profile settings are unavailable in widget mode
      widget === null
        ? (): void => {
            setSettingsTab("profile");
            setSettingsModalOpen(true);
          }
        : null,
    [setSettingsTab, setSettingsModalOpen],
  );

  /*
   * Read before the bounds below, because they depend on it: see the ORISO
   * section further down for what the gate means.
   */
  const {
    parentUrl,
    orisoAtmosphere,
    orisoDesign,
    orisoLogo,
    orisoHostChrome,
    orisoCallType,
    orisoInvite,
    callIntent,
  } = useUrlParams();
  const orisoEnabled = orisoDesign;
  const orisoAudioOnly = orisoEnabled && callIntent === "audio";
  const orisoVideoCall = orisoEnabled && callIntent === "video";
  const orisoVideoOneOnOne = orisoVideoCall && layout.type === "one-on-one";
  // The window buttons in the header, when the host leaves them to the call.
  const orisoWindow = useOrisoWindow(orisoEnabled && orisoHostChrome);
  // "Link teilen" (S8): only when the host said it can make a link.
  const orisoInviteRequest = useMemo(
    () => (orisoEnabled && orisoInvite ? inviteLinkRequester() : null),
    [orisoEnabled, orisoInvite],
  );

  const [headerRef, headerBounds] = useMeasure();
  const [footerRef, footerBounds] = useMeasure();
  const [notesRef, notesBounds] = useMeasure();
  const alone = useBehavior(vm.orisoOneOnOne$);
  // The call's duration in the header of a 1:1 over the atmosphere (2b).
  const orisoMobile =
    orisoEnabled && bounds.width > 0 && bounds.width <= MOBILE_MAX_WIDTH;
  // 2b on a desktop; on a phone the video 1:1 shows it too (5d).
  const callDuration = useCallDuration(
    rtcSession,
    orisoEnabled && showControls && (!orisoVideoCall || orisoMobile) && alone,
  );
  // The wave band names whoever speaks (5b).
  const orisoSpeaker = useBehavior(vm.orisoSpeaker$);

  /*
   * Where the notepad opens (#112), as in the design: beside the stage of a
   * group call when there is room for both (2a), otherwise inside the view
   * above the control bar (2b), compact on a phone. Either way the stage
   * gives the card its room — the circle steps back rather than being
   * covered.
   */
  /*
   * S5: on a desktop-wide window the card is docked fixed on the right in
   * every view — the 1:1 over the atmosphere too, where it used to open
   * inside the view. Narrower windows keep the sheet above the bar.
   */
  const notesDocked = orisoVideoOneOnOne
    ? bounds.width >= VIDEO_NOTES_DOCK_MIN_WIDTH
    : bounds.width >= NOTES_DOCK_MIN_WIDTH;
  const notesCompact = bounds.width <= NOTES_COMPACT_MAX_WIDTH;
  const notesShown = orisoEnabled && showControls && notesOpen;
  const videoStageGutter = orisoVideoOneOnOne
    ? bounds.width >= 640
      ? 20
      : 12
    : 0;
  const dockInset = orisoVideoOneOnOne
    ? VIDEO_NOTES_WIDTH + VIDEO_NOTES_GAP
    : NOTES_DOCK_INSET;
  const notesWidth = notesShown && notesDocked ? dockInset : 0;
  const notesHeight =
    notesShown && !notesDocked && notesBounds.height > 0
      ? notesBounds.height + NOTES_SHEET_CLEARANCE
      : 0;

  const gridBounds = useMemo(
    () => ({
      width: Math.max(0, bounds.width - notesWidth - 2 * videoStageGutter),
      /*
       * The footer's height comes off the stage — for ORISO even in `flat`.
       *
       * Upstream gives a flat window the whole height and floats the footer
       * over it, which suits a spotlight whose subject sits in the middle.
       * An ORISO arrangement puts people at the edges: a landscape phone,
       * where the footer takes two rows below 660px, had the controls and
       * the view rail sitting on top of the bottom of the circle, the outer
       * participants, or a bottom-aligned screen share.
       */
      height:
        bounds.height -
        headerBounds.height -
        (windowMode === "flat" && !orisoEnabled ? 0 : footerBounds.height) -
        notesHeight,
    }),
    [
      bounds.width,
      bounds.height,
      notesWidth,
      videoStageGutter,
      notesHeight,
      headerBounds.height,
      footerBounds.height,
      windowMode,
      orisoEnabled,
    ],
  );
  const gridBoundsObservable$ = useObservable(
    (inputs$) => inputs$.pipe(map(([gridBounds]) => gridBounds)),
    [gridBounds],
  );

  const spotlightAlignment$ = useInitial(
    () => new BehaviorSubject(defaultSpotlightAlignment),
  );
  const pipAlignment$ = useInitial(
    () =>
      new BehaviorSubject<Alignment>(
        orisoVideoCall ? { inline: "end", block: "end" } : defaultPipAlignment,
      ),
  );

  // 5d: on a phone my own picture sits top right, the other person fills.
  useEffect(() => {
    if (orisoMobile && orisoVideoCall)
      pipAlignment$.next({ inline: "end", block: "start" });
  }, [orisoMobile, orisoVideoCall, pipAlignment$]);

  const setGridMode = useCallback(
    (mode: GridMode) => vm.setGridMode(mode),
    [vm],
  );

  /* ---------------------------------------------------------------------- *
   * ORISO
   *
   * The design is on when the embedding host ASKED for it, which is what
   * `orisoDesign` says. Not `parentUrl`: that is the generic widget parameter
   * every embedded Element Call carries, so gating on it would have handed the
   * grove, the backdrop and the animals to any Element Web embedding of this
   * build. Standalone and every other host keep upstream's rectangles — one
   * tile implementation serving both, rather than a fork in the tree.
   *
   * `parentUrl` is still where the artwork is inherited FROM, which is a
   * different question and only asked once the design is on.
   * ---------------------------------------------------------------------- */
  const orisoIdentities = useOrisoIdentities(matrixRoom);
  // Who the host says is a counsellor: the only source of "Beratung".
  const orisoCounsellors = useOrisoCounsellors();
  const orisoStage = useMemo(
    () => ({
      identities: orisoIdentities,
      counsellors: orisoCounsellors,
      parentUrl,
      enabled: orisoEnabled,
      audioOnly: orisoAudioOnly,
      rectangular: orisoVideoOneOnOne,
    }),
    [
      orisoIdentities,
      orisoCounsellors,
      parentUrl,
      orisoEnabled,
      orisoAudioOnly,
      orisoVideoOneOnOne,
    ],
  );
  const orisoShapes = useInitial(() => new OrisoShapeStore());

  /*
   * The backdrop world (S5, design 2a). The person chooses in the header's
   * popover; the default is "Motiv des Trägers", the motif the counselling
   * centre put on the URL. The choice is kept in this browser only.
   */
  const [storedAtmosphere, setStoredAtmosphere] = useLocalStorage(
    ATMOSPHERE_CHOICE_KEY,
  );
  const atmosphereChoice = readAtmosphereChoice(storedAtmosphere);
  const atmosphere = resolveAtmosphere(atmosphereChoice, orisoAtmosphere);
  const [atmosphereOpen, setAtmosphereOpen] = useState(false);
  const chooseAtmosphere = useCallback(
    (choice: AtmosphereChoice) => setStoredAtmosphere(choice),
    [setStoredAtmosphere],
  );
  const openAtmosphere = useCallback(() => setAtmosphereOpen(true), []);
  // Only where the atmosphere is the stage: the video 1:1 is a dark stage.
  const atmosphereShown = orisoEnabled && !orisoVideoOneOnOne;

  // "Namen & Symbole" (S5): dezent or as a capsule, kept in this browser.
  const [storedNameStyle, setStoredNameStyle] = useLocalStorage(NAME_STYLE_KEY);
  const nameStyle = readNameStyle(storedNameStyle);
  const chooseNameStyle = useCallback(
    (style: NameStyle) => setStoredNameStyle(style),
    [setStoredNameStyle],
  );

  /*
   * The view is remembered, because it is a preference about how somebody
   * likes to see a room rather than a property of this call — the spotlight
   * included (S6; it used to live in memory only).
   *
   * What the rail offers and what a stored choice means come from
   * `stagePlan`: at exactly two people the stage is the Einzelgespräch
   * whichever arrangement is stored, so the rail names that and offers the
   * one real alternative, the spotlight. The machinery underneath holds two
   * orthogonal settings — the arrangement in grid mode, and spotlight mode;
   * see `useOrisoView.ts` for why they are not one enum.
   *
   * Two people are counted as the VIEW MODEL counts them, not as the stage
   * happens to look: in spotlight mode the layout is a spotlight, and a rail
   * that read the layout offered the grove again at two people.
   */
  // Kept per conversation type (S6b): `oriso-call-view-group` / `-single`.
  const [storedView, setStoredView] = useLocalStorage(
    viewStorageKey(orisoCallType),
  );
  // From the view model, which knows the head count, the conversation type
  // and whether this is a video call (S7).
  const orisoPlan = useBehavior(vm.orisoPlan$);
  // A stable array, so the rail can memoise its entries on it and its
  // keyboard handler cannot close over a list that has moved on.
  const orisoOffer = orisoPlan.offer;
  const orisoView: OrisoView = arrangementFor(
    resolveStageView(storedView, orisoPlan),
    orisoPlan,
  );
  const stageView: StageView =
    gridMode === "spotlight"
      ? "spotlight"
      : alone
        ? "einzelgespraech"
        : orisoView;
  const setStageView = useCallback(
    (view: StageView) => {
      /*
       * The Einzelgespräch is what two people get, not an arrangement to
       * keep: picking it only replaces a stored spotlight, so the grove or
       * the fields come back when a third person arrives.
       */
      if (view !== "einzelgespraech" || storedView === "spotlight")
        setStoredView(view);
      setGridMode(view === "spotlight" ? "spotlight" : "grid");
    },
    [setGridMode, setStoredView, storedView],
  );
  // A call that was left in the spotlight starts in it again.
  const restoredView = useRef(false);
  useEffect(() => {
    if (restoredView.current || !orisoEnabled) return;
    restoredView.current = true;
    if (storedView === "spotlight") setGridMode("spotlight");
  }, [orisoEnabled, storedView, setGridMode]);

  // "Anheften — bleibt groß" (S6): mine alone, for this call.
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const togglePin = useCallback(
    (mediaId: string) =>
      setPinnedIds((was) => {
        const next = new Set(was);
        if (next.has(mediaId)) next.delete(mediaId);
        else next.add(mediaId);
        return next;
      }),
    [],
  );
  const orisoPins: OrisoPins = useMemo(
    () => ({ pinned: pinnedIds, toggle: orisoEnabled ? togglePin : null }),
    [pinnedIds, orisoEnabled, togglePin],
  );

  useEffect(() => {
    widget?.api.transport
      .send(
        gridMode === "grid"
          ? ElementWidgetActions.TileLayout
          : ElementWidgetActions.SpotlightLayout,
        {},
      )
      .catch((e) => {
        logger.error("Failed to send layout change to widget API", e);
      });
  }, [gridMode]);

  useEffect(() => {
    if (widget) {
      const onTileLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setGridMode("grid");
        widget!.api.transport.reply(ev.detail, {});
      };
      const onSpotlightLayout = (ev: CustomEvent<IWidgetApiRequest>): void => {
        setGridMode("spotlight");
        widget!.api.transport.reply(ev.detail, {});
      };

      widget.lazyActions.on(ElementWidgetActions.TileLayout, onTileLayout);
      widget.lazyActions.on(
        ElementWidgetActions.SpotlightLayout,
        onSpotlightLayout,
      );

      return (): void => {
        widget!.lazyActions.off(ElementWidgetActions.TileLayout, onTileLayout);
        widget!.lazyActions.off(
          ElementWidgetActions.SpotlightLayout,
          onSpotlightLayout,
        );
      };
    }
  }, [setGridMode]);

  useAppBarSecondaryButton(
    useMemo(() => {
      if (audioOutputSwitcher === null) return null;
      const isEarpieceTarget = audioOutputSwitcher.targetOutput === "earpiece";
      const Icon = isEarpieceTarget ? VoiceCallSolidIcon : VolumeOnSolidIcon;
      const label = isEarpieceTarget
        ? t("settings.devices.handset")
        : t("settings.devices.loudspeaker");

      return (
        <Tooltip label={label}>
          <IconButton
            onClick={(e) => {
              e.preventDefault();
              audioOutputSwitcher.switch();
            }}
          >
            <Icon />
          </IconButton>
        </Tooltip>
      );
    }, [t, audioOutputSwitcher]),
  );

  useAppBarHidden(!showHeader);

  // The call menu's contents, in the bar's ⋮ or the phone header's (S9).
  const callMenu: CallMenuProps = {
    onToggleNotes: toggleNotes,
    waitingCount: orisoKnock.waiting,
    knock: orisoKnock.knock,
    onKnockChange: orisoKnock.setKnock,
    onHangup: (): void => vm.hangup(),
    participantCount,
    // Over a camera names are always capsules, so a video call offers no
    // choice.
    nameStyle,
    onNameStyleChange: orisoVideoCall ? null : chooseNameStyle,
    // A phone's header has no room for the atmosphere popover (5b).
    backgroundLabel:
      atmosphereShown && !orisoMobile
        ? atmosphereChoice === "traeger"
          ? t("oriso.atmosphere_carrier")
          : t(`oriso.atmosphere_${atmosphereChoice}`)
        : null,
    onOpenBackground: atmosphereShown && !orisoMobile ? openAtmosphere : null,
    onToggleScreenShare: vm.toggleScreenSharing,
    sharingScreen,
    // The SettingsModal is not mounted in pip or flat mode.
    onOpenSoundSettings: isPopupMode ? null : openSoundSettings,
    onOpenSettings: isPopupMode ? null : openSettings,
    onTouchEnd: onControlsTouchEnd,
  };

  // R27: who speaks, in every view and in the minimised call.
  const speakerBand = speakerBandPlace({
    enabled: orisoEnabled,
    pip: layout.type === "pip",
    headerShown: orisoEnabled && showControls && windowMode !== "pip",
    mobile: orisoMobile,
    view: stageView,
    kreisNamesSpeaker: kreisCentreNamesSpeaker(gridBounds),
  });
  // The Kacheln and the Felder scroll under the phone's header.
  const [stageScrolled, onStageScroll] = useStageScrolled();

  let header: ReactNode = null;
  if (orisoEnabled && showControls && windowMode !== "pip") {
    /*
     * The ORISO header, whatever header style the host asked for: the
     * design has one in every call (2a, 2b, 5a), and with `orisoHostChrome`
     * it is where the window buttons live — without it the call would have
     * none at all.
     */
    const orisoHeader = (
      <OrisoHeader
        ref={orisoMobile ? undefined : headerRef}
        className={orisoMobile ? undefined : styles.header}
        compact={orisoMobile}
        tone={orisoVideoOneOnOne ? "dark" : "light"}
        logo={orisoLogo}
        title={
          matrixInfo.roomName ||
          t(
            orisoVideoCall
              ? "oriso.video_stage_title"
              : "oriso.audio_stage_title",
          )
        }
        encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
        meta={
          callDuration !== null ? (
            <span
              role="timer"
              aria-label={t("oriso.call_duration", { duration: callDuration })}
              data-testid="oriso-call-duration"
            >
              {callDuration}
            </span>
          ) : (
            // 5b: "verschlüsselt · 6 Teilnehmende" on a phone.
            orisoMobile && (
              <span data-testid="oriso-header-participants">
                {t("oriso.participants_count", { count: participantCount })}
              </span>
            )
          )
        }
        onWindow={orisoWindow.send}
        fullscreen={orisoWindow.fullscreen}
        onTouchEnd={onHeaderTouchEnd}
        speaker={
          speakerBand === "header" ? (
            <WaveBand
              variant="header"
              tone={orisoVideoOneOnOne ? "dark" : "light"}
              speaker={orisoSpeaker}
            />
          ) : undefined
        }
        actions={
          <>
            {atmosphereShown && !orisoMobile && (
              <AtmospherePicker
                choice={atmosphereChoice}
                current={atmosphere}
                onChoose={chooseAtmosphere}
                open={atmosphereOpen}
                onOpenChange={setAtmosphereOpen}
                onTouchEnd={onHeaderTouchEnd}
              />
            )}
            {/* S5: the view rail is in the header (2a), inactive views as an
                icon, the active one with its word. */}
            {orisoOffer.length > 1 && !orisoMobile && (
              <ViewSwitcher
                tone={orisoVideoOneOnOne ? "dark" : "light"}
                active={stageView}
                offer={orisoOffer}
                onChange={setStageView}
                onTouchEnd={onHeaderTouchEnd}
              />
            )}
            {orisoVideoOneOnOne && !orisoMobile && (
              <button
                type="button"
                className={styles.videoNotesButton}
                onClick={toggleNotes}
                onTouchEnd={onHeaderTouchEnd}
                aria-pressed={notesOpen}
                data-testid="incall_video_header_notes"
              >
                <ListBulletedIcon aria-hidden />
                {t("oriso.video_stage_notes")}
              </button>
            )}
            {/* S8: the host's link to this call (`orisoInvite`). */}
            {orisoInviteRequest !== null && (
              <InviteLinkButton
                request={orisoInviteRequest}
                tone={orisoVideoOneOnOne ? "dark" : "light"}
                compact={orisoMobile}
                onTouchEnd={onHeaderTouchEnd}
              />
            )}
            {/* S9: the ⋮ moves from the bar into a phone's header. */}
            {orisoMobile && (
              <OrisoMobileMenu
                {...callMenu}
                onTouchEnd={onHeaderTouchEnd}
                views={{
                  offer: orisoOffer,
                  active: stageView,
                  onChange: setStageView,
                }}
                onToggleWindow={
                  orisoWindow.send === null
                    ? null
                    : (): void => orisoWindow.send?.("toggle_fullscreen")
                }
                fullscreen={orisoWindow.fullscreen}
              />
            )}
            {orisoInviteRequest === null &&
              !orisoMobile &&
              headerStyle === "standard" &&
              onShareClick !== null && (
                <InviteButton
                  className={styles.invite}
                  onClick={onShareClick}
                />
              )}
          </>
        }
      />
    );
    header = orisoMobile ? (
      // A phone: the header and the wave band under it are measured
      // together, so the stage starts below both. In every view, the 1:1
      // included (R27).
      <div ref={headerRef} className={styles.orisoMobileHeader}>
        {orisoHeader}
        {speakerBand === "phone" && <WaveBand speaker={orisoSpeaker} />}
      </div>
    ) : (
      orisoHeader
    );
  } else if (showHeader) {
    switch (headerStyle) {
      case "none":
        // Cosmetic header to fill out space while still affecting the bounds of
        // the grid
        header = (
          <div
            className={classNames(styles.header, styles.filler)}
            ref={headerRef}
          />
        );
        break;
      case "standard":
        header = (
          <Header
            className={styles.header}
            ref={headerRef}
            disconnectedBanner={false} // This screen has its own 'reconnecting' toast
          >
            <LeftNav>
              <RoomHeaderInfo
                id={matrixInfo.roomId}
                name={matrixInfo.roomName}
                avatarUrl={matrixInfo.roomAvatar}
                encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
                participantCount={participantCount}
              />
            </LeftNav>
            <RightNav>
              {showControls && onShareClick !== null && (
                <InviteButton
                  className={styles.invite}
                  onClick={onShareClick}
                />
              )}
            </RightNav>
          </Header>
        );
    }
  }

  // The reconnecting toast cannot be dismissed
  const onDismissReconnectingToast = useCallback(() => {}, []);
  // We need to use a non-modal toast to avoid trapping focus within the toast.
  // However, a non-modal toast will not render any background overlay on its
  // own, so we must render one manually.
  const reconnectingToast = (
    <>
      <div
        className={classNames(overlayStyles.bg, overlayStyles.animate)}
        data-state={reconnecting ? "open" : "closed"}
      />
      <Toast
        onDismiss={onDismissReconnectingToast}
        open={reconnecting}
        modal={false}
      >
        {t("common.reconnecting")}
      </Toast>
    </>
  );

  const earpieceOverlay = (
    <EarpieceOverlay
      show={earpieceMode && !reconnecting}
      onBackToVideoPressed={audioOutputSwitcher?.switch}
    />
  );

  // If the reconnecting toast or earpiece overlay obscures the media tiles, we
  // need to remove them from the accessibility tree and block focus.
  const contentObscured = reconnecting || earpieceMode;

  const Tile = useMemo(
    () =>
      function Tile({
        ref,
        className,
        style,
        targetWidth,
        targetHeight,
        model,
      }: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
        const spotlightExpanded = useBehavior(vm.spotlightExpanded$);
        const onToggleExpanded = useBehavior(vm.toggleSpotlightExpanded$);
        const showSpeakingIndicatorsValue = useBehavior(
          vm.showSpeakingIndicators$,
        );
        const showSpotlightIndicatorsValue = useBehavior(
          vm.showSpotlightIndicators$,
        );

        return model instanceof GridTileViewModel ? (
          <GridTile
            ref={ref}
            vm={model}
            onOpenProfile={openProfile}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            className={classNames(className, styles.tile)}
            style={style}
            showSpeakingIndicators={showSpeakingIndicatorsValue}
            focusable={!contentObscured}
          />
        ) : (
          <SpotlightTile
            ref={ref}
            vm={model}
            expanded={spotlightExpanded}
            onToggleExpanded={onToggleExpanded}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            showIndicators={showSpotlightIndicatorsValue}
            focusable={!contentObscured}
            className={classNames(className, styles.tile)}
            style={style}
          />
        );
      },
    [vm, openProfile, contentObscured],
  );

  const layouts = useMemo(() => {
    const inputs = {
      minBounds$: gridBoundsObservable$,
      spotlightAlignment$,
      pipAlignment$,
    };
    return {
      // Two entries swap for ORISO's; the other three are upstream's
      // unchanged, because a screen share and an expanded speaker are the
      // same thing in both designs.
      grid: orisoEnabled
        ? makeOrisoGroveLayout(inputs)
        : makeGridLayout(inputs),
      "spotlight-landscape": makeSpotlightLandscapeLayout(inputs),
      "spotlight-portrait": makeSpotlightPortraitLayout(inputs),
      "spotlight-expanded": makeSpotlightExpandedLayout(inputs),
      "one-on-one":
        orisoEnabled && !orisoVideoCall
          ? makeEinzelgespraechLayout(inputs)
          : makeOneOnOneLayout({ ...inputs, fillStage: orisoVideoCall }),
    };
  }, [
    gridBoundsObservable$,
    spotlightAlignment$,
    pipAlignment$,
    orisoEnabled,
    orisoVideoCall,
  ]);

  const renderContent = (): JSX.Element => {
    if (layout.type === "pip") {
      // The minimised call has no header: the speaker band (R27) is a slim
      // line above its one form, and the form takes the rest.
      // (Upstream hands the two sides over swapped; the band comes off the
      // height either way.)
      const band = speakerBand === "pip" ? PIP_BAND_BLOCK : 0;
      return (
        <>
          {band > 0 && <WaveBand variant="pip" speaker={orisoSpeaker} />}
          <SpotlightTile
            className={classNames(styles.tile, styles.maximised)}
            vm={layout.spotlight}
            expanded
            onToggleExpanded={null}
            targetWidth={gridBounds.height - band}
            targetHeight={gridBounds.width}
            showIndicators={false}
            focusable={!contentObscured}
            aria-hidden={contentObscured}
          />
        </>
      );
    }

    const layers = layouts[layout.type] as CallLayoutOutputs<Layout>;
    const fixedGrid = (
      <Grid
        key="fixed"
        className={styles.fixedGrid}
        style={{
          insetBlockStart:
            headerBounds.height > 0 ? headerBounds.bottom : bounds.top,
          height: gridBounds.height,
        }}
        model={layout}
        Layout={layers.fixed}
        Tile={Tile}
        aria-hidden={contentObscured}
      />
    );
    const scrollingGrid = (
      <Grid
        key="scrolling"
        className={styles.scrollingGrid}
        // The card in the view takes its height from the stage, so the
        // circle steps back above it (design 2b) instead of under it.
        style={notesHeight > 0 ? { marginBlockEnd: notesHeight } : undefined}
        model={layout}
        Layout={layers.scrolling}
        Tile={Tile}
        aria-hidden={contentObscured}
      />
    );
    // The grid tiles go *under* the spotlight in the portrait layout, but
    // *over* the spotlight in the expanded layout
    return layout.type === "spotlight-expanded" ? (
      <>
        {fixedGrid}
        {scrollingGrid}
      </>
    ) : (
      <>
        {scrollingGrid}
        {fixedGrid}
      </>
    );
  };

  const rageshakeRequestModalProps = useRageshakeRequestModal(
    matrixRoom.roomId,
  );

  const buttons: JSX.Element[] = [];

  buttons.push(
    <MicButton
      key="audio"
      muted={!audioEnabled || mediaError !== null}
      disableTooltip={isPopupMode}
      onClick={toggleAudio ?? undefined}
      onTouchEnd={onControlsTouchEnd}
      disabled={toggleAudio === null || mediaError !== null}
      data-testid="incall_mute"
    />,
    <VideoButton
      key="video"
      muted={!videoEnabled || mediaError !== null}
      disableTooltip={isPopupMode}
      onClick={toggleVideo ?? undefined}
      onTouchEnd={onControlsTouchEnd}
      disabled={toggleVideo === null || mediaError !== null}
      data-testid="incall_videomute"
    />,
  );
  if (vm.toggleScreenSharing !== null) {
    buttons.push(
      <ShareScreenButton
        key="share_screen"
        className={styles.shareScreen}
        enabled={sharingScreen}
        disableTooltip={isPopupMode}
        onClick={vm.toggleScreenSharing}
        onTouchEnd={onControlsTouchEnd}
        data-testid="incall_screenshare"
      />,
    );
  }
  if (supportsReactions && !isPopupMode) {
    buttons.push(
      <ReactionToggleButton
        vm={vm}
        key="raise_hand"
        className={styles.raiseHand}
        identifier={`${client.getUserId()}:${client.getDeviceId()}`}
        onTouchEnd={onControlsTouchEnd}
      />,
    );
  }
  if (!isPopupMode)
    buttons.push(
      <SettingsButton
        key="settings"
        onClick={openSettings}
        onTouchEnd={onControlsTouchEnd}
      />,
    );

  buttons.push(
    <EndCallButton
      key="end_call"
      disableTooltip={isPopupMode}
      onClick={function (): void {
        vm.hangup();
      }}
      onTouchEnd={onControlsTouchEnd}
      data-testid="incall_leave"
    />,
  );
  const notes = orisoEnabled && showControls && (
    <OrisoNotes
      ref={notesRef}
      open={notesOpen}
      onClose={closeNotes}
      layout={notesDocked ? "docked" : "sheet"}
      compact={!notesDocked && notesCompact}
      style={
        {
          "--oriso-notes-top": `${headerBounds.height + (orisoVideoOneOnOne && notesDocked ? 0 : 16)}px`,
          "--oriso-notes-dock-bottom": orisoVideoOneOnOne
            ? `${footerBounds.height}px`
            : undefined,
          "--oriso-footer-h": `${footerBounds.height}px`,
          // The phone's bar is one 72px pill (S9).
          "--oriso-toolbar-h": orisoMobile
            ? "72px"
            : notesCompact
              ? "56px"
              : "64px",
        } as CSSProperties
      }
    />
  );

  const footer = (
    <div
      ref={footerRef}
      className={classNames(styles.footer, {
        // Gives the view rail a row of its own on a phone; see the CSS.
        [styles.orisoFooter]: orisoEnabled,
        [styles.overlay]: windowMode === "flat",
        [styles.hidden]:
          !showFooter || (!showControls && headerStyle === "none"),
      })}
    >
      {headerStyle !== "none" && debugTileLayout
        ? `Tiles generation: ${tileStoreGeneration}`
        : undefined}
      {showControls &&
        (orisoEnabled ? (
          <OrisoToolbar
            {...callMenu}
            className={styles.orisoToolbar}
            compact={orisoMobile}
            audioMuted={!audioEnabled || mediaError !== null}
            onToggleAudio={mediaError === null ? toggleAudio : null}
            showVideo={!orisoAudioOnly}
            videoMuted={!videoEnabled || mediaError !== null}
            onToggleVideo={mediaError === null ? toggleVideo : null}
            handRaised={localHandRaised}
            onToggleHand={
              supportsReactions && !isPopupMode
                ? (): void => void toggleRaisedHand()
                : null
            }
            notesOpen={notesOpen}
            screenShareInBar={orisoVideoCall}
          />
        ) : (
          <>
            <div className={styles.buttons}>{buttons}</div>
            <LayoutToggle
              className={styles.layout}
              layout={gridMode}
              setLayout={setGridMode}
              onTouchEnd={onControlsTouchEnd}
            />
          </>
        ))}
    </div>
  );

  return (
    // Three contexts rather than props threaded through Grid: the tiles need
    // to know who somebody is and what form they are standing in, and Grid
    // deliberately hands a tile nothing but its rectangle. Going through it
    // would have meant teaching every upstream layout about a field it does
    // not use.
    <OrisoStageContext value={orisoStage}>
      <OrisoShapesContext value={orisoShapes}>
        <OrisoViewContext value={orisoView}>
          <OrisoPinsContext value={orisoPins}>
            <div
              className={styles.inRoom}
              ref={containerRef}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchCancel}
              onPointerMove={onPointerMove}
              onPointerOut={onPointerOut}
              onScroll={orisoEnabled ? onStageScroll : undefined}
              data-stage-scrolled={
                orisoEnabled && stageScrolled ? "true" : undefined
              }
              data-oriso={orisoEnabled ? "true" : undefined}
              data-oriso-video-stage={orisoVideoOneOnOne ? "true" : undefined}
              style={
                orisoVideoOneOnOne
                  ? ({
                      "--oriso-stage-gutter": `${videoStageGutter}px`,
                      "--oriso-video-notes-width": `${VIDEO_NOTES_WIDTH}px`,
                      "--oriso-video-notes-inset": `${dockInset}px`,
                    } as CSSProperties)
                  : undefined
              }
              data-notes-docked={notesShown && notesDocked ? "true" : undefined}
              // Names over video are always capsules (S7): a video call offers
              // no "dezent".
              data-oriso-names={
                orisoEnabled
                  ? orisoVideoCall
                    ? "popout"
                    : nameStyle
                  : undefined
              }
            >
              {/* The living backdrop. Behind everything, announced to
                nobody: it carries no information, and reading it out would be
                noise between a counsellor and what they need. The preset is
                the person's own choice, the carrier's motif by default. */}
              {atmosphereShown && (
                <div className={styles.orisoBackdrop} aria-hidden="true">
                  <Atmosphere palette={atmosphere} />
                </div>
              )}
              {header}
              {mediaError !== null && (
                <div className={styles.mediaError} role="alert">
                  <div>
                    <Text as="h2" size="sm" weight="semibold">
                      {mediaError.localisedTitle}
                    </Text>
                    {mediaError.localisedMessage && (
                      <Text size="sm">{mediaError.localisedMessage}</Text>
                    )}
                  </div>
                  <Button kind="secondary" size="sm" onClick={vm.retryMedia}>
                    {t("action.try_again")}
                  </Button>
                </div>
              )}
              {audioParticipants.map(({ livekitRoom, url, participants }) => (
                <LivekitRoomAudioRenderer
                  key={url}
                  url={url}
                  livekitRoom={livekitRoom}
                  validIdentities={participants}
                  muted={muteAllAudio}
                />
              ))}
              {renderContent()}
              <CallEventAudioRenderer vm={vm} muted={muteAllAudio} />
              <ReactionsAudioRenderer vm={vm} muted={muteAllAudio} />
              {reconnectingToast}
              <InitialDeviceNotice />
              {earpieceOverlay}
              <ReactionsOverlay vm={vm} />
              {waitingOverlay}
              {footer}
              {notes}
              {!isPopupMode && (
                <>
                  <RageshakeRequestModal {...rageshakeRequestModalProps} />
                  <SettingsModal
                    client={client}
                    roomId={matrixRoom.roomId}
                    open={settingsModalOpen}
                    onDismiss={closeSettings}
                    tab={settingsTab}
                    onTabChange={setSettingsTab}
                    // TODO expose correct data to setttings modal
                    livekitRooms={[]}
                  />
                </>
              )}
            </div>
          </OrisoPinsContext>
        </OrisoViewContext>
      </OrisoShapesContext>
    </OrisoStageContext>
  );
};
