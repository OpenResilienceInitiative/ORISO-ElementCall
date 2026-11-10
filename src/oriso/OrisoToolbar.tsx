/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  type TouchEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import {
  EndCallIcon,
  GroupIcon,
  CollapseIcon,
  FullScreenIcon,
  ImageIcon,
  ListBulletedIcon,
  MicOffSolidIcon,
  MicOnSolidIcon,
  OverflowVerticalIcon,
  RaisedHandSolidIcon,
  SettingsSolidIcon,
  ShareScreenSolidIcon,
  VideoCallOffSolidIcon,
  VideoCallSolidIcon,
  VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./OrisoToolbar.module.css";
import { type NameStyle } from "./nameStyle";
import { type StageView, ViewSwitcher } from "./ViewSwitcher";

/** What the call menu (⋮) holds; shared by the bar and the mobile header. */
export interface CallMenuProps {
  /** Null hides the notes entry. */
  onToggleNotes: (() => void) | null;
  onHangup: () => void;
  participantCount: number;
  /**
   * "Namen & Symbole" (design 2a): dezent or as a capsule. Null hides the
   * section, e.g. on the video stage where names are always capsules.
   */
  nameStyle?: NameStyle;
  onNameStyleChange?: ((style: NameStyle) => void) | null;
  /**
   * "Hintergrund": opens the atmosphere popover in the header. The label is
   * the motif that is on; null hides the entry (no atmosphere on this stage).
   */
  backgroundLabel?: string | null;
  onOpenBackground?: (() => void) | null;
  /** Null hides it: screen sharing is not available here. */
  onToggleScreenShare: (() => void) | null;
  sharingScreen: boolean;
  /** Null hides both: this window mode mounts no settings dialog. */
  onOpenSoundSettings: (() => void) | null;
  onOpenSettings: (() => void) | null;
  /** People knocking on this call's link, from the host (#108). */
  waitingCount?: number;
  /** "Anklopfen" of this call's link; null hides the switch (no link to switch). */
  knock?: boolean | null;
  onKnockChange?: ((knock: boolean) => void) | null;
  onTouchEnd?: (e: TouchEvent) => void;
}

interface Props extends CallMenuProps {
  audioMuted: boolean;
  /** Null while the microphone cannot be toggled. */
  onToggleAudio: (() => void) | null;
  showVideo?: boolean;
  videoMuted: boolean;
  onToggleVideo: (() => void) | null;
  /** Null hides the hand: reactions are not available in this call. */
  handRaised: boolean;
  onToggleHand: (() => void) | null;
  /** "Meine Gesprächsnotiz" is open (#112). */
  notesOpen?: boolean;
  /**
   * "Bildschirm teilen" in the bar itself, not only in the menu: the video
   * call's bar in design 5a. An audio call keeps it in the menu.
   */
  screenShareInBar?: boolean;
  /**
   * The phone's full-screen bar (5b/5d, S9): one white bar with the
   * microphone, the camera (video only), the hand, the notes and a round
   * hang-up at its end. No `⋮` — the call menu is in the header there.
   */
  compact?: boolean;
  className?: string;
}

/**
 * The ORISO control bar, section 1c of the handoff.
 *
 * One white bar with the microphone, the camera, the hand, the notes and a
 * `⋮`, and the hang-up beside it as a round button of its own. Upstream's
 * black buttons and the view rail are gone from the footer; the rail lives
 * in the call header (S5), the `⋮` menu holds "Namen & Symbole" and
 * "Hintergrund" as in design 2a.
 *
 * The menu is rendered INSIDE the toolbar rather than in a portal, so the
 * toolbar's own z-index is the menu's too. That is the stacking order's rule
 * for the toolbar: z 20 on the toolbar itself, never only on its menu.
 */
export const OrisoToolbar: FC<Props> = ({
  audioMuted,
  onToggleAudio,
  showVideo = true,
  videoMuted,
  onToggleVideo,
  handRaised,
  onToggleHand,
  onToggleNotes,
  notesOpen = false,
  onHangup,
  participantCount,
  nameStyle = "popout",
  onNameStyleChange = null,
  backgroundLabel = null,
  onOpenBackground = null,
  onToggleScreenShare,
  sharingScreen,
  screenShareInBar = false,
  onOpenSoundSettings,
  onOpenSettings,
  waitingCount = 0,
  knock = null,
  onKnockChange = null,
  onTouchEnd,
  compact = false,
  className,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((refocus: boolean) => {
    setMenuOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useMenuPopover(menuOpen, setMenuOpen, triggerRef, menuRef);

  const micLabel = audioMuted
    ? t("unmute_microphone_button_label")
    : t("mute_microphone_button_label");
  const videoLabel = videoMuted
    ? t("start_video_button_label")
    : t("stop_video_button_label");
  const waiting =
    waitingCount > 0 ? t("oriso.waiting_count", { count: waitingCount }) : null;
  const menuLabel = waiting
    ? `${t("oriso.call_menu_label")}, ${waiting}`
    : t("oriso.call_menu_label");
  const shareLabel = sharingScreen
    ? t("stop_screenshare_button_label")
    : t("screenshare_button_label");
  const handLabel = handRaised
    ? t("action.lower_hand")
    : t("action.raise_hand");

  /* Wide and spelled out (design 2a/2b, "Auflegen"): the one action that
     ends the call should not be an icon to be guessed. Round on a phone. */
  const hangup = (
    <button
      type="button"
      className={styles.hangup}
      title={t("hangup_button_label")}
      onClick={onHangup}
      onTouchEnd={onTouchEnd}
      data-testid="incall_leave"
    >
      <EndCallIcon aria-hidden width={24} height={24} />
      <span className={styles.hangupLabel}>{t("oriso.hangup")}</span>
    </button>
  );

  return (
    <div
      className={classNames(styles.toolbar, className)}
      data-compact={compact || undefined}
      data-testid="oriso-toolbar"
    >
      <div
        className={styles.bar}
        role="toolbar"
        aria-label={t("oriso.controls_label")}
      >
        <ToolbarButton
          label={micLabel}
          state={audioMuted ? "off" : "live"}
          onClick={onToggleAudio}
          onTouchEnd={onTouchEnd}
          testId="incall_mute"
        >
          {audioMuted ? <MicOffSolidIcon /> : <MicOnSolidIcon />}
        </ToolbarButton>
        {showVideo && (
          <ToolbarButton
            label={videoLabel}
            state={videoMuted ? "off" : "live"}
            onClick={onToggleVideo}
            onTouchEnd={onTouchEnd}
            testId="incall_videomute"
          >
            {videoMuted ? <VideoCallOffSolidIcon /> : <VideoCallSolidIcon />}
          </ToolbarButton>
        )}
        {onToggleHand !== null && (
          <ToolbarButton
            label={handLabel}
            state={handRaised ? "raised" : "off"}
            pressed={handRaised}
            onClick={onToggleHand}
            onTouchEnd={onTouchEnd}
            testId="incall_raise_hand"
          >
            <RaisedHandSolidIcon />
          </ToolbarButton>
        )}
        {screenShareInBar && !compact && onToggleScreenShare !== null && (
          <ToolbarButton
            label={shareLabel}
            state={sharingScreen ? "live" : "off"}
            pressed={sharingScreen}
            onClick={onToggleScreenShare}
            onTouchEnd={onTouchEnd}
            testId="incall_screenshare"
          >
            <ShareScreenSolidIcon />
          </ToolbarButton>
        )}
        {onToggleNotes !== null && (
          <ToolbarButton
            label={t("oriso.notes_label")}
            state={notesOpen ? "open" : "off"}
            pressed={notesOpen}
            onClick={onToggleNotes}
            onTouchEnd={onTouchEnd}
            testId="incall_notes"
          >
            <ListBulletedIcon />
          </ToolbarButton>
        )}
        {!compact && (
          <ToolbarButton
            ref={triggerRef}
            label={menuLabel}
            state={menuOpen ? "open" : "off"}
            expanded={menuOpen}
            controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            onTouchEnd={onTouchEnd}
            testId="incall_menu"
          >
            <OverflowVerticalIcon />
            {waiting && (
              <span className={styles.badge} data-testid="oriso-waiting-badge">
                {waitingCount > 99 ? "99+" : waitingCount}
              </span>
            )}
          </ToolbarButton>
        )}
        {/* On a phone the hang-up is round and inside the one bar (5b/5d). */}
        {compact && hangup}
      </div>
      {!compact && hangup}
      {menuOpen && !compact && (
        <CallMenuPanel
          ref={menuRef}
          id={menuId}
          onClose={closeMenu}
          participantCount={participantCount}
          nameStyle={nameStyle}
          onNameStyleChange={onNameStyleChange}
          backgroundLabel={backgroundLabel}
          onOpenBackground={onOpenBackground}
          onToggleScreenShare={onToggleScreenShare}
          sharingScreen={sharingScreen}
          onToggleNotes={onToggleNotes}
          onOpenSoundSettings={onOpenSoundSettings}
          onOpenSettings={onOpenSettings}
          onHangup={onHangup}
          waitingCount={waitingCount}
          knock={knock}
          onKnockChange={onKnockChange}
          onTouchEnd={onTouchEnd}
        />
      )}
    </div>
  );
};

/**
 * A popover's own housekeeping: a click anywhere else closes it, and
 * opening moves focus to its first button so a keyboard user lands in it.
 */
export function useMenuPopover(
  open: boolean,
  setOpen: (open: boolean) => void,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return (): void =>
      document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen, triggerRef, panelRef]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [open, panelRef]);
}

interface CallMenuPanelProps extends CallMenuProps {
  ref?: Ref<HTMLDivElement>;
  id: string;
  /** Up from the bar (desktop), or down from the header's ⋮ (phone, S9). */
  placement?: "bar" | "header";
  /** Closes the menu; `refocus` puts focus back on its trigger. */
  onClose: (refocus: boolean) => void;
  /** Sections above the usual ones: on a phone the view rail and the window. */
  extra?: ReactNode;
  className?: string;
}

/**
 * The call menu's panel (1c), wherever its `⋮` is: in the bar on a desktop,
 * in the header on a phone (S9). The owner positions it and closes it on an
 * outside click; Escape and picking an entry close it from inside.
 */
export const CallMenuPanel: FC<CallMenuPanelProps> = ({
  ref,
  id,
  placement = "bar",
  onClose,
  extra,
  className,
  participantCount,
  nameStyle = "popout",
  onNameStyleChange = null,
  backgroundLabel = null,
  onOpenBackground = null,
  onToggleScreenShare,
  sharingScreen,
  onToggleNotes,
  onOpenSoundSettings,
  onOpenSettings,
  onHangup,
  waitingCount = 0,
  knock = null,
  onKnockChange = null,
  onTouchEnd,
}) => {
  const { t } = useTranslation();
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose(true);
  };
  /** Runs a menu entry and closes the menu behind it. */
  const pick = (action: () => void) => (): void => {
    onClose(false);
    action();
  };
  const waiting =
    waitingCount > 0 ? t("oriso.waiting_count", { count: waitingCount }) : null;
  const shareLabel = sharingScreen
    ? t("stop_screenshare_button_label")
    : t("screenshare_button_label");

  return (
    // A popover of buttons rather than an ARIA menu: it holds the view
    // rail, which is a radio group and may not sit inside role="menu".
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      id={id}
      className={classNames(styles.menu, className)}
      data-placement={placement}
      aria-label={t("oriso.call_menu_label")}
      role="group"
      data-testid="oriso-call-menu"
      onKeyDown={onKeyDown}
      // Its entries and its scroll area, or a tap reaches the call and
      // hides the footer, menu and all.
      onTouchEnd={onTouchEnd}
    >
      {extra}
      {onNameStyleChange !== null && (
        <div className={styles.section} data-entry="names">
          <span className={styles.sectionTitle} id={`${id}-names`}>
            {t("oriso.names_title")}
          </span>
          <div
            className={styles.nameCards}
            role="radiogroup"
            aria-labelledby={`${id}-names`}
          >
            {(["dezent", "popout"] as const).map((style) => (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={nameStyle === style}
                className={styles.nameCard}
                data-name-style={style}
                // The menu stays open: the person sees the names change.
                onClick={() => onNameStyleChange(style)}
                onTouchEnd={onTouchEnd}
              >
                <span className={styles.nameSample} aria-hidden="true">
                  {t("oriso.names_sample")}
                </span>
                <span>{t(`oriso.names_${style}`)}</span>
              </button>
            ))}
          </div>
          <span className={styles.rowDescription}>{t("oriso.names_hint")}</span>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.row} data-entry="participants">
          <span className={styles.rowLabel}>
            {t("oriso.menu_participants")}
          </span>
          <span className={styles.rowHint}>
            {participantCount}
            {waiting && <span className={styles.waiting}> · {waiting}</span>}
          </span>
          <GroupIcon aria-hidden width={21} height={21} />
        </div>
        {knock !== null && onKnockChange !== null && (
          <div className={styles.row} data-entry="knock">
            <span className={styles.rowLabel}>
              <span id={`${id}-knock`}>{t("oriso.knock_label")}</span>
              <span id={`${id}-knock-state`} className={styles.rowDescription}>
                {t(knock ? "oriso.knock_on" : "oriso.knock_off")}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={knock}
              aria-labelledby={`${id}-knock`}
              aria-describedby={`${id}-knock-state`}
              className={styles.switch}
              data-state={knock ? "on" : "off"}
              // The menu stays open: the person sees the switch flip.
              onClick={() => onKnockChange(!knock)}
              onTouchEnd={onTouchEnd}
              data-testid="oriso-knock-switch"
            >
              <span className={styles.switchThumb} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className={styles.section}>
        {onToggleScreenShare !== null && (
          <MenuEntry
            entry="share_screen"
            label={shareLabel}
            onClick={pick(onToggleScreenShare)}
          >
            <ShareScreenSolidIcon aria-hidden width={21} height={21} />
          </MenuEntry>
        )}
        {onOpenBackground !== null && (
          <MenuEntry
            entry="background"
            label={t("oriso.menu_background")}
            hint={backgroundLabel ?? undefined}
            onClick={pick(onOpenBackground)}
          >
            <ImageIcon aria-hidden width={21} height={21} />
          </MenuEntry>
        )}
        {onToggleNotes !== null && (
          <MenuEntry
            entry="notes"
            label={t("oriso.notes_label")}
            onClick={pick(onToggleNotes)}
          >
            <ListBulletedIcon aria-hidden width={21} height={21} />
          </MenuEntry>
        )}
        {onOpenSoundSettings !== null && (
          <MenuEntry
            entry="sound"
            label={t("oriso.menu_sound_devices")}
            onClick={pick(onOpenSoundSettings)}
          >
            <VolumeOnSolidIcon aria-hidden width={21} height={21} />
          </MenuEntry>
        )}
        {onOpenSettings !== null && (
          <MenuEntry
            entry="settings"
            label={t("common.settings")}
            onClick={pick(onOpenSettings)}
          >
            <SettingsSolidIcon aria-hidden width={21} height={21} />
          </MenuEntry>
        )}
      </div>
      <div className={styles.section}>
        <MenuEntry
          entry="leave"
          label={t("oriso.menu_leave")}
          onClick={pick(onHangup)}
          danger
        >
          <EndCallIcon aria-hidden width={21} height={21} />
        </MenuEntry>
      </div>
    </div>
  );
};

interface ToolbarButtonProps {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  /**
   * What the round fill says: `live` is a device that is on, `raised` the
   * hand, `open` a panel this button opened; `off` is no fill at all.
   */
  state: "off" | "live" | "raised" | "open";
  onClick: (() => void) | null;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  onTouchEnd?: (e: TouchEvent) => void;
  testId: string;
  children: ReactNode;
}

const ToolbarButton: FC<ToolbarButtonProps> = ({
  ref,
  label,
  state,
  onClick,
  pressed,
  expanded,
  controls,
  onTouchEnd,
  testId,
  children,
}) => (
  <button
    ref={ref}
    type="button"
    className={styles.button}
    data-state={state}
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    aria-expanded={expanded}
    aria-controls={expanded ? controls : undefined}
    disabled={onClick === null}
    onClick={onClick ?? undefined}
    onTouchEnd={onTouchEnd}
    data-testid={testId}
  >
    <span className={styles.fill} aria-hidden="true">
      {children}
    </span>
  </button>
);

export const MenuEntry: FC<{
  entry: string;
  label: string;
  /** Grey, at the row's end: what is on ("Lichtung"). */
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}> = ({ entry, label, hint, onClick, danger, children }) => (
  <button
    type="button"
    className={classNames(styles.row, styles.entry, {
      [styles.danger]: danger,
    })}
    data-entry={entry}
    onClick={onClick}
  >
    <span className={styles.rowLabel}>{label}</span>
    {hint !== undefined && <span className={styles.rowHint}>{hint}</span>}
    {children}
  </button>
);

interface MobileMenuProps extends CallMenuProps {
  /** "Ansicht": the view rail, which has no room in a phone's header. */
  views?: {
    offer: readonly StageView[];
    active: StageView;
    onChange: (view: StageView) => void;
  } | null;
  /**
   * "Schweben" / "Vollbild": the host shows the call full screen or floating
   * in the upper half (5c). Null when the host keeps its own window buttons.
   */
  onToggleWindow?: (() => void) | null;
  /** Whether the host shows the call full screen right now. */
  fullscreen?: boolean;
}

/**
 * The call menu behind the header's ⋮ on a phone (5b, S9).
 *
 * Everything the bar has no room for: the view rail, the window ("Schweben"
 * while full screen, "Vollbild" while floating) and the usual call menu.
 */
export const OrisoMobileMenu: FC<MobileMenuProps> = ({
  views = null,
  onToggleWindow = null,
  fullscreen = true,
  onTouchEnd,
  ...menu
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);
  useMenuPopover(open, setOpen, triggerRef, panelRef);

  const waitingCount = menu.waitingCount ?? 0;
  const waiting =
    waitingCount > 0 ? t("oriso.waiting_count", { count: waitingCount }) : null;
  const label = waiting
    ? `${t("oriso.call_menu_label")}, ${waiting}`
    : t("oriso.call_menu_label");
  const windowLabel = fullscreen
    ? t("oriso.window_float")
    : t("oriso.window_fullscreen");

  const extra = (views !== null || onToggleWindow !== null) && (
    <>
      {views !== null && views.offer.length > 1 && (
        <div className={styles.menuSection} data-entry="views">
          <span className={styles.sectionTitle}>{t("oriso.menu_view")}</span>
          <ViewSwitcher
            tone="light"
            active={views.active}
            offer={views.offer}
            onChange={views.onChange}
            onTouchEnd={onTouchEnd}
          />
        </div>
      )}
      {onToggleWindow !== null && (
        <div className={styles.section}>
          <MenuEntry
            entry="window"
            label={windowLabel}
            onClick={() => {
              close(false);
              onToggleWindow();
            }}
          >
            {fullscreen ? (
              <CollapseIcon aria-hidden width={21} height={21} />
            ) : (
              <FullScreenIcon aria-hidden width={21} height={21} />
            )}
          </MenuEntry>
        </div>
      )}
    </>
  );

  return (
    <div className={styles.mobileMenu}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.mobileTrigger}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((was) => !was)}
        onTouchEnd={onTouchEnd}
        data-testid="oriso-mobile-menu"
      >
        <OverflowVerticalIcon aria-hidden width={22} height={22} />
        {waiting && (
          <span className={styles.badge} data-testid="oriso-waiting-badge">
            {waitingCount > 99 ? "99+" : waitingCount}
          </span>
        )}
      </button>
      {open && (
        <CallMenuPanel
          {...menu}
          ref={panelRef}
          id={id}
          placement="header"
          onClose={close}
          extra={extra}
          onTouchEnd={onTouchEnd}
        />
      )}
    </div>
  );
};
