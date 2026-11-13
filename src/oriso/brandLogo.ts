/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The Träger's logo from the call address, fail-closed.
 *
 * The call address is attacker-controllable: anybody can send a link. An
 * `<img src>` taken from it would make the call page fetch from any server the
 * link names, which tells that server the viewer's IP address and that they are
 * in a call. So a logo is accepted only if BOTH hold:
 *
 *  1. its address is exactly the TenantService's public logo route,
 *     `/service/tenant/public/branding/<digits>/logo`: nothing else on the
 *     path, no query, no fragment, no credentials (`parseBrandLogo`);
 *  2. its origin is one the deployment trusts: the call page's own origin, or an
 *     origin listed in the config as `oriso.brand_logo_origins`
 *     (`allowedBrandLogo`, `brandLogoOrigins`).
 *
 * Whatever fails is ignored without a sound: no image, no gap, exactly as if
 * the address carried no logo.
 */

/** Hosts a developer's own machine answers on; the only ones plain http may use. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** TenantService's public logo route, and nothing but it. */
const LOGO_PATH = /^\/service\/tenant\/public\/branding\/\d+\/logo$/;

/** `https:`, or `http:` on a local development host. */
const hasPermittedScheme = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    // Not an absolute address.
    return null;
  }
};

/**
 * The shape of a logo address: the tenant logo route on an absolute `https:`
 * address (`http:` only for localhost / 127.0.0.1), with no credentials, no
 * query and no fragment. Says nothing about WHICH host: see `allowedBrandLogo`.
 *
 * What comes back is the parsed, normalised address (`URL.href`), never the raw
 * string: dot segments are resolved before the path is checked, so a traversal
 * cannot leave the route.
 */
export const parseBrandLogo = (
  value: string | null | undefined,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  // URL drops an empty query or fragment (`…/logo?`), so look at the raw text.
  if (/[?#]/.test(value)) {
    return null;
  }
  const url = parseUrl(value);
  if (
    url === null ||
    !hasPermittedScheme(url) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !LOGO_PATH.test(url.pathname)
  ) {
    return null;
  }
  return url.href;
};

/** A DNS name or an IPv4 address: no wildcard, no brackets, no odd characters. */
const PLAIN_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/**
 * An origin as the allowlist takes it: exactly what `URL.origin` prints, on
 * `https:` (or `http:` on localhost / 127.0.0.1). No path, no trailing slash,
 * no credentials, no wildcard.
 */
const exactOrigin = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const url = parseUrl(value);
  return url !== null &&
    hasPermittedScheme(url) &&
    PLAIN_HOST.test(url.hostname) &&
    url.origin === value
    ? value
    : null;
};

/**
 * The origins a logo may come from: the call page's own origin plus the
 * configured ones (`oriso.brand_logo_origins`). Entries that are not an exact
 * origin are dropped, so a typo narrows the list, never widens it.
 */
export const brandLogoOrigins = (
  ownOrigin: string,
  configured: unknown,
): string[] =>
  [ownOrigin, ...(Array.isArray(configured) ? configured : [])]
    .map(exactOrigin)
    .filter((origin): origin is string => origin !== null);

/**
 * The logo address if it has the shape of the tenant logo route AND comes from
 * one of `origins` (exact origin match); null otherwise. Checks the shape again
 * itself: it does not take anybody's word that the address was vetted.
 */
export const allowedBrandLogo = (
  logo: string | null | undefined,
  origins: readonly string[],
): string | null => {
  const checked = parseBrandLogo(logo);
  if (checked === null) {
    return null;
  }
  return origins.includes(new URL(checked).origin) ? checked : null;
};

/**
 * The platform operator's logo (#2233 R29): shown where the Träger has none,
 * or where the Träger's cannot be loaded.
 *
 * It comes from the deployment's own config (`oriso.operator_logo`), not from
 * the call address, so it is not held to the tenant logo route. It still has
 * to be an image address and nothing else: a path on the call's own origin
 * (`/oriso/operator-logo.svg`) or an absolute `https:` address (`http:` only on
 * localhost / 127.0.0.1), without credentials. A protocol-relative `//host`,
 * a relative path, `data:` and `javascript:` are refused.
 */
export const parseOperatorLogo = (
  value: unknown,
  ownOrigin: string,
): string | null => {
  if (typeof value !== "string" || value === "") return null;
  let url: URL;
  if (value.startsWith("/")) {
    if (value.startsWith("//")) return null;
    try {
      url = new URL(value, ownOrigin);
    } catch {
      return null;
    }
  } else {
    const parsed = parseUrl(value);
    if (parsed === null) return null;
    url = parsed;
  }
  return hasPermittedScheme(url) && url.username === "" && url.password === ""
    ? url.href
    : null;
};
