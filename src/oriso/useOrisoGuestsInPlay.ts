/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";

// Leaving to the lobby unmounts the call view: keep what this call learnt.
const callsWithGuests = new Set<string>();

/** Tests only: no call has had guests yet. */
export const forgetGuestsInPlay = (): void => {
  callsWithGuests.clear();
};

/**
 * Whether guests are part of this call, so the counsellor needs the guest
 * button: its link, "Anklopfen" and who is waiting (call UX round #170).
 *
 * A counsellor with a logged-in advice seeker has no use for guest settings
 * (Frank, live test 18 Nov). They matter from the moment the counsellor asks
 * for the call's link, or somebody knocks on it — and then for the rest of
 * the call, since whoever was let in is now in it.
 */
export const useOrisoGuestsInPlay = (
  callKey: string,
  waiting: number,
): { inPlay: boolean; markInviting: () => void } => {
  const [inPlay, setInPlay] = useState(() => callsWithGuests.has(callKey));

  const markInviting = useCallback((): void => {
    callsWithGuests.add(callKey);
    setInPlay(true);
  }, [callKey]);

  useEffect(() => {
    setInPlay(callsWithGuests.has(callKey));
  }, [callKey]);

  useEffect(() => {
    if (waiting > 0) markInviting();
  }, [waiting, markInviting]);

  return { inPlay, markInviting };
};
