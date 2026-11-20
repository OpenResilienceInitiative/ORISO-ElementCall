/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  POINTER_TOPIC,
  decodePointer,
  encodePointer,
  userIdOfParticipant,
} from "./protocol";

describe("pointer protocol", () => {
  it("has its own topic, so nothing else on the data channel is read as a pointer", () => {
    expect(POINTER_TOPIC).toBe("org.oriso.call.pointer");
  });

  it("round-trips a position", () => {
    const msg = { share: "@a:oriso.org:DEV", x: 0.25, y: 0.75 };
    expect(decodePointer(encodePointer(msg))).toEqual(msg);
  });

  it("round-trips a hide (pointer left the screen)", () => {
    const msg = { share: "@a:oriso.org:DEV", x: null, y: null };
    expect(decodePointer(encodePointer(msg))).toEqual(msg);
  });

  it("keeps a message small (4 decimals is ±0.2 px on a 4K screen)", () => {
    const bytes = encodePointer({
      share: "@a:oriso.org:DEV",
      x: 0.123456789,
      y: 0.987654321,
    });
    expect(bytes.byteLength).toBeLessThan(80);
    expect(decodePointer(bytes)).toEqual({
      share: "@a:oriso.org:DEV",
      x: 0.1235,
      y: 0.9877,
    });
  });

  it("rejects anything that is not a pointer", () => {
    const enc = new TextEncoder();
    for (const bad of [
      "not json",
      "{}",
      '{"v":2,"s":"x","x":0.5,"y":0.5}',
      '{"v":1,"s":"x","x":1.5,"y":0.5}',
      '{"v":1,"s":"x","x":-0.1,"y":0.5}',
      '{"v":1,"s":"x","x":"0.5","y":0.5}',
      '{"v":1,"s":"","x":0.5,"y":0.5}',
      '{"v":1,"s":"x","x":0.5,"y":null}',
    ]) {
      expect(decodePointer(enc.encode(bad))).toBeNull();
    }
  });

  it("reads the Matrix user out of a LiveKit identity (user id : device id)", () => {
    expect(userIdOfParticipant("@cyrus:oriso.org:ABCDEF")).toBe(
      "@cyrus:oriso.org",
    );
    expect(userIdOfParticipant("@a:b.c:8448:DEV")).toBe("@a:b.c:8448");
    expect(userIdOfParticipant("nocolon")).toBeNull();
  });
});
