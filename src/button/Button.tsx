/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { type ComponentPropsWithoutRef, type FC } from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { Button as CpdButton, Tooltip } from "@vector-im/compound-web";
import {
  MicOnSolidIcon,
  MicOffSolidIcon,
  VideoCallSolidIcon,
  VideoCallOffSolidIcon,
  EndCallIcon,
  ShareScreenSolidIcon,
  SettingsSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./Button.module.css";

interface TooltipControlProps {
  disableTooltip?: boolean;
}

interface MicButtonProps extends ComponentPropsWithoutRef<"button"> {
  muted: boolean;
}

export const MicButton: FC<MicButtonProps & TooltipControlProps> = ({
  muted,
  disableTooltip = false,
  ...props
}) => {
  const { t } = useTranslation();
  const Icon = muted ? MicOffSolidIcon : MicOnSolidIcon;
  const label = muted
    ? t("unmute_microphone_button_label")
    : t("mute_microphone_button_label");

  const button = (
    <CpdButton
      iconOnly
      Icon={Icon}
      kind={muted ? "primary" : "secondary"}
      {...props}
    />
  );

  return disableTooltip ? button : <Tooltip label={label}>{button}</Tooltip>;
};

interface VideoButtonProps extends ComponentPropsWithoutRef<"button"> {
  muted: boolean;
}

export const VideoButton: FC<VideoButtonProps & TooltipControlProps> = ({
  muted,
  disableTooltip = false,
  ...props
}) => {
  const { t } = useTranslation();
  const Icon = muted ? VideoCallOffSolidIcon : VideoCallSolidIcon;
  const label = muted
    ? t("start_video_button_label")
    : t("stop_video_button_label");

  const button = (
    <CpdButton
      iconOnly
      Icon={Icon}
      kind={muted ? "primary" : "secondary"}
      {...props}
    />
  );

  return disableTooltip ? button : <Tooltip label={label}>{button}</Tooltip>;
};

interface ShareScreenButtonProps
  extends ComponentPropsWithoutRef<"button">,
    TooltipControlProps {
  enabled: boolean;
}

export const ShareScreenButton: FC<ShareScreenButtonProps> = ({
  enabled,
  disableTooltip = false,
  ...props
}) => {
  const { t } = useTranslation();
  const label = enabled
    ? t("stop_screenshare_button_label")
    : t("screenshare_button_label");

  const button = (
    <CpdButton
      iconOnly
      Icon={ShareScreenSolidIcon}
      kind={enabled ? "primary" : "secondary"}
      {...props}
    />
  );

  return disableTooltip ? button : <Tooltip label={label}>{button}</Tooltip>;
};

export const EndCallButton: FC<
  ComponentPropsWithoutRef<"button"> & TooltipControlProps
> = ({
  className,
  disableTooltip = false,
  ...props
}) => {
  const { t } = useTranslation();

  const button = (
    <CpdButton
      className={classNames(className, styles.endCall)}
      iconOnly
      Icon={EndCallIcon}
      destructive
      {...props}
    />
  );

  return disableTooltip ? button : (
    <Tooltip label={t("hangup_button_label")}>{button}</Tooltip>
  );
};

export const SettingsButton: FC<
  ComponentPropsWithoutRef<"button"> & TooltipControlProps
> = ({ disableTooltip = false, ...props }) => {
  const { t } = useTranslation();

  const button = (
    <CpdButton
      iconOnly
      Icon={SettingsSolidIcon}
      kind="secondary"
      {...props}
    />
  );

  return disableTooltip ? button : (
    <Tooltip label={t("common.settings")}>{button}</Tooltip>
  );
};
