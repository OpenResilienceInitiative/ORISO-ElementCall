/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { E2eeType } from "./e2eeType";
import { isPerParticipantE2EEUnavailable } from "./e2eeAvailability";

describe("isPerParticipantE2EEUnavailable", () => {
  it("accepts widget mode because the host owns the crypto stack", () => {
    expect(
      isPerParticipantE2EEUnavailable(
        E2eeType.PER_PARTICIPANT,
        false,
        true,
      ),
    ).toBe(false);
  });

  it("fails closed for a standalone client without crypto", () => {
    expect(
      isPerParticipantE2EEUnavailable(
        E2eeType.PER_PARTICIPANT,
        false,
        false,
      ),
    ).toBe(true);
  });

  it("accepts a standalone client with its own crypto stack", () => {
    expect(
      isPerParticipantE2EEUnavailable(
        E2eeType.PER_PARTICIPANT,
        true,
        false,
      ),
    ).toBe(false);
  });
});
