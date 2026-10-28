/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Button, IconButton, Text, Tooltip } from "@vector-im/compound-web";
import { type MatrixClient, type Room as MatrixRoom } from "matrix-js-sdk";
import {
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
import { ElementWidgetActions, OrisoWidgetActions, widget } from "../widget";
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
  defaultPipAlignment,
  defaultSpotlightAlignment,
} from "../grid/CallLayout";
import { makeOneOnOneLayout } from "../grid/OneOnOneLayout";
import { makeSpotlightExpandedLayout } from "../grid/SpotlightExpandedLayout";
import { makeSpotlightLandscapeLayout } from "../grid/SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "../grid/SpotlightPortraitLayout";
import { makeOrisoGroveLayout } from "../grid/OrisoGroveLayout";
import { makeEinzelgespraechLayout } from "../grid/EinzelgespraechLayout";
import { type StageView } from "../oriso/ViewSwitcher";
import { OrisoToolbar } from "../oriso/OrisoToolbar";
import {
  OrisoStageContext,
  useOrisoIdentities,
} from "../oriso/useOrisoIdentities";
import { OrisoShapeStore, OrisoShapesContext } from "../oriso/useOrisoShape";
import {
  ORISO_VIEW_STORAGE_KEY,
  OrisoViewContext,
  type OrisoView,
} from "../oriso/useOrisoView";
import { useLocalStorage } from "../useLocalStorage";
import {
  Atmosphere,
  DEFAULT_ATMOSPHERE,
  isAtmosphereName,
} from "../oriso/Atmosphere";
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
   * "Meine Notiz" is the host's notepad, not ours: the call only asks the
   * host to open or close it. Not offered outside a widget, where there is
   * no host to ask.
   */
  const toggleNotes = useMemo(
    () =>
      widget === null
        ? null
        : (): void => {
            widget!.api.transport
              .send(OrisoWidgetActions.ToggleNotes, {})
              .catch((e) => logger.warn("The host did not open its notes", e));
          },
    [],
  );

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
  const { parentUrl, orisoAtmosphere, orisoDesign } = useUrlParams();
  const orisoEnabled = orisoDesign;

  const [headerRef, headerBounds] = useMeasure();
  const [footerRef, footerBounds] = useMeasure();

  const gridBounds = useMemo(
    () => ({
      width: bounds.width,
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
        (windowMode === "flat" && !orisoEnabled ? 0 : footerBounds.height),
    }),
    [
      bounds.width,
      bounds.height,
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
    () => new BehaviorSubject(defaultPipAlignment),
  );

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
  const orisoStage = useMemo(
    () => ({
      identities: orisoIdentities,
      parentUrl,
      enabled: orisoEnabled,
    }),
    [orisoIdentities, parentUrl, orisoEnabled],
  );
  const orisoShapes = useInitial(() => new OrisoShapeStore());

  // The backdrop world. Configured centrally by the counselling centre, so it
  // arrives on the URL rather than being chosen in the call; an unknown name
  // falls back to the handoff's default rather than rendering nothing.
  const atmosphere =
    orisoAtmosphere !== null && isAtmosphereName(orisoAtmosphere)
      ? orisoAtmosphere
      : DEFAULT_ATMOSPHERE;

  // The arrangement is remembered, because it is a preference about how
  // somebody likes to see a room rather than a property of this call.
  const [storedView, setStoredView] = useLocalStorage(ORISO_VIEW_STORAGE_KEY);
  const orisoView: OrisoView = storedView === "felder" ? "felder" : "hain";

  /*
   * What the rail offers, and what it says is on.
   *
   * The machinery underneath holds two orthogonal settings: Kreis and Kacheln
   * are both grid mode with a different arrangement, Spotlight is the other
   * mode. See `useOrisoView.ts` for why they are not one enum.
   *
   * But at exactly two people `layoutMedia$` reaches for the one-on-one
   * layout first and it matches, so the stage is the Einzelgespräch whichever
   * arrangement is selected — and Kreis and Kacheln were BOTH no-ops there:
   * the radio moved and nothing else did. The rail now names the arrangement
   * that is actually on and offers the one real alternative, which is the
   * spotlight. Choosing the Einzelgespräch means grid mode, exactly as Kreis
   * does; the stored arrangement is left alone so that it comes back when a
   * third person arrives.
   */
  /*
   * Two people, as the VIEW MODEL counts them rather than as the stage
   * happens to look.
   *
   * This read `layout.type === "one-on-one"`, which is the same thing only
   * in grid mode: pick the spotlight at two people and the layout becomes a
   * spotlight, so the rail decided it was no longer a two-person call and
   * offered the grove and the fields again — both of which land straight
   * back on the Einzelgespräch. The control went back to naming arrangements
   * it cannot honour, which is the thing it was fixed to stop doing.
   */
  const alone = useBehavior(vm.orisoOneOnOne$);
  // A stable array, so the rail can memoise its entries on it and its
  // keyboard handler cannot close over a list that has moved on.
  const orisoOffer: readonly StageView[] = useMemo(
    () =>
      alone
        ? ["einzelgespraech", "spotlight"]
        : ["hain", "felder", "spotlight"],
    [alone],
  );
  const stageView: StageView =
    gridMode === "spotlight"
      ? "spotlight"
      : alone
        ? "einzelgespraech"
        : orisoView;
  const setStageView = useCallback(
    (view: StageView) => {
      if (view === "spotlight") {
        setGridMode("spotlight");
        return;
      }
      // The Einzelgespräch is not a stored arrangement — it is what two
      // people get — so picking it only says "not the spotlight".
      if (view !== "einzelgespraech") setStoredView(view);
      setGridMode("grid");
    },
    [setGridMode, setStoredView],
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

  let header: ReactNode = null;
  if (showHeader) {
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
      "one-on-one": orisoEnabled
        ? makeEinzelgespraechLayout(inputs)
        : makeOneOnOneLayout(inputs),
    };
  }, [gridBoundsObservable$, spotlightAlignment$, pipAlignment$, orisoEnabled]);

  const renderContent = (): JSX.Element => {
    if (layout.type === "pip") {
      return (
        <SpotlightTile
          className={classNames(styles.tile, styles.maximised)}
          vm={layout.spotlight}
          expanded
          onToggleExpanded={null}
          targetWidth={gridBounds.height}
          targetHeight={gridBounds.width}
          showIndicators={false}
          focusable={!contentObscured}
          aria-hidden={contentObscured}
        />
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
            className={styles.orisoToolbar}
            audioMuted={!audioEnabled || mediaError !== null}
            onToggleAudio={mediaError === null ? toggleAudio : null}
            videoMuted={!videoEnabled || mediaError !== null}
            onToggleVideo={mediaError === null ? toggleVideo : null}
            handRaised={localHandRaised}
            onToggleHand={
              supportsReactions && !isPopupMode
                ? (): void => void toggleRaisedHand()
                : null
            }
            onToggleNotes={toggleNotes}
            onHangup={() => vm.hangup()}
            participantCount={participantCount}
            view={stageView}
            offer={orisoOffer}
            onViewChange={setStageView}
            onToggleScreenShare={vm.toggleScreenSharing}
            sharingScreen={sharingScreen}
            onOpenSoundSettings={openSoundSettings}
            onOpenSettings={openSettings}
            onTouchEnd={onControlsTouchEnd}
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
          <div
            className={styles.inRoom}
            ref={containerRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            onPointerMove={onPointerMove}
            onPointerOut={onPointerOut}
            data-oriso={orisoEnabled ? "true" : undefined}
          >
            {/* The living backdrop. Behind everything, announced to
                nobody: it carries no information, and reading it out would be
                noise between a counsellor and what they need. The preset is
                the counselling centre's choice and travels on the URL — an
                advice seeker never picks it. */}
            {orisoEnabled && (
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
            {earpieceOverlay}
            <ReactionsOverlay vm={vm} />
            {waitingOverlay}
            {footer}
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
        </OrisoViewContext>
      </OrisoShapesContext>
    </OrisoStageContext>
  );
};
