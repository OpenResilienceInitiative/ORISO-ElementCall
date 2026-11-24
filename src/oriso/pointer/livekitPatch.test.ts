/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The laser pointer depends on `.yarn/patches/livekit-client-*.patch`.
 *
 * Upstream livekit-client (2.16.1, and still 2.24.0) seals a data packet but
 * leaves its `encryptionType` at NONE, and the receiver reports that field
 * as it is — so every sealed pointer looked unsealed and `PointerChannel`
 * dropped it. The patch marks sealed packets GCM when sending and, when
 * receiving, reports GCM for every packet that was actually decrypted.
 *
 * This pins the patch in the code the app really loads, so an upgrade that
 * loses it fails here instead of silently hiding every pointer.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from the repository root: vitest runs there.
const esm = readFileSync(
  "node_modules/livekit-client/dist/livekit-client.esm.mjs",
  "utf8",
);
const umd = readFileSync(
  "node_modules/livekit-client/dist/livekit-client.umd.js",
  "utf8",
);

describe("livekit-client patch for sealed data packets", () => {
  it("marks a sealed packet GCM when sending", () => {
    expect(esm).toMatch(
      /new EncryptedPacket\(\{[^}]*keyIndex: encryptedData\.keyIndex,[^}]*encryptionType: Encryption_Type\.GCM/,
    );
    expect(umd).toContain("keyIndex:n.keyIndex,encryptionType:1})");
  });

  it("reports GCM for a packet it decrypted, not the sender's field", () => {
    expect(esm).toContain(
      "this.emit(EngineEvent.DataPacketReceived, newDp, Encryption_Type.GCM);",
    );
    expect(esm).not.toContain("newDp, dp.value.value.encryptionType");
    expect(umd).toContain("this.emit(e.EngineEvent.DataPacketReceived,i,1)");
  });
});
