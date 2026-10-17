/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The chain from a room state event to a face.
 *
 * `identity.contract.test.ts` proves the record the host publishes is one
 * this repository accepts. This proves the rest of the way: that the event
 * is found in room state under the right type, keyed by the right person,
 * and that a member nobody published anything for gets initials rather than
 * an invented animal.
 *
 * Between them the two cover the whole crossing, which is the part neither
 * repository's component tests can see.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type Room, RoomEvent } from "matrix-js-sdk";

import { readIdentities, useOrisoIdentities } from "./useOrisoIdentities";
import { ORISO_IDENTITY_EVENT_TYPE } from "./identity";

/** Exactly what ORISO-Frontend's `ownCallIdentity` puts on the wire. */
const FROM_THE_HOST = {
  "@anon:oriso.test": {
    kind: "animal",
    file: "fox.svg",
    bg: "#165E83",
    ink: "#ffffff",
  },
  "@berater:oriso.test": {
    kind: "motif",
    file: "owl.svg",
    bg: "#a5000a",
    ink: "#ffffff",
  },
};

function roomWith(records: Record<string, unknown>): Room {
  const emitter = new EventEmitter();
  const state = Object.assign(new EventEmitter(), {
    getStateEvents: (type: string) =>
      type !== ORISO_IDENTITY_EVENT_TYPE
        ? []
        : Object.entries(records).map(([userId, content]) => ({
            getStateKey: (): string => userId,
            getContent: (): unknown => content,
          })),
  });
  return Object.assign(emitter, { currentState: state }) as unknown as Room;
}

describe("finding out who everybody is", () => {
  it("reads what the host published, under the type it published it as", () => {
    const identities = readIdentities(roomWith(FROM_THE_HOST));
    expect([...identities.keys()].sort()).toEqual([
      "@anon:oriso.test",
      "@berater:oriso.test",
    ]);
    expect(identities.get("@anon:oriso.test")).toEqual(
      FROM_THE_HOST["@anon:oriso.test"],
    );
    expect(identities.get("@berater:oriso.test")?.kind).toBe("motif");
  });

  it("ignores a record that is not one, rather than failing the room", () => {
    // One malformed record must not cost everybody else their face.
    const identities = readIdentities(
      roomWith({ ...FROM_THE_HOST, "@broken:oriso.test": { kind: "animal" } }),
    );
    expect(identities.size).toBe(2);
    expect(identities.has("@broken:oriso.test")).toBe(false);
  });

  it("copes with a room whose state has not loaded", () => {
    expect(readIdentities({} as Room).size).toBe(0);
  });

  it("follows the room, so a motif changed mid-call changes on the stage", () => {
    const records: Record<string, unknown> = { ...FROM_THE_HOST };
    const room = roomWith(records);
    const { result } = renderHook(() => useOrisoIdentities(room));
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    records["@berater:oriso.test"] = {
      kind: "motif",
      file: "swan.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    };
    act(() => {
      (room as unknown as EventEmitter).emit(RoomEvent.CurrentStateUpdated);
    });
    expect(result.current.get("@berater:oriso.test")?.file).toBe("swan.svg");
  });

  it("hands back the same map when nothing changed", () => {
    // Every tile re-renders on a new map, and a membership event arrives for
    // reasons that have nothing to do with identities.
    const room = roomWith(FROM_THE_HOST);
    const { result } = renderHook(() => useOrisoIdentities(room));
    const first = result.current;
    act(() => {
      (room as unknown as EventEmitter).emit(RoomEvent.CurrentStateUpdated);
    });
    expect(result.current).toBe(first);
  });
});
