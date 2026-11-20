/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Matryoshka-only embedding boundary", () => {
  it("publishes immutable multi-platform images with supply-chain evidence", () => {
    const imageAction = readSource(
      "../.github/actions/scanned-image/action.yml",
    );
    const defaultPlatforms = imageAction.match(
      /^ {2}platforms:\n(?: {4}[^\n]+\n)*? {4}default: ([^\n]+)$/m,
    )?.[1];
    expect(imageAction).toContain("platforms: ${{ inputs.platforms }}");
    expect(imageAction).toContain("IMAGE_PLATFORMS: ${{ inputs.platforms }}");
    expect(imageAction).toContain("outputs: type=oci,dest=");
    expect(imageAction).toContain("push: false");
    expect(imageAction).toContain("provenance: mode=max");
    expect(imageAction).toContain("sbom: true");
    expect(imageAction).toContain(
      "aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514",
    );
    const scan = imageAction.indexOf(
      "run: bash scripts/ci/scan-image-archive.sh",
    );
    const login = imageAction.indexOf("uses: docker/login-action");
    const publish = imageAction.indexOf(
      "run: bash scripts/ci/publish-image-archive.sh",
    );
    expect(scan).toBeGreaterThanOrEqual(0);
    expect(login).toBeGreaterThan(scan);
    expect(publish).toBeGreaterThan(login);
    expect(imageAction).toContain(
      "EXPECTED_ARCHIVE_SHA256: ${{ steps.scan.outputs.archive_sha256 }}",
    );
    expect(imageAction).toContain("value: ${{ steps.publish.outputs.digest }}");

    for (const workflow of [
      readSource("../.github/workflows/ci-main.yml"),
      readSource("../.github/workflows/build-and-publish-docker.yaml"),
    ]) {
      const publisherInputs = workflow.match(
        /^ {8}id: image\n {8}uses: \.\/\.github\/actions\/scanned-image\n {8}with:\n((?: {10}[^\n]+\n)+)/m,
      )?.[1];
      expect(publisherInputs).toContain("publish: true");
      const platforms = publisherInputs?.match(/^ +platforms: (.+)$/m)?.[1];
      expect(platforms ?? defaultPlatforms).toBe("linux/amd64,linux/arm64");
      expect(workflow).toContain("id-token: write");
      expect(workflow).toContain("attestations: write");
      expect(workflow).toContain(
        "actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6",
      );
      expect(workflow).toMatch(
        /gh attestation verify\s+"oci:\/\/[^"\n]+@\$\{\{ steps\.image\.outputs\.digest \}\}"/,
      );
      expect(workflow).toContain(
        "subject-digest: ${{ steps.image.outputs.digest }}",
      );
      expect(workflow).toContain(
        '--predicate-type "https://slsa.dev/provenance/v1"',
      );
    }
  });

  it("pins every container build and runtime base by digest", () => {
    for (const dockerfile of [
      readSource("../Dockerfile"),
      readSource("../Dockerfile.prod"),
    ]) {
      const fromLines = dockerfile
        .split("\n")
        .filter((line) => line.startsWith("FROM "));

      expect(fromLines.length).toBeGreaterThan(0);
      expect(fromLines.every((line) => /@sha256:[a-f0-9]{64}/.test(line))).toBe(
        true,
      );
    }
  });

  it("does not accept or persist Matrix credentials from the iframe URL", () => {
    const html = readSource("../index.html");
    const urlParams = readSource("./UrlParams.ts");
    const clientContext = readSource("./ClientContext.tsx");

    expect(`${html}\n${urlParams}\n${clientContext}`).not.toMatch(
      /AUTO-AUTHENTICATION|accessToken|matrix-auth-store.*URL/,
    );
  });

  it("does not retain the borrowed-session external-crypto workaround", () => {
    const matrix = readSource("./utils/matrix.ts");

    expect(matrix).not.toMatch(/hasEmbeddedSession|usingExternalCrypto/);
  });

  it("uses only standard Widget API lifecycle actions", () => {
    const groupCall = readSource("./room/GroupCallView.tsx");
    const inCall = readSource("./room/InCallView.tsx");

    expect(`${groupCall}\n${inCall}`).not.toMatch(
      /oriso-call-ended|oriso-call-action/,
    );
  });

  it("restores encrypted media selection for encrypted rooms", () => {
    const sharedKeys = readSource("./e2ee/sharedKeyManagement.ts");

    expect(sharedKeys).toContain("E2eeType.PER_PARTICIPANT");
    expect(sharedKeys).not.toMatch(
      /Always treat media as unencrypted|forcing E2eeType\.NONE/,
    );
  });

  it("does not retain Jitsi configuration in the local integration harness", () => {
    const sameSiteConfig = readSource("../backend/ew.test.config.json");
    const otherSiteConfig = readSource(
      "../backend/ew.test.othersite.config.json",
    );

    expect(`${sameSiteConfig}\n${otherSiteConfig}`).not.toMatch(/jitsi/i);
  });
});
