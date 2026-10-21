/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { animated } from "@react-spring/web";
import { type FC, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { VideoTrack } from "@livekit/components-react";
import { Text, Tooltip } from "@vector-im/compound-web";
import { ErrorSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./MediaView.module.css";
import { Avatar } from "../Avatar";
import { type EncryptionStatus } from "../state/MediaViewModel";
import { RaisedHandIndicator } from "../reactions/RaisedHandIndicator";
import { showHandRaisedTimer, useSetting } from "../settings/settings";
import { type ReactionOption } from "../reactions";
import { ReactionIndicator } from "../reactions/ReactionIndicator";
import { RTCConnectionStats } from "../RTCConnectionStats";
import { OrisoFace } from "../oriso/OrisoFace";
import { type OrisoIdentity } from "../oriso/identity";
import { splitName, type TileShape } from "../oriso/shape";
import { HALO_ROOM_MAX_SHARE, shapelessFaceSide } from "../oriso/halo";

interface Props extends ComponentProps<typeof animated.div> {
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  video: TrackReferenceOrPlaceholder | undefined;
  videoFit: "cover" | "contain";
  mirror: boolean;
  userId: string;
  videoEnabled: boolean;
  unencryptedWarning: boolean;
  encryptionStatus: EncryptionStatus;
  nameTagLeadingIcon?: ReactNode;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  focusable: boolean;
  primaryButton?: ReactNode;
  raisedHandTime?: Date;
  currentReaction?: ReactionOption;
  raisedHandOnClick?: () => void;
  waitingForMedia?: boolean;
  audioStreamStats?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  videoStreamStats?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  // The focus url, mainly for debugging purposes
  focusUrl?: string;
  /**
   * The person's ORISO identity, when the call has one for them.
   *
   * Present means the ORISO design: the tile is a form in this person's own
   * colour carrying their own animal, and the camera, when it is on, is
   * cropped into that same form. Absent means upstream's rectangle with a
   * Matrix avatar in the middle — which is what the lobby, the tests and any
   * standalone use still get, so this file serves both without a fork in the
   * tree above it.
   */
  orisoIdentity?: OrisoIdentity;
  /** The form the layout put this tile in. Only read with an identity. */
  orisoShape?: TileShape;
  /** Whether this person currently holds the floor. */
  orisoSpeaking?: boolean;
  /** The host's origin, so the artwork can be inherited rather than drawn. */
  orisoParentUrl?: string | null;
}

export const MediaView: FC<Props> = ({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  video,
  videoFit,
  mirror,
  userId,
  videoEnabled,
  unencryptedWarning,
  nameTagLeadingIcon,
  displayName,
  mxcAvatarUrl,
  focusable,
  primaryButton,
  encryptionStatus,
  raisedHandTime,
  currentReaction,
  raisedHandOnClick,
  waitingForMedia,
  audioStreamStats,
  videoStreamStats,
  focusUrl,
  orisoIdentity,
  orisoShape,
  orisoSpeaking = false,
  orisoParentUrl = null,
  ...props
}) => {
  const { t } = useTranslation();
  const [handRaiseTimerVisible] = useSetting(showHandRaisedTimer);

  const avatarSize = Math.round(Math.min(targetWidth, targetHeight) / 2);

  const hasVideo = video?.publication !== undefined;

  /*
   * Which half of a shared box this tile actually owns.
   *
   * In the Einzelgespräch both tiles are given the WHOLE circle and differ
   * only by the clip path that cuts them, which is what makes them one body.
   * But a tile is more than its background: without this the later tile's box
   * lay over both halves and swallowed every click meant for the other one,
   * and both name capsules sat at the same corner of the same circle, one on
   * top of the other.
   *
   * The clip goes on the tile ROOT, so hit-testing follows the seam — a
   * clipped-away region is not hit-testable — and the chrome is moved into
   * the half by the same `focusX` the artwork uses.
   */
  const orisoFocusShift =
    orisoShape?.focusX === undefined
      ? undefined
      : Math.round(
          (orisoShape.focusX - 0.5) * Math.min(targetWidth, targetHeight),
        );

  /*
   * Where this tile's half of the shared box actually is.
   *
   * Translating the chrome layer by the focus shift was not enough, and the
   * reason is arithmetic: `.fg` spans 84% of the WHOLE box, so moving it
   * sideways carries its left-aligned name capsule and its right-aligned
   * options button the same distance — the button of the left-hand tile
   * stayed past the seam and was clipped away, taking the tile's only menu
   * control with it. The chrome has to be sized to the half, not shifted
   * within the pair.
   *
   * The bounds follow exactly from `focusX`, which `EinzelgespraechLayout`
   * sets to the middle of the half it gave this tile: `share / 2` for the
   * left one and `share + (1 - share) / 2` for the right. So the seam is at
   * `2 * focusX` on the left and `2 * focusX - 1` on the right, and the 8%
   * chrome inset is taken from the half's own width rather than the pair's.
   */
  const orisoHalf = ((): { start: string; end: string } | undefined => {
    const focusX = orisoShape?.focusX;
    if (focusX === undefined) return undefined;
    const [start, end] = focusX < 0.5 ? [0, 2 * focusX] : [2 * focusX - 1, 1];
    const inset = 0.08 * (end - start);
    const percent = (value: number): string => `${(value * 100).toFixed(3)}%`;
    return { start: percent(start + inset), end: percent(1 - end + inset) };
  })();

  /*
   * How big the form is, and where its chrome goes.
   *
   * A shape from a layout is meant to fill the slot it was computed for, so
   * there the reference size is the tile's shorter side and `.face` fills the
   * tile. With no shape — the spotlight's single form — the face is a centred
   * square instead, because a 50% radius on a 300x200 box is a 300x200 oval
   * with the camera stretched into it.
   *
   * That square is `shapelessFaceSide`, which also keeps room for the halo:
   * the speaking stack is an outer shadow and both `SpotlightTile` and `Grid`
   * clip, so a form touching its tile's edge had its halo cut along that edge.
   *
   * Two things follow from the same number, which is why it comes from one
   * function. The face is sized to it, and the chrome layer is inset to it —
   * by 8% of the square's own side rather than of the rectangle around it,
   * because in an 800x450 spotlight the circle begins at x=175 while the name
   * capsule began near x=64, floating off the form it names.
   */
  const orisoSide =
    orisoShape === undefined
      ? shapelessFaceSide(targetWidth, targetHeight)
      : Math.min(targetWidth, targetHeight);

  const orisoCircle = ((): { inline: string; block: string } | undefined => {
    if (orisoIdentity === undefined || orisoShape !== undefined)
      return undefined;
    const pad = HALO_ROOM_MAX_SHARE * orisoSide;
    return {
      inline: `${Math.round((targetWidth - orisoSide) / 2 + pad)}px`,
      block: `${Math.round((targetHeight - orisoSide) / 2 + pad)}px`,
    };
  })();

  return (
    <animated.div
      className={classNames(styles.media, className, {
        [styles.mirror]: mirror,
        [styles.oriso]: orisoIdentity !== undefined,
      })}
      style={
        orisoShape?.clipPath === undefined &&
        orisoFocusShift === undefined &&
        orisoCircle === undefined
          ? style
          : {
              ...style,
              clipPath: orisoShape?.clipPath,
              ...(orisoFocusShift === undefined
                ? {}
                : { "--oriso-focus-shift": `${orisoFocusShift}px` }),
              ...(orisoHalf === undefined
                ? {}
                : {
                    "--oriso-half-inset-start": orisoHalf.start,
                    "--oriso-half-inset-end": orisoHalf.end,
                  }),
              ...(orisoCircle === undefined
                ? {}
                : {
                    "--oriso-circle-inset-inline": orisoCircle.inline,
                    "--oriso-circle-inset-block": orisoCircle.block,
                  }),
            }
      }
      ref={ref}
      data-testid="videoTile"
      data-video-fit={videoFit}
      data-oriso={orisoIdentity === undefined ? undefined : "true"}
      data-oriso-speaking={orisoSpeaking ? "true" : undefined}
      data-oriso-half={orisoFocusShift === undefined ? undefined : "true"}
      data-oriso-circle={orisoCircle === undefined ? undefined : "true"}
      {...props}
    >
      {orisoIdentity === undefined ? (
        <div className={styles.bg}>
          <Avatar
            id={userId}
            name={displayName}
            size={avatarSize}
            src={mxcAvatarUrl}
            className={styles.avatar}
            style={{ display: video && videoEnabled ? "none" : "initial" }}
          />
          {hasVideo && (
            <VideoTrack
              trackRef={video!}
              // There's no reason for this to be focusable
              tabIndex={-1}
              disablePictureInPicture
              style={{ display: video && videoEnabled ? "block" : "none" }}
              data-testid="video"
            />
          )}
        </div>
      ) : (
        <OrisoFace
          className={styles.bg}
          identity={orisoIdentity}
          size={orisoSide}
          contentSize={
            orisoShape?.contentShare === undefined
              ? undefined
              : Math.round(
                  Math.min(targetWidth, targetHeight) * orisoShape.contentShare,
                )
          }
          shape={orisoShape}
          speaking={orisoSpeaking}
          parentUrl={orisoParentUrl}
          // The camera takes the artwork's place and leaves the form alone.
          // With it off, the form carries the animal — there is no black
          // rectangle in between, which is the whole reason this branch
          // exists rather than a style override on the one above.
          video={
            hasVideo && videoEnabled ? (
              <VideoTrack
                trackRef={video!}
                tabIndex={-1}
                disablePictureInPicture
                data-testid="video"
              />
            ) : undefined
          }
          videoFit={videoFit}
        />
      )}
      <div className={styles.fg}>
        <div className={styles.reactions}>
          <RaisedHandIndicator
            raisedHandTime={raisedHandTime}
            miniature={avatarSize < 96}
            showTimer={handRaiseTimerVisible}
            onClick={raisedHandOnClick}
            tabIndex={focusable ? undefined : -1}
          />
          {currentReaction && (
            <ReactionIndicator
              miniature={avatarSize < 96}
              emoji={currentReaction.emoji}
            />
          )}
        </div>
        {waitingForMedia && (
          <div className={styles.status}>
            {t("video_tile.waiting_for_media")}
          </div>
        )}
        {(audioStreamStats || videoStreamStats) && (
          <RTCConnectionStats
            audio={audioStreamStats}
            video={videoStreamStats}
            focusUrl={focusUrl}
          />
        )}
        {/* TODO: Bring this back once encryption status is less broken */}
        {/*encryptionStatus !== EncryptionStatus.Okay && (
            <div className={styles.status}>
              <Text as="span" size="sm" weight="medium" className={styles.name}>
                {encryptionStatus === EncryptionStatus.Connecting &&
                  t("e2ee_encryption_status.connecting")}
                {encryptionStatus === EncryptionStatus.KeyMissing &&
                  t("e2ee_encryption_status.key_missing")}
                {encryptionStatus === EncryptionStatus.KeyInvalid &&
                  t("e2ee_encryption_status.key_invalid")}
                {encryptionStatus === EncryptionStatus.PasswordInvalid &&
                  t("e2ee_encryption_status.password_invalid")}
              </Text>
            </div>
          )*/}
        <div className={styles.nameTag}>
          {nameTagLeadingIcon}
          <Text
            as="span"
            size="sm"
            weight="medium"
            className={styles.name}
            data-testid="name_tag"
          >
            {orisoIdentity === undefined ? (
              displayName
            ) : (
              /*
               * Cut in the middle, not at the end.
               *
               * An ORISO pseudonym is "ruhiger Fuchs 432" and the number is
               * what tells two foxes apart; a plain ellipsis takes exactly
               * that off and leaves two people looking identical. The head
               * shrinks and ellipsises, the tail never does — no measuring,
               * no JavaScript, and it reflows with the capsule.
               */
              <>
                <span className={styles.nameHead}>
                  {splitName(displayName).head}
                </span>
                <span className={styles.nameTail}>
                  {splitName(displayName).tail}
                </span>
              </>
            )}
          </Text>
          {unencryptedWarning && (
            <Tooltip
              label={t("common.unencrypted")}
              placement="bottom"
              isTriggerInteractive={false}
              nonInteractiveTriggerTabIndex={focusable ? undefined : -1}
            >
              <ErrorSolidIcon
                width={20}
                height={20}
                className={styles.errorIcon}
                role="img"
                aria-label={t("common.unencrypted")}
              />
            </Tooltip>
          )}
        </div>
        {primaryButton}
      </div>
    </animated.div>
  );
};

MediaView.displayName = "MediaView";
