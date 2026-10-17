/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import {
  type TrackReference,
  type TrackReferencePlaceholder,
} from "@livekit/components-core";
import { LocalTrackPublication, Track } from "livekit-client";
import { TrackInfo } from "@livekit/protocol";
import { type ComponentProps } from "react";

import { MediaView } from "./MediaView";
import { EncryptionStatus } from "../state/MediaViewModel";
import { mockLocalParticipant } from "../utils/test";
import { type OrisoIdentity } from "../oriso/identity";
import { resetArtworkCache } from "../oriso/artwork";
import { liftFor } from "../oriso/lift";

const participant = mockLocalParticipant({});
const placeholder: TrackReferencePlaceholder = {
  participant,
  source: Track.Source.Camera,
};
const track: TrackReference = {
  ...placeholder,
  publication: new LocalTrackPublication(
    Track.Kind.Video,
    new TrackInfo({ sid: "id", name: "name" }),
  ),
};

const base: ComponentProps<typeof MediaView> = {
  displayName: "ruhiger Fuchs 432",
  videoEnabled: true,
  videoFit: "cover",
  targetWidth: 300,
  targetHeight: 200,
  encryptionStatus: EncryptionStatus.Connecting,
  mirror: false,
  unencryptedWarning: false,
  video: track,
  userId: "@alice:example.com",
  mxcAvatarUrl: undefined,
  focusable: true,
};

const FOX: OrisoIdentity = {
  kind: "animal",
  file: "fox.svg",
  bg: "#165e83",
  ink: "#ffffff",
};

afterEach(() => {
  resetArtworkCache();
  vi.restoreAllMocks();
});

describe("without an identity, the tile is upstream's", () => {
  it("keeps the Matrix avatar and the plate behind it", () => {
    render(<MediaView {...base} />);
    expect(screen.getByTestId("videoTile").dataset.oriso).toBeUndefined();
    expect(screen.queryByTestId("oriso-face")).toBeNull();
  });

  it("still shows the video element the old way", () => {
    render(<MediaView {...base} />);
    // Upstream keeps the track mounted and toggles display, which is what
    // lets it switch without renegotiating. That must not change.
    expect(screen.getByTestId("video").style.display).toBe("block");
  });
});

describe("with an identity, the tile is a form", () => {
  it("is accessible", async () => {
    const { container } = render(
      <MediaView {...base} orisoIdentity={FOX} orisoParentUrl={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("replaces the plate with the person's own colour", () => {
    render(<MediaView {...base} orisoIdentity={FOX} />);
    expect(screen.getByTestId("videoTile").dataset.oriso).toBe("true");
    expect(screen.getByTestId("oriso-face").style.background).toBe(
      "rgb(22, 94, 131)",
    );
  });

  it("takes the form the layout gave it", () => {
    render(
      <MediaView
        {...base}
        orisoIdentity={FOX}
        orisoShape={{ radius: "48% 52% 61% 39%", tilt: 4.2 }}
      />,
    );
    const face = screen.getByTestId("oriso-face");
    expect(face.style.borderRadius).toBe("48% 52% 61% 39%");
    expect(face.style.transform).toBe("rotate(4.2deg)");
  });

  it("sizes the form by the tile's smaller side", () => {
    // 300x200: a form sized off the width would overflow the tile
    // vertically, and its lift would be judged against the wrong number.
    render(<MediaView {...base} orisoIdentity={FOX} videoEnabled={false} />);
    expect(screen.getByTestId("oriso-face").style.boxShadow).toBe(liftFor(200));
    expect(liftFor(200)).not.toBe(liftFor(300));
  });

  it("is a circle, not an ellipse, when the layout gave it no shape", () => {
    /*
     * The spotlight's single form, and any other face with no shape.
     *
     * `.face` fills its tile, which the grove and the fields want — their
     * eight-value radius is meant for that box. With no shape the radius
     * falls back to `50%`, and 50% of this 300x200 tile is a 300x200 oval
     * with the camera stretched into it. The handoff's default is a circle.
     */
    render(<MediaView {...base} orisoIdentity={FOX} />);
    const face = screen.getByTestId("oriso-face");
    expect(face.style.borderRadius).toBe("50%");
    expect(face.style.inlineSize).toBe("200px");
    expect(face.style.blockSize).toBe("200px");
    // Centred against the tile root, which is a containing block for it.
    expect(face.style.position).toBe("absolute");
    expect(face.style.margin).toBe("auto");
  });

  it("still fills the tile when the layout DID give it a shape", () => {
    // The blob is meant to fill its slot; squaring it off would shrink
    // every grove form to its smaller side and undo the packing.
    render(
      <MediaView
        {...base}
        orisoIdentity={FOX}
        orisoShape={{ radius: "48% 52% 61% 39%", tilt: 4.2 }}
      />,
    );
    const face = screen.getByTestId("oriso-face");
    expect(face.style.inlineSize).toBe("");
    expect(face.style.position).toBe("");
  });

  it("puts the camera inside the form rather than beside it", () => {
    render(<MediaView {...base} orisoIdentity={FOX} />);
    const face = screen.getByTestId("oriso-face");
    expect(face.contains(screen.getByTestId("video"))).toBe(true);
  });

  it("drops the camera entirely when it is off, instead of hiding it", () => {
    // Upstream hides the element with display:none and leaves a black plate.
    // In the form there is nothing behind it to be black, so the artwork has
    // to take its place.
    render(<MediaView {...base} orisoIdentity={FOX} videoEnabled={false} />);
    expect(screen.queryByTestId("video")).toBeNull();
  });

  it("marks speaking on the tile, for the capsule to follow", () => {
    render(<MediaView {...base} orisoIdentity={FOX} orisoSpeaking />);
    expect(screen.getByTestId("videoTile").dataset.orisoSpeaking).toBe("true");
    expect(screen.getByTestId("oriso-face").dataset.speaking).toBe("true");
  });

  it("still carries the name, the mute glyph and the menu", () => {
    // The form replaces the picture, not the chrome. The name tag, the
    // microphone state, the raised hand and the options menu are real
    // function and are restyled rather than rebuilt.
    render(
      <MediaView
        {...base}
        orisoIdentity={FOX}
        nameTagLeadingIcon={<svg data-testid="mic" />}
        primaryButton={<button>options</button>}
      />,
    );
    expect(screen.getByTestId("name_tag").textContent).toBe(
      "ruhiger Fuchs 432",
    );
    expect(screen.getByTestId("mic")).toBeTruthy();
  });
});

describe("the name, when it does not fit", () => {
  it("keeps the number that tells two foxes apart", () => {
    render(
      <MediaView {...base} orisoIdentity={FOX} displayName="naher Otter 303" />,
    );
    const tag = screen.getByTestId("name_tag");
    // Whole to a screen reader and to a copy-paste; only the middle gives
    // way visually, and only when there is not enough room.
    expect(tag.textContent).toBe("naher Otter 303");
    expect(tag.lastElementChild?.textContent).toBe(" 303");
  });

  it("owns only its half of a shared box", () => {
    /*
     * In the Einzelgespräch both tiles are given the WHOLE circle and differ
     * only by the clip path — that is what makes them one body rather than
     * two shapes side by side. But a tile is more than its background: the
     * later one's box lay over both halves and swallowed every click meant
     * for the other, and both name capsules sat at the same corner of the
     * same circle, one on top of the other.
     *
     * The clip on the ROOT fixes the first (a clipped-away region is not
     * hit-testable) and the focus shift fixes the second.
     */
    const { container } = render(
      <MediaView
        {...base}
        orisoIdentity={FOX}
        orisoShape={{
          radius: "50%",
          tilt: 0,
          clipPath: "url(#seam)",
          focusX: 0.31,
          contentShare: 0.22 / 0.86,
        }}
      />,
    );
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="videoTile"]',
    )!;
    expect(tile.style.clipPath).toBe("url(#seam)");
    expect(tile.dataset.orisoHalf).toBe("true");
    // (0.31 - 0.5) * min(300, 200) = -38
    expect(tile.style.getPropertyValue("--oriso-focus-shift")).toBe("-38px");
  });

  it("asks for neither when the layout gave it the whole shape", () => {
    const { container } = render(
      <MediaView
        {...base}
        orisoIdentity={FOX}
        orisoShape={{ radius: "48% 52% 61% 39%", tilt: 4.2 }}
      />,
    );
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="videoTile"]',
    )!;
    expect(tile.style.clipPath).toBe("");
    expect(tile.dataset.orisoHalf).toBeUndefined();
  });

  it("leaves upstream's name alone", () => {
    render(<MediaView {...base} displayName="naher Otter 303" />);
    const tag = screen.getByTestId("name_tag");
    expect(tag.textContent).toBe("naher Otter 303");
    expect(tag.children).toHaveLength(0);
  });
});
