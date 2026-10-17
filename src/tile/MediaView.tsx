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
import { type TileShape } from "../oriso/shape";

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

  return (
    <animated.div
      className={classNames(styles.media, className, {
        [styles.mirror]: mirror,
        [styles.oriso]: orisoIdentity !== undefined,
      })}
      style={style}
      ref={ref}
      data-testid="videoTile"
      data-video-fit={videoFit}
      data-oriso={orisoIdentity === undefined ? undefined : "true"}
      data-oriso-speaking={orisoSpeaking ? "true" : undefined}
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
          size={Math.min(targetWidth, targetHeight)}
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
            {displayName}
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
