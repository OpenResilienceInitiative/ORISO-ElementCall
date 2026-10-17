/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The chain from an encrypted timeline event to a face.
 *
 * `identity.contract.test.ts` proves the record the host publishes is one
 * this repository accepts. This proves the rest of the way: that the event
 * is found in the room's timeline under the right type, credited to the
 * person who sent it, and that a member nobody published anything for gets
 * initials rather than an invented animal.
 *
 * Between them the two cover the whole crossing, which is the part neither
 * repository's component tests can see.
 */
import { EventEmitter } from "node:events";
import { type FC, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type Room, RoomEvent } from "matrix-js-sdk";

import {
  OrisoStageContext,
  readIdentities,
  useOrisoIdentities,
  useOrisoIdentity,
} from "./useOrisoIdentities";
import { ORISO_IDENTITY_EVENT_TYPE, type OrisoIdentity } from "./identity";

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

interface TimelineRoom {
  room: Room;
  /** Send another record, as that person's own client would. */
  push: (sender: string, content: unknown) => void;
}

/**
 * A room whose live timeline holds identity records.
 *
 * Timeline, not state: an identity in room state is readable by the
 * homeserver, because Matrix does not encrypt state events. The host sends
 * these as ordinary room events so the room's Megolm session covers them, and
 * what arrives here has already been decrypted by the host before it was fed
 * to the widget.
 */
function roomWith(
  records: Record<string, unknown>,
  /** Who actually sent each record, when that is not the person it describes. */
  senderFor?: (userId: string) => string,
): TimelineRoom {
  const emitter = new EventEmitter();
  const events: unknown[] = [
    // Something else in the timeline, so the filter has work to do.
    {
      getType: (): string => "m.room.message",
      getSender: (): string => "@anon:oriso.test",
      getContent: (): unknown => ({ body: "hello" }),
    },
  ];
  const push = (sender: string, content: unknown): void => {
    events.push({
      getType: (): string => ORISO_IDENTITY_EVENT_TYPE,
      getSender: (): string => sender,
      getContent: (): unknown => content,
    });
  };
  for (const [userId, content] of Object.entries(records))
    push(senderFor?.(userId) ?? userId, content);
  const room = Object.assign(emitter, {
    getLiveTimeline: (): { getEvents: () => unknown[] } => ({
      getEvents: (): unknown[] => events,
    }),
  }) as unknown as Room;
  return { room, push };
}

describe("finding out who everybody is", () => {
  it("reads what the host published, under the type it published it as", () => {
    const identities = readIdentities(roomWith(FROM_THE_HOST).room);
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
      roomWith({ ...FROM_THE_HOST, "@broken:oriso.test": { kind: "animal" } })
        .room,
    );
    expect(identities.size).toBe(2);
    expect(identities.has("@broken:oriso.test")).toBe(false);
  });

  it("credits a record to whoever sent it, not to whoever it describes", () => {
    /*
     * The one property that makes a record trustworthy.
     *
     * As a state event this needed checking by hand: the key was a user id,
     * so one participant could write a record under another's and the reader
     * had to compare key against sender or be deceived. A timeline event has
     * no key to claim. Whatever this content says, it is filed under the
     * sender — so a mischief-maker can only ever change their OWN face, and
     * the people they tried to impersonate are simply absent and fall back to
     * initials.
     */
    const identities = readIdentities(
      roomWith(FROM_THE_HOST, () => "@mischief:oriso.test").room,
    );
    expect(identities.has("@anon:oriso.test")).toBe(false);
    expect(identities.has("@berater:oriso.test")).toBe(false);
    expect([...identities.keys()]).toEqual(["@mischief:oriso.test"]);
  });

  it("lets the newest record win", () => {
    // Which is what makes the host's re-send on a new arrival an update
    // rather than a second, conflicting answer.
    const { room, push } = roomWith(FROM_THE_HOST);
    push("@berater:oriso.test", {
      kind: "motif",
      file: "swan.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    });
    expect(readIdentities(room).get("@berater:oriso.test")?.file).toBe(
      "swan.svg",
    );
  });

  it("copes with a room whose timeline has not loaded", () => {
    expect(readIdentities({} as Room).size).toBe(0);
    expect(
      readIdentities({ getLiveTimeline: () => ({}) } as unknown as Room).size,
    ).toBe(0);
  });

  it("follows the room, so a motif changed mid-call changes on the stage", () => {
    const { room, push } = roomWith(FROM_THE_HOST);
    const { result } = renderHook(() => useOrisoIdentities(room));
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    act(() => {
      push("@berater:oriso.test", {
        kind: "motif",
        file: "swan.svg",
        bg: "#a5000a",
        ink: "#ffffff",
      });
      (room as unknown as EventEmitter).emit(RoomEvent.Timeline);
    });
    expect(result.current.get("@berater:oriso.test")?.file).toBe("swan.svg");
  });

  it("hands back the same map when nothing changed", () => {
    // Every tile re-renders on a new map, and a timeline event arrives for
    // reasons that have nothing to do with identities.
    const { room } = roomWith(FROM_THE_HOST);
    const { result } = renderHook(() => useOrisoIdentities(room));
    const first = result.current;
    act(() => {
      (room as unknown as EventEmitter).emit(RoomEvent.Timeline);
    });
    expect(result.current).toBe(first);
  });
});

describe("what one tile is told", () => {
  const withStage = (
    identities: Map<string, OrisoIdentity>,
  ): FC<{ children: ReactNode }> =>
    function Stage({ children }: { children: ReactNode }) {
      return (
        <OrisoStageContext
          value={{ identities, parentUrl: null, enabled: true }}
        >
          {children}
        </OrisoStageContext>
      );
    };

  it("gives a published animal letters to stand in while it loads", () => {
    /*
     * A published animal record carries `file`, `bg` and `ink` and no
     * letters — it does not need any. But the artwork is FETCHED from the
     * host, so between mounting and arriving, and for good if the host is
     * unreachable, the form has a colour and nothing in it. The promised
     * fallback was initials; the first version rendered an empty string and
     * only its test looked right, because the test added letters to the
     * animal by hand.
     */
    const { result } = renderHook(
      () => useOrisoIdentity("@anon:oriso.test", "ruhiger Fuchs 432"),
      {
        wrapper: withStage(
          new Map([
            [
              "@anon:oriso.test",
              {
                kind: "animal",
                file: "fox.svg",
                bg: "#165E83",
                ink: "#ffffff",
              } satisfies OrisoIdentity,
            ],
          ]),
        ),
      },
    );
    expect(result.current?.kind).toBe("animal");
    expect(result.current?.file).toBe("fox.svg");
    // The last two words of "ruhiger Fuchs 432", which is the rule
    // `initialsOf` documents: the number is what tells two foxes apart.
    expect(result.current?.initials).toBe("F4");
  });

  it("leaves published letters alone", () => {
    const { result } = renderHook(
      () => useOrisoIdentity("@berater:oriso.test", "Sabine P."),
      {
        wrapper: withStage(
          new Map([
            [
              "@berater:oriso.test",
              {
                kind: "initials",
                bg: "#a5000a",
                ink: "#ffffff",
                initials: "SP",
              } satisfies OrisoIdentity,
            ],
          ]),
        ),
      },
    );
    // "SP" is one word, so re-deriving would give "S".
    expect(result.current?.initials).toBe("SP");
  });

  it("is upstream's rectangle when the design is off", () => {
    const { result } = renderHook(
      () => useOrisoIdentity("@anon:oriso.test", "ruhiger Fuchs 432"),
      {
        wrapper: function Off({ children }: { children: ReactNode }) {
          return (
            <OrisoStageContext
              value={{ identities: new Map(), parentUrl: null, enabled: false }}
            >
              {children}
            </OrisoStageContext>
          );
        },
      },
    );
    expect(result.current).toBeUndefined();
  });
});
