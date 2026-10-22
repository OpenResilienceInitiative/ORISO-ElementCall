/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The contract with ORISO-Frontend.
 *
 * One record crosses between two repositories that are tested separately,
 * which is the shape of problem where both suites stay green and the thing
 * still does not work. The fixtures below are byte-for-byte the ones in
 * ORISO-Frontend's `src/components/call/callIdentity.contract.test.ts`, and
 * each file names the other. If somebody renames a field, one of the two
 * goes red and says where to look.
 *
 * Deliberately literal. A shared type would test that the two agree about
 * TypeScript; what has to hold is that they agree about JSON on the wire.
 */
import { describe, expect, it } from "vitest";

import {
  ORISO_IDENTITY_EVENT_TYPE,
  readIdentity,
  fallbackIdentity,
} from "./identity";

/** Must equal CALL_IDENTITY_EVENT_TYPE in ORISO-Frontend. */
const EVENT_TYPE = "org.oriso.call.identity";

/** Exactly what `ownCallIdentity` over there produces. */
const ON_THE_WIRE = {
  animal: {
    kind: "animal",
    file: "fox.svg",
    bg: "#165E83",
    ink: "#ffffff",
    name: "ruhiger Fuchs 432",
  },
  motif: {
    kind: "motif",
    file: "owl.svg",
    bg: "#a5000a",
    ink: "#ffffff",
    name: "Beratung Nord",
  },
  initials: {
    kind: "initials",
    bg: "#a5000a",
    ink: "#ffffff",
    initials: "SP",
    name: "Susanne Pfeiffer",
  },
} as const;

describe("the record the host publishes", () => {
  it("arrives under the event type this repository asks for", () => {
    expect(ORISO_IDENTITY_EVENT_TYPE).toBe(EVENT_TYPE);
  });

  it.each(Object.entries(ON_THE_WIRE))(
    "accepts the %s record",
    (_kind, wire) => {
      expect(readIdentity(wire)).toEqual(wire);
    },
  );

  /*
   * A host that has not been taught to publish a name — the deployed state
   * on the day this lands — must still produce a usable record. The field
   * is optional on the wire in both directions, and the tile falls back to
   * the display name it already has.
   */
  it.each(Object.entries(ON_THE_WIRE))(
    "accepts the %s record from a host too old to send a name",
    (_kind, wire) => {
      const { name: _ignored, ...older } = wire;
      const read = readIdentity(older);
      expect(read).not.toBeNull();
      expect(read?.name).toBeUndefined();
    },
  );

  it("rejects the record the engine's own spelling would produce", () => {
    // `iconColor` is what ORISO's anonymous-name engine calls the ink, and
    // it is what a refactor on that side would reach for. Rejecting it is
    // correct — but it means everybody turns into initials, which looks like
    // a rendering problem rather than a contract break, so it is pinned.
    expect(
      readIdentity({
        kind: "animal",
        file: "fox.svg",
        bg: "#165E83",
        iconColor: "#ffffff",
      }),
    ).toBeNull();
  });

  it("falls back to initials rather than an animal when nothing arrived", () => {
    // The whole rule, in one assertion: an identity the call was not given
    // is not one the call invents.
    const stand = fallbackIdentity("@anon:oriso.test", "ruhiger Fuchs 432");
    expect(stand.kind).toBe("initials");
    expect(stand.file).toBeUndefined();
  });
});
