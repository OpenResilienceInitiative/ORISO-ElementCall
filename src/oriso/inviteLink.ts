/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { OrisoWidgetActions, widget } from "../widget";

const logger = rootLogger.getChild("[inviteLink]");

/** What the host answered to `org.oriso.call.invite_link`. */
export type InviteLinkReply = { url: string } | { error: string };

/**
 * The host's reply, checked field by field.
 *
 * The host answers `{ url }` or `{ error: string }` as an ordinary reply —
 * NOT as a widget error, whose `error` is an object with a `message`. So the
 * transport resolves either way and the fields decide. Anything that is
 * neither (an old host, a garbled reply, a URL that is not http(s)) is an
 * error too, rather than a link nobody can open.
 */
export function readInviteReply(reply: unknown): InviteLinkReply {
  if (typeof reply === "object" && reply !== null) {
    const raw = reply as Record<string, unknown>;
    if (typeof raw.url === "string" && raw.url.trim() !== "") {
      const url = raw.url.trim();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:")
          return { url };
      } catch {
        // not a URL: falls through to the error below
      }
      return { error: "The host sent a link that is not a web address" };
    }
    if (typeof raw.error === "string" && raw.error.trim() !== "")
      return { error: raw.error.trim() };
    // A widget error that slipped through as data: `{ error: { message } }`.
    const nested = raw.error as { message?: unknown } | undefined;
    if (typeof nested?.message === "string") return { error: nested.message };
  }
  return { error: "The host did not send a link" };
}

/**
 * Asks the host for the call's link. Null outside a widget, where there is
 * no host to ask.
 */
export function inviteLinkRequester(): (() => Promise<InviteLinkReply>) | null {
  if (!widget) return null;
  const api = widget.api;
  return async (): Promise<InviteLinkReply> => {
    try {
      const reply = await api.transport.send(OrisoWidgetActions.InviteLink, {});
      return readInviteReply(reply);
    } catch (e) {
      logger.warn("The host did not answer for the call's link", e);
      const message =
        e instanceof Error && e.message ? e.message : "No answer from the host";
      return { error: message };
    }
  };
}
