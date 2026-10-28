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
import { type StageView, ViewSwitcher } from "./ViewSwitcher";

interface Props {
  audioMuted: boolean;
  /** Null while the microphone cannot be toggled. */
  onToggleAudio: (() => void) | null;
  videoMuted: boolean;
  onToggleVideo: (() => void) | null;
  /** Null hides the hand: reactions are not available in this call. */
  handRaised: boolean;
  onToggleHand: (() => void) | null;
  /** Null hides the notes: only the host app has a notepad. */
  onToggleNotes: (() => void) | null;
  onHangup: () => void;
  participantCount: number;
  view: StageView;
  offer: readonly StageView[];
  onViewChange: (view: StageView) => void;
  /** Null hides it: screen sharing is not available here. */
  onToggleScreenShare: (() => void) | null;
  sharingScreen: boolean;
  onOpenSoundSettings: () => void;
  onOpenSettings: () => void;
  onTouchEnd?: (e: TouchEvent) => void;
  className?: string;
}

/**
 * The ORISO control bar, section 1c of the handoff.
 *
 * One white bar with the microphone, the camera, the hand, the notes and a
 * `⋮`, and the hang-up beside it as a round button of its own. Upstream's
 * black buttons and the view rail are gone from the footer; the rail moved
 * into the `⋮` menu under "Ansicht".
 *
 * The menu is rendered INSIDE the toolbar rather than in a portal, so the
 * toolbar's own z-index is the menu's too. That is the stacking order's rule
 * for the toolbar: z 20 on the toolbar itself, never only on its menu.
 */
export const OrisoToolbar: FC<Props> = ({
  audioMuted,
  onToggleAudio,
  videoMuted,
  onToggleVideo,
  handRaised,
  onToggleHand,
  onToggleNotes,
  onHangup,
  participantCount,
  view,
  offer,
  onViewChange,
  onToggleScreenShare,
  sharingScreen,
  onOpenSoundSettings,
  onOpenSettings,
  onTouchEnd,
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

  // A click anywhere else closes the menu, as a popover should.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return (): void =>
      document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // Opening moves focus into the menu, so a keyboard user lands on it.
  useEffect(() => {
    if (menuOpen)
      menuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [menuOpen]);

  const onMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeMenu(true);
    },
    [closeMenu],
  );

  /** Runs a menu entry and closes the menu behind it. */
  const pick = (action: () => void) => (): void => {
    closeMenu(false);
    action();
  };

  const micLabel = audioMuted
    ? t("unmute_microphone_button_label")
    : t("mute_microphone_button_label");
  const videoLabel = videoMuted
    ? t("start_video_button_label")
    : t("stop_video_button_label");
  const handLabel = handRaised
    ? t("action.lower_hand")
    : t("action.raise_hand");

  return (
    <div
      className={classNames(styles.toolbar, className)}
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
        <ToolbarButton
          label={videoLabel}
          state={videoMuted ? "off" : "live"}
          onClick={onToggleVideo}
          onTouchEnd={onTouchEnd}
          testId="incall_videomute"
        >
          {videoMuted ? <VideoCallOffSolidIcon /> : <VideoCallSolidIcon />}
        </ToolbarButton>
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
        {onToggleNotes !== null && (
          <ToolbarButton
            label={t("oriso.notes_label")}
            state="off"
            onClick={onToggleNotes}
            onTouchEnd={onTouchEnd}
            testId="incall_notes"
          >
            <ListBulletedIcon />
          </ToolbarButton>
        )}
        <ToolbarButton
          ref={triggerRef}
          label={t("oriso.call_menu_label")}
          state={menuOpen ? "open" : "off"}
          expanded={menuOpen}
          controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
          onTouchEnd={onTouchEnd}
          testId="incall_menu"
        >
          <OverflowVerticalIcon />
        </ToolbarButton>
      </div>
      <button
        type="button"
        className={styles.hangup}
        aria-label={t("hangup_button_label")}
        onClick={onHangup}
        onTouchEnd={onTouchEnd}
        data-testid="incall_leave"
      >
        <EndCallIcon aria-hidden width={24} height={24} />
      </button>

      {menuOpen && (
        // A popover of buttons rather than an ARIA menu: it holds the view
        // rail, which is a radio group and may not sit inside role="menu".
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={menuRef}
          id={menuId}
          className={styles.menu}
          aria-label={t("oriso.call_menu_label")}
          role="group"
          data-testid="oriso-call-menu"
          onKeyDown={onMenuKeyDown}
        >
          <div className={styles.section}>
            <div className={styles.row} data-entry="participants">
              <span className={styles.rowLabel}>
                {t("oriso.menu_participants")}
              </span>
              <span className={styles.rowHint}>{participantCount}</span>
              <GroupIcon aria-hidden width={21} height={21} />
            </div>
            <div className={styles.row} data-entry="view">
              <span className={styles.rowLabel}>{t("oriso.menu_view")}</span>
              <ViewSwitcher
                tone="light"
                active={view}
                offer={offer}
                // The menu stays open: the arrows move the selection too,
                // and the person sees the stage change behind it.
                onChange={onViewChange}
                onTouchEnd={onTouchEnd}
              />
            </div>
          </div>
          <div className={styles.section}>
            {onToggleScreenShare !== null && (
              <MenuEntry
                entry="share_screen"
                label={
                  sharingScreen
                    ? t("stop_screenshare_button_label")
                    : t("screenshare_button_label")
                }
                onClick={pick(onToggleScreenShare)}
              >
                <ShareScreenSolidIcon aria-hidden width={21} height={21} />
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
            <MenuEntry
              entry="sound"
              label={t("oriso.menu_sound_devices")}
              onClick={pick(onOpenSoundSettings)}
            >
              <VolumeOnSolidIcon aria-hidden width={21} height={21} />
            </MenuEntry>
            <MenuEntry
              entry="settings"
              label={t("common.settings")}
              onClick={pick(onOpenSettings)}
            >
              <SettingsSolidIcon aria-hidden width={21} height={21} />
            </MenuEntry>
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
      )}
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

const MenuEntry: FC<{
  entry: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}> = ({ entry, label, onClick, danger, children }) => (
  <button
    type="button"
    className={classNames(styles.row, styles.entry, {
      [styles.danger]: danger,
    })}
    data-entry={entry}
    onClick={onClick}
  >
    <span className={styles.rowLabel}>{label}</span>
    {children}
  </button>
);
