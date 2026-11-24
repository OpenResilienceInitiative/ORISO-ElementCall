#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")/../.."
revision=$(git rev-parse HEAD)
export ORISO_MEDIA_RUN=$(mktemp -d "${RUNNER_TEMP:-/tmp}/element-call-media.XXXXXX")
project="oriso-media-$(printf '%s' "${ORISO_MEDIA_RUN##*.}" | tr '[:upper:]' '[:lower:]')"
mkdir "$ORISO_MEDIA_RUN/primary" "$ORISO_MEDIA_RUN/secondary"
printf 'Testing Element Call %s\nLocal diagnostics: %s\n' "$revision" "$ORISO_MEDIA_RUN"

phase="prepare isolated fixture"
stack=(docker compose -p "$project" -f dev-backend-docker-compose.yml
  -f playwright-backend-docker-compose.override.yml -f backend/ci-two-party.override.yml)
started=false

finish() {
  local status=$?
  if [[ "$started" == true ]] && ! "${stack[@]}" down --timeout 15 > "$ORISO_MEDIA_RUN/cleanup.log" 2>&1; then
    printf 'Could not stop test Compose project %s\n' "$project" >&2
    [[ "$status" != 0 ]] || status=1
  fi
  if [[ "$status" != 0 ]]; then
    printf 'Two-browser media failed at %s for %s\n' "$phase" "$revision" >&2
  fi
  exit "$status"
}
trap finish EXIT

node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const { ORISO_MEDIA_RUN: work } = process.env;
const proxy = readFileSync('backend/dev_nginx.conf', 'utf8');
const hostGateway = '    server host.docker.internal:6080;\n';
assert.equal(proxy.split(hostGateway).length, 2);
assert.ok(proxy.includes('    server auth-server:6080;'));
writeFileSync(`${work}/nginx.conf`, proxy.replace(hostGateway, ''));
const homeserver = readFileSync('backend/playwright_homeserver.yaml', 'utf8');
assert.ok(!/^default_room_version\s*:/m.test(homeserver));
writeFileSync(`${work}/homeserver.yaml`, `${homeserver.trimEnd()}\ndefault_room_version: "12"\n`);
JS
"${stack[@]}" config --format json | node --input-type=module -e '
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";
  for (const service of Object.values(JSON.parse(readFileSync(0, "utf8")).services)) {
    assert.notEqual(service.network_mode, "host");
    for (const port of service.ports ?? []) assert.equal(port.host_ip, "127.0.0.1");
  }
'

if [[ "${CI:-}" == true ]]; then
  phase="pull pinned fixture images"
  "${stack[@]}" pull
fi
phase="wait for the local Matrix, gateway and media stack"
started=true
"${stack[@]}" up -d --pull never --wait --wait-timeout 60

phase="check readiness through the loopback Matrix proxy"
curl --fail --silent --show-error --max-time 10 --cacert backend/dev_tls_local-ca.crt \
  --resolve synapse.m.localhost:443:127.0.0.1 https://synapse.m.localhost/_matrix/client/versions \
  -o "$ORISO_MEDIA_RUN/matrix-versions.json"

phase="run the two-browser call and rejoin in Chromium"
unset USE_DOCKER
corepack yarn playwright test playwright/two-party-media.spec.ts \
  --project=chromium --workers=1 --retries=0 --trace=off --reporter=line
