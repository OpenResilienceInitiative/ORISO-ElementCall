/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type TouchEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  LinkIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./InviteLinkButton.module.css";
import { type InviteLinkReply } from "./inviteLink";

export type InviteState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "link"; url: string; copied: boolean | null }
  | { kind: "error"; message: string };

interface Props {
  /** Asks the host for the link (`org.oriso.call.invite_link`). */
  request: () => Promise<InviteLinkReply>;
  /** Dark on the video stage (5a), light over the atmosphere. */
  tone: "light" | "dark";
  /** A phone's header (S9): the icon alone, the words its name. */
  compact?: boolean;
  onTouchEnd?: (e: TouchEvent) => void;
}

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
 * by "Link teilen" in the header and the participants panel (#2233).
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
        setState({ kind: "error", message: reply.error });
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
          <p className={styles.detail}>{state.message}</p>
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

/**
 * "Link teilen" in the call header (call design S8).
 *
 * The link belongs to the host: one click asks for it, copies it to the
 * clipboard and shows it in a small popover with a copy button and what
 * happens next — whoever opens it knocks and is let in by this person. When
 * the host cannot make one, the popover says so instead.
 */
export const InviteLinkButton: FC<Props> = ({
  request,
  tone,
  compact = false,
  onTouchEnd,
}) => {
  const { t } = useTranslation();
  const id = useId();
  const { state, start, close, copyAgain } = useInviteLink(request);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = state.kind !== "closed";

  const onClick = useCallback(() => {
    if (open) close();
    else start();
  }, [open, close, start]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      close();
    };
    // Escape closes wherever focus is: the click leaves it on the trigger.
    const onEscape = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return (): void => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, close]);

  const label = t("oriso.invite_button");

  return (
    <div
      className={styles.invite}
      data-tone={tone}
      data-compact={compact || undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        data-compact={compact || undefined}
        onClick={onClick}
        onTouchEnd={onTouchEnd}
        data-testid="oriso-invite-button"
      >
        <LinkIcon aria-hidden width={20} height={20} />
        {!compact && <span>{label}</span>}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={id}
          role="dialog"
          aria-labelledby={`${id}-title`}
          className={styles.popover}
          onTouchEnd={onTouchEnd}
          data-testid="oriso-invite-popover"
        >
          <div className={styles.head}>
            <span id={`${id}-title`} className={styles.title}>
              {t("oriso.invite_title")}
            </span>
            <button
              type="button"
              className={styles.close}
              aria-label={t("oriso.invite_close")}
              onClick={close}
            >
              <CloseIcon aria-hidden width={18} height={18} />
            </button>
          </div>
          <InviteLinkBody state={state} onCopy={copyAgain} />
        </div>
      )}
    </div>
  );
};
