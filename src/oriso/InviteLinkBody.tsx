/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  CheckIcon,
  CopyIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./InviteLinkBody.module.css";
import { type InviteLinkReply } from "./inviteLink";

export type InviteState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "link"; url: string; copied: boolean | null }
  | { kind: "error" };

async function copy(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asking the host for the link, copying it and the popover's states; shared
 * by the guest button (#170) and the participants panel (#2233).
 */
export function useInviteLink(request: () => Promise<InviteLinkReply>): {
  state: InviteState;
  start: () => void;
  close: () => void;
  copyAgain: () => void;
} {
  const [state, setState] = useState<InviteState>({ kind: "closed" });
  // A reply that arrives after the popover was closed must not reopen it.
  const generation = useRef(0);

  const close = useCallback(() => {
    generation.current++;
    setState({ kind: "closed" });
  }, []);

  const start = useCallback(() => {
    const mine = ++generation.current;
    setState({ kind: "loading" });
    void request().then(async (reply) => {
      if (generation.current !== mine) return;
      if ("url" in reply) {
        const copied = await copy(reply.url);
        if (generation.current !== mine) return;
        setState({ kind: "link", url: reply.url, copied });
      } else {
        /*
         * The host's reason goes to the log, not on screen: it is an
         * untranslated technical string, and under the translated sentence
         * it read "Der Link konnte nicht erstellt werden." followed by "The
         * link could not be created" (#2233 live test, 16 Nov).
         */
        logger.warn("[oriso] invite link not created:", reply.error);
        setState({ kind: "error" });
      }
    });
  }, [request]);

  const copyAgain = useCallback(() => {
    if (state.kind !== "link") return;
    const url = state.url;
    void copy(url).then((copied) =>
      setState((was) =>
        was.kind === "link" && was.url === url ? { ...was, copied } : was,
      ),
    );
  }, [state]);

  return { state, start, close, copyAgain };
}

/** The popover's body for a state: loading, the link with copy, or an error. */
export const InviteLinkBody: FC<{
  state: InviteState;
  onCopy: () => void;
}> = ({ state, onCopy }) => {
  const { t } = useTranslation();
  return (
    <>
      {state.kind === "loading" && (
        <p className={styles.status} role="status">
          {t("oriso.invite_loading")}
        </p>
      )}
      {state.kind === "error" && (
        <div role="alert" data-testid="oriso-invite-error">
          <p className={styles.error}>{t("oriso.invite_error")}</p>
        </div>
      )}
      {state.kind === "link" && (
        <>
          <div className={styles.row}>
            <input
              className={styles.url}
              readOnly
              value={state.url}
              aria-label={t("oriso.invite_title")}
              onFocus={(e) => e.currentTarget.select()}
              data-testid="oriso-invite-url"
            />
            <button
              type="button"
              className={styles.copy}
              onClick={onCopy}
              data-testid="oriso-invite-copy"
            >
              {state.copied ? (
                <CheckIcon aria-hidden width={18} height={18} />
              ) : (
                <CopyIcon aria-hidden width={18} height={18} />
              )}
              {state.copied ? t("oriso.invite_copied") : t("oriso.invite_copy")}
            </button>
          </div>
          {state.copied === false && (
            <p className={styles.detail} role="status">
              {t("oriso.invite_copy_failed")}
            </p>
          )}
          <p className={styles.hint}>{t("oriso.invite_hint")}</p>
        </>
      )}
    </>
  );
};
