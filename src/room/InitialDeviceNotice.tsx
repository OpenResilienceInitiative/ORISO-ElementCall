/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Toast } from "../Toast";
import { useMediaDevices } from "../MediaDevicesContext";
import { useBehavior } from "../useBehavior";

/**
 * A short notice when a device the host app picked (by label,
 * ORISO-ElementCall#116) is not here: the call carries on with the default
 * device, and the person knows why they hear or see a different one.
 *
 * Not modal, so it never takes focus from the call; it goes away by itself.
 */
export const InitialDeviceNotice: FC = () => {
  const { t } = useTranslation();
  const unmatched = useBehavior(useMediaDevices().unmatchedInitialInputs$);
  // How many of the reports the person has already seen go.
  const [dismissed, setDismissed] = useState(0);
  const onDismiss = useCallback(
    () => setDismissed(unmatched.length),
    [unmatched.length],
  );

  // Nothing to say in almost every call: stay out of the tree.
  if (unmatched.length === 0) return null;

  const microphone = unmatched.includes("audioinput");
  const camera = unmatched.includes("videoinput");
  const message =
    microphone && camera
      ? t("initial_device_notice.both_not_found")
      : microphone
        ? t("initial_device_notice.microphone_not_found")
        : t("initial_device_notice.camera_not_found");

  return (
    <Toast
      open={unmatched.length > dismissed}
      onDismiss={onDismiss}
      autoDismiss={8000}
      modal={false}
    >
      {message}
    </Toast>
  );
};
