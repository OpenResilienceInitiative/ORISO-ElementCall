/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KreisCentre } from "./KreisCentre";
import { KREIS_CENTRE_TEXT_MIN } from "./kreis";

const speaker = { userId: "@p1:oriso.test", displayName: "weiter Bär 651" };

describe("the Kreis's indicator (S6)", () => {
  it("names who speaks when the disc has room for it", () => {
    render(
      <KreisCentre
        plan={{ x: 0, y: 0, size: KREIS_CENTRE_TEXT_MIN }}
        speaker={speaker}
      />,
    );
    expect(screen.getByTestId("oriso-kreis-speaker").textContent).toBe(
      "weiter Bär 651",
    );
  });

  it("keeps only its bars on a disc too small for the name (S9)", () => {
    render(
      <KreisCentre
        plan={{ x: 0, y: 0, size: KREIS_CENTRE_TEXT_MIN - 1 }}
        speaker={speaker}
      />,
    );
    expect(screen.getByTestId("oriso-kreis-centre")).toBeTruthy();
    expect(screen.queryByTestId("oriso-kreis-speaker")).toBeNull();
  });
});
