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
import { renderHook, act, render } from "@testing-library/react";
import { MatrixEventEvent, type Room, RoomEvent } from "matrix-js-sdk";

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

const ROOM_ID = "!call:oriso.test";

interface TimelineRoom {
  room: Room;
  /** Send another record, as that person's own client would. Returns its id. */
  push: (sender: string, content: unknown) => string;
  /** The client the room belongs to, for decryption signals. */
  client: EventEmitter;
  /** Replace the live timeline with a fresh, empty chunk, as a gappy sync does. */
  resetTimeline: () => void;
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
  roomId: string = ROOM_ID,
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
  let nextId = 0;
  const push = (sender: string, content: unknown): string => {
    const id = `$identity-${++nextId}`;
    events.push({
      getType: (): string => ORISO_IDENTITY_EVENT_TYPE,
      getSender: (): string => sender,
      getContent: (): unknown => content,
      getId: (): string => id,
    });
    return id;
  };
  for (const [userId, content] of Object.entries(records))
    push(senderFor?.(userId) ?? userId, content);
  const client = new EventEmitter();
  const room = Object.assign(emitter, {
    roomId,
    client,
    getLiveTimeline: (): { getEvents: () => unknown[] } => ({
      getEvents: (): unknown[] => events,
    }),
  }) as unknown as Room;
  const resetTimeline = (): void => {
    events.length = 0;
  };
  return { room, push, client, resetTimeline };
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

  it("re-reads when an identity finishes decrypting", () => {
    /*
     * The timeline fires while the event is still `m.room.encrypted`.
     *
     * In the embedded build the host decrypts before feeding the widget, so
     * what arrives is already clear. This hook must not depend on an
     * invariant of the other repository: with a client of its own, the
     * timeline event comes first and decryption is a separate signal, so
     * without this listener the last identity of a batch — or a motif
     * changed mid-call — would stay as initials until unrelated timeline
     * activity happened to re-read it.
     */
    const { room, push, client } = roomWith({});
    const { result } = renderHook(() => useOrisoIdentities(room));
    expect(result.current.size).toBe(0);

    push("@berater:oriso.test", {
      kind: "motif",
      file: "owl.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    });
    // No timeline event: the arrival was the encrypted one, already past.
    act(() => {
      client.emit(MatrixEventEvent.Decrypted, {
        getRoomId: (): string => ROOM_ID,
        getType: (): string => ORISO_IDENTITY_EVENT_TYPE,
      });
    });
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");
  });

  it("ignores a decryption in another room, or of something else", () => {
    const { room, push, client } = roomWith({});
    const { result } = renderHook(() => useOrisoIdentities(room));
    push("@berater:oriso.test", {
      kind: "motif",
      file: "owl.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    });
    act(() => {
      client.emit(MatrixEventEvent.Decrypted, {
        getRoomId: (): string => "!elsewhere:oriso.test",
        getType: (): string => ORISO_IDENTITY_EVENT_TYPE,
      });
      client.emit(MatrixEventEvent.Decrypted, {
        getRoomId: (): string => ROOM_ID,
        getType: (): string => "m.room.message",
      });
    });
    expect(result.current.size).toBe(0);
  });

  it("drops a carried-over identity whose event is redacted after a gappy sync", () => {
    /*
     * The two halves of this hook pulling against each other.
     *
     * Absence from the live timeline is deliberately not withdrawal, so a
     * limited sync that replaces the window keeps what is known. A redaction
     * of one of those kept records then arrives with nothing in the timeline
     * to contradict it — re-reading finds no event, and the carry-over puts
     * the withdrawn animal straight back. It stayed on the stage for good.
     *
     * So the id of the event each identity came from is kept too, and the
     * redaction names it.
     */
    const { room, push, resetTimeline } = roomWith({});
    const eventId = push("@berater:oriso.test", {
      kind: "motif",
      file: "owl.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    });
    const { result } = renderHook(() => useOrisoIdentities(room));
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    // A gappy sync: a fresh, empty window. The record is kept.
    resetTimeline();
    act(() => {
      (room as unknown as EventEmitter).emit(RoomEvent.TimelineReset);
    });
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    // And now it is withdrawn, with nothing left in the window to say so.
    act(() => {
      (room as unknown as EventEmitter).emit(RoomEvent.Redaction, {
        getAssociatedId: (): string => eventId,
      });
    });
    expect(result.current.has("@berater:oriso.test")).toBe(false);
  });

  it("re-reads when an identity record is redacted", () => {
    /*
     * Withdrawing a record emits `RoomEvent.Redaction` and no timeline
     * event, so without a listener for it the person kept the animal they
     * had just removed for as long as the call stayed quiet. A redacted
     * event has empty content, which `readIdentity` rejects — so the record
     * simply stops counting and the stand-in letters come back.
     */
    const { room, push } = roomWith({});
    push("@berater:oriso.test", {
      kind: "motif",
      file: "owl.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    });
    const { result } = renderHook(() => useOrisoIdentities(room));
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    // The host redacts it: the event stays in the timeline with no content.
    push("@berater:oriso.test", {});
    act(() => {
      (room as unknown as EventEmitter).emit(RoomEvent.Redaction);
    });
    expect(result.current.has("@berater:oriso.test")).toBe(false);
  });

  it("keeps what it knows when a gappy sync replaces the timeline", () => {
    /*
     * The live timeline is a WINDOW on the room, not the room.
     *
     * A limited sync throws the window away and hands over a fresh chunk,
     * which need not contain identity events that are still perfectly valid
     * in the room's history. Reading the new chunk on its own therefore
     * dropped everybody who had not published recently, and a roomful of
     * animals turned back into stand-in letters until each client happened to
     * announce itself again.
     *
     * The replacement here is empty, which is the harshest version of the
     * case and the one the old code read as "nobody has an identity".
     */
    const { room, resetTimeline } = roomWith(FROM_THE_HOST);
    const { result } = renderHook(() => useOrisoIdentities(room));
    const before = result.current.size;
    expect(before).toBeGreaterThan(0);

    act(() => {
      resetTimeline();
      (room as unknown as EventEmitter).emit(RoomEvent.TimelineReset);
    });
    expect(result.current.size).toBe(before);
  });

  it("still lets a withdrawal through after a reset", () => {
    /*
     * The other side of the rule above, and the reason the removal is
     * explicit rather than a skipped assignment: absence from the window is
     * not withdrawal, but an unreadable newest record IS. If keeping known
     * identities also kept redacted ones, the fix for one bug would have
     * reintroduced the other.
     */
    const { room, push, resetTimeline } = roomWith({});
    push("@berater:oriso.test", {
      kind: "motif",
      file: "owl.svg",
      bg: "#a5000a",
      ink: "#ffffff",
    });
    const { result } = renderHook(() => useOrisoIdentities(room));
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    // A new chunk arrives, and in it the record is redacted: present, empty.
    act(() => {
      resetTimeline();
      push("@berater:oriso.test", {});
      (room as unknown as EventEmitter).emit(RoomEvent.TimelineReset);
    });
    expect(result.current.has("@berater:oriso.test")).toBe(false);
  });

  it("does not carry identities into a different room", () => {
    /*
     * The carry-over is only valid WITHIN one room, and this hook is reused
     * across rooms: `RoomPage` is a wildcard route, so SPA navigation can
     * replace `room` without remounting. Seeding the new room's read from the
     * old room's map left somebody present in both wearing the animal they
     * had in the room just left — and indefinitely, because absence from the
     * new timeline is deliberately not withdrawal.
     *
     * This is a regression the carry-over itself introduced, which is why it
     * is tested from the other side: same person, two rooms, two motifs.
     */
    const first = roomWith({
      "@berater:oriso.test": {
        kind: "motif",
        file: "owl.svg",
        bg: "#a5000a",
        ink: "#ffffff",
      },
    });
    const second = roomWith(
      {
        "@berater:oriso.test": {
          kind: "motif",
          file: "heron.svg",
          bg: "#123456",
          ink: "#ffffff",
        },
      },
      undefined,
      "!other:oriso.test",
    );
    const { result, rerender } = renderHook(
      ({ room }: { room: typeof first.room }) => useOrisoIdentities(room),
      { initialProps: { room: first.room } },
    );
    expect(result.current.get("@berater:oriso.test")?.file).toBe("owl.svg");

    rerender({ room: second.room });
    expect(result.current.get("@berater:oriso.test")?.file).toBe("heron.svg");

    // And a room with nothing in it says nothing, rather than the last room.
    const empty = roomWith({}, undefined, "!empty:oriso.test");
    rerender({ room: empty.room });
    expect(result.current.size).toBe(0);
  });

  it("never paints the room just left", () => {
    /*
     * The frame, not just the outcome.
     *
     * Keeping the room's identity in a ref that only the effect consults
     * fixed the lasting case and left the first render after the switch
     * describing the new room with the old room's map. That render is the
     * one that paints: changing rooms mid-call showed everybody the faces
     * from the room just left for a frame — the wrong person's animal in
     * front of the wrong people. So every render is recorded, not only the
     * last one.
     */
    const first = roomWith({
      "@berater:oriso.test": {
        kind: "motif",
        file: "owl.svg",
        bg: "#a5000a",
        ink: "#ffffff",
      },
    });
    const second = roomWith({}, undefined, "!other:oriso.test");

    const painted: { roomId: string; file: string | undefined }[] = [];
    const Probe: FC<{ room: Room }> = ({ room }) => {
      const identities = useOrisoIdentities(room);
      painted.push({
        roomId: room.roomId,
        file: identities.get("@berater:oriso.test")?.file,
      });
      return null;
    };

    const { rerender } = render(<Probe room={first.room} />);
    expect(painted.at(-1)).toEqual({
      roomId: ROOM_ID,
      file: "owl.svg",
    });

    rerender(<Probe room={second.room} />);
    const inSecond = painted.filter((p) => p.roomId === "!other:oriso.test");
    expect(inSecond.length).toBeGreaterThan(0);
    expect(inSecond.map((p) => p.file)).toEqual(inSecond.map(() => undefined));
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
