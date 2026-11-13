/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";

import styles from "./WaveBand.module.css";
import { useOrisoIdentity, useShownName } from "./useOrisoIdentities";

interface Speaker {
  userId: string;
  displayName: string;
}

/** The band's bars, an uneven run like the design's (5b). */
const BARS = [
  0.3, 0.6, 0.25, 0.9, 0.35, 0.7, 0.5, 0.8, 0.3, 0.55, 1, 0.4, 0.65, 0.25, 0.75,
  0.45, 0.9, 0.3, 0.6, 0.35, 0.8, 0.5, 0.25, 0.7, 0.4,
];

/**
 * The wave band (5b, S9): the room's sound across the width and, at its
 * end, who is speaking.
 *
 * The forms already say who speaks; this says it once more in words,
 * because the speaker's form may be off screen, small, or one of many.
 * In every view (R27), in three sizes — see `speakerBandPlace`:
 *
 * - `phone`: 5b's pill under the phone's header, name above "spricht".
 * - `header`: condensed into the desktop header, one 40px line.
 * - `pip`: a slim line above the minimised call's one form.
 *
 * Reduced motion keeps the bars at their heights and stops the wave.
 */
export const WaveBand: FC<{
  speaker: Speaker | null;
  variant?: "phone" | "header" | "pip";
  /** The header it sits in: light (2a/2b) or the dark video stage (5a). */
  tone?: "light" | "dark";
}> = ({ speaker, variant = "phone", tone = "light" }) => {
  const { t } = useTranslation();
  return (
    <div
      className={styles.band}
      data-variant={variant}
      data-tone={tone}
      data-speaking={speaker !== null}
      data-testid="oriso-wave-band"
      role="status"
      aria-label={t("oriso.wave_label")}
    >
      <span className={styles.bars} aria-hidden="true">
        {BARS.map((h, i) => (
          <span
            key={i}
            className={styles.bar}
            style={{
              blockSize: speaker === null ? "12%" : `${Math.round(h * 100)}%`,
              animationDelay: `${(i % 7) * -0.13}s`,
            }}
          />
        ))}
      </span>
      {speaker === null ? (
        <span className={styles.who}>
          <span className={styles.status}>{t("oriso.kreis_quiet")}</span>
        </span>
      ) : (
        <SpeakerName speaker={speaker} />
      )}
    </div>
  );
};

const SpeakerName: FC<{ speaker: Speaker }> = ({ speaker }) => {
  const { t } = useTranslation();
  const identity = useOrisoIdentity(speaker.userId, speaker.displayName);
  const name = useShownName(speaker.displayName, identity, speaker.userId);
  return (
    <span className={styles.who}>
      <span className={styles.name} data-testid="oriso-wave-speaker">
        {name}
      </span>
      <span className={styles.status}>{t("oriso.speaking")}</span>
    </span>
  );
};
