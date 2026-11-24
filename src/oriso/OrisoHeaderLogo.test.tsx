/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Config } from "../config/Config";
import { DEFAULT_CONFIG } from "../config/ConfigOptions";
import { OrisoHeaderLogo } from "./OrisoHeaderLogo";

const ROUTE = "/service/tenant/public/branding/12/logo";
// The call page's own origin is where a logo may come from by default.
const LOGO = `${window.location.origin}${ROUTE}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OrisoHeaderLogo", () => {
  it("shows the logo once it has loaded", () => {
    render(<OrisoHeaderLogo src={LOGO} />);
    const logo = screen.getByTestId("oriso_header_logo");
    expect(logo).toHaveAttribute("src", LOGO);
    // Not announced: the title beside it already says where the call is.
    expect(logo).toHaveAttribute("alt", "");
    fireEvent.load(logo);
    expect(logo).toBeVisible();
  });

  it("keeps the logo out of the layout until it has loaded", () => {
    // An empty slot would still take its gap in the header's flex row.
    render(<OrisoHeaderLogo src={LOGO} />);
    expect(screen.getByTestId("oriso_header_logo")).not.toBeVisible();
  });

  it("is absent without a logo", () => {
    const { container } = render(<OrisoHeaderLogo src={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("goes away for good when the image cannot be loaded", () => {
    const { container } = render(<OrisoHeaderLogo src={LOGO} />);
    fireEvent.error(screen.getByTestId("oriso_header_logo"));
    expect(screen.queryByTestId("oriso_header_logo")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("does not hand the call's address to the logo's host", () => {
    render(<OrisoHeaderLogo src={LOGO} />);
    expect(screen.getByTestId("oriso_header_logo")).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
  });

  it("starts afresh for another logo after one has failed", () => {
    const { rerender } = render(<OrisoHeaderLogo src={LOGO} />);
    fireEvent.error(screen.getByTestId("oriso_header_logo"));
    const other = `${window.location.origin}/service/tenant/public/branding/13/logo`;
    rerender(<OrisoHeaderLogo src={other} />);
    expect(screen.getByTestId("oriso_header_logo")).toHaveAttribute(
      "src",
      other,
    );
  });

  describe("only from a host the deployment trusts", () => {
    const FOREIGN = `https://tenant.example.org${ROUTE}`;

    it("draws nothing for another host", () => {
      const { container } = render(<OrisoHeaderLogo src={FOREIGN} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("draws nothing for the right host with the wrong path", () => {
      const { container } = render(
        <OrisoHeaderLogo src={`${window.location.origin}/evil.png`} />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("draws a logo from a host the config lists", () => {
      vi.spyOn(Config, "get").mockReturnValue({
        ...DEFAULT_CONFIG,
        oriso: { brand_logo_origins: ["https://tenant.example.org"] },
      });
      render(<OrisoHeaderLogo src={FOREIGN} />);
      expect(screen.getByTestId("oriso_header_logo")).toHaveAttribute(
        "src",
        FOREIGN,
      );
    });

    it("falls back to the own origin when the config is not there yet", () => {
      vi.spyOn(Config, "get").mockImplementation(() => {
        throw new Error("Config instance read before config got initialized");
      });
      render(<OrisoHeaderLogo src={LOGO} />);
      expect(screen.getByTestId("oriso_header_logo")).toBeInTheDocument();
      expect(
        render(<OrisoHeaderLogo src={FOREIGN} />).container,
      ).toBeEmptyDOMElement();
    });
  });
  /*
   * #2233 R29: the logo is the Träger's, or the platform operator's where
   * the Träger has none. The operator's comes from the deployment's own
   * config, not from the call address.
   */
  describe("the platform operator's logo as the fallback", () => {
    const OPERATOR = "/oriso/operator-logo.svg";
    const withOperator = (logo: string): void => {
      vi.spyOn(Config, "get").mockReturnValue({
        ...DEFAULT_CONFIG,
        oriso: { operator_logo: logo },
      });
    };

    it("draws the operator's logo when the Träger has none", () => {
      withOperator(OPERATOR);
      render(<OrisoHeaderLogo src={null} />);
      expect(screen.getByTestId("oriso_header_logo")).toHaveAttribute(
        "src",
        `${window.location.origin}${OPERATOR}`,
      );
    });

    it("prefers the Träger's logo", () => {
      withOperator(OPERATOR);
      render(<OrisoHeaderLogo src={LOGO} />);
      expect(screen.getByTestId("oriso_header_logo")).toHaveAttribute(
        "src",
        LOGO,
      );
    });

    it("falls back to it when the Träger's logo cannot be loaded", () => {
      withOperator(OPERATOR);
      render(<OrisoHeaderLogo src={LOGO} />);
      fireEvent.error(screen.getByTestId("oriso_header_logo"));
      expect(screen.getByTestId("oriso_header_logo")).toHaveAttribute(
        "src",
        `${window.location.origin}${OPERATOR}`,
      );
    });

    it("draws nothing for an unusable operator address", () => {
      withOperator("javascript:alert(1)");
      expect(
        render(<OrisoHeaderLogo src={null} />).container,
      ).toBeEmptyDOMElement();
    });
  });
});
