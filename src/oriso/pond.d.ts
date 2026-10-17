/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * `pond.js` is a verbatim port from the design handoff and has no exports: it
 * registers the <oriso-pond> custom element as a side effect and that is all.
 * TypeScript therefore refuses `import('./pond.js')` with "is not a module".
 *
 * This declaration sits next to the file so the dynamic import in
 * `Atmosphere.tsx` type-checks, without editing the port to add an export it
 * does not have. It deliberately declares nothing: there is nothing to use.
 */
export {};
