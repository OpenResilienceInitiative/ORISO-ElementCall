/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import i18n from "i18next";

import DE from "../../locales/de/app.json";
import { readTopic, stageTitle, stageTitleText } from "./stageTitle";

const base = {
  roomName: "Anruf",
  defaultRoomName: "Anruf",
  callType: "single" as const,
  topic: "Schuldnerberatung",
  group: false,
};

describe("the call's title (#2233 R6)", () => {
  it("names a 1:1 by its topic", () => {
    expect(stageTitle(base)).toEqual({
      kind: "one-on-one",
      topic: "Schuldnerberatung",
    });
  });

  it("calls a 1:1 without a topic an Einzelgespräch, not 'Anruf'", () => {
    expect(stageTitle({ ...base, topic: null })).toEqual({
      kind: "one-on-one",
      topic: null,
    });
  });

  it("names a 1:1 that grew into a group as the topic's group call", () => {
    expect(stageTitle({ ...base, group: true })).toEqual({
      kind: "group",
      topic: "Schuldnerberatung",
    });
  });

  it("keeps a real room name, e.g. a direct link's", () => {
    expect(stageTitle({ ...base, roomName: "Flyer Schule" })).toEqual({
      kind: "room",
      name: "Flyer Schule",
    });
  });

  it("names a group call by its chat and its kind (#2233 live test, v2.0.17)", () => {
    const chat = "QA Moabit · Brieftriage zu viert 08.11";
    // Dev, 16 Nov: the header read only the chat's name. It has to say what
    // kind of conversation it is too: "… · Gruppengespräch", "… · Kreis".
    expect(
      stageTitle({ ...base, callType: "group", topic: chat, group: true }),
    ).toEqual({ kind: "group", topic: chat });
    // Two people in a group conversation: still the chat's name and kind.
    expect(stageTitle({ ...base, callType: "circle", topic: chat })).toEqual({
      kind: "circle",
      topic: chat,
    });
    // A group room with a real name is called by it, and still says what it is.
    expect(
      stageTitle({
        ...base,
        callType: "group",
        topic: chat,
        roomName: "Flyer Schule",
      }),
    ).toEqual({ kind: "group", topic: "Flyer Schule" });
    expect(
      stageTitle({
        ...base,
        callType: "circle",
        topic: null,
        roomName: "Elterncafé",
      }),
    ).toEqual({ kind: "circle", topic: "Elterncafé" });
  });

  it("leaves group conversations without a name and untyped calls as they were", () => {
    expect(stageTitle({ ...base, callType: "group", topic: null })).toEqual({
      kind: "room",
      name: "Anruf",
    });
    expect(stageTitle({ ...base, callType: "circle", topic: null })).toEqual({
      kind: "room",
      name: "Anruf",
    });
    // An untyped call ignores a topic: an older host never sent one.
    expect(stageTitle({ ...base, callType: null, roomName: "" })).toEqual({
      kind: "room",
      name: "",
    });
  });
});

describe("the header's title text", () => {
  const t = i18n.t.bind(i18n);
  const chat = "QA Moabit · Brieftriage zu viert 08.11";

  it("puts the conversation's kind after a group's or a circle's name", () => {
    expect(stageTitleText({ kind: "group", topic: chat }, t, false)).toBe(
      `${chat} · Group call`,
    );
    expect(stageTitleText({ kind: "circle", topic: chat }, t, false)).toBe(
      `${chat} · Circle`,
    );
  });

  it("says Gruppengespräch and Kreis in German", () => {
    expect(DE.oriso.group_topic_title).toBe("{{topic}} · Gruppengespräch");
    expect(DE.oriso.circle_topic_title).toBe("{{topic}} · Kreis");
  });

  it("keeps the 1:1 and room titles as they were", () => {
    expect(
      stageTitleText({ kind: "one-on-one", topic: "Schulden" }, t, false),
    ).toBe(t("oriso.one_on_one_title", { topic: "Schulden" }));
    expect(stageTitleText({ kind: "one-on-one", topic: null }, t, false)).toBe(
      t("oriso.view_one_on_one"),
    );
    expect(stageTitleText({ kind: "room", name: "Flyer" }, t, true)).toBe(
      "Flyer",
    );
    expect(stageTitleText({ kind: "room", name: "" }, t, true)).toBe(
      t("oriso.video_stage_title"),
    );
    expect(stageTitleText({ kind: "room", name: "" }, t, false)).toBe(
      t("oriso.audio_stage_title"),
    );
  });
});

describe("the topic from the call address", () => {
  it("trims and collapses white space", () => {
    expect(readTopic("  Schulden \n beratung ")).toBe("Schulden beratung");
  });

  it("treats empty or missing as no topic", () => {
    expect(readTopic(null)).toBeNull();
    expect(readTopic("   ")).toBeNull();
  });

  it("cuts an overlong topic so the header stays one line", () => {
    const long = "x".repeat(200);
    expect(readTopic(long)?.length).toBe(80);
    expect(readTopic(long)?.endsWith("…")).toBe(true);
  });
});
