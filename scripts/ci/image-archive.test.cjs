/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const scripts = resolve(__dirname);
const platforms = ["amd64", "arm64"];
const index = JSON.stringify({
  schemaVersion: 2,
  mediaType: "application/vnd.oci.image.index.v1+json",
  manifests: platforms.map((architecture, position) => ({
    digest: "sha256:" + String(position + 1).repeat(64),
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture },
  })),
});
const digest = "sha256:" + createHash("sha256").update(index).digest("hex");

const fakeSkopeo = `#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const index = process.env.FAKE_INDEX;
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(['skopeo', ...args]) + '\\n');
if (args.includes('inspect')) {
	process.stdout.write(index);
} else if (args.includes('manifest-digest')) {
	const bytes = fs.readFileSync(args.at(-1));
	process.stdout.write('sha256:' + crypto.createHash('sha256').update(bytes).digest('hex') + '\\n');
} else if (args.includes('copy')) {
	const indexDigest = 'sha256:' + crypto.createHash('sha256').update(index).digest('hex');
	const architecture = args.includes('--override-arch') ? args[args.indexOf('--override-arch') + 1] : null;
	const manifests = JSON.parse(index).manifests;
	const selectedArch = architecture === process.env.FAKE_WRONG_ARCH ? 'amd64' : architecture;
	const descriptor = manifests.find(image => image.platform.architecture === selectedArch);
	fs.writeFileSync(args[args.indexOf('--digestfile') + 1], (descriptor?.digest ?? indexDigest) + '\\n');
} else {
	process.exit(2);
}
`;

const fakeTrivy = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(['trivy', ...args]) + '\\n');
process.exit(args.includes(process.env.FAKE_FAIL_PLATFORM) ? 1 : 0);
`;

function imageFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "livekit-archive-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const archive = join(directory, "image.tar");
  const receipt = join(directory, "output");
  const calls = join(directory, "calls");
  writeFileSync(archive, "original archive");
  writeFileSync(join(directory, "skopeo"), fakeSkopeo, { mode: 0o700 });
  writeFileSync(join(directory, "trivy"), fakeTrivy, { mode: 0o700 });

  const env = {
    ...process.env,
    PATH: [directory, dirname(process.execPath), process.env.PATH].join(":"),
    FAKE_INDEX: index,
    FAKE_CALLS: calls,
    FAKE_FAIL_PLATFORM: "",
    FAKE_WRONG_ARCH: "",
    IMAGE_TAGS: "example.invalid/fixture:verified",
    GITHUB_OUTPUT: receipt,
  };
  function run(script, args, overrides) {
    return spawnSync("bash", [join(scripts, script), ...args], {
      env: { ...env, ...overrides },
      encoding: "utf8",
    });
  }
  return {
    archive,
    calls: () => readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse),
    receipt: () => (existsSync(receipt) ? readFileSync(receipt, "utf8") : ""),
    scan: (overrides) =>
      run(
        "scan-image-archive.sh",
        [archive, "linux/amd64,linux/arm64", digest],
        overrides,
      ),
    publish: (checksum) =>
      run("publish-image-archive.sh", [archive, digest, checksum]),
  };
}

test("scans both platform manifests before copying the verified index", (t) => {
  const image = imageFixture(t);
  const scan = image.scan();
  assert.equal(scan.status, 0, scan.stderr);

  const checkedPlatforms = image
    .calls()
    .filter(([tool]) => tool === "trivy")
    .map((args) => {
      return args[args.indexOf("--platform") + 1];
    });
  assert.deepEqual(checkedPlatforms, ["linux/amd64", "linux/arm64"]);

  const [, checksum] = image.receipt().match(/^archive_sha256=(.+)$/m);
  const publish = image.publish(checksum);
  assert.equal(publish.status, 0, publish.stderr);
  assert.match(image.receipt(), new RegExp("^digest=" + digest + "$", "m"));

  const registryCopies = image
    .calls()
    .filter((args) => args.some((arg) => arg.startsWith("docker://")));
  assert.equal(registryCopies.length, 1);
  assert.ok(registryCopies[0].includes("--all"));
  assert.ok(registryCopies[0].includes("--preserve-digests"));
});

test("an unsuccessful arm64 scan produces no publish receipt", (t) => {
  const image = imageFixture(t);
  const scan = image.scan({ FAKE_FAIL_PLATFORM: "linux/arm64" });
  assert.notEqual(scan.status, 0);
  assert.equal(image.receipt(), "");
  assert.equal(image.calls().filter(([tool]) => tool === "trivy").length, 2);
});

test("a selected manifest must match the requested architecture", (t) => {
  const image = imageFixture(t);
  const scan = image.scan({ FAKE_WRONG_ARCH: "arm64" });

  assert.notEqual(scan.status, 0);
  assert.match(scan.stderr, /selected linux\/arm64 manifest differs/);
  assert.equal(image.receipt(), "");
  const inspected = image.calls().filter(([tool]) => tool === "trivy");
  assert.equal(inspected.length, 1);
  assert.ok(inspected[0].includes("linux/amd64"));
});

test("an archive changed after scanning cannot reach the registry copy", (t) => {
  const image = imageFixture(t);
  const scan = image.scan();
  assert.equal(scan.status, 0, scan.stderr);

  const [, checksum] = image.receipt().match(/^archive_sha256=(.+)$/m);
  writeFileSync(image.archive, "changed archive");
  const publish = image.publish(checksum);

  assert.notEqual(publish.status, 0);
  assert.doesNotMatch(image.receipt(), /^digest=/m);
  assert.ok(
    !image
      .calls()
      .flat()
      .some((arg) => arg.startsWith("docker://")),
  );
});

test("every publisher uses the archive gate and PRs scan both Dockerfiles without publishing", () => {
  const root = resolve(__dirname, "../..");
  const workflows = join(root, ".github/workflows");
  for (const path of [
    "ci-main.yml",
    "build-and-publish-docker.yaml",
    "release-image.yml",
  ]) {
    const workflow = readFileSync(join(workflows, path), "utf8");
    assert.match(
      workflow,
      /uses: \.\/\.github\/actions\/scanned-image\n\s+with:\n\s+publish: true/,
      path,
    );
    assert.doesNotMatch(
      workflow,
      /docker\/build-push-action|aquasecurity\/trivy-action/,
      path,
    );
  }
  const pull = readFileSync(join(workflows, "ci-pull-request.yml"), "utf8");
  assert.equal(
    [...pull.matchAll(/uses: \.\/\.github\/actions\/scanned-image/g)].length,
    2,
  );
  assert.match(pull, /dockerfile: Dockerfile\.prod/);
  assert.doesNotMatch(pull, /publish: true|secrets\.GITHUB_TOKEN/);

  const gate = readFileSync(
    join(root, ".github/actions/scanned-image/action.yml"),
    "utf8",
  );
  assert.match(
    gate,
    /platforms:\n(?:[^\n]+\n)*?    default: linux\/amd64,linux\/arm64/,
  );
  assert.match(gate, /platforms: \$\{\{ inputs\.platforms \}\}/);
  assert.match(gate, /IMAGE_PLATFORMS: \$\{\{ inputs\.platforms \}\}/);
  assert.match(
    gate,
    /scan-image-archive.sh "\$IMAGE_ARCHIVE" "\$IMAGE_PLATFORMS"/,
  );
  assert.match(gate, /push: false/);
  assert.match(gate, /outputs: type=oci,dest=/);
  assert.match(gate, /provenance: mode=max/);
  assert.match(gate, /sbom: true/);
  const scan = gate.indexOf("run: bash scripts/ci/scan-image-archive.sh");
  const login = gate.indexOf("uses: docker/login-action");
  const publish = gate.indexOf("run: bash scripts/ci/publish-image-archive.sh");
  assert.ok(scan >= 0 && scan < login && login < publish);
  assert.match(
    gate,
    /EXPECTED_ARCHIVE_SHA256: \$\{\{ steps\.scan\.outputs\.archive_sha256 \}\}/,
  );
});

test("the versioned release and its pull-request check both keep the amd64 platform", () => {
  const workflows = resolve(__dirname, "../../.github/workflows");
  const releasePlatform =
    /^([ ]+)dockerfile: Dockerfile\.prod\n\1platforms: linux\/amd64$/m;
  for (const path of ["release-image.yml", "ci-pull-request.yml"]) {
    const workflow = readFileSync(join(workflows, path), "utf8");
    assert.match(workflow, releasePlatform, path);
    assert.equal([...workflow.matchAll(/^ +platforms:/gm)].length, 1, path);
  }
  for (const path of ["ci-main.yml", "build-and-publish-docker.yaml"]) {
    assert.doesNotMatch(
      readFileSync(join(workflows, path), "utf8"),
      /^ +platforms:/m,
      path,
    );
  }
});

test("the trusted versioned release verifies the published digest before creating release records", () => {
  const workflows = resolve(__dirname, "../../.github/workflows");
  const release = readFileSync(join(workflows, "release-image.yml"), "utf8");
  const branch = readFileSync(join(workflows, "ci-main.yml"), "utf8");
  const steps = release.split(/^      - name: /m).slice(1);
  const index = (name) =>
    steps.findIndex((step) => step.startsWith(name + "\n"));
  const publish = index("Build, scan and publish the release image");
  const sign = index("Sign and publish the image provenance attestation");
  const verify = index("Verify the SLSA provenance predicate");
  const tag = index("Create and push release tag");
  const create = index("Create GitHub Release");
  assert.ok(
    publish >= 0 &&
      publish < sign &&
      sign < verify &&
      verify < tag &&
      tag < create,
  );
  assert.match(steps[publish], /^        id: image$/m);
  const pinnedAttest = /actions\/attest@[a-f0-9]{40}/;
  assert.match(steps[sign], pinnedAttest);
  assert.equal(
    steps[sign].match(pinnedAttest)?.[0],
    branch.match(pinnedAttest)?.[0],
  );
  assert.match(
    steps[sign],
    /subject-digest: \$\{\{ steps\.image\.outputs\.digest \}\}/,
  );
  assert.match(steps[sign], /push-to-registry: true/);
  assert.match(
    steps[verify],
    /gh attestation verify[\s\S]+@\$\{\{ steps\.image\.outputs\.digest \}\}/,
  );
  assert.match(
    steps[verify],
    /--predicate-type "https:\/\/slsa\.dev\/provenance\/v1"/,
  );
  assert.doesNotMatch(
    steps.slice(sign, create + 1).join(""),
    /^        (?:if|continue-on-error):/m,
  );
  assert.doesNotMatch(release, /^permissions:/m);
  assert.match(
    release,
    /^    permissions:\n      contents: write\n      id-token: write\n      attestations: write\n      artifact-metadata: write\n      packages: write$/m,
  );
});
