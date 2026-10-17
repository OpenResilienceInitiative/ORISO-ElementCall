/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { type OrisoIdentity, recolorSvg } from "./identity";

/**
 * Where the animals come from.
 *
 * They come from ORISO. That is the whole point of this file, and it is a
 * requirement rather than a convenience:
 *
 *   "Du musst einfach die Icons, wie sie sind, reinladen. Das heisst, nicht
 *    du definierst die im Call. Du bist da immer quasi der, der das erbt."
 *
 * So there is no animal set in this repository and no fallback artwork to
 * drift from it. The call fetches the same files the chat draws, off the host
 * that embedded it, and paints them in the ink it was told. If the fetch
 * fails the face shows initials — it does not substitute a picture.
 *
 * In production the widget is served from the host's own origin (`/assets` is
 * routed to this bundle, `/static` to the host's files), so `/static/...`
 * resolves without a hop. Standalone and in dev the origins differ, which is
 * what `parentUrl` is for; that case needs `Access-Control-Allow-Origin` on
 * `/static/anon-animals/`.
 */
const ARTWORK_PATH = "/static/anon-animals";

/**
 * Bumped by the host whenever the artwork or its viewBox changes. The files
 * are served with a day of cache and are not content-hashed, so without this
 * a browser can pair new sizing code with an old drawing. Kept in step with
 * ORISO-Frontend's `AVATAR_ART_REVISION`.
 */
export const ARTWORK_REVISION = 2;

/**
 * The host's origin, out of whatever the widget contract handed us.
 *
 * `parentUrl` is only promised to be the host's URL, not a bare origin: the
 * contract permits a path and a query string, and ORISO-Frontend passing
 * `window.location.origin` today is a choice it could change. Concatenating
 * `/static` onto the whole value turned a host embedded at `/client/room`
 * into a request for `/client/room/static/anon-animals/fox.svg`, and a query
 * string into something worse. The empty string means "this origin", which is
 * the production case: the widget is served from the host.
 */
function originOf(parentUrl: string | null): string {
  if (parentUrl === null || parentUrl.trim() === "") return "";
  try {
    return new URL(parentUrl).origin;
  } catch {
    return "";
  }
}

export function artworkUrl(file: string, parentUrl: string | null): string {
  return `${originOf(parentUrl)}${ARTWORK_PATH}/${file}?v=${ARTWORK_REVISION}`;
}

/** Tags that carry behaviour rather than drawing. */
const FORBIDDEN_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "handler",
  "set",
]);

/**
 * Anything in the drawing that could run, removed.
 *
 * The artwork is first-party — it comes off the host's own `/static`, behind
 * a content-type check, under a file name validated to a bare `*.svg` — and
 * ORISO-Frontend's own `AnimalAvatar` injects the same files with no more
 * than that. But this one goes through `dangerouslySetInnerHTML` in a call
 * that is holding a camera and a microphone, and the file NAME arrives in a
 * room state event published by another client. One pass over the parsed
 * document costs nothing and makes the whole chain safe by construction
 * rather than by argument. It is deliberately not a dependency: this runs on
 * a document the DOM already parsed, and a sanitiser in the fork that the
 * host does not have would be two different answers to one question.
 */
function stripActiveContent(root: Element): void {
  for (const element of [...root.querySelectorAll("*")]) {
    if (FORBIDDEN_TAGS.has(element.nodeName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      // Whitespace and control characters are ignored inside a URL scheme as
      // written in markup, so `java\nscript:` is a live link. Compare with
      // everything unprintable taken out.
      const value = attribute.value.replace(/[^\x21-\x7e]/g, "").toLowerCase();
      const isLink = name === "href" || name.endsWith(":href");
      if (
        name.startsWith("on") ||
        value.startsWith("javascript:") ||
        value.startsWith("data:text/html") ||
        // Only a reference into this same drawing, never out of it.
        (isLink && !attribute.value.trimStart().startsWith("#"))
      )
        element.removeAttribute(attribute.name);
    }
  }
}

/** One fetch per file per session, shared by every tile that wants it. */
const inFlight = new Map<string, Promise<string>>();

/**
 * The raw SVG text for one file, fetched once.
 *
 * Uncoloured on purpose: two people can carry the same animal in different
 * ink, and caching the coloured result would mean fetching the same drawing
 * again for the second of them.
 */
export async function loadArtwork(
  file: string,
  parentUrl: string | null,
): Promise<string> {
  const url = artworkUrl(file, parentUrl);
  let pending = inFlight.get(url);
  if (pending === undefined) {
    pending = (async (): Promise<string> => {
      const response = await fetch(url);
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.toLowerCase().includes("image/svg"))
        throw new Error(`Failed to load avatar SVG: ${file}`);
      const text = (await response.text()).trim();
      if (text.length === 0) throw new Error(`Empty avatar SVG: ${file}`);
      /*
       * Parsed, not prefix-matched.
       *
       * The first version of this checked `text.startsWith("<svg")`, which
       * rejected every single real ORISO animal: they are written by a tool
       * and begin `<?xml version="1.0" encoding="UTF-8"?>`. Nothing caught it
       * — the unit test's fixture began with `<svg` and so agreed with the
       * bug — and it only showed up when the faces came back as initials in
       * a screenshot. This is the same check ORISO-Frontend's own loader
       * makes, for the same reason.
       */
      const document = new DOMParser().parseFromString(text, "image/svg+xml");
      if (
        document.documentElement.nodeName.toLowerCase() !== "svg" ||
        document.querySelector("parsererror") !== null
      )
        throw new Error(`Invalid avatar SVG: ${file}`);
      stripActiveContent(document.documentElement);
      return new XMLSerializer().serializeToString(document.documentElement);
    })();
    // A failed fetch must not be remembered as a failure forever: a tile that
    // mounts after the host comes back should get another go.
    pending.catch(() => inFlight.delete(url));
    inFlight.set(url, pending);
  }
  return pending;
}

/** Only for tests: forget what has been fetched. */
export function resetArtworkCache(): void {
  inFlight.clear();
}

/**
 * The inherited artwork for an identity, painted in its ink.
 *
 * `null` while it is on its way and `null` if it never arrives, which the
 * face reads as "show initials". An identity with no file — the fallback for
 * somebody who published nothing — never fetches anything.
 */
export function useArtwork(
  identity: OrisoIdentity,
  parentUrl: string | null,
): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  const { file, ink } = identity;

  useEffect(() => {
    if (file === undefined) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    setSvg(null);
    loadArtwork(file, parentUrl)
      .then((text) => {
        if (!cancelled) setSvg(recolorSvg(text, ink));
      })
      .catch((error) => {
        if (!cancelled) {
          setSvg(null);
          logger.warn(`[ORISO] could not inherit the artwork ${file}`, error);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [file, ink, parentUrl]);

  return svg;
}
