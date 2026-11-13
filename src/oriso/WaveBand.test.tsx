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

  it.each(["phone", "header", "pip"] as const)(
    "does not announce every turn and every pause (%s, #2233 review)",
    (variant) => {
      // In every view now, a live region would read out each "X is
      // speaking" and each "quiet". The band stays a labelled group whose
      // name can be read on demand.
      render(
        <WaveBand
          variant={variant}
          speaker={{ userId: "@fox:oriso.test", displayName: "Fuchs" }}
        />,
      );
      expect(screen.queryByRole("status")).toBeNull();
      const band = screen.getByRole("group", { name: "Who is speaking" });
      expect(band).not.toHaveAttribute("aria-live");
      expect(band).toHaveTextContent("Fuchs");
    },
  );

  it.each(["header", "pip"] as const)(
    "comes condensed for the %s, with the same name and the same words",
    (variant) => {
      render(
        <WaveBand
          variant={variant}
          speaker={{
            userId: "@fox:oriso.test",
            displayName: "ruhiger Fuchs 432",
          }}
        />,
      );
      const band = screen.getByTestId("oriso-wave-band");
      expect(band.dataset.variant).toBe(variant);
      expect(screen.getByTestId("oriso-wave-speaker")).toHaveTextContent(
        "ruhiger Fuchs 432",
      );
      expect(band).toHaveTextContent("speaking");
    },
  );
});
