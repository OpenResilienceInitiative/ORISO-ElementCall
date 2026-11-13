/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { readTopic, stageTitle } from "./stageTitle";

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

  it("leaves group conversations and untyped calls as they were", () => {
    expect(stageTitle({ ...base, callType: "group" })).toEqual({
      kind: "room",
      name: "Anruf",
    });
    expect(stageTitle({ ...base, callType: "circle" })).toEqual({
      kind: "room",
      name: "Anruf",
    });
    expect(stageTitle({ ...base, callType: null, roomName: "" })).toEqual({
      kind: "room",
      name: "",
    });
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
