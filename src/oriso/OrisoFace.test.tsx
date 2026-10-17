/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { OrisoFace, artworkPaddingFor } from "./OrisoFace";
import { resetArtworkCache } from "./artwork";
import { type OrisoIdentity } from "./identity";
import { QUIET_SHADOW } from "./halo";
import { liftFor } from "./lift";
import { coverScale } from "./shape";

const FOX: OrisoIdentity = {
  kind: "animal",
  file: "fox.svg",
  bg: "#165e83",
  ink: "#ffffff",
};

const NAMELESS: OrisoIdentity = {
  kind: "initials",
  bg: "#fce7e6",
  ink: "#1a1a1a",
  initials: "KM",
};

/*
 * With the XML prolog the real files carry.
 *
 * The fixture used to start at `<svg`, which let a prefix check in the loader
 * pass here and reject every actual ORISO animal in the browser. The prolog
 * belongs in the fixture precisely because the production files have it.
 */
const SVG =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
  '<path d="M0 0h10v10H0z"/></svg>';

const serveArtwork = (body = SVG): void => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { headers: { "content-type": "image/svg+xml" } }),
  );
};

beforeEach(() => resetArtworkCache());
afterEach(() => vi.restoreAllMocks());

describe("the form", () => {
  it("is a circle unless a layout says otherwise", () => {
    render(<OrisoFace identity={NAMELESS} size={200} />);
    expect(screen.getByTestId("oriso-face").style.borderRadius).toBe("50%");
  });

  it("takes the radius and the lean a layout hands it", () => {
    render(
      <OrisoFace
        identity={NAMELESS}
        size={200}
        shape={{ radius: "48% 52% 61% 39% / 44% 58% 42% 56%", tilt: -7.3 }}
      />,
    );
    const face = screen.getByTestId("oriso-face");
    expect(face.style.borderRadius).toBe("48% 52% 61% 39% / 44% 58% 42% 56%");
    expect(face.style.transform).toBe("rotate(-7.3deg)");
  });

  it("carries the identity's own colour, not one of its own", () => {
    render(<OrisoFace identity={FOX} size={200} />);
    // jsdom normalises hex to rgb().
    expect(screen.getByTestId("oriso-face").style.background).toBe(
      "rgb(22, 94, 131)",
    );
  });

  it("wears the clip a layout gives it on top of the radius", () => {
    render(
      <OrisoFace
        identity={NAMELESS}
        size={200}
        shape={{ radius: "50%", tilt: 0, clipPath: "url(#seam)" }}
      />,
    );
    const face = screen.getByTestId("oriso-face");
    expect(face.style.clipPath).toBe("url(#seam)");
    expect(face.style.borderRadius).toBe("50%");
  });
});

describe("speaking", () => {
  it("rests on the lift that scales, not the prototype's flat value", () => {
    render(<OrisoFace identity={FOX} size={120} />);
    const shadow = screen.getByTestId("oriso-face").style.boxShadow;
    // `haloFor(bg, false)` would hand back QUIET_SHADOW, the prototype's one
    // value for every size. That value was judged on a small avatar and is a
    // smudge under one edge of a 400px tile, which is the reason `lift.ts`
    // exists at all. So the quiet state comes from there instead. Written
    // down because the two look interchangeable and are not.
    expect(shadow).not.toBe(QUIET_SHADOW);
    expect(shadow).toBe(liftFor(120));
  });

  it("lights up in the person's own colour, never a system accent", () => {
    render(<OrisoFace identity={FOX} size={120} speaking />);
    const shadow = screen.getByTestId("oriso-face").style.boxShadow;
    // 22, 94, 131 is this person's circle. A shared accent here would be the
    // one thing the handoff rules out.
    expect(shadow).toContain("rgba(22, 94, 131, 0.18)");
    expect(shadow).toContain("rgba(22, 94, 131, 0.5)");
    expect(screen.getByTestId("oriso-face").dataset.speaking).toBe("true");
  });

  it("grows its lift with the form, so a large shape is not a smudge", () => {
    render(<OrisoFace identity={NAMELESS} size={320} />);
    expect(screen.getByTestId("oriso-face").style.boxShadow).toBe(
      "0 6px 18px 0 rgba(0, 0, 0, 0.16)",
    );
  });
});

describe("the artwork, which is inherited", () => {
  it("fetches it from the host that embedded the call", async () => {
    serveArtwork();
    render(
      <OrisoFace identity={FOX} size={200} parentUrl="https://oriso.test" />,
    );
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://oriso.test/static/anon-animals/fox.svg?v=2",
      ),
    );
  });

  it("paints it in the ink it was given", async () => {
    serveArtwork();
    render(<OrisoFace identity={FOX} size={200} />);
    const artwork = await screen.findByTestId("oriso-artwork");
    expect(artwork.innerHTML).toContain('fill="#ffffff"');
  });

  it("sizes it by the per-motif padding, not by one number for all", () => {
    // The dolphin is a flat motif and reads too small at the default 16%.
    expect(artworkPaddingFor("dolphin.svg")).toBe(0.12);
    expect(artworkPaddingFor("fox.svg")).toBe(0.16);
    expect(artworkPaddingFor(undefined)).toBe(0.16);
  });

  it("shows initials rather than inventing a picture when it cannot load", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(
      <OrisoFace
        identity={{ ...FOX, initials: "FJ" }}
        size={200}
        parentUrl="https://oriso.test"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("oriso-initials").textContent).toBe("FJ"),
    );
    expect(screen.queryByTestId("oriso-artwork")).toBeNull();
  });

  it("never fetches for an identity that carries no file", () => {
    serveArtwork();
    render(<OrisoFace identity={NAMELESS} size={200} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("oriso-initials").textContent).toBe("KM");
  });

  it("fetches one file once however many people wear it", async () => {
    serveArtwork();
    render(
      <>
        <OrisoFace identity={FOX} size={100} />
        <OrisoFace identity={{ ...FOX, ink: "#1a1a1a" }} size={100} />
      </>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("oriso-artwork")).toHaveLength(2),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a file that opens with the XML prolog, as every real one does", async () => {
    serveArtwork();
    render(<OrisoFace identity={FOX} size={200} />);
    const artwork = await screen.findByTestId("oriso-artwork");
    expect(artwork.innerHTML).toContain("<svg");
  });

  it("refuses a body that is not an SVG", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>login</html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    render(<OrisoFace identity={{ ...FOX, initials: "FJ" }} size={200} />);
    await waitFor(() =>
      expect(screen.getByTestId("oriso-initials")).toBeTruthy(),
    );
  });
});

describe("the camera", () => {
  it("takes the artwork's place and leaves the form alone", async () => {
    serveArtwork();
    render(
      <OrisoFace
        identity={FOX}
        size={200}
        shape={{ radius: "40% 60% 55% 45%", tilt: 0 }}
        video={<video data-testid="track" />}
      />,
    );
    expect(screen.getByTestId("track")).toBeTruthy();
    expect(screen.queryByTestId("oriso-artwork")).toBeNull();
    expect(screen.getByTestId("oriso-face").style.borderRadius).toBe(
      "40% 60% 55% 45%",
    );
  });

  it("grows by exactly enough to cover a leaning frame", () => {
    render(
      <OrisoFace
        identity={FOX}
        size={200}
        shape={{ radius: "50%", tilt: 11 }}
        video={<video data-testid="track" />}
      />,
    );
    // Without the scale, a frame leaning 11 degrees shows four wedges of
    // background in its corners.
    expect(coverScale(11)).toBeCloseTo(1.1724, 4);
    expect(screen.getByTestId("oriso-video").style.transform).toBe(
      `rotate(-11deg) scale(${coverScale(11).toFixed(4)})`,
    );
  });

  it("passes the fit through, so contain stays contain", () => {
    render(
      <OrisoFace
        identity={FOX}
        size={200}
        video={<video data-testid="track" />}
        videoFit="contain"
      />,
    );
    expect(screen.getByTestId("oriso-video").dataset.fit).toBe("contain");
  });
});

describe("the body of the form", () => {
  it("lies over whatever the form contains", () => {
    // Under the artwork the gradients only tint the background and the shape
    // stays a flat disc. This is the one ordering that makes it read as a
    // body.
    const { container } = render(<OrisoFace identity={NAMELESS} size={200} />);
    const face = screen.getByTestId("oriso-face");
    const children = [...face.children];
    expect(children[children.length - 1]).toBe(
      container.querySelector('[data-testid="oriso-sphere"]'),
    );
  });
});
