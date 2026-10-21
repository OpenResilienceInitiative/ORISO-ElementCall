/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

/**
 * ORISO identity, as the call receives it.
 *
 * The first rule of the handoff is that identity is inherited, never derived:
 * a person's animal, their circle colour and the colour of the artwork on it
 * are the same here as in the chat they came from. The call does not get a
 * vote. That rule is why this file has no animal list in it and no way to
 * pick one.
 *
 * What travels is a tiny record, sent by each client as an encrypted timeline
 * event in the call room — not as room state, which Matrix does not encrypt.
 * The colour maths below is here only to serve it:
 * `recolorSvg` paints the inherited artwork in the inherited ink, and the
 * palette and contrast functions exist for the one case the transport cannot
 * cover — a member who published nothing at all.
 *
 * That case gets INITIALS, deliberately. Deriving an animal from a user id
 * would look like success and be the exact mistake the rule forbids: the call
 * inventing an identity of its own. Initials say "we were not told", which is
 * the truth, and they say it in the person's own palette colour so the shape
 * still belongs to the room.
 *
 * The palette, `luminance`, `contrastRatio`, `pickIconColor`,
 * `iconCandidates` and `recolorSvg` below are ORISO-Frontend's
 * `src/utils/anonName/engine.ts`, unchanged. Two copies of a contrast rule
 * drift; these are pinned by `identity.test.ts` against the values the other
 * repo's tests pin.
 */
export const AVATAR_COLORS = [
  // --- Light (pairs with a near-black animal) ---
  "#FCE7E6", // JP Sakura
  "#F6BFBC", // JP Toki
  "#EEBBCB", // JP Nadeshiko
  "#F0908D", // JP Usubeni
  "#FCE2C4", // JP Tamago
  "#EAD56B", // JP Kariyasu
  "#D6E9CA", // JP Byakuroku
  "#D8E698", // JP Wakana
  "#EBF6F7", // JP Aijiro
  "#BBBCDE", // JP Fuji
  "#BCE2E8", // JP Mizu
  "#FABF14", // JP Ukon
  "#A3C1AD", // UK Cambridge Blue
  "#B0E0E6", // UK Powder Blue
  "#96C8A2", // UK Eton Blue
  "#B2AC88", // UK Sage
  "#F0DC82", // UK Buff
  "#F6DE9B", // UK Primrose
  "#F7CAC9", // UK Rose Quartz
  "#C6D3E3", // UK Wedgwood
  "#C9E4DE", // UK Duck Egg
  "#C3B1D0", // UK Heather
  // --- Dark (pairs with a white animal) ---
  "#165E83", // JP Ai (indigo)
  "#223A70", // JP Kon
  "#1E50A2", // JP Ruri
  "#19448E", // JP Rurikon
  "#4C6CB3", // JP Gunjo
  "#007B43", // JP Tokiwa (green)
  "#B7282E", // JP Akane
  "#C9171E", // JP Kurenai
  "#6C2C2F", // JP Ebicha
  "#745399", // JP Edomurasaki
  "#5E4491", // JP Sumire
  "#4F284B", // JP Murasaki
  "#1D697C", // JP Nando
  "#2C4F54", // JP Onando
  "#181B39", // JP Kachi
  "#A22041", // JP Botan
  "#211915", // JP Kurotsurubami
  "#004225", // UK British Racing Green
  "#002147", // UK Oxford Blue
  "#003153", // UK Prussian Blue
  "#7F1734", // UK Claret
  "#800020", // UK Burgundy
  "#355E3B", // UK Hunter Green
  "#005F6A", // UK Teal
  "#1B1F3B", // UK Navy
  "#472D47", // UK Aubergine
  "#4B2E44", // UK Damson
  "#48586A", // UK Slate
  "#5C2A4B", // UK Mulberry
  "#093824", // UK Bottle Green
];

/** WCAG relative luminance (0–1) of a #rrggbb colour (gamma-correct sRGB). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21) between two colours (given as #rrggbb). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const ICON_DARK = "#1a1a1a";
const ICON_LIGHT = "#ffffff";

/** Minimum WCAG contrast an animal colour must reach against its background so
 *  the silhouette stays clearly legible. */
const MIN_ICON_CONTRAST = 4.5;

/** How many complementary palette colours to offer per background (the most
 *  hue-distant, contrast-passing ones). Black + white are always added on top,
 *  so they stay part of the mix. */
const COMPLEMENTARY_ICON_LIMIT = 6;

/** Hue angle (0–360) of a #rrggbb colour. */
function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Shortest angular distance (0–180) between two hues. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const PALETTE_META = AVATAR_COLORS.map((hex) => ({ hex, hue: hueOf(hex) }));

/** Pick the animal colour (near-black or white) that maximises WCAG contrast
 *  against the given background — legible on any palette entry. */
export function pickIconColor(bg: string): string {
  return contrastRatio(bg, ICON_DARK) >= contrastRatio(bg, ICON_LIGHT)
    ? ICON_DARK
    : ICON_LIGHT;
}

/**
 * All animal-colour options that stay legible on `bg` (WCAG ≥ 4.5): the
 * black/white that pass, PLUS the most hue-distant ("complementary") colours
 * from the same curated palette. Black/white remain in the pool so the classic
 * high-contrast look still appears. Always returns at least one entry.
 */
export function iconCandidates(bg: string): string[] {
  const bw = [ICON_DARK, ICON_LIGHT].filter(
    (c) => contrastRatio(bg, c) >= MIN_ICON_CONTRAST,
  );
  const bgHue = hueOf(bg);
  const complementary = PALETTE_META.filter(
    (p) => p.hex.toLowerCase() !== bg.toLowerCase(),
  )
    .map((p) => ({ hex: p.hex, dist: hueDistance(bgHue, p.hue) }))
    .filter((p) => contrastRatio(bg, p.hex) >= MIN_ICON_CONTRAST)
    .sort((x, y) => y.dist - x.dist)
    .slice(0, COMPLEMENTARY_ICON_LIMIT)
    .map((p) => p.hex);

  const pool = [...bw, ...complementary];
  return pool.length > 0 ? pool : [pickIconColor(bg)];
}

/** Recolour a monochrome animal SVG to `iconColor` (line/silhouette art that
 *  defaults to black). White / none are preserved so highlights stay light.
 *  Browser-only (uses DOMParser); both ORISO apps run in the browser. */
export function recolorSvg(svgText: string, iconColor: string): string {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute(
    "style",
    `${svg.getAttribute("style") || ""};display:block;max-width:100%;max-height:100%;overflow:visible;`,
  );
  const keep = new Set(["none", "white", "#fff", "#ffffff"]);
  svg
    .querySelectorAll("path, circle, rect, ellipse, line, polyline, polygon")
    .forEach((el) => {
      const f = el.getAttribute("fill");
      if (f === null || !keep.has(f.toLowerCase()))
        el.setAttribute("fill", iconColor);
      const s = el.getAttribute("stroke");
      if (s && !keep.has(s.toLowerCase())) el.setAttribute("stroke", iconColor);
    });
  return new XMLSerializer().serializeToString(svg);
}

/* ------------------------------------------------------------------------- *
 * What travels, and how it is read
 * ------------------------------------------------------------------------- */

/**
 * The encrypted timeline event that carries one person's ORISO identity.
 *
 * Not room state: state events are not encrypted, and this record says which
 * animal a person chose. It is keyed by sender, the newest one wins, and the
 * host re-sends it whenever somebody joins — see `useOrisoIdentities`.
 *
 * Why an event of our own and not the MatrixRTC membership, which was
 * the first plan: `MembershipManager.makeMyMembership` in matrix-js-sdk is
 * `protected` and builds its content from a fixed literal, and
 * `joinRoomSession` constructs the manager itself. There is no supported hook
 * for an extra field, so riding along in the membership would mean patching
 * the SDK. This costs one small event instead, which the widget is allowed to
 * receive.
 */
export const ORISO_IDENTITY_EVENT_TYPE = "org.oriso.call.identity";

/** How a person is drawn. The call never chooses this; it is told. */
export type OrisoIdentityKind = "animal" | "motif" | "initials";

export interface OrisoIdentity {
  kind: OrisoIdentityKind;
  /** The artwork's file name, e.g. `fox.svg`. Absent for initials. */
  file?: string;
  /** The circle's colour. */
  bg: string;
  /** The colour the artwork is painted in. */
  ink: string;
  /**
   * One or two letters.
   *
   * The whole of the `initials` kind, and the stand-in for the other two
   * while their artwork is in flight or if it never arrives. A published
   * animal record carries no letters — it does not need to — so the tile
   * fills them in from the display name it has; see `useOrisoIdentity`.
   */
  initials?: string;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The shape of an artwork file name, and the one place it is written down.
 *
 * A bare name and nothing else: no slashes, no scheme, no second dot. The
 * loader joins it onto `ARTWORK_PATH` in `artwork.ts`, so a name that could
 * walk out of that folder would be a way to aim the fetch at any path on the
 * host. ORISO-Frontend's `src/utils/anonName/data.ts` is the other end of
 * this contract — every `svg:` entry there has to match this, and
 * `callIdentity.contract.test.ts` over there asserts it from its side.
 *
 * When a second icon set arrives, this is the line that decides whether it
 * can live in a subfolder. Widen it deliberately and change `ARTWORK_PATH`
 * with it; do not widen it by accident.
 */
export const ARTWORK_FILE_NAME = /^[a-z0-9][a-z0-9_-]*\.svg$/i;

/**
 * Said once per file, and said at all.
 *
 * A record we cannot use ends as initials, which is the right PICTURE — the
 * call never guesses an animal — but it used to be the right picture with no
 * explanation. Somebody adds an icon set, the chat shows the new animal, the
 * call shows two letters, and every test stays green. The silence is the bug.
 *
 * A record that carries no file at all is not this case: that is a person who
 * published nothing, and initials are the whole answer. Only a record that
 * HAS a file we could not accept says something is wrong with the deployment.
 *
 * Deduplicated by file name, because a twenty-person call would otherwise
 * repeat the same line twenty times and once more on every re-render.
 */
const announced = new Set<string>();

function announceRejection(file: string, why: string): void {
  if (file === "" || announced.has(file)) return;
  announced.add(file);
  logger.warn(`[ORISO] identity artwork rejected: "${file}" — ${why}`);
}

/** Only for tests: forget what has already been said. */
export function resetRejectionLog(): void {
  announced.clear();
}

/**
 * An identity record out of untrusted event content.
 *
 * Every field is checked, because this arrives from another client over the
 * network: a `file` that is not a plain SVG name could otherwise be used to
 * aim the artwork fetch at any path on the host, and a `bg` that is not a hex
 * colour lands in a style attribute. `null` means "we were not told", which
 * is a legitimate answer and gets the initials treatment.
 */
export function readIdentity(content: unknown): OrisoIdentity | null {
  if (typeof content !== "object" || content === null) return null;
  const raw = content as Record<string, unknown>;

  const bg = typeof raw.bg === "string" ? raw.bg.trim() : "";
  const ink = typeof raw.ink === "string" ? raw.ink.trim() : "";
  if (!HEX.test(bg) || !HEX.test(ink)) return null;

  const kind = raw.kind;
  if (kind === "initials") {
    /*
     * Taken as given, not re-derived.
     *
     * The host has already decided what the letters are, from name parts
     * this side cannot see. Running `initialsOf` over the result turns the
     * counsellor's "SP" into "S", because "SP" is one word — which is what
     * the cross-repository contract test caught, and what neither
     * repository's own suite could have. Sanitised, capped, and otherwise
     * left alone.
     */
    const given = typeof raw.initials === "string" ? raw.initials : "";
    /*
     * Upper-cased BEFORE the cut, because some letters grow in the mapping.
     * `ﬃ` upper-cases to `FFI` and `ß` to `SS`, so slicing first and
     * upper-casing after returned three characters from a field this file
     * documents as one or two — enough to overflow the letters on the form.
     */
    const letters = [...given.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase()]
      .slice(0, 2)
      .join("");
    // A record that says "initials" and carries none is not an identity: it
    // would draw an empty coloured circle. `null` means "we were not told",
    // which is the truth, and the tile then takes the letters from the
    // display name it already has.
    if (letters.length === 0) return null;
    return { kind, bg, ink, initials: letters };
  }
  if (kind !== "animal" && kind !== "motif") return null;

  // A bare file name and nothing else: no slashes, no dots beyond the
  // extension, no scheme. The fetch that uses it joins it onto a base path.
  const file = typeof raw.file === "string" ? raw.file.trim() : "";
  if (!ARTWORK_FILE_NAME.test(file)) {
    announceRejection(
      file,
      "the file name is not a bare <name>.svg; artwork lives flat in one folder, see artwork.ts",
    );
    return null;
  }

  return { kind, file, bg, ink };
}

/**
 * At most two letters, upper-cased, from a display name.
 *
 * ORISO display names are of the form "freundliche Katze Mika", so the useful
 * pair is the first letter of the last two words — "KM" — rather than the
 * first two letters of the string, which would give every cat the same mark.
 */
export function initialsOf(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0);
  if (words.length === 0) return "";
  const picked = words.length === 1 ? [words[0]] : words.slice(-2);
  /*
   * One letter per word, capped where it is taken rather than at the end.
   *
   * Both steps count code POINTS, never UTF-16 units: `slice(0, 2)` on a
   * string left half a surrogate pair, which the font draws as a replacement
   * glyph. And upper-casing can GROW a letter — `ß` becomes `SS`, `ﬃ`
   * becomes `FFI` — so capping the joined pair let the first word spend both
   * slots: "ßeta Katze" came back as "SS", losing the K that tells two
   * Katzen apart, which is the whole purpose of the second letter.
   */
  return picked.map((w) => [...[...w][0].toUpperCase()][0]).join("");
}

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * The identity for somebody who published none.
 *
 * Initials, not an animal. Picking an animal here would look like success and
 * be the one thing the handoff forbids — the call deciding who somebody is.
 * The colour is deterministic from the user id so the shape at least keeps
 * still between renders and between clients, and the ink is chosen by the
 * same contrast rule everything else uses.
 */
export function fallbackIdentity(
  userId: string,
  displayName: string,
): OrisoIdentity {
  const bg = AVATAR_COLORS[hashOf(userId) % AVATAR_COLORS.length];
  return {
    kind: "initials",
    bg,
    ink: pickIconColor(bg),
    initials: initialsFor(userId, displayName),
  };
}

/**
 * The letters to show for somebody, from whatever we know about them.
 *
 * The display name if there is one, the localpart otherwise — a member whose
 * profile has not arrived yet still gets a mark rather than a blank circle.
 */
export function initialsFor(userId: string, displayName: string): string {
  return initialsOf(displayName) || initialsOf(userId.replace(/^@/, ""));
}
