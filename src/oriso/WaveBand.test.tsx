/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WaveBand } from "./WaveBand";
import { OrisoStageContext } from "./useOrisoIdentities";

describe("the phone's wave band (S9, 5b)", () => {
  it("names the speaker by the name they published, not their Matrix id", () => {
    render(
      <OrisoStageContext
        value={{
          identities: new Map([
            [
              "@susanne:oriso.test",
              {
                kind: "initials",
                bg: "#a5000a",
                ink: "#ffffff",
                initials: "SP",
                name: "Susanne P.",
              },
            ],
          ]),
          parentUrl: null,
          enabled: true,
        }}
      >
        <WaveBand
          speaker={{
            userId: "@susanne:oriso.test",
            displayName: "@susanne:oriso.test",
          }}
        />
      </OrisoStageContext>,
    );
    const band = screen.getByTestId("oriso-wave-band");
    expect(band.dataset.speaking).toBe("true");
    expect(screen.getByTestId("oriso-wave-speaker")).toHaveTextContent(
      "Susanne P.",
    );
    expect(band).toHaveTextContent("speaking");
  });

  it("says the room is quiet while nobody speaks", () => {
    render(<WaveBand speaker={null} />);
    const band = screen.getByTestId("oriso-wave-band");
    expect(band.dataset.speaking).toBe("false");
    expect(band).toHaveTextContent("quiet");
  });
});
