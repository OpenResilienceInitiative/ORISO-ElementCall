/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { TFunction } from "i18next";
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
 * is what the counsellor called it; a group room's name is followed by its
 * kind like a chat's. A group conversation is called by the
 * chat's own name, which the host sends in the same field: the #2233 live
 * test (16 Nov) had a team call titled "Anruf" while the chat card read
 * "Audioanruf · QA Moabit · Brieftriage zu viert 08.11". Followed by what
 * kind of conversation it is (v2.0.17): "… · Gruppengespräch" for a group
 * chat, "… · Kreis" for a Gesprächskreis. A group without that name, and
 * calls from an older host (no type), keep the room name; the caller falls
 * back to the stage title when that is empty.
 */
export type StageTitle =
  | { kind: "room"; name: string }
  | { kind: "one-on-one"; topic: string | null }
  | { kind: "group"; topic: string }
  | { kind: "circle"; topic: string };

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
  // A group room with its own name keeps it, and still says what it is
  // ("Elterncafé · Gruppengespräch", Frank 16 Nov).
  if (callType === "group" || callType === "circle") {
    const name = realName ? roomName : topic;
    return name === null
      ? { kind: "room", name: roomName }
      : { kind: callType, topic: name };
  }
  if (realName) return { kind: "room", name: roomName };
  if (callType !== "single") return { kind: "room", name: roomName };
  if (group)
    return topic === null
      ? { kind: "room", name: roomName }
      : { kind: "group", topic };
  return { kind: "one-on-one", topic };
}

/**
 * The header's text for a `StageTitle`: "Einzelgespräch · Schuldnerberatung",
 * "QA Moabit · Gruppengespräch", "Sucht · Kreis", or the room's name. A room
 * without a name is called after what the call is, "Videogespräch" or
 * "Telefongespräch".
 */
export function stageTitleText(
  title: StageTitle,
  t: TFunction,
  video: boolean,
): string {
  switch (title.kind) {
    case "one-on-one":
      return title.topic === null
        ? t("oriso.view_one_on_one")
        : t("oriso.one_on_one_title", { topic: title.topic });
    case "group":
      return t("oriso.group_topic_title", { topic: title.topic });
    case "circle":
      return t("oriso.circle_topic_title", { topic: title.topic });
    case "room":
      return (
        title.name ||
        t(video ? "oriso.video_stage_title" : "oriso.audio_stage_title")
      );
  }
}

/** Longest topic the header shows, ellipsis included. */
export const TOPIC_MAX_CHARS = 80;

/**
 * The topic as the call address carries it (`orisoTopic`: a 1:1's
 * Beratungsthema, a group chat's name): trimmed, white
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
