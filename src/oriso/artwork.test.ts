/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Where the artwork is fetched from, and what is allowed back.
 *
 * Both halves were review findings rather than failures anybody saw: the URL
 * was built by concatenating onto whatever `parentUrl` held, which is only
 * promised to be the host's URL and not a bare origin; and the fetched text
 * went into `dangerouslySetInnerHTML` on the strength of a content-type
 * header and an XML parse.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ARTWORK_REVISION,
  artworkUrl,
  loadArtwork,
  resetArtworkCache,
} from "./artwork";

const serve = (body: string): void => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { headers: { "content-type": "image/svg+xml" } }),
  );
};

const svg = (inner: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

afterEach(() => {
  vi.restoreAllMocks();
  resetArtworkCache();
});

describe("where the artwork comes from", () => {
  it("is this origin when the call is not embedded", () => {
    expect(artworkUrl("fox.svg", null)).toBe(
      `/static/anon-animals/fox.svg?v=${ARTWORK_REVISION}`,
    );
  });

  it("is the host's origin when it is", () => {
    expect(artworkUrl("fox.svg", "https://beratung.example")).toBe(
      `https://beratung.example/static/anon-animals/fox.svg?v=${ARTWORK_REVISION}`,
    );
  });

  it("ignores the host's path and query, which the contract allows it", () => {
    // Concatenating asked for /client/room/static/anon-animals/fox.svg.
    expect(artworkUrl("fox.svg", "https://beratung.example/client/room")).toBe(
      `https://beratung.example/static/anon-animals/fox.svg?v=${ARTWORK_REVISION}`,
    );
    expect(artworkUrl("fox.svg", "https://beratung.example/?a=1#x")).toBe(
      `https://beratung.example/static/anon-animals/fox.svg?v=${ARTWORK_REVISION}`,
    );
  });

  it("falls back to this origin rather than building nonsense", () => {
    expect(artworkUrl("fox.svg", "not a url")).toBe(
      `/static/anon-animals/fox.svg?v=${ARTWORK_REVISION}`,
    );
  });
});

describe("what comes back", () => {
  it("keeps the drawing", async () => {
    serve(svg('<path d="M0 0h10v10H0z" fill="#123456"/>'));
    const text = await loadArtwork("fox.svg", null);
    expect(text).toContain('d="M0 0h10v10H0z"');
    expect(text).toContain("#123456");
  });

  it("drops a script, and keeps the rest of the drawing", async () => {
    serve(svg('<script>globalThis.pwned = 1</script><circle r="4"/>'));
    const text = await loadArtwork("fox.svg", null);
    expect(text).not.toMatch(/<script/i);
    expect(text).not.toContain("pwned");
    expect(text).toContain("<circle");
  });

  it("drops event handlers, however they are spelled", async () => {
    serve(svg('<circle r="4" onload="alert(1)" ONCLICK="alert(2)"/>'));
    const text = await loadArtwork("fox.svg", null);
    expect(text.toLowerCase()).not.toContain("onload");
    expect(text.toLowerCase()).not.toContain("onclick");
  });

  it("drops a link out of the drawing but keeps one into it", async () => {
    serve(
      svg(
        '<a href="https://elsewhere.example"><circle r="4"/></a>' +
          '<use href="#glyph"/>',
      ),
    );
    const text = await loadArtwork("fox.svg", null);
    expect(text).not.toContain("elsewhere.example");
    expect(text).toContain('href="#glyph"');
  });

  it("drops a javascript: URL written with whitespace in the scheme", async () => {
    serve(svg('<a href="java\nscript:alert(1)"><circle r="4"/></a>'));
    const text = await loadArtwork("fox.svg", null);
    expect(text.toLowerCase()).not.toContain("script:");
  });

  it("drops a foreignObject, which is a document inside a drawing", async () => {
    serve(svg("<foreignObject><div>hello</div></foreignObject>"));
    const text = await loadArtwork("fox.svg", null);
    expect(text).not.toMatch(/foreignObject/i);
    expect(text).not.toContain("hello");
  });

  it("drops a handler on the root element itself", async () => {
    // `querySelectorAll("*")` never visits the element it is called on, so
    // the first version of the pass walked straight past `<svg onload>`.
    serve(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" ' +
        'onload="globalThis.pwned = 1"><circle r="4"/></svg>',
    );
    const text = await loadArtwork("fox.svg", null);
    expect(text.toLowerCase()).not.toContain("onload");
    expect(text).not.toContain("pwned");
    expect(text).toContain("<circle");
  });

  it("drops a stylesheet, which would restyle the whole call", async () => {
    serve(svg('<style>body{display:none}</style><circle r="4"/>'));
    const text = await loadArtwork("fox.svg", null);
    expect(text).not.toMatch(/<style/i);
    expect(text).not.toContain("display:none");
    expect(text).toContain("<circle");
  });

  it("drops a paint that reaches out to somebody else's server", async () => {
    serve(
      svg(
        '<circle r="4" fill="url(https://beacon.example/x.svg#p)"/>' +
          '<rect width="2" height="2" fill="url(#local)"/>',
      ),
    );
    const text = await loadArtwork("fox.svg", null);
    expect(text).not.toContain("beacon.example");
    // A reference into this same drawing is the legitimate use.
    expect(text).toContain("url(#local)");
  });

  it("refuses something that is not an SVG at all", async () => {
    serve("<html><body>404</body></html>");
    await expect(loadArtwork("fox.svg", null)).rejects.toThrow(
      /Invalid avatar SVG/,
    );
  });
});
