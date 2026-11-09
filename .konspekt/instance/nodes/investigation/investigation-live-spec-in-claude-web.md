```yaml
id: investigation-live-spec-in-claude-web
type: investigation
title: Run the live spec tests in a claude.ai web session
status: active
review: proposed
provenance:
  conversationId: claude-ai-web-live-spec
  sourceRef: e276f39
  timestamp: 2026-11-09T00:17:00Z
  confidence: 0.9
createdAt: 2026-11-09T00:17:00Z
updatedAt: 2026-11-09T00:43:03Z
```
# Investigation: run the live spec tests in a claude.ai web session

The project owner asked whether the local test suites (Besu, Java, Node) run in the shell of a claude.ai web session
(2026-11-08), then asked to bind the work to an investigation of running the live spec tests there.

Scope:
- The one-time build of `docs/runbook-e2e.md` section 3 (`bash scripts/live-e2e.sh build`).
- The unit suites: `contracts` (`hardhat test`), `console` (`vitest run`), `cdm-ext`, `services/collateral` and
  `services/oracle` (`mvn test`).
- The live stack (`bash scripts/live-e2e.sh up`) and the Playwright live specs (`bash scripts/live-e2e.sh check`).

Session environment (observed): 2 CPU cores, 7.8 GB RAM, Docker 29.9.2 with the daemon started by hand (`dockerd`),
JDK 21.0.12, Maven 3.9.11, Node 22.23.4. Outbound HTTPS goes through an allowlist proxy.

## Findings

1. Network allowlist. With the default allowlist (package managers and attached GitHub repositories) the Maven build,
   the Besu image pull and the Solidity compiler download are refused. The project owner added these entries under
   claude.ai Settings > Capabilities > Allowed websites, and each took effect in the running session:
   `repo1.maven.org`, `repo.maven.apache.org`, `registry-1.docker.io`, `auth.docker.io`,
   `production.cloudflare.docker.com`, `*.docker.com` (layer downloads use `production.cloudfront.docker.com`),
   `binaries.soliditylang.org` (Hardhat compiler list and solc 0.8.28; also needed by `deploy:besu`).
2. Build and unit results at commit `e276f39`: build exit 0 in 2m40s; console 104 tests passed; `cdm-ext` 242,
   `services/collateral` 65, `services/oracle` 13 tests, 0 failures; contracts 83 passing.
3. Besu first run. `besu operator generate-blockchain-config` (image `hyperledger/besu:26.9.0`) writes a complete
   `besu/networkFiles/` (genesis and four key pairs) and then exits 1 with
   `java.lang.IllegalArgumentException: Output directory already exists.`, reproduced from an empty directory.
   `besu/start-network.sh` stops at that step under `set -e`. The remaining first-run steps (key copy, `besu/.env`)
   were run by hand; the network then started: four nodes, peers `0x3`, four validators.
   Cause (observed): the image entrypoint `besu-entry.sh`, when the container runs as uid 0, first runs
   `besu --print-paths-and-exit $BESU_USER_NAME "$@"` and then the command itself. For
   `operator generate-blockchain-config` the first run writes the output, so the second run fails. The session shell
   is root, and `start-network.sh` passes `--user "$(id -u):$(id -g)"` (`0:0`). The same command exits 0 with
   `--user 1000:1000`, and fails without a bind mount (`--to=/tmp/out`), so the host mount is not involved. Hosts
   whose shell user is not root (dev container, Codespaces) take the entrypoint's non-root branch and are not affected.
4. Process lifetime. Processes left running after a reply are stopped (observed: `dockerd` and the Besu containers
   were gone at the next turn). `up` and `check` run in the same turn; `dockerd` is started by hand each turn.
5. Browser. The session ships Chromium at `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`
   (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set); `check` uses it through `CHROMIUM_PATH`.
6. Live run at commit `e276f39`: `bash scripts/live-e2e.sh up` exit 0 in 96 s (seven health checks and console HTTP
   200); `CHROMIUM_PATH=… bash scripts/live-e2e.sh check` exit 0 in 838 s, 27 passed, 0 failed (13.9 min). Load
   average reached 5.97 on 2 cores; no timeout observed.
7. Runbook. `docs/runbook-e2e.md` section 4 "In a claude.ai web session" records findings 1 to 5, and section 10
   records the run of finding 6 (commit `8cef351`). The specs added on `main` after `e276f39` (PR #52) were not run
   in this workspace.
