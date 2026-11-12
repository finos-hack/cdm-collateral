#!/usr/bin/env bash
# Setup script for a Claude Code cloud environment (claude.ai/code) that works on this repository.
# Paste this file into the environment's "Setup script" field (docs/setup/claude-code-cloud.md).
#
# Claude Code runs the script as root on Ubuntu 24.04 before it launches, and caches the result, so the work here is
# what a later session can reuse from disk:
#   1. starts the Docker daemon and pulls the Besu image named in besu/docker-compose.yml;
#   2. runs the one-time build (scripts/live-e2e.sh build): each Node package's dependencies, the cdm-ext install into
#      ~/.m2 and the two service jars;
#   3. compiles the contracts once, which downloads solc 0.8.28 into Hardhat's compiler cache;
#   4. links the preinstalled Chromium to /usr/local/bin/cdm-chromium, a path that does not change with the browser
#      revision, for the environment variable CHROMIUM_PATH=/usr/local/bin/cdm-chromium.
#
# Processes do not outlive the setup script, so a session starts dockerd again before `live-e2e.sh up`:
#   bash docs/setup/claude-code-cloud-setup.sh --docker
#
# Each step reports and continues on failure, and the script exits 0, so one blocked download does not stop the
# session from starting. Read the "setup:" lines in the setup log for the steps that failed.
#
# Usage:
#   bash docs/setup/claude-code-cloud-setup.sh            all steps
#   bash docs/setup/claude-code-cloud-setup.sh --docker   start the Docker daemon only
# Repository location: CDM_COLLATERAL_DIR if set, else the clone that contains this script, else the first
# cdm-collateral clone found under $PWD, $HOME, /home and /workspace.
set -uo pipefail

say() { printf 'setup: %s\n' "$*"; }
warn() { printf 'setup: WARNING: %s\n' "$*" >&2; failed=$((failed + 1)); }
failed=0

start_docker() {
  if docker info >/dev/null 2>&1; then
    say "docker daemon already running"
    return 0
  fi
  if ! command -v dockerd >/dev/null 2>&1; then
    warn "dockerd not installed; the Besu network cannot start"
    return 1
  fi
  say "starting dockerd (log: /tmp/dockerd.log)"
  (setsid nohup dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && { say "docker daemon running"; return 0; }
    sleep 1
  done
  warn "dockerd did not answer within 30 s; see /tmp/dockerd.log"
  return 1
}

find_repo() {
  if [ -n "${CDM_COLLATERAL_DIR:-}" ] && [ -f "$CDM_COLLATERAL_DIR/scripts/live-e2e.sh" ]; then
    printf '%s\n' "$CDM_COLLATERAL_DIR"; return 0
  fi
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)"
  if [ -n "$here" ] && [ -f "$here/scripts/live-e2e.sh" ] && [ -f "$here/besu/start-network.sh" ]; then
    printf '%s\n' "$here"; return 0
  fi
  local base hit
  for base in "$PWD" "${HOME:-/root}" /home /workspace; do
    [ -d "$base" ] || continue
    hit="$(find "$base" -maxdepth 4 -type f -path '*/scripts/live-e2e.sh' 2>/dev/null | head -1)"
    if [ -n "$hit" ] && [ -f "$(dirname "$(dirname "$hit")")/besu/start-network.sh" ]; then
      dirname "$(dirname "$hit")"; return 0
    fi
  done
  return 1
}

link_chromium() {
  local chrome
  chrome="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1)"
  [ -n "$chrome" ] || chrome="$(command -v google-chrome chromium chromium-browser 2>/dev/null | head -1)"
  if [ -z "$chrome" ]; then
    warn "no preinstalled Chromium found; live-e2e.sh check will try 'npx playwright install chromium'"
    return 1
  fi
  ln -sf "$chrome" /usr/local/bin/cdm-chromium
  say "linked /usr/local/bin/cdm-chromium -> $chrome (set CHROMIUM_PATH=/usr/local/bin/cdm-chromium)"
}

if [ "${1:-}" = "--docker" ]; then
  start_docker
  exit $?
fi

start_docker
docker_ok=$?

repo="$(find_repo)" || repo=""
if [ -z "$repo" ]; then
  warn "cdm-collateral clone not found; set CDM_COLLATERAL_DIR. Skipping the image pull, build and solc download"
else
  say "repository: $repo"
  cd "$repo" || exit 0

  if [ "$docker_ok" -eq 0 ]; then
    image="$(sed -n 's/^[[:space:]]*image:[[:space:]]*\(hyperledger\/besu:[^[:space:]]*\).*/\1/p' besu/docker-compose.yml | head -1)"
    image="${image:-hyperledger/besu:26.9.0}"
    say "pulling $image"
    docker pull -q "$image" >/dev/null || warn "docker pull $image failed (allow Docker Hub in the environment's Network access)"
  fi

  say "one-time build: bash scripts/live-e2e.sh build"
  bash scripts/live-e2e.sh build || warn "live-e2e.sh build failed (Maven Central and the npm registry must be reachable)"

  if [ -d contracts/node_modules ]; then
    say "compiling the contracts once to cache solc"
    ( cd contracts && npx hardhat compile >/dev/null ) || warn "hardhat compile failed (allow binaries.soliditylang.org)"
  fi
fi

link_chromium

if [ "$failed" -eq 0 ]; then
  say "done"
else
  say "done with $failed warning(s)"
fi
exit 0
