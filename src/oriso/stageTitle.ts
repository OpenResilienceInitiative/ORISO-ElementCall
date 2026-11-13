/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { OrisoCallType } from "./stageViews";

/**
 * What the call header is called (#2233 R6).
 *
 * A 1:1 counselling call used to be titled "Anruf": the room's default name,
 * which says nothing. The host now sends the conversation's topic
 * (`orisoTopic`), so a 1:1 reads "Einzelgespräch · Schuldnerberatung", and
 * the same conversation grown into a group (somebody came in through the
 * shared link) reads "Schuldnerberatung · Gruppengespräch".
 *
 * A room that has a real name keeps it — a direct link's name, for instance,
 * is what the counsellor called it. Group conversations and calls from an
 * older host (no type) keep the room name too; the caller falls back to the
 * stage title when that is empty.
 */
export type StageTitle =
  | { kind: "room"; name: string }
  | { kind: "one-on-one"; topic: string | null }
  | { kind: "group"; topic: string };

export function stageTitle({
  roomName,
  defaultRoomName,
  callType,
  topic,
  group,
}: {
  /** The room's display name, as `roomDisplayName` gives it. */
  roomName: string;
  /** What `roomDisplayName` returns for a room without a real name. */
  defaultRoomName: string;
  callType: OrisoCallType | null;
  topic: string | null;
  /** Three or more people in the call. */
  group: boolean;
}): StageTitle {
  const realName = roomName !== "" && roomName !== defaultRoomName;
  if (callType !== "single" || realName)
    return { kind: "room", name: roomName };
  if (group)
    return topic === null
      ? { kind: "room", name: roomName }
      : { kind: "group", topic };
  return { kind: "one-on-one", topic };
}

/** Longest topic the header shows, ellipsis included. */
export const TOPIC_MAX_CHARS = 80;

/**
 * The topic as the call address carries it (`orisoTopic`): trimmed, white
 * space collapsed, cut to one header line. Plain text only — it is rendered
 * as a React text node, never as markup.
 */
export function readTopic(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > TOPIC_MAX_CHARS
    ? `${text.slice(0, TOPIC_MAX_CHARS - 1)}…`
    : text;
}
