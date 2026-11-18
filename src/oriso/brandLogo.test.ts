/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { computeUrlParams } from "../UrlParams";
import {
  allowedBrandLogo,
  brandLogoOrigins,
  parseBrandLogo,
  parseOperatorLogo,
} from "./brandLogo";

const OWN = "https://dev.oriso.org";
const ROUTE = "/service/tenant/public/branding/12/logo";

describe("parseBrandLogo: the address has to be the tenant logo route", () => {
  it("takes the route on https", () => {
    expect(parseBrandLogo(`${OWN}${ROUTE}`)).toBe(`${OWN}${ROUTE}`);
    expect(
      parseBrandLogo(
        "https://tenant.example.org:8443/service/tenant/public/branding/7/logo",
      ),
    ).toBe(
      "https://tenant.example.org:8443/service/tenant/public/branding/7/logo",
    );
  });

  it("takes plain http only on a local development host", () => {
    expect(parseBrandLogo(`http://localhost:5173${ROUTE}`)).toBe(
      `http://localhost:5173${ROUTE}`,
    );
    expect(parseBrandLogo(`http://127.0.0.1${ROUTE}`)).toBe(
      `http://127.0.0.1${ROUTE}`,
    );
  });

  it.each([
    ["any other path", `${OWN}/evil.png`],
    [
      "the favicon next to it",
      `${OWN}/service/tenant/public/branding/1/favicon`,
    ],
    [
      "the branding route without the service prefix",
      `${OWN}/public/branding/1/logo`,
    ],
    [
      "a tenant id that is not a number",
      `${OWN}/service/tenant/public/branding/abc/logo`,
    ],
    ["no tenant id", `${OWN}/service/tenant/public/branding//logo`],
    ["a file extension", `${OWN}${ROUTE}.png`],
    ["a trailing slash", `${OWN}${ROUTE}/`],
    ["a longer path", `${OWN}${ROUTE}/more`],
    ["a path in front", `${OWN}/x${ROUTE}`],
    ["a different case", `${OWN}/Service/tenant/public/branding/12/logo`],
    [
      "path traversal out of the route",
      `${OWN}/service/tenant/public/branding/12/../../../evil/logo`,
    ],
    [
      "encoded path traversal",
      `${OWN}/service/tenant/public/branding/12/%2e%2e/%2e%2e/evil/logo`,
    ],
    ["an encoded slash", `${OWN}/service/tenant/public/branding/1%2F2/logo`],
    ["a query", `${OWN}${ROUTE}?x=1`],
    ["an empty query", `${OWN}${ROUTE}?`],
    ["a fragment", `${OWN}${ROUTE}#x`],
    ["credentials", `https://user:secret@dev.oriso.org${ROUTE}`],
    [
      "a user name that looks like the host",
      `https://dev.oriso.org@evil.example${ROUTE}`,
    ],
    ["a script address", "javascript:alert(1)"],
    ["a script address in disguise", "JaVaScRiPt:alert(1)"],
    ["a data address", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["a blob address", `blob:${OWN}/3b9a`],
    ["a file address", `file://${ROUTE}`],
    ["an ftp address", `ftp://dev.oriso.org${ROUTE}`],
    ["plain http on a real host", `http://dev.oriso.org${ROUTE}`],
    [
      "plain http on a look-alike of localhost",
      `http://localhost.evil.example${ROUTE}`,
    ],
    ["a relative path", ROUTE],
    ["a protocol-relative address", `//dev.oriso.org${ROUTE}`],
    ["a bare host", `dev.oriso.org${ROUTE}`],
    ["an empty value", ""],
    ["a blank value", "   "],
    ["no address at all", "not a url"],
  ])("ignores %s", (_name, value) => {
    expect(parseBrandLogo(value)).toBeNull();
  });

  it("ignores a missing value", () => {
    expect(parseBrandLogo(null)).toBeNull();
    expect(parseBrandLogo(undefined)).toBeNull();
  });

  it("hands back the normalised address, never the raw string", () => {
    expect(
      parseBrandLogo(`${OWN}/service/tenant/public/branding/12/x/../logo`),
    ).toBe(`${OWN}${ROUTE}`);
  });
});

describe("allowedBrandLogo: the address has to be on a host the deployment trusts", () => {
  const origins = [OWN, "https://tenant.example.org"];

  it("takes the call's own origin", () => {
    expect(allowedBrandLogo(`${OWN}${ROUTE}`, origins)).toBe(`${OWN}${ROUTE}`);
  });

  it("takes a listed origin", () => {
    const logo = `https://tenant.example.org${ROUTE}`;
    expect(allowedBrandLogo(logo, origins)).toBe(logo);
  });

  it("rejects any other host, even with the right path", () => {
    expect(
      allowedBrandLogo(`https://evil.example${ROUTE}`, origins),
    ).toBeNull();
  });

  it.each([
    [
      "a host that merely starts like it",
      `https://dev.oriso.org.evil.example${ROUTE}`,
    ],
    ["a host it is a subdomain of", `https://x.dev.oriso.org${ROUTE}`],
    ["another port", `https://dev.oriso.org:8443${ROUTE}`],
    ["plain http for an https origin", `http://localhost${ROUTE}`],
    [
      "credentials that name a listed host",
      `https://dev.oriso.org@evil.example${ROUTE}`,
    ],
  ])("matches the origin exactly: not %s", (_name, logo) => {
    expect(allowedBrandLogo(logo, origins)).toBeNull();
  });

  it("rejects the right host with the wrong path", () => {
    expect(allowedBrandLogo(`${OWN}/evil.png`, origins)).toBeNull();
    expect(allowedBrandLogo(`${OWN}${ROUTE}?x=1`, origins)).toBeNull();
  });

  it("is closed when nothing is listed", () => {
    expect(allowedBrandLogo(`${OWN}${ROUTE}`, [])).toBeNull();
  });

  it("has no logo for no address", () => {
    expect(allowedBrandLogo(null, origins)).toBeNull();
  });

  it("re-checks the address it is given, whoever vouched for it", () => {
    expect(allowedBrandLogo("javascript:alert(1)", origins)).toBeNull();
    expect(allowedBrandLogo(`${OWN}/evil.png`, origins)).toBeNull();
  });
});

describe("brandLogoOrigins: which hosts a logo may come from", () => {
  it("is the call's own origin when nothing is configured", () => {
    expect(brandLogoOrigins(OWN, undefined)).toEqual([OWN]);
  });

  it("adds the configured origins", () => {
    expect(
      brandLogoOrigins(OWN, [
        "https://tenant.example.org",
        "http://localhost:8081",
      ]),
    ).toEqual([OWN, "https://tenant.example.org", "http://localhost:8081"]);
  });

  it.each([
    ["an origin with a path", "https://tenant.example.org/service"],
    ["an origin with a trailing slash", "https://tenant.example.org/"],
    ["an origin with credentials", "https://user@tenant.example.org"],
    ["plain http on a real host", "http://tenant.example.org"],
    ["a script address", "javascript:alert(1)"],
    ["a wildcard", "https://*.example.org"],
    ["something that is not an address", "tenant"],
    ["a number", 42],
    ["an object", { origin: "https://tenant.example.org" }],
  ])("drops %s", (_name, entry) => {
    expect(brandLogoOrigins(OWN, [entry])).toEqual([OWN]);
  });

  it("ignores a setting that is not a list", () => {
    expect(brandLogoOrigins(OWN, "https://tenant.example.org")).toEqual([OWN]);
    expect(brandLogoOrigins(OWN, null)).toEqual([OWN]);
  });

  it("does not trust an own origin it cannot make sense of", () => {
    // A page opened from a file has the origin "null".
    expect(brandLogoOrigins("null", ["https://tenant.example.org"])).toEqual([
      "https://tenant.example.org",
    ]);
  });
});

describe("the logo in the call address", () => {
  it("reads the tenant logo route from the hash", () => {
    const params = computeUrlParams(
      "",
      `#?orisoLogo=${encodeURIComponent(`${OWN}${ROUTE}`)}`,
    );
    expect(params.orisoLogo).toBe(`${OWN}${ROUTE}`);
  });

  it("has none when the address carries none", () => {
    expect(computeUrlParams("", "").orisoLogo).toBeNull();
  });

  it("drops anything that is not the tenant logo route", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "https://evil.example/logo.png",
      `${OWN}/evil.png`,
    ]) {
      expect(
        computeUrlParams("", `#?orisoLogo=${encodeURIComponent(bad)}`)
          .orisoLogo,
      ).toBeNull();
    }
  });
});

describe("parseOperatorLogo: the platform operator's logo from the config", () => {
  const CALL = "https://call.oriso.org";

  it("takes a path on the call's own origin", () => {
    expect(parseOperatorLogo("/oriso/logo.svg", CALL)).toBe(
      "https://call.oriso.org/oriso/logo.svg",
    );
  });

  it("takes an absolute https address", () => {
    expect(parseOperatorLogo("https://cdn.oriso.org/logo.png", CALL)).toBe(
      "https://cdn.oriso.org/logo.png",
    );
  });

  it("refuses anything else", () => {
    for (const bad of [
      undefined,
      "",
      42,
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "//evil.example/logo.svg",
      "http://cdn.oriso.org/logo.png",
      "https://user:pw@cdn.oriso.org/logo.png",
      "logo.svg",
    ])
      expect(parseOperatorLogo(bad, CALL)).toBeNull();
  });
});
