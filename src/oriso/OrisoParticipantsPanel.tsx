/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type KeyboardEvent,
  type Ref,
  type TouchEvent,
  useEffect,
  useId,
} from "react";
import { useTranslation } from "react-i18next";
import {
  CloseIcon,
  LinkIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";

import styles from "./OrisoParticipantsPanel.module.css";
import menuStyles from "./OrisoToolbar.module.css";
import { InviteLinkBody, useInviteLink } from "./InviteLinkButton";
import { type InviteLinkReply } from "./inviteLink";
import { lettersFor } from "./OrisoFace";
import { useArtwork } from "./artwork";
import { type OrisoIdentity } from "./identity";
import {
  useOrisoIdentity,
  useOrisoStage,
  useShownName,
} from "./useOrisoIdentities";

/** One person in the call, as the call knows them. */
export interface CallParticipant {
  userId: string;
  displayName: string;
}

interface Props {
  ref?: Ref<HTMLDivElement>;
  participants: readonly CallParticipant[];
  /** Asks the host for the call's link; null hides inviting (no host). */
  inviteRequest: (() => Promise<InviteLinkReply>) | null;
  /** Opened from "Einladelink senden": asks for the link at once. */
  inviting?: boolean;
  /** Up from the bar (desktop), or down from the header's ⋮ (phone, S9). */
  placement?: "bar" | "header";
  onClose: (refocus: boolean) => void;
  onTouchEnd?: (e: TouchEvent) => void;
}

/**
 * "Teilnehmende" (Frank, 12 Nov, ORISO-Frontend#2233): who is in the call,
 * and inviting somebody else — the link to this call, asked from the host,
 * copied and shown — without leaving the list. Whoever opens the link
 * knocks and is let in, so inviting a person and sending the link again are
 * the same act; the button says the first, the hint the second.
 *
 * Takes the call menu's place and look: it opens from the same `⋮`.
 */
export const OrisoParticipantsPanel: FC<Props> = ({
  ref,
  participants,
  inviteRequest,
  inviting = false,
  placement = "bar",
  onClose,
  onTouchEnd,
}) => {
  const { t } = useTranslation();
  const id = useId();
  const invite = useInviteLink(inviteRequest ?? noRequest);
  const { start } = invite;

  useEffect(() => {
    if (inviting && inviteRequest !== null) start();
  }, [inviting, inviteRequest, start]);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose(true);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className={classNames(menuStyles.menu, styles.panel)}
      data-placement={placement}
      data-testid="oriso-participants-panel"
      onKeyDown={onKeyDown}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.head}>
        <span id={`${id}-title`} className={styles.title}>
          {t("oriso.menu_participants")}
          <span className={styles.count}>{participants.length}</span>
        </span>
        <button
          type="button"
          className={styles.close}
          aria-label={t("oriso.invite_close")}
          onClick={() => onClose(true)}
        >
          <CloseIcon aria-hidden width={18} height={18} />
        </button>
      </div>
      <ul className={styles.list} aria-labelledby={`${id}-title`}>
        {participants.map((p) => (
          <ParticipantRow key={p.userId} {...p} />
        ))}
      </ul>
      {inviteRequest !== null && (
        <div className={styles.invite}>
          {invite.state.kind === "closed" ? (
            <button
              type="button"
              className={styles.inviteButton}
              onClick={start}
              data-testid="oriso-participants-invite"
            >
              <LinkIcon aria-hidden width={20} height={20} />
              {t("oriso.participants_invite")}
            </button>
          ) : (
            <InviteLinkBody state={invite.state} onCopy={invite.copyAgain} />
          )}
        </div>
      )}
    </div>
  );
};

const noRequest = async (): Promise<InviteLinkReply> =>
  Promise.resolve({ error: "no host" });

const ParticipantRow: FC<CallParticipant> = ({ userId, displayName }) => {
  const { t } = useTranslation();
  const { parentUrl = null } = useOrisoStage();
  const identity = useOrisoIdentity(userId, displayName);
  const name = useShownName(displayName, identity, userId);
  return (
    <li className={styles.person} data-testid="oriso-participant">
      {identity && <Avatar identity={identity} parentUrl={parentUrl} />}
      <span className={styles.who}>
        <span className={styles.name}>{name}</span>
        {identity?.role && (
          <span className={styles.role}>
            {t(`oriso.participant_role_${identity.role}`)}
          </span>
        )}
      </span>
    </li>
  );
};

/**
 * The person's animal (or letters) as a small flat circle. Not `OrisoFace`:
 * that one is a stage form, lifted and sized by the tile around it.
 */
const Avatar: FC<{ identity: OrisoIdentity; parentUrl: string | null }> = ({
  identity,
  parentUrl,
}) => {
  const artwork = useArtwork(identity, parentUrl);
  return (
    <span
      className={styles.face}
      style={{ background: identity.bg, color: identity.ink }}
      aria-hidden="true"
    >
      {artwork === null ? (
        lettersFor(identity)
      ) : (
        <img className={styles.artwork} src={artwork} alt="" />
      )}
    </span>
  );
};
