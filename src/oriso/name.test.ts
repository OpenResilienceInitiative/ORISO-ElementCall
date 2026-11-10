/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The name on a person's tile.
 *
 * The live test of 22 October photographed a counselling call in which both
 * participants were labelled `@cyrus:oriso.org`. That is `RoomMember.name`
 * answering with the user id for a profile that has none, which is the
 * normal state of an ORISO account — and an identifier on the one surface
 * whose purpose is that identifiers stay out of sight.
 */
import { describe, expect, it } from "vitest";

import {
  cleanedUsername,
  initialsFor,
  isUsernameShaped,
  type OrisoIdentity,
  readIdentity,
  shownNameFor,
} from "./identity";

const record = (extra: Record<string, unknown>): OrisoIdentity => {
  const read = readIdentity({
    kind: "animal",
    file: "fox.svg",
    bg: "#F7CAC9",
    ink: "#1A1A1A",
    ...extra,
  });
  if (read === null) throw new Error("the fixture itself was rejected");
  return read;
};

describe("the name a tile shows", () => {
  it("uses the name the host published", () => {
    expect(
      shownNameFor("@cyrus:oriso.org", record({ name: "ruhiger Fuchs 432" })),
    ).toBe("ruhiger Fuchs 432");
  });

  /*
   * The point of the whole change, stated as the picture it fixes.
   *
   * A host that has not been taught to publish a name is the deployed state
   * on the day this lands, so the floor matters as much as the fix: `cyrus`
   * is a username and not a name, but it is the half of the id that is not
   * addressing information.
   */
  it("falls back to the cleaned local part when nothing was published", () => {
    expect(shownNameFor("@cyrus:oriso.org", record({}))).toBe("Cyrus");
  });

  it("leaves a real display name alone", () => {
    expect(shownNameFor("Beratung Nord", record({}))).toBe("Beratung Nord");
  });

  /*
   * Impersonation, and the half that keying does not cover.
   *
   * `readIdentities` keys on the event's sender, so nobody can publish a
   * record onto somebody else's tile. What is left is relabelling your OWN
   * tile — an advice seeker publishing the counselling service's name and
   * sitting next to it in a group session. The homeserver's answer wins
   * wherever it has one, so a published name cannot overrule a room that
   * already knows who somebody is.
   */
  it("does not let a published name overrule a name the room knows", () => {
    expect(shownNameFor("Alice", record({ name: "Beratung Nord" }))).toBe(
      "Alice",
    );
  });

  it("still keeps a disambiguated name whole against a published one", () => {
    expect(
      shownNameFor(
        "Alex (@alex:example.org)",
        record({ name: "Beratung Nord" }),
      ),
    ).toBe("Alex (@alex:example.org)");
  });

  /*
   * matrix-js-sdk appends the id when two people share a name. That string
   * is a deliberate answer to the ambiguity, not the fallback this guards
   * against, and cutting it down to `alex` would re-create the collision it
   * exists to resolve.
   */
  it("keeps a disambiguated name whole", () => {
    expect(shownNameFor("Alex (@alex:example.org)", record({}))).toBe(
      "Alex (@alex:example.org)",
    );
  });

  /*
   * Not an ORISO call: the lobby, the standalone build. Upstream's name is
   * upstream's business.
   */
  it("does not touch the name when there is no ORISO identity", () => {
    expect(shownNameFor("@cyrus:oriso.org", undefined)).toBe(
      "@cyrus:oriso.org",
    );
  });
});

describe("a published name, which arrives from a stranger", () => {
  it("refuses a name that is only a user id", () => {
    // Otherwise a host that read `RoomMember.name` itself and passed the
    // fallback on could put the identifier back through the one field that
    // exists to keep it out.
    expect(record({ name: "@cyrus:oriso.org" }).name).toBeUndefined();
    expect(
      shownNameFor("@cyrus:oriso.org", record({ name: "@cyrus:oriso.org" })),
    ).toBe("Cyrus");
  });

  it("strips control characters and collapses the whitespace", () => {
    expect(record({ name: " ruhiger\n\tFuchs   432 " }).name).toBe(
      "ruhiger Fuchs 432",
    );
  });

  it("strips bidi overrides, which can make one name render as another", () => {
    expect(record({ name: "ruhiger ‮Fuchs" }).name).toBe("ruhiger Fuchs");
  });

  /*
   * The first version named the bidi marks it knew about and missed these.
   * A name of nothing but invisible formatting passed the emptiness check
   * and rendered a blank capsule on the form.
   */
  it.each([
    ["bidi isolates", "\u2066ruhiger\u2069 Fuchs", "ruhiger Fuchs"],
    [
      "zero-width characters",
      "ruhiger\u200b\u200c\u200d Fuchs",
      "ruhiger Fuchs",
    ],
    ["a byte order mark", "\ufeffruhiger Fuchs", "ruhiger Fuchs"],
  ])("strips %s", (_what, given, want) => {
    expect(record({ name: given }).name).toBe(want);
  });

  it("refuses a name made of nothing but invisible formatting", () => {
    expect(record({ name: "\u200b\u2066\ufeff\u200d" }).name).toBeUndefined();
  });

  it("cuts a name nobody sized a tile for", () => {
    const name = record({ name: "a".repeat(200) }).name ?? "";
    expect(name.length).toBe(64);
  });

  it("treats a name of nothing but spacing as not having been told", () => {
    expect(record({ name: "   \u0000  " }).name).toBeUndefined();
  });

  it("ignores a name that is not a string", () => {
    expect(record({ name: 42 }).name).toBeUndefined();
  });

  it("carries the name on an initials record too", () => {
    const read = readIdentity({
      kind: "initials",
      bg: "#F7CAC9",
      ink: "#1A1A1A",
      initials: "SP",
      name: "Beratung Nord",
    });
    expect(read?.name).toBe("Beratung Nord");
  });
});

/*
 * Live on dev, 10 Nov 2026: a counselling call labelled its two people
 * `hugo.simpson_at_trail.ist` and `krusty.clown_at_openresilience.cc`. The
 * homeserver profile held the login name, which is not a bare Matrix id, so
 * the published role and animal names never got a say.
 */
describe("a login name standing in as the display name (S1)", () => {
  const asker = "@hugo.simpson_at_trail.ist:oriso.org";
  const counsellor = "@krusty.clown_at_openresilience.cc:oriso.org";

  it("gives way to the animal name the host published for an asker", () => {
    expect(
      shownNameFor(
        "hugo.simpson_at_trail.ist",
        record({ name: "ruhiger Fuchs 432" }),
        asker,
      ),
    ).toBe("ruhiger Fuchs 432");
  });

  it("gives way to the role name the host published for a counsellor", () => {
    expect(
      shownNameFor(
        "krusty.clown_at_openresilience.cc",
        record({ name: "Beratung · Frau Keller" }),
        counsellor,
      ),
    ).toBe("Beratung · Frau Keller");
  });

  it("is cleaned rather than shown raw when nothing was published", () => {
    expect(
      shownNameFor("krusty.clown_at_openresilience.cc", record({}), counsellor),
    ).toBe("Krusty Clown");
    expect(shownNameFor(counsellor, record({}))).toBe("Krusty Clown");
  });

  it("recognises the bare local part as a username too", () => {
    expect(
      shownNameFor("cyrus", record({ name: "Beratung" }), "@cyrus:oriso.org"),
    ).toBe("Beratung");
  });

  it("never lets a published login name through either", () => {
    expect(record({ name: "hugo.simpson_at_trail.ist" }).name).toBeUndefined();
  });

  it("leaves a real name with spaces alone", () => {
    expect(isUsernameShaped("Krusty Clown", counsellor)).toBe(false);
    expect(
      shownNameFor("Krusty Clown", record({ name: "Beratung" }), counsellor),
    ).toBe("Krusty Clown");
  });

  it.each([
    ["hugo.simpson_at_trail.ist", "Hugo Simpson"],
    ["@krusty.clown_at_openresilience.cc:oriso.org", "Krusty Clown"],
    ["@cyrus:oriso.org", "Cyrus"],
    ["anne-marie_berg", "Anne Marie Berg"],
  ])("cleans %s to %s", (raw, want) => {
    expect(cleanedUsername(raw)).toBe(want);
  });

  it("takes the initials from the cleaned name", () => {
    expect(initialsFor(counsellor, "krusty.clown_at_openresilience.cc")).toBe(
      "KC",
    );
    expect(initialsFor(counsellor, counsellor)).toBe("KC");
  });
});
