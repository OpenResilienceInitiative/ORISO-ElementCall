/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type KnipConfig } from "knip";

export default {
  vite: {
    config: ["vite.config.ts", "vite-embedded.config.ts"],
  },
  entry: [
    "src/main.tsx",
    "i18next-parser.config.ts",
    // The visual-proof harness and the two scripts that drive it. They are
    // reached by a developer running them, not by the bundle, so Knip is
    // right that nothing imports them and wrong that they are unused.
    "harness/orisoStage.tsx",
    "harness/videoSpike.ts",
    "harness/vite.harness.config.ts",
    "scripts/shootOrisoStage.mjs",
    "scripts/measureVideoInShape.mjs",
  ],
  ignoreBinaries: [
    // This is deprecated, so Knip doesn't actually recognize it as a globally
    // installed binary. TODO We should switch to Compose v2:
    // https://docs.docker.com/compose/migrate/
    "docker-compose",
  ],
  ignoreDependencies: [
    // Used in CSS
    "normalize.css",
    // Used for its global type declarations
    "@types/grecaptcha",
    // Because we use matrix-js-sdk as a Git dependency rather than consuming
    // the proper release artifacts, and also import directly from src/, we're
    // forced to re-install some of the types that it depends on even though
    // these look unused to Knip
    "@types/content-type",
    "@types/sdp-transform",
    "@types/uuid",
  ],
  ignoreExportsUsedInFile: true,
} satisfies KnipConfig;
