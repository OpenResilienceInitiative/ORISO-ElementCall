/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { computeUrlParams } from "../../UrlParams";
import { parseBrandHex } from "./brandParams";

describe("parseBrandHex", () => {
  it("takes six lowercase hex digits and hands back the seed with a hash", () => {
    expect(parseBrandHex("0a7a3c")).toBe("#0a7a3c");
    expect(parseBrandHex("a5000a")).toBe("#a5000a");
  });

  it.each([
    ["a hash in front", "#0a7a3c"],
    ["upper case", "0A7A3C"],
    ["five digits", "0a7a3"],
    ["seven digits", "0a7a3c0"],
    ["the three-digit shorthand", "fc0"],
    ["a colour name", "red"],
    ["an empty value", ""],
    ["a trailing blank", "0a7a3c "],
    ["a leading blank", " 0a7a3c"],
    ["a non-hex digit", "0a7a3g"],
    ["a CSS breakout", "0a7a3c;}body{display:none"],
    ["a CSS function", "rgb(0,0,0)"],
    ["a script address", "javascript:alert(1)"],
  ])("ignores %s", (_name, value) => {
    expect(parseBrandHex(value)).toBeNull();
  });

  it("ignores a missing value", () => {
    expect(parseBrandHex(null)).toBeNull();
    expect(parseBrandHex(undefined)).toBeNull();
  });
});

describe("the brand colours in the call address", () => {
  it("reads the three seeds from the hash", () => {
    const params = computeUrlParams(
      "",
      "#?orisoPrimary=0a7a3c&orisoAccent=1c4f8f&orisoSignal=b1005e",
    );
    expect(params.orisoPrimary).toBe("#0a7a3c");
    expect(params.orisoAccent).toBe("#1c4f8f");
    expect(params.orisoSignal).toBe("#b1005e");
  });

  it("still reads them from the plain query, like every other parameter", () => {
    expect(computeUrlParams("?orisoPrimary=0a7a3c", "").orisoPrimary).toBe(
      "#0a7a3c",
    );
  });

  it("has none of them when the address carries none", () => {
    const params = computeUrlParams("", "");
    expect(params.orisoPrimary).toBeNull();
    expect(params.orisoAccent).toBeNull();
    expect(params.orisoSignal).toBeNull();
  });

  it("drops each invalid seed on its own and keeps a valid sibling", () => {
    const params = computeUrlParams(
      "",
      "#?orisoPrimary=nope&orisoAccent=1C4F8F&orisoSignal=b1005e",
    );
    expect(params.orisoPrimary).toBeNull();
    expect(params.orisoAccent).toBeNull();
    expect(params.orisoSignal).toBe("#b1005e");
  });
});
