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
import {
  ErrorSolidIcon,
  RaisedHandSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./MediaView.module.css";
import { Avatar } from "../Avatar";
import { type EncryptionStatus } from "../state/MediaViewModel";
import { RaisedHandIndicator } from "../reactions/RaisedHandIndicator";
import { useHandDuration } from "../oriso/handDuration";
import { showHandRaisedTimer, useSetting } from "../settings/settings";
import { type ReactionOption } from "../reactions";
import { ReactionIndicator } from "../reactions/ReactionIndicator";
import { RTCConnectionStats } from "../RTCConnectionStats";
import { OrisoFace } from "../oriso/OrisoFace";
import { useOrisoStage } from "../oriso/useOrisoIdentities";
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
  /** My own tile: a circle on the video stage (#2233, D1). */
  orisoOwn?: boolean;
  /**
   * This tile is a SHARED SCREEN in the ORISO design (#2233, R25).
   *
   * A screen is not a person, so it never gets a form: it stays upstream's
   * tile, with no identity, and only its corner is the design's — a
   * rectangle, slightly rounded (`SHARE_RADIUS`), on the tile itself so it
   * holds wherever the share is drawn.
   */
  orisoShare?: boolean;
}

/*
 * A rectangle on the video stage or in the spotlight. It carries no lift, so
 * it has no halo either; whoever speaks gets the Einzelgespräch's inset rim
 * instead (#2233 review), or in a spotlight of five nothing visible would
 * change when somebody starts to talk.
 */
const VIDEO_STAGE_SHAPE: TileShape = {
  radius: "var(--cpd-space-5x)",
  tilt: 0,
  contentShare: 0.4,
  body: false,
  lifted: false,
  speakingAs: "rim",
};

// #2233 (D1): on the video stage my own picture is a circle.
const OWN_CIRCLE_SHAPE: TileShape = {
  radius: "50%",
  tilt: 0,
  contentShare: 0.5,
  body: false,
  lifted: false,
};

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
  videoEnabled: cameraEnabled,
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
  orisoShape: layoutShape,
  orisoSpeaking = false,
  orisoParentUrl = null,
  orisoOwn = false,
  orisoShare = false,
  ...props
}) => {
  const { t } = useTranslation();
  const [handRaiseTimerVisible] = useSetting(showHandRaisedTimer);

  const { audioOnly, rectangular } = useOrisoStage();
  /*
   * S6: on an ORISO form the raised hand is a status in the name's capsule,
   * with how long it has been up ("1:40"), rather than upstream's badge in
   * the corner. The Einzelgespräch's names are text under the circle and keep
   * the badge.
   */
  const handInCapsule =
    orisoIdentity !== undefined && layoutShape?.focusX === undefined;
  const handDuration = useHandDuration(
    handInCapsule ? raisedHandTime : undefined,
  );
  const orisoRectangular = orisoIdentity !== undefined && rectangular;
  const videoEnabled =
    cameraEnabled && !(orisoIdentity !== undefined && audioOnly);
  const orisoRound = orisoRectangular && orisoOwn;
  const orisoShape = orisoRectangular
    ? orisoRound
      ? OWN_CIRCLE_SHAPE
      : VIDEO_STAGE_SHAPE
    : layoutShape;
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
   * The clip is the FACE's (`OrisoFace` applies the shape's clip path), not
   * the root's: a clipped root also clipped the names, which stand outside
   * the circle. The root is made transparent to the pointer in CSS instead,
   * and the clipped face is the hit target, so hit-testing still follows the
   * seam.
   */
  const orisoFocusShift =
    orisoShape?.focusX === undefined
      ? undefined
      : Math.round(
          (orisoShape.focusX - 0.5) * Math.min(targetWidth, targetHeight),
        );

  /*
   * Which half of the shared box this tile is, for where its name goes.
   *
   * The names stand UNDER the circle (section 2b), the left half's at the
   * circle's left edge and the right half's at its right edge. `focusX` is
   * the middle of the half `EinzelgespraechLayout` gave this tile, so it says
   * which side that is.
   */
  const orisoHalfSide =
    orisoShape?.focusX === undefined
      ? undefined
      : orisoShape.focusX < 0.5
        ? "start"
        : "end";

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

  const nameText = (
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
          <span className={styles.nameHead}>{splitName(displayName).head}</span>
          <span className={styles.nameTail}>{splitName(displayName).tail}</span>
        </>
      )}
    </Text>
  );

  return (
    <animated.div
      className={classNames(styles.media, className, {
        [styles.mirror]: mirror,
        [styles.oriso]: orisoIdentity !== undefined,
      })}
      style={
        orisoFocusShift === undefined && orisoCircle === undefined
          ? style
          : {
              ...style,
              ...(orisoFocusShift === undefined
                ? {}
                : { "--oriso-focus-shift": `${orisoFocusShift}px` }),
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
      data-oriso-rectangular={orisoRectangular ? "true" : undefined}
      data-oriso-round={orisoRound ? "true" : undefined}
      data-oriso-speaking={orisoSpeaking ? "true" : undefined}
      data-oriso-half={orisoFocusShift === undefined ? undefined : "true"}
      data-oriso-side={orisoHalfSide}
      data-oriso-circle={orisoCircle === undefined ? undefined : "true"}
      data-oriso-name-side={orisoShape?.nameSide}
      data-oriso-share={orisoShare ? "true" : undefined}
      // A running camera under the name: then the name is always a capsule,
      // whatever "Namen & Symbole" says (S5).
      data-oriso-camera={
        orisoIdentity !== undefined && hasVideo && videoEnabled
          ? "true"
          : undefined
      }
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
          // The shapeless form sits in a tile that clips (the spotlight):
          // its halo is drawn to the room around it rather than cut by it.
          haloRoom={
            orisoShape === undefined
              ? (Math.min(targetWidth, targetHeight) - orisoSide) / 2
              : undefined
          }
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
            raisedHandTime={handInCapsule ? undefined : raisedHandTime}
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
          {orisoHalfSide === undefined && handDuration !== null && (
            <span
              className={styles.orisoHand}
              data-testid="oriso-hand"
              role="img"
              aria-label={t("oriso.hand_raised_for", {
                duration: handDuration,
              })}
            >
              <RaisedHandSolidIcon aria-hidden width={14} height={14} />
              <span aria-hidden="true">{handDuration}</span>
            </span>
          )}
          {orisoHalfSide === undefined && nameTagLeadingIcon}
          {orisoHalfSide === undefined ? (
            nameText
          ) : (
            // Under the circle: the name, and under it who is talking. The
            // microphone icon moves into that line, where it only shows when
            // the microphone is off.
            <span className={styles.orisoLabel}>
              {nameText}
              <span
                className={styles.orisoStatus}
                data-speaking={orisoSpeaking}
                data-testid="oriso_status"
              >
                {nameTagLeadingIcon}
                {orisoSpeaking ? t("oriso.speaking") : t("oriso.listening")}
              </span>
            </span>
          )}
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
