/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { E2eeType } from "./e2eeType";

/**
 * Matryoshka deliberately keeps crypto out of the iframe client. A widget host
 * is therefore a valid external crypto owner; a standalone client still has to
 * expose its own crypto stack or fail closed.
 */
export const isPerParticipantE2EEUnavailable = (
  type: E2eeType,
  hasClientCrypto: boolean,
  hasWidgetHost: boolean,
): boolean =>
  type === E2eeType.PER_PARTICIPANT && !hasClientCrypto && !hasWidgetHost;
