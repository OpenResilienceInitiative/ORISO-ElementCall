/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { haloRoomFor } from "./layout";

/**
 * The Kreis (design 2a, the group's standard view): the room's sound
 * indicator in the middle, everybody on a circle around it.
 *
 * Pure, like the rest of the engine: the same room looks the same on every
 * client, and the tests can pin the geometry down.
 */
export interface KreisSpot {
  x: number;
  y: number;
  size: number;
}

export interface KreisPlan {
  /** The sound indicator in the middle, as a square box. */
  centre: KreisSpot;
  /** One per person, in the order given, as square boxes. */
  seats: KreisSpot[];
  /** Whether the indicator is drawn at all (`KREIS_CENTRE_MIN`). */
  indicator: boolean;
}

/** The indicator's share of the stage's shorter side. */
export const KREIS_CENTRE_SHARE = 0.3;
/**
 * Below this the indicator is left out.
 *
 * Under about 96px the disc cannot hold the speaker's name and "spricht"
 * (seen on a phone with the notes sheet open: "Susa…" under its own forms),
 * and the ring still had to keep room for it. Where the stage is that small
 * the wave band above it already names who speaks.
 */
export const KREIS_CENTRE_MIN = 96;
/** Below this the indicator shows its bars only, without name and status. */
export const KREIS_CENTRE_TEXT_MIN = 136;
/** How much bigger a speaking or pinned form is than a listening one. */
export const KREIS_EMPHASIS = 1.3;

/**
 * The smallest group (T4): two people are the Einzelgespräch now, so three
 * is the Kreis most people meet first.
 *
 * Sized like a crowd, three got a quarter of the stage each and huddled
 * around the disc with the rest of the stage empty — 97px forms on a phone,
 * names cut to "ruhiger Fuc… 432". Three get a bigger share, and the
 * placement uses the room the triangle actually takes (below).
 */
export const KREIS_SMALL_GROUP = 3;
/** A form's cap as a share of the stage's shorter side, and a speaker's. */
const FORM_SHARE = {
  crowd: 0.25,
  crowdBig: 0.3,
  small: 0.3,
  smallBig: 0.36,
  // Without the disc (a phone) the middle is theirs as well.
  smallOpen: 0.36,
  smallOpenBig: 0.42,
};

/**
 * Whether the centre is big enough to say who speaks, not only to show the
 * bars. Then the desktop header leaves the speaker's name to it (R27).
 */
export function kreisCentreNamesSpeaker(stage: {
  width: number;
  height: number;
}): boolean {
  const side = Math.max(0, Math.min(stage.width, stage.height));
  return (
    side > 0 && Math.round(side * KREIS_CENTRE_SHARE) >= KREIS_CENTRE_TEXT_MIN
  );
}

/**
 * Where everybody stands.
 *
 * The first person sits at twelve o'clock and the rest follow clockwise at
 * equal angles. A form is as big as its share of the circle allows, capped
 * at a quarter of the stage (three people: `FORM_SHARE.small`); somebody
 * speaking or pinned ("Anheften: bleibt groß") gets `KREIS_EMPHASIS` of
 * that. The ring is pulled in so that the biggest form, with the halo's room
 * around it, still stays on the stage.
 */
export function kreisPlan(
  count: number,
  stage: { width: number; height: number; offsetY?: number },
  emphasised: ReadonlySet<number> = new Set(),
): KreisPlan {
  const offsetY = stage.offsetY ?? 0;
  const side = Math.max(0, Math.min(stage.width, stage.height));
  // One person is no group to measure as a triangle: their seats would
  // reach nowhere (`reachY` 0) and every position became NaN (#2233 review).
  const small = count >= 2 && count <= KREIS_SMALL_GROUP;
  const cx = stage.width / 2;
  const cy = offsetY + stage.height / 2;
  const share = Math.round(side * KREIS_CENTRE_SHARE);
  /*
   * A stage not measured yet (0) is not a small one.
   *
   * Three people keep the disc only where it can name the speaker: a disc
   * of bars alone, between three forms that light up themselves, adds
   * nothing — and on a phone it took the middle the three needed, while
   * the wave band above already says who speaks.
   */
  const indicator =
    side === 0 || share >= (small ? KREIS_CENTRE_TEXT_MIN : KREIS_CENTRE_MIN);
  const centreSize = indicator ? share : 0;
  const centreAt = (shiftY: number): KreisSpot => ({
    x: Math.round(cx - centreSize / 2),
    y: Math.round(cy + shiftY - centreSize / 2),
    size: centreSize,
  });
  if (count <= 0 || side === 0)
    return { centre: centreAt(0), seats: [], indicator };

  const room = haloRoomFor(stage.width, stage.height);
  const outer = side / 2 - room;
  const angles = Array.from(
    { length: count },
    (_, i) => -Math.PI / 2 + (2 * Math.PI * i) / count,
  );
  // A first guess at the ring, then the forms sized to the gaps on it.
  const ring0 = outer * 0.68;
  const perSeat = (2 * Math.PI * ring0) / count;
  const caps = !small
    ? { base: FORM_SHARE.crowd, big: FORM_SHARE.crowdBig }
    : indicator
      ? { base: FORM_SHARE.small, big: FORM_SHARE.smallBig }
      : { base: FORM_SHARE.smallOpen, big: FORM_SHARE.smallOpenBig };

  /*
   * How far the seats reach from the ring's middle, as a share of the ring.
   *
   * A crowd reaches the whole ring every way. Three do not: one person a
   * whole radius up, the other two only half a radius down and 0.87 to the
   * sides. Treated as a full circle, that left the bottom third of the stage
   * empty and the group hanging high, so a small group is measured as the
   * triangle it is and centred as one (`shift`).
   */
  const sines = angles.map(Math.sin);
  const up = small ? -Math.min(...sines) : 1;
  const down = small ? Math.max(...sines) : 1;
  // `up` and `down` differ for an odd count; the forms are centred below.
  const across = small
    ? Math.max(...angles.map((a) => Math.abs(Math.cos(a))))
    : 1;
  const reachY = (up + down) / 2;

  const fit = (
    base: number,
  ): {
    base: number;
    big: number;
    largest: number;
    ring: number;
    ringMax: number;
  } => {
    const big = Math.min(base * KREIS_EMPHASIS, side * caps.big);
    const largest = emphasised.size > 0 ? big : base;
    const ringMax = small
      ? Math.min(
          (stage.height / 2 - room - largest / 2) / reachY,
          across > 1e-6
            ? (stage.width / 2 - room - largest / 2) / across
            : Number.POSITIVE_INFINITY,
        )
      : outer - largest / 2;
    // Never into the indicator, never off the stage. Without the indicator
    // the middle is empty and the forms take all the room there is.
    const ring = Math.max(
      centreSize / 2 + largest / 2 + 8,
      indicator ? Math.min(ring0, ringMax) : ringMax,
    );
    return { base, big, largest, ring, ringMax };
  };
  let sized = fit(Math.min(side * caps.base, perSeat * 0.72));
  // A small group around a disc on a narrow stage: smaller forms rather than
  // forms in the halo's room. (A crowd keeps its old behaviour.)
  while (small && sized.ring > sized.ringMax + 0.5 && sized.base > 1)
    sized = fit(sized.base * 0.97);
  const { base, big, largest, ring } = sized;

  /*
   * Without the indicator the circle may become an oval.
   *
   * The indicator is a disc and the ring around it has to be round; with it
   * gone (`KREIS_CENTRE_MIN`), nothing holds the ring to the shorter side.
   * A phone's stage above its notes sheet is wide and low, and on a circle
   * its six forms and their names crowded into the middle third of it.
   */
  const stretch = (extent: number, reach: number): number =>
    indicator
      ? ring
      : Math.max(
          ring,
          Math.min(
            (extent / 2 - room - largest / 2) / reach,
            (ring * extent) / side,
          ),
        );
  const ringX = stretch(stage.width, small && across > 1e-6 ? across : 1);
  const ringY = stretch(stage.height, small ? reachY : 1);

  const place = (shiftY: number): KreisSpot[] =>
    angles.map((angle, i) => {
      const size = Math.round(emphasised.has(i) ? big : base);
      return {
        x: Math.round(cx + ringX * Math.cos(angle) - size / 2),
        y: Math.round(cy + shiftY + ringY * Math.sin(angle) - size / 2),
        size,
      };
    });
  if (!small) return { centre: centreAt(0), seats: place(0), indicator };
  // The small group's forms, sizes and all, centred on the stage as one.
  const unshifted = place(0);
  const top = Math.min(...unshifted.map((s) => s.y));
  const bottom = Math.max(...unshifted.map((s) => s.y + s.size));
  const shiftY = Math.round(cy - (top + bottom) / 2);
  return { centre: centreAt(shiftY), seats: place(shiftY), indicator };
}

/** Where a Kreis form hangs its name, and how wide the NAME may grow. */
export interface KreisName {
  side: "start" | "centre" | "end";
  /** The name's cap in px (`--oriso-name-max`); the capsule adds padding. */
  max: number;
}

/** The capsule around the name: its padding, its height, a gap between two. */
const CAPSULE_PAD = 24;
const CAPSULE_HEIGHT = 26;
const CAPSULE_GAP = 6;
/** About what a 12px capsule letter takes, to guess a name's width. */
const CHAR_PX = 7;
/**
 * The narrowest a name is cut to: the tail ("…303") and a letter or two
 * before it still tell two foxes apart (`splitName`).
 */
export const KREIS_NAME_MIN = 44;

/**
 * What the capsule shows beside the name (`MediaView`'s `nameTag`): the
 * raised hand with how long it has been up, and the microphone only while it
 * is off.
 */
export interface KreisStatus {
  hand: boolean;
  muted: boolean;
}

/**
 * The raised hand: 14px icon, 3px gap, the time at its widest common length
 * ("12:03", so the layout does not move every minute), 6px padding and the
 * 1px separator, then the capsule's 6px gap to the name.
 */
const HAND_PX = 14 + 3 + 5 * CHAR_PX + 6 + 1 + 6;
/** The muted microphone: the 15px icon and the capsule's 6px gap. */
const MUTED_PX = 15 + 6;

/** How much wider than its name a capsule is with this status in it. */
export function kreisStatusWidth(status: KreisStatus | undefined): number {
  return (status?.hand ? HAND_PX : 0) + (status?.muted ? MUTED_PX : 0);
}

/**
 * Where everybody's name goes in the Kreis, so no two capsules overlap.
 *
 * Every capsule sits on its form's top edge and is as wide as its name, up
 * to the cap (`cap`: 184px, a phone 112px). Up to about a dozen people that
 * fits centred (or hung inward at the stage's edge, `side`), and nothing
 * changes. With more, neighbours on the ring sit closer than two names are
 * wide: the #2233 Storybook check at 18 had "klare Biene 641" under "feiner
 * Dachs 255" and "ruhiger Fuchs 432" over two others. Then every name hangs
 * OUTWARD — from the form's left edge on the ring's right half, from its
 * right edge on the left half, centred only at the very top and bottom —
 * and any two that still meet are cut down until they do not, never below
 * `KREIS_NAME_MIN`. Cutting keeps the tail (`splitName`), so the number
 * that tells two foxes apart stays.
 *
 * Pure: `forms` are the seats as boxes on the stage, `names` the names they
 * carry as their capsules show them (only their length is used, as a guess
 * at the width), `status` what else each capsule carries — a raised hand, a
 * muted microphone (`kreisStatusWidth`). The status is never cut, so it
 * comes out of the name's share. One case does not fit: a raised hand on the
 * very top or bottom seat of a ring of 14 or more, whose neighbours leave
 * less room than a hand and the shortest name need; that name stays at the
 * minimum and its capsule touches theirs.
 */
export function kreisNames(
  forms: readonly { x: number; y: number; size: number }[],
  names: readonly string[],
  stageWidth: number,
  cap: number,
  side: (x: number, width: number) => KreisName["side"],
  status: readonly (KreisStatus | undefined)[] = [],
): KreisName[] {
  const extra = forms.map((_, i) => kreisStatusWidth(status[i]));
  const guess = (i: number): number =>
    Math.min(cap, [...(names[i] ?? "")].length * CHAR_PX) +
    CAPSULE_PAD +
    extra[i];
  const floor = (i: number): number => KREIS_NAME_MIN + CAPSULE_PAD + extra[i];
  const first = forms.map((f) => side(f.x, f.size));
  const widths = forms.map((_, i) => guess(i));
  if (!anyOverlap(forms, first, widths))
    return first.map((s) => ({ side: s, max: cap }));

  const centre =
    forms.reduce((sum, f) => sum + f.x + f.size / 2, 0) /
    Math.max(1, forms.length);
  const outward = forms.map((f): KreisName["side"] => {
    const mid = f.x + f.size / 2;
    if (Math.abs(mid - centre) < f.size / 2) return "centre";
    return mid > centre ? "start" : "end";
  });
  // Never past the stage's edge either.
  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    const room =
      outward[i] === "start"
        ? stageWidth - f.x
        : outward[i] === "end"
          ? f.x + f.size
          : 2 * Math.min(f.x + f.size / 2, stageWidth - f.x - f.size / 2);
    widths[i] = Math.max(floor(i), Math.min(widths[i], room));
  }
  // Shrink whatever still meets, a little at a time, until nothing does.
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let i = 0; i < forms.length; i++)
      for (let j = i + 1; j < forms.length; j++) {
        if (!sameRow(forms[i], forms[j])) continue;
        const a = span(forms[i], outward[i], widths[i]);
        const b = span(forms[j], outward[j], widths[j]);
        const overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l) + CAPSULE_GAP;
        if (overlap <= 0) continue;
        // Which edge faces the other, and how fast shrinking moves it.
        const [left, right] = a.l + a.r <= b.l + b.r ? [i, j] : [j, i];
        const rate = (k: number, facingRight: boolean): number =>
          widths[k] <= floor(k)
            ? 0
            : outward[k] === "centre"
              ? 0.5
              : (outward[k] === "start") === facingRight
                ? 1
                : 0;
        const rl = rate(left, true);
        const rr = rate(right, false);
        if (rl + rr === 0) continue;
        const cut = overlap / (rl + rr);
        if (rl > 0) widths[left] = Math.max(floor(left), widths[left] - cut);
        if (rr > 0) widths[right] = Math.max(floor(right), widths[right] - cut);
        moved = true;
      }
    if (!moved) break;
  }
  return outward.map((s, i) => ({
    side: s,
    max: Math.min(cap, Math.floor(widths[i] - CAPSULE_PAD - extra[i])),
  }));
}

function sameRow(a: { y: number }, b: { y: number }): boolean {
  return Math.abs(a.y - b.y) < CAPSULE_HEIGHT + CAPSULE_GAP;
}

function span(
  f: { x: number; size: number },
  side: KreisName["side"],
  width: number,
): { l: number; r: number } {
  if (side === "start") return { l: f.x, r: f.x + width };
  if (side === "end") return { l: f.x + f.size - width, r: f.x + f.size };
  const mid = f.x + f.size / 2;
  return { l: mid - width / 2, r: mid + width / 2 };
}

function anyOverlap(
  forms: readonly { x: number; y: number; size: number }[],
  sides: readonly KreisName["side"][],
  widths: readonly number[],
): boolean {
  for (let i = 0; i < forms.length; i++)
    for (let j = i + 1; j < forms.length; j++) {
      if (!sameRow(forms[i], forms[j])) continue;
      const a = span(forms[i], sides[i], widths[i]);
      const b = span(forms[j], sides[j], widths[j]);
      if (Math.min(a.r, b.r) - Math.max(a.l, b.l) + CAPSULE_GAP > 0)
        return true;
    }
  return false;
}
