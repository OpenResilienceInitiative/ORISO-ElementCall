/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useId } from "react";
import { useTranslation } from "react-i18next";

import styles from "./OrisoNameStyleSetting.module.css";
import { type NameStyle, useNameStyle } from "./nameStyle";

/** The capsule first: it is the default (Frank, 12 Nov, #2233). */
const CHOICES: readonly NameStyle[] = ["popout", "dezent"];

/**
 * "Namen & Symbole" (design 2a) in the settings dialog's preferences. It was
 * a section of the call menu; it is a preference rather than something done
 * during a call, and the menu needs the room for the invite link (#2233).
 * Saved in this browser; a running call follows the change at once.
 */
export const OrisoNameStyleSetting: FC = () => {
  const { t } = useTranslation();
  const id = useId();
  const [nameStyle, setNameStyle] = useNameStyle();

  return (
    <section className={styles.setting} data-testid="oriso-name-style-setting">
      <h4 className={styles.title} id={`${id}-title`}>
        {t("oriso.names_title")}
      </h4>
      <div
        className={styles.cards}
        role="radiogroup"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
      >
        {CHOICES.map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={nameStyle === style}
            className={styles.card}
            data-name-style={style}
            onClick={() => setNameStyle(style)}
          >
            <span className={styles.sample} aria-hidden="true">
              {t("oriso.names_sample")}
            </span>
            <span>{t(`oriso.names_${style}`)}</span>
          </button>
        ))}
      </div>
      <p className={styles.hint} id={`${id}-hint`}>
        {t("oriso.names_hint")}
      </p>
    </section>
  );
};
