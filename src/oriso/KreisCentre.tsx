/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";

import styles from "./KreisCentre.module.css";
import { KREIS_CENTRE_TEXT_MIN, type KreisSpot } from "./kreis";
import { useOrisoIdentity, useShownName } from "./useOrisoIdentities";

interface Speaker {
  userId: string;
  displayName: string;
}

/** Bar heights of the indicator, the design's uneven little skyline. */
const BARS = [0.25, 0.45, 0.3, 0.7, 1, 0.55, 0.85, 0.4, 0.6, 0.3, 0.2];

/**
 * The Kreis's middle (design 2a): the room's sound indicator, and under it
 * who is speaking. Nobody speaking leaves the bars low and says so.
 *
 * Hidden from assistive technology: every form already says whether its
 * person speaks, and a second announcement in the middle would double it.
 */
export const KreisCentre: FC<{ plan: KreisSpot; speaker?: Speaker }> = ({
  plan,
  speaker,
}) => (
  <div
    className={styles.centre}
    data-testid="oriso-kreis-centre"
    data-speaking={speaker !== undefined}
    aria-hidden="true"
    style={{
      insetInlineStart: plan.x,
      insetBlockStart: plan.y,
      inlineSize: plan.size,
      blockSize: plan.size,
    }}
  >
    <span className={styles.bars}>
      {BARS.map((h, i) => (
        <span
          key={i}
          className={styles.bar}
          // Nobody speaking: the skyline lies down.
          style={{
            blockSize:
              speaker === undefined ? "15%" : `${Math.round(h * 100)}%`,
          }}
        />
      ))}
    </span>
    {/* A small disc keeps its bars only: the name and "spricht" no longer
        fit, and on a phone the wave band above says who speaks. */}
    {plan.size < KREIS_CENTRE_TEXT_MIN ? null : speaker === undefined ? (
      <Quiet />
    ) : (
      <Speaking speaker={speaker} />
    )}
  </div>
);

const Quiet: FC = () => {
  const { t } = useTranslation();
  return <span className={styles.status}>{t("oriso.kreis_quiet")}</span>;
};

const Speaking: FC<{ speaker: Speaker }> = ({ speaker }) => {
  const { t } = useTranslation();
  const identity = useOrisoIdentity(speaker.userId, speaker.displayName);
  const name = useShownName(speaker.displayName, identity, speaker.userId);
  return (
    <>
      <span className={styles.name} data-testid="oriso-kreis-speaker">
        {name}
      </span>
      <span className={styles.status}>{t("oriso.speaking")}</span>
    </>
  );
};
