/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The two people of a 1:1, counted as PEOPLE (#2233, D7).
 *
 * Two people are a 1:1 whatever the conversation type, and they stay one
 * while one of them shares a screen: a shared screen is a picture, not a
 * third person. Upstream's one-on-one test counts media tiles instead —
 * exactly two, one local and one remote — so the moment somebody shared,
 * the share made a third tile and both sides got the group's view rail,
 * the atmosphere and the Felder or the Fokus (live test, 16 Nov).
 *
 * Takes the people only (user media, never screen shares). Returns the pair
 * when there are exactly two of them, one of them me; otherwise null.
 */
export function oneOnOnePeople<T extends { local: boolean }>(
  people: readonly T[],
): { local: T; remote: T } | null {
  if (people.length !== 2) return null;
  const local = people.find((p) => p.local);
  const remote = people.find((p) => !p.local);
  return local === undefined || remote === undefined ? null : { local, remote };
}
