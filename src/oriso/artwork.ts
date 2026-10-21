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

/**
 * Tags that carry behaviour, or reach outside the drawing, rather than draw.
 *
 * `style` is in here because a stylesheet inside an inlined SVG applies to
 * the WHOLE document it lands in — `body { display: none }` would take the
 * call with it — and because `url(…)` inside CSS is a request to a third
 * party from the call's origin. Inside an `<img>` neither is true, but the
 * cached text has to be safe on its own terms.
 */
const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
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
 * Belt and braces rather than the barrier. The barrier is the `<img>` the
 * face renders this with — see `artworkDataUrl` below — because an SVG loaded
 * in image context cannot run whatever is in it, and that is a property of
 * the context rather than of a list of tags one has to keep complete.
 *
 * This pass still runs, for two reasons. The cached text is what anybody who
 * later has a reason to put the drawing IN the document would reach for, and
 * it should be safe when they do. And the host it comes from is named by
 * `parentUrl`, a URL parameter: anybody can open this call pointed at a host
 * of their own choosing, so nothing about the body is first-party by
 * assumption.
 */
function stripActiveContent(root: Element): void {
  // The ROOT is in the pass, not only its descendants: `querySelectorAll("*")`
  // never visits the element it is called on, so `<svg onload="…">` walked
  // straight through the first version of this.
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (
      element !== root &&
      FORBIDDEN_TAGS.has(element.nodeName.toLowerCase())
    ) {
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
      // `fill="url(https://…)"`, `filter`, `mask`, `clip-path` and friends all
      // take a reference. Into this drawing is fine; out of it is a request to
      // somebody else's server from the call's origin.
      const reachesOut = /url\(\s*['"]?(?!#)/i.test(attribute.value);
      if (
        name.startsWith("on") ||
        value.startsWith("javascript:") ||
        value.startsWith("data:text/html") ||
        reachesOut ||
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
 * Said once per drawing, and with the address it was looked for at.
 *
 * The face falls back to initials when the artwork does not arrive, which is
 * right, and used to be all that happened: one line naming the file, without
 * saying WHERE the call had looked. That is the difference between "the call
 * shows letters" and "the set is not deployed under `/static/anon-animals` on
 * that host" — the second one can be acted on.
 *
 * Deduplicated by URL rather than by file, so the same drawing missing on two
 * different hosts is two warnings, and a twenty-person call is still one line
 * per drawing.
 */
const announcedMissing = new Set<string>();

function announceMissingArtwork(
  file: string,
  parentUrl: string | null,
  error: unknown,
): void {
  const url = artworkUrl(file, parentUrl);
  if (announcedMissing.has(url)) return;
  announcedMissing.add(url);
  logger.warn(
    `[ORISO] could not inherit the artwork "${file}" from ${url} — the tile falls back to initials`,
    error,
  );
}

/** Only for tests: forget what has already been said. */
export function resetMissingArtworkLog(): void {
  announcedMissing.clear();
}

/**
 * The drawing as something the browser renders but cannot run.
 *
 * An SVG referenced by an `<img>` is loaded in IMAGE context: scripts do not
 * execute, event handlers do not fire and external references are not
 * fetched. That is the barrier here, and it is a property of the context
 * rather than of a list of things to strip — which matters because `parentUrl`
 * is a URL parameter, so anybody can open this call pointed at a host of
 * their choosing and have it fetch a drawing of their choosing. Inlining that
 * through `dangerouslySetInnerHTML` put it in the call's own origin.
 *
 * `stripActiveContent` above still runs. It is belt and braces now rather
 * than the barrier, and it keeps the cached text safe for anybody who later
 * has a reason to put it in the document.
 */
export function artworkDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * The inherited artwork for an identity, painted in its ink.
 *
 * A `data:` URL for an `<img>`, `null` while it is on its way and `null` if it
 * never arrives — which the face reads as "show initials". An identity with no
 * file — the fallback for somebody who published nothing — never fetches
 * anything.
 */
export function useArtwork(
  identity: OrisoIdentity,
  parentUrl: string | null,
): string | null {
  const { file, ink } = identity;
  /*
   * What the held drawing is OF. The null byte cannot occur in any of the
   * three, so the join cannot be ambiguous.
   */
  const wanted =
    file === undefined ? null : `${file}\u0000${ink}\u0000${parentUrl ?? ""}`;
  const [held, setHeld] = useState<{ of: string | null; svg: string | null }>({
    of: wanted,
    svg: null,
  });

  /*
   * Cleared HERE rather than in the effect below, because an effect runs
   * after the commit it belongs to.
   *
   * The render that first carries the new identity would otherwise still be
   * handed the previous drawing, and the face paints what it is handed: for
   * one frame, somebody who changed their animal — or withdrew it, which is
   * the case that matters, since a withdrawal has nothing to replace it with
   * — went on showing the old one, in the old ink, under the new identity.
   * Writing state during render is the documented way out of exactly this:
   * React re-runs the render with the new state before anything is painted.
   */
  if (held.of !== wanted) setHeld({ of: wanted, svg: null });
  // Not `held.svg`: in the render that spots the change, `held` is the one
  // being discarded.
  const svg = held.of === wanted ? held.svg : null;

  useEffect(() => {
    // Nothing to fetch for an identity without a file, and nothing to clear
    // either — the render above has done it.
    if (file === undefined) return;
    let cancelled = false;
    loadArtwork(file, parentUrl)
      .then((text) => {
        if (!cancelled)
          setHeld({ of: wanted, svg: artworkDataUrl(recolorSvg(text, ink)) });
      })
      .catch((error) => {
        if (!cancelled) {
          setHeld({ of: wanted, svg: null });
          announceMissingArtwork(file, parentUrl, error);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [file, ink, parentUrl, wanted]);

  return svg;
}
