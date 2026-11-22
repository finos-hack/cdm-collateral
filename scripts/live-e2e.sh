#!/usr/bin/env bash
# scripts/live-e2e.sh — bring the live end-to-end stack up locally and leave it running, so an engineer can drive
# the collateral flow (issue -> agree -> propose -> accept -> pledge/transfer, i.e. post and pay) by hand through the
# console UI, or run the flows automatically with `check` (the Playwright live specs, console/e2e/live.spec.ts,
# task-live-flow-checkout-script). CI runs only up and status (task-ci-live-e2e-stack, wp-adr-live-stack-local-ui-driven).
#
# Subcommands:
#   up      (default) Stop any stack from a previous run (stop-and-replace), then start the Besu network, deploy the
#           contracts if they are not deployed yet, start store + five gateways (bank-a, bank-b, the triparty
#           agent BANK-T on bank-c, the CCP BANK-C on ccp and the market operator mkt) + the oracle service + four
#           collateral services (A, B, the agent T and the CCP C) + the console dev server, wait until all
#           health checks pass, print the URLs and leave everything running.
#   down    Stop the store/gateways/services/console and stop the Besu containers. The Besu chain on disk is kept.
#   reset   down, then delete the chain, the deployment and the off-chain state (runbook section 8). The next up
#           re-creates the Besu network and redeploys.
#   status  Print the health checks and the console port without changing anything.
#   build   The one-time build of docs/setup/runbook-e2e.md section 3: npm ci in contracts, gateway, store and console, the
#           cdm-ext install into ~/.m2, then the collateral service and oracle service jars. Uses mvn when on PATH, else cdm-ext/mvnw. The
#           dev container runs it once on creation (postCreateCommand).
#   check   Run every live flow (console/e2e/live.spec.ts) against the running stack: fails at once if the stack is
#           not up, installs Playwright's Chromium if absent (skipped when CHROMIUM_PATH is set), then runs the specs
#           against the console on 5173 (override with E2E_BASE_URL). Extra arguments go to Playwright, e.g.
#           `check --grep flow-return`. The exit code is Playwright's.
#
# Environment: bash (Linux, macOS, Codespaces, WSL, Git Bash on Windows). Requires Docker with Compose, Node 22+ and a
# JDK on PATH. The one-time build (service jar, each package's node_modules) is a precondition of up — run build, or
# see docs/setup/runbook-e2e.md sections 2 and 3. This script deploys the contracts only when
# contracts/deployments/besu.json is absent; it never redeploys over an existing deployment (a redeploy would orphan
# the stored documents that reference the current contract addresses).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

compose=(docker compose -f besu/docker-compose.yml)
registry="contracts/deployments/besu.json"
jar="services/collateral/target/collateral-service.jar"
oracle_jar="services/oracle/target/oracle-service.jar"
stack_log="$root/stack.log"
pidfile="$root/.live-e2e.pid"
# Health endpoints in start order. The console (5173) is checked separately because its root path has no JSON body.
health=(
  "8300|/store/v1/health"
  "8200|/ledger/v1/health"
  "8201|/ledger/v1/health"
  "8202|/ledger/v1/health"
  "8203|/ledger/v1/health"
  "8204|/ledger/v1/health"
  "8001|/api/v1/health"
  "8002|/api/v1/health"
  "8003|/api/v1/health"
  "8004|/api/v1/health"
  "8100|/oracle/v1/health"
)
backend_ports=(8300 8200 8201 8202 8203 8204 8100 8001 8002 8003 8004)
all_ports=(8300 8200 8201 8202 8203 8204 8100 8001 8002 8003 8004 5173 4173)

say() { printf '%s\n' "$*"; }
die() { printf 'live-e2e: %s\n' "$*" >&2; exit 1; }

# Kill whatever process is listening on a TCP port. Portable across lsof (Linux/macOS), fuser (Linux) and
# netstat+taskkill (Windows/Git Bash), because the stack children (node, java) are spawned through a shell and a plain
# kill of the orchestrate parent does not always reap them on Windows.
kill_port() {
  local p="$1" pid
  if command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -ti "tcp:$p" -s "tcp:listen" 2>/dev/null || true); do kill "$pid" 2>/dev/null || true; done
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "$p/tcp" 2>/dev/null || true
  elif command -v netstat >/dev/null 2>&1 && command -v taskkill >/dev/null 2>&1; then
    for pid in $(netstat -ano 2>/dev/null | grep -E "LISTENING" | grep -E "[:.]$p[[:space:]]" | awk '{print $NF}' | sort -u); do
      taskkill //PID "$pid" //F >/dev/null 2>&1 || true
    done
  fi
}

stop_stack() {
  # Stop the orchestrate.mjs parent first (its SIGTERM handler kills its children), then clear any port still held by
  # an orphaned child. This is the stop-and-replace step: up calls it before starting a fresh stack.
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
  fi
  local p
  for p in "${all_ports[@]}"; do kill_port "$p"; done
}

rpc() { curl -s -m 5 "http://localhost:$1" -H 'content-type: application/json' --data "$2"; }

start_besu() {
  if [ -f besu/.env ] && [ -f besu/networkFiles/genesis.json ]; then
    # Leftover bridges and iptables rules from earlier besu_besu networks block validator peering (besu/clean-stale-network.sh).
    bash besu/clean-stale-network.sh
    # The CCP's node writes its key into besu/ccp/data on its first start; Docker would create a missing bind-mount
    # directory as root, which the Besu user cannot write (wp-adr-ccp-membership).
    mkdir -p besu/ccp/data
    "${compose[@]}" up -d
  else
    # First time on this clone (no generated genesis/keys): start-network.sh generates them, then brings the nodes up.
    say "besu network files missing — generating via besu/start-network.sh"
    bash besu/start-network.sh
  fi
  # Wait until the block height advances (QBFT produces a block every 2 s once at least three validators peer). A
  # non-zero height alone is not enough: a restarted node reports its stored height even while consensus is stalled.
  local i n first=""
  for i in $(seq 1 60); do
    # A node that has just started refuses or drops the connection (curl exit 7 / 52); under set -e that must not end
    # the script, so the poll tolerates a failed request and retries.
    n="$( { rpc 8545 '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' || true; } | sed -n 's/.*"result":"\(0x[0-9a-fA-F]*\)".*/\1/p')"
    if [ -n "$n" ]; then
      [ -z "$first" ] && first="$n"
      if [ "$n" != "$first" ]; then say "besu producing blocks (height $first -> $n)"; wait_ccp_node; return 0; fi
    fi
    sleep 2
  done
  die "besu block height did not advance within 120 s (height ${first:-unknown}) — check: bash besu/check-network.sh"
}

# The CCP's non-validator node ccp: its key exists and it has synced past block 0 (wp-adr-ccp-membership).
wait_ccp_node() {
  local i n
  for i in $(seq 1 60); do
    n="$( { rpc 8553 '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' || true; } | sed -n 's/.*"result":"\(0x[0-9a-fA-F]*\)".*/\1/p')"
    if [ -f besu/ccp/data/key ] && [ -n "$n" ] && [ "$n" != "0x0" ]; then say "ccp node synced (height $n)"; return 0; fi
    sleep 2
  done
  die "the ccp node did not sync within 120 s — check: docker logs besu-ccp"
}

deploy_if_needed() {
  if [ -f "$registry" ] && ! grep -q '"ccpClearing"' "$registry"; then
    die "the deployment in $registry predates CcpClearing and the CCP's node (task-ccp-membership) — run: scripts/live-e2e.sh reset"
  fi
  if [ -f "$registry" ]; then
    say "contracts already deployed ($registry) — keeping the existing deployment"
  else
    say "deploying contracts (npm run deploy:besu)"
    ( cd contracts && npm run deploy:besu )
  fi
}

# The deployment marks tokens whose provenance the secured party requires (registry provenanceRequired, tUST and tMMF);
# with nothing anchored yet, seed their fixture provenance once through party A's service (task-document-provenance).
seed_provenance() {
  grep -q '"provenanceRequired": *true' "$registry" 2>/dev/null || return 0
  local anchors
  anchors=$(curl -s --max-time 30 http://localhost:8001/api/v1/provenance | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).anchors??"")}catch{console.log("")}})')
  if [ "$anchors" = "0" ]; then
    say "seeding the fixture provenance of tUST and tMMF (POST /api/v1/provenance/seed)"
    curl -s --max-time 600 -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:8001/api/v1/provenance/seed > /dev/null \
      || say "provenance seed failed; seed it from the Provenance card in the console"
  fi
}

wait_healthy() {
  local i entry port path ok all
  for i in $(seq 1 60); do
    all=1
    for entry in "${health[@]}"; do
      port="${entry%%|*}"; path="${entry#*|}"
      ok="$(curl -s -m 3 "localhost:$port$path" 2>/dev/null || true)"
      case "$ok" in *'"ok":true'*) ;; *) all=0 ;; esac
    done
    if [ "$all" -eq 1 ]; then return 0; fi
    sleep 3
  done
  return 1
}

print_status() {
  local entry port path
  for entry in "${health[@]}"; do
    port="${entry%%|*}"; path="${entry#*|}"
    printf '  %-5s %s\n' "$port" "$(curl -s -m 3 "localhost:$port$path" 2>/dev/null || echo 'no response')"
  done
  printf '  %-5s %s\n' "5173" "$(curl -s -m 3 -o /dev/null -w 'HTTP %{http_code}' localhost:5173/ 2>/dev/null || echo 'no response')"
}

cmd_up() {
  [ -f "$jar" ] || die "missing $jar — build it once: see docs/setup/runbook-e2e.md section 3"
  [ -f "$oracle_jar" ] || die "missing $oracle_jar — build it once: bash scripts/live-e2e.sh build"
  say "stop-and-replace: stopping any stack from a previous run"
  stop_stack
  say "starting besu network"
  start_besu
  deploy_if_needed
  say "starting store, gateways, services and console (orchestrate.mjs)"
  # Detached so this script can health-check and return, leaving the stack running. orchestrate.mjs (no --ci) also
  # starts the console dev server on 5173, which is what the engineer opens to drive the flow. setsid (Linux) puts it
  # in its own session so it survives the end of the calling shell, e.g. the dev container's postStartCommand; Git
  # Bash on Windows has no setsid and uses nohup alone.
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup node orchestrate.mjs > "$stack_log" 2>&1 < /dev/null &
  else
    nohup node orchestrate.mjs > "$stack_log" 2>&1 &
  fi
  echo $! > "$pidfile"
  if wait_healthy; then
    seed_provenance
    say ""
    say "live stack is up and running:"
    print_status
    say ""
    say "  drive the flow in the console:"
    say "    secured party (BANK-B)  http://localhost:5173/#/live/B"
    say "    pledgor      (BANK-A)  http://localhost:5173/#/live/A"
    say "    triparty agent (BANK-T) http://localhost:5173/#/live/T"
    say "    CCP          (BANK-C)  http://localhost:5173/#/live/C"
    say ""
    say "  logs:  $stack_log"
    say "  stop:  scripts/live-e2e.sh down"
  else
    say "stack did not become healthy within 180 s — last state:"
    print_status
    say "see $stack_log"
    exit 1
  fi
}

cmd_down() {
  say "stopping store, gateways, services and console"
  stop_stack
  say "stopping besu containers (chain kept on disk)"
  "${compose[@]}" stop
  say "stopped."
}

cmd_reset() {
  cmd_down
  say "removing chain, deployment and off-chain state (full reset)"
  "${compose[@]}" down -v 2>/dev/null || true
  rm -rf besu/networkFiles besu/.env besu/mkt besu/bank-a besu/bank-b besu/bank-c besu/ccp
  rm -rf contracts/deployments store/data data
  say "reset done — the next 'up' re-creates the besu network and redeploys the contracts."
}

cmd_build() {
  local pkg mvn
  for pkg in contracts gateway store console; do
    say "npm ci in $pkg/"
    npm --prefix "$pkg" ci --no-audit --no-fund
  done
  if command -v mvn >/dev/null 2>&1; then mvn=(mvn); else mvn=(bash cdm-ext/mvnw); fi
  say "installing cdm-ext into the local Maven repository (${mvn[*]})"
  "${mvn[@]}" -B -q -f cdm-ext/pom.xml -DskipTests install
  say "building the collateral service jar"
  "${mvn[@]}" -B -q -f services/collateral/pom.xml -DskipTests package
  [ -f "$jar" ] || die "build finished but $jar is missing"
  say "building the oracle service jar"
  "${mvn[@]}" -B -q -f services/oracle/pom.xml -DskipTests package
  [ -f "$oracle_jar" ] || die "build finished but $oracle_jar is missing"
  say "build done — start the stack with: bash scripts/live-e2e.sh up"
}

cmd_check() {
  # Precondition: the stack is already up (one pass, no waiting). A down stack is a usage error, not a test failure.
  local entry port path ok down=0
  for entry in "${health[@]}"; do
    port="${entry%%|*}"; path="${entry#*|}"
    ok="$(curl -s -m 3 "localhost:$port$path" 2>/dev/null || true)"
    case "$ok" in *'"ok":true'*) ;; *) down=1 ;; esac
  done
  [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' localhost:5173/ 2>/dev/null || true)" = "200" ] || down=1
  if [ "$down" -eq 1 ]; then
    print_status >&2
    die "stack not up — run: bash scripts/live-e2e.sh up"
  fi
  # CHROMIUM_PATH names a preinstalled browser (console/playwright.config.ts), so the download is skipped. Otherwise the
  # install is a no-op when Playwright's Chromium is already present; the dev container image ships none.
  if [ -n "${CHROMIUM_PATH:-}" ]; then
    say "using the preinstalled Chromium at $CHROMIUM_PATH (CHROMIUM_PATH); skipping the Playwright download"
  else
    say "ensuring the Playwright Chromium browser is installed"
    ( cd console && npx playwright install chromium )
  fi
  say "restoring the test parties' free balances (contracts/scripts/top-up-test-balances.mjs)"
  ( cd contracts && node scripts/top-up-test-balances.mjs ) || die "could not top up the test balances"
  say "running the live flows (console/e2e/live.spec.ts) against ${E2E_BASE_URL:-http://localhost:5173}"
  cd console
  E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:5173}" E2E_REQUIRE_STACK=1 \
    npx playwright test e2e/live.spec.ts --reporter=list "$@"
}

case "${1:-up}" in
  up) cmd_up ;;
  build) cmd_build ;;
  check) shift; cmd_check "$@" ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  status) print_status ;;
  *) die "unknown subcommand '${1}' — use: up | down | reset | status | build | check" ;;
esac
