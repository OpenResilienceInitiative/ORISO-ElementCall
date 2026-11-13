/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type UIEvent, useCallback, useState } from "react";

/**
 * Whether the call's scroll container has moved, so that part of the stage
 * now lies under the header.
 *
 * The phone's header is transparent over the stage (5b), which is right
 * while nothing is under it. The Kacheln and the Felder scroll, and then
 * the tiles passed straight under the title and the "verschlüsselt · …"
 * line: the header stayed where it was, but read as gone. With this the
 * header takes a surface of its own only while it needs one.
 */
export function useStageScrolled(): [
  boolean,
  (e: UIEvent<HTMLElement>) => void,
] {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (e: UIEvent<HTMLElement>) => setScrolled(e.currentTarget.scrollTop > 0),
    [],
  );
  return [scrolled, onScroll];
}
