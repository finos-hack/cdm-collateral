# Runbook: end-to-end stack

How to build, start, check, drive, stop and reset the live end-to-end stack (`task-e2e-wiring`): the four-node Besu
network, the deployed contracts, the CDM payload store, two ledger gateways, two collateral workflow services and the
party console. Source of truth for each component is its own README and source file; this runbook gives the order,
the commands and the checks across all of them.

Paths are relative to the repository root. Commands are bash (Linux, macOS, Codespaces, WSL); on native Windows use
the equivalents in [`setup-windows.md`](setup-windows.md) for the Besu step and `mvnw.cmd` for Maven.

## 1. Components, ports and health checks

Start order is top to bottom. Each row depends on the rows above it.

| # | Component | Process | Port(s) | Health check | Started by |
|---|---|---|---|---|---|
| 1 | Besu QBFT network (`mkt`, `bank-a`, `bank-b`, `bank-c`) | Docker containers `besu-<node>` | JSON-RPC 8545 / 8547 / 8549 / 8551, WebSocket one port higher | `bash besu/check-network.sh` | `bash besu/start-network.sh` |
| 2 | Contracts (margin call, collateral control, tokens, oracle feed) | one-off deploy | — | `contracts/deployments/besu.json` exists | `npm run deploy:besu` in `contracts/` |
| 3 | CDM payload store | `node store/src/server.ts` | 8300 | `curl localhost:8300/store/v1/health` | `orchestrate.mjs` |
| 4 | Ledger gateway, bank-a | `node gateway/src/server.ts` (`NODE=bank-a`) | 8201 | `curl localhost:8201/ledger/v1/health` | `orchestrate.mjs` |
| 4 | Ledger gateway, bank-b | `node gateway/src/server.ts` (`NODE=bank-b`) | 8202 | `curl localhost:8202/ledger/v1/health` | `orchestrate.mjs` |
| 4 | Ledger gateway, mkt (market operator, oracle publisher key) | `node gateway/src/server.ts` (`NODE=mkt`) | 8200 | `curl localhost:8200/ledger/v1/health` | `orchestrate.mjs` |
| 5 | Oracle service (default notices; mock market data and price publishing, `flow-oracle-update`) | `java -jar services/oracle/target/oracle-service.jar` | 8100 | `curl localhost:8100/oracle/v1/health` | `orchestrate.mjs`, 2 s after the gateways |
| 5 | Collateral service A (pledgor, bank-a) | `java -jar services/collateral/target/collateral-service.jar` | 8001 | `curl localhost:8001/api/v1/health` | `orchestrate.mjs`, 2 s after the gateways |
| 5 | Collateral service B (secured party, bank-b) | same jar, `PARTY_ID=B` | 8002 | `curl localhost:8002/api/v1/health` | `orchestrate.mjs`, 2 s after the gateways |
| 6 | Party console (Vite dev server) | `npm run dev` in `console/` | 5173 | open `http://localhost:5173/#/live/A` | `orchestrate.mjs` |

Request path for one lifecycle step: console → collateral service → (CDM document to the payload store) → ledger
gateway → Besu. Chain events flow back: Besu WebSocket → gateway `/ledger/v1/events` → service `/api/v1/events` →
console (Server-Sent Events).

## 2. Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Docker with Compose | any current | Besu network (image `hyperledger/besu:26.9.0`) |
| Java | 21 | `cdm-ext`, collateral service |
| Maven | 3.9.x, or the wrapper `cdm-ext/mvnw` | `cdm-ext`, collateral service |
| Node.js | 24 (gateway README); 22.22 also runs the store and gateway (type stripping is on by default from 22.18) | contracts, store, gateways, console, `orchestrate.mjs` |

The dev container ([`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json)) provides all four.

## 3. One-time build

Run once per clone, and again after a `git pull` that changes the named directory.

```bash
# Node dependencies (orchestrate.mjs does not install them)
npm --prefix contracts ci
npm --prefix gateway ci
npm --prefix store ci
npm --prefix console ci

# CDM extension into the local Maven repository (~/.m2). The collateral service depends on
# local.cdmx:cdmx-java:0.0.1-SNAPSHOT, which is not published anywhere else.
(cd cdm-ext && ./mvnw -q install -DskipTests)

# Collateral service jar -> services/collateral/target/collateral-service.jar (shaded, about 135 MB)
(cd services/collateral && mvn -q -DskipTests package)

# Oracle service jar -> services/oracle/target/oracle-service.jar (shaded; `mvn package` without -DskipTests runs its unit tests)
(cd services/oracle && mvn -q -DskipTests package)
```

`services/collateral/` has no Maven wrapper; without a system `mvn`, use
`cdm-ext/mvnw -f services/collateral/pom.xml -q -DskipTests package` from the repository root.

Rebuild order matters: after a change under `cdm-ext/`, re-run the `install` before re-packaging the service, or the
service builds against the previous extension in `~/.m2`.

## 4. Start the stack

### One command: `scripts/live-e2e.sh`

After the one-time build (section 3), one command runs steps 1, 2, 4 and 5 below and leaves the stack running:

```bash
bash scripts/live-e2e.sh up       # start (or replace) the stack, wait for the health checks, print the console URLs
bash scripts/live-e2e.sh status   # print the seven health checks and the console port; changes nothing
bash scripts/live-e2e.sh down     # stop store, gateways, services and console; stop the Besu containers (chain kept)
bash scripts/live-e2e.sh reset    # down, then delete the chain, the deployment and the off-chain state (section 8)
bash scripts/live-e2e.sh build    # the one-time build of section 3 (mvn if on PATH, else cdm-ext/mvnw)
bash scripts/live-e2e.sh check    # run every live flow (console/e2e/live.spec.ts) against the running stack
```

`check` fails at once if a health check or the console is down. It installs Playwright's Chromium if absent, then
runs the live specs against the console on 5173 (`E2E_BASE_URL` overrides the URL). Extra arguments go to
Playwright, for example `bash scripts/live-e2e.sh check --grep flow-vm`. The exit code is Playwright's. Each run of
the flows moves tokens on the chain, so on a long-lived chain the pledgor eventually lacks the free balance a flow
needs (see the 2026-11-01 `check` entry in section 10); `reset` gives a fresh chain.

With the dev container, run `check` on the host, not inside the container: `appPort` publishes 5173, 8001 and 8002
on the host's `127.0.0.1`, so the same command tests the container's stack from outside it.

The dev container runs `build` once when it is created and `up` every time it starts
([`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json)).

`up` does the following, in order:

1. **Stop-and-replace:** stops the `orchestrate.mjs` process recorded in `.live-e2e.pid` from an earlier `up`, then
   kills any process still listening on 8300, 8200, 8201, 8202, 8100, 8001, 8002, 5173 or 4173.
2. Starts Besu: `docker compose up -d` when `besu/.env` and `besu/networkFiles/genesis.json` exist, otherwise
   `bash besu/start-network.sh`. Waits up to 120 s for a non-zero block height on 8545.
3. Runs `npm run deploy:besu` only when `contracts/deployments/besu.json` is absent. It never redeploys over an
   existing deployment.
4. Starts `node orchestrate.mjs` detached, with output in `stack.log` at the repository root.
5. Polls the seven health checks of step 5 every 3 s for up to 180 s. On success it prints them, the console status
   (`5173  HTTP 200`) and the two console URLs, then exits 0 with the stack still running. On timeout it prints the
   last state and exits 1.

It stops with `missing services/collateral/target/collateral-service.jar` (or `…/oracle-service.jar`) when a jar is
not built. The script runs
in bash on Linux, macOS, Codespaces, WSL and Git Bash on Windows. The CI workflow
`.github/workflows/e2e-live-stack.yml` runs the same `up` command after the section 3 build.

The steps below are the same sequence done by hand.

### Step 1 — Besu network

```bash
bash besu/start-network.sh
```

First run: generates the genesis file and four validator keys into `besu/networkFiles/`, copies one key into each
`besu/<node>/data/key`, writes `besu/.env`, then runs `docker compose up -d`. Later runs start the existing network
and keep the chain.

Check:

```bash
bash besu/check-network.sh
```

Expected: a block number from every node that increases between two runs (a block every 2 s), `peers` = `0x3`, four
validators.

Logs:

```bash
docker compose -f besu/docker-compose.yml ps
docker compose -f besu/docker-compose.yml logs -f bank-a      # or mkt, bank-b, bank-c
```

### Step 2 — Deploy the contracts

```bash
(cd contracts && npm run deploy:besu)
```

Signs as the `mkt` account with `besu/mkt/data/key` and writes `contracts/deployments/besu.json` (contract addresses,
party addresses, RPC URLs, tokens). Every service and gateway reads this file at startup.

Run this once per chain. Each run deploys new contract instances and overwrites `besu.json`; calls made against the
earlier addresses are no longer visible to the stack. After a redeploy, restart step 4.

### Step 3 — Optional: check chain and gateway without the Java services

```bash
(cd gateway && npm run cycle)
```

Drives `flow-im-margin-call-pledge` through two in-process gateway adapters (bank-b issues, bank-a pledges) and asserts
on-chain state. Each assertion prints `  ok: <message>`; a failure throws `ASSERT FAILED: <message>`. It does not need
the gateway HTTP servers. A pass isolates later failures to the store, the services or the console.

### Step 4 — Store, gateways, services and console

```bash
node orchestrate.mjs 2>&1 | tee stack.log
```

`orchestrate.mjs` refuses to start, with a message naming the fix, when `contracts/deployments/besu.json` or the service
jar is missing. Otherwise it:

1. mints one bearer token per party for the payload store (new tokens on every run, never written to disk);
2. starts the store on 8300 with `PARTY_TOKENS` and `DATA_DIR=store/data`;
3. starts gateway bank-a on 8201, gateway bank-b on 8202 and the market operator's gateway mkt on 8200;
4. after 2 s, starts the oracle service on 8100 (writing through gateway mkt), then service A on 8001 and service B on
   8002, each with its own `STORE_TOKEN` and `ORACLE_URL=http://localhost:8100`, from the repository root (so they
   find `besu.json` and write `data/<node>.db`);
5. starts the console dev server on 5173.

Every output line carries the child's prefix: `[store]`, `[gw-a]`, `[gw-b]`, `[gw-mkt]`, `[oracle]`, `[svc-a]`,
`[svc-b]`, `[console]`.
Expected startup lines:

```
[store] cdm payload store on http://localhost:8300/store/v1 (data: …/store/data)
[gw-a] ledger gateway for bank-a (0x…) on http://localhost:8201/ledger/v1
[gw-b] ledger gateway for bank-b (0x…) on http://localhost:8202/ledger/v1
[gw-mkt] ledger gateway for mkt (0x…) on http://localhost:8200/ledger/v1
[oracle] oracle service on http://localhost:8100/oracle/v1 -> operator gateway http://localhost:8200
[svc-a] collateral service: party A (Pledgor) 0x… on http://localhost:8001/api/v1 -> gateway http://localhost:8201
[svc-b] collateral service: party B (Secured Party) 0x… on http://localhost:8002/api/v1 -> gateway http://localhost:8202
[console]   ➜  Local:   http://localhost:5173/
```

`orchestrate.mjs` keeps running when one child exits. A line `[<name>] exited with <code>` means that component is
down while the others continue; read the lines with the same prefix above it.

### Step 5 — Health checks

In a second terminal:

```bash
curl -s localhost:8300/store/v1/health    # {"ok":true,"count":<documents>}
curl -s localhost:8201/ledger/v1/health   # {"node":"bank-a","account":"0x…","ok":true}
curl -s localhost:8202/ledger/v1/health   # {"node":"bank-b",…}
curl -s localhost:8200/ledger/v1/health   # {"node":"mkt",…}
curl -s localhost:8100/oracle/v1/health   # {"service":"oracle","ok":true}
curl -s localhost:8001/api/v1/health      # {"party":"A","role":"Pledgor","address":"0x…","ok":true}
curl -s localhost:8002/api/v1/health      # {"party":"B","role":"Secured Party",…}
```

All seven must answer before step 6.

## 5. Drive the flows

### Manually in the console

- Secured party (BANK-B): `http://localhost:5173/#/live/B`
- Pledgor (BANK-A): `http://localhost:5173/#/live/A`

IM flow: B issues an IM call → A agrees in full → A proposes collateral (tUST) → B accepts the proposal → A pledges.
Both consoles show `settled on-chain ✓`. VM flow: same steps with call type VM, tUSD, and `Transfer title` as the
settlement step.

Return flow (`flow-return`): with collateral in escrow, A calls a return in "Call for a return" → B agrees in full →
B chooses the token and quantity and clicks `Release escrow`. The released value after haircut may not exceed the
agreed return amount.

Default flow (`flow-default-enforcement`): on a settled IM call it issued, while collateral is in escrow, B clicks
`Declare default & enforce`. B's service sends the default notice to the oracle service, which writes it to the oracle
feed through gateway mkt; B's gateway then calls `enforce`, which moves everything A has in escrow with B to B. Both
consoles show `in default on the oracle feed` and `enforced ✓`. A stays in default on the persistent chain; only
`reset` clears it.

Close-out flow (`flow-close-out-netting`): while A has collateral in escrow, B enters a Close-out Amount in the
"Close-out on default" card and clicks `Declare default & close out A`. B's service sends the default notice if the
feed does not show it, values the escrow after haircuts, builds the CDM `CloseOutStatement` and calls `closeOut`: the
contract gives B whole token units up to the Early Termination Amount and returns the rest of A's escrow to A. Both
consoles list the statement with `statement verified ✓`.

Substitution flow (`flow-substitution`): while A has collateral in escrow, A chooses the token and quantity to get back
and the substitute in "Substitute pledged collateral" and clicks `Request substitution → B`. B clicks `Consent` (or
`Refuse`), then A clicks `Settle substitution`; the substitute moves into escrow and the original items back to A. Both
consoles show `substituted on-chain ✓` and the CDM qualifier `CollateralSubstituted`.

Interest flow (`flow-interest-on-cash`): while A has tUSD in escrow, B enters the period dates and the observed rate
in "Interest on cash collateral" and clicks `State interest → A`. B's service builds the CDM
`CollateralInterestStatement` (every day of the period at the tUSD now in escrow, ACT/360, whole USD) and calls
`stateInterest`; the contract pays the amount from B to A. Both consoles list the statement with `paid on-chain ✓` and
`statement verified ✓`. For a negative rate the statement waits for A to click `Pay interest`.

Amendment flow (`flow-agreement-amendment`): each console shows "Agreement terms": the pledgor's minimum transfer
amount, the rounding and each token's haircut in the CDM schedule beside the haircut the contract applies, with
`terms verified against the chain ✓`. B enters a new MTA (for example 400000) and a tMMF haircut in basis points and
clicks `Propose amendment → A`; A's console lists the amendment with `Consent` and `Refuse`. On `Consent` A's service
checks the CDM `CollateralAgreementAmendment` against the terms in force and the contract applies the haircut to the
pair; both consoles show `agreed on-chain ✓`, and revaluation and pledge checks use the new terms. Amend the terms
back (MTA 500000, tMMF 400 bps) afterwards; the other specs use the baseline terms.

Revaluation flow (`flow-revaluation-top-up`): with IM in escrow, open the market operator console
(`http://localhost:5173/#/live/operator`), enter a lower tUST price (for example 88.56) and click `Publish tUST`. The
oracle publishes the price to the feed through gateway mkt. B's console then shows the "Revaluation" card: the
required IM (agreed amounts of IM calls settled since the pair's last enforcement, less returns, top-ups excluded),
the pledged value at the feed prices after haircuts, the shortfall, and the top-up amount (0 below the minimum
transfer amount in force, USD 500,000 at baseline, otherwise rounded up to USD 10,000). `Issue top-up IM call → A` issues the call, which
follows the IM flow. Set the tUST price back to 98.4 afterwards; the other specs value tUST at 98.4.

### Automated (Playwright live specs)

```bash
cd console
npm run test:e2e -- e2e/live.spec.ts
# with a preinstalled Chromium (Codespaces image, cloud sessions):
CHROMIUM_PATH=/path/to/chromium npm run test:e2e -- e2e/live.spec.ts
```

The specs run `flow-im-margin-call-pledge`, `flow-vm-margin-call-transfer`, `flow-return`,
`flow-default-enforcement`, `flow-oracle-update`, `flow-revaluation-top-up`, `flow-close-out-netting`,
`flow-substitution`, `flow-interest-on-cash` and `flow-agreement-amendment` (last; it restores the baseline terms).
The return, default and revaluation
specs set up their escrow through the service API, then drive
the flow in the consoles and check on-chain state through the gateways. Playwright builds the console and
serves it on 4173 itself (`console/playwright.config.ts`); it does not use the 5173 dev server, but it needs the
services on 8001/8002 and everything below them. Each run uses a distinct call amount, so the chain does not need a
reset between runs.

If the specs report `skipped` with `backend stack not running`, `GET http://localhost:8001/api/v1/context` did not
return 2xx: go back to step 5 of section 4.

### Inspect results

```bash
curl -s localhost:8001/api/v1/state                       # calls as party A sees them (on-chain state via the gateway)
curl -s localhost:8201/ledger/v1/calls/<callId>           # raw on-chain call state
curl -s localhost:8201/ledger/v1/calls/<callId>/steps     # lifecycle steps in chain order with their cdmHash
curl -s localhost:8001/api/v1/calls/<callId>/cdm-state    # party A's folded CDM MarginCallState
curl -s localhost:8002/api/v1/calls/<callId>/cdm-state    # party B's fold; its stateHash and anchorHash must equal party A's
```

## 6. Logs and state on disk

| Component | Where | Normal output | Error output |
|---|---|---|---|
| Besu | `docker compose -f besu/docker-compose.yml logs <node>` | block import / QBFT round lines | peer or genesis errors; blocks stuck at `0x0` |
| Store | `[store]` in `stack.log` | startup line only; no per-request logging | startup warning `store: no PARTY_TOKENS configured …` when started without tokens (every docs request then returns 401) |
| Gateways | `[gw-a]`, `[gw-b]`, `[gw-mkt]` | startup line only | `<METHOD> <path> failed: <message>` per failed request (contract reverts appear here); `watchSteps error: <message>` when the Besu WebSocket subscription fails |
| Services | `[svc-a]`, `[svc-b]` | startup line only | uncaught startup exceptions (stack trace). Request errors are **not** printed: they return HTTP 400 `{"error": "<message>"}`, visible in the browser devtools Network tab or the console UI. A failed gateway event-stream connection is retried every 2 s without logging |
| Console | `[console]` | Vite URL lines | Vite compile errors; browser-side errors appear in the browser devtools console |
| Console preview (`console/serve.sh`, run by hand) | `console/.preview.log` | the production preview | — |

State that persists across stack restarts:

| Path | Contents | Written by |
|---|---|---|
| `besu/<node>/data/` | chain database and node key | Besu |
| `besu/networkFiles/`, `besu/.env` | genesis, validator keys, bootnode | `start-network.sh` (first run) |
| `contracts/deployments/besu.json` | deployment registry | `deploy:besu` |
| `store/data/<hash>.json` | CDM documents and their reader allowlists | store |
| `data/bank-a.db`, `data/bank-b.db` | per-party SQLite workflow store | services (run from the repository root) |

All of these paths are git-ignored.

## 7. Stop

- Everything started by `scripts/live-e2e.sh up`, keeping the chain: `bash scripts/live-e2e.sh down`.
- Store, gateways, services, console: Ctrl-C in the `orchestrate.mjs` terminal (stops every child).
- Besu, keeping the chain: `docker compose -f besu/docker-compose.yml stop` (restart with `bash besu/start-network.sh`).
- Besu, removing the containers but keeping the chain on disk: `docker compose -f besu/docker-compose.yml down`.

## 8. Full reset

Removes the chain, the keys, the deployment and all off-chain state; the next start begins from section 4, step 1.
`bash scripts/live-e2e.sh reset` runs these commands after stopping the stack.

```bash
docker compose -f besu/docker-compose.yml down
rm -rf besu/networkFiles besu/.env besu/mkt besu/bank-a besu/bank-b besu/bank-c
rm -rf contracts/deployments store/data data
```

Remove the Besu directories together: `start-network.sh` regenerates keys only when `besu/networkFiles/genesis.json`
is missing, and old `besu/<node>/data/` chain databases do not match a new genesis. The Besu containers write as
`BESU_USER` from `besu/.env`; if `rm` reports permission denied, run it with the same user or with `sudo`.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `orchestrate.mjs`: `missing contracts/deployments/besu.json` | contracts not deployed | section 4, step 2 |
| `orchestrate.mjs`: `missing services/collateral/target/collateral-service.jar` | jar not built | section 3 |
| Maven cannot resolve `local.cdmx:cdmx-java:0.0.1-SNAPSHOT` when packaging the service | extension not installed in `~/.m2` | `(cd cdm-ext && ./mvnw -q install -DskipTests)`, then package again |
| `deploy:besu`: `mkt node key not found at …` | Besu never started on this clone | section 4, step 1 |
| `[gw-*]`: `deployment registry not found at …/besu.json` | contracts not deployed | section 4, step 2, then restart step 4 |
| `[svc-*]`: `contracts/deployments/besu.json not found upward from <dir>` | service started outside the repository | run from the repository root or set `REPO_ROOT` |
| `[svc-*] exited with 1` shortly after start | startup exception; see the stack trace above the line | fix the named cause, restart step 4 |
| Service actions return 400 mentioning the store, or the store returns 401 / 403 | store token mismatch: a service or the store was restarted on its own, so its token no longer matches (tokens are minted per `orchestrate.mjs` run) | stop and restart `orchestrate.mjs` as a whole; do not restart one child |
| `Cannot find package 'viem'` from `[store]` or `[gw-*]` | Node dependencies not installed | `npm --prefix store ci`, `npm --prefix gateway ci` |
| `SyntaxError` on a type annotation in a `.ts` file | Node too old for type stripping | Node 24 (or 22.18 or later) |
| `[console]` reports `Port 5173 is in use, trying another one…` | a `console/serve.sh` preview started by hand holds 5173 (`scripts/live-e2e.sh up` stops it first) | use the URL printed by `[console]`, or stop the preview first: `kill -- -$(cat console/.preview.pid)` |
| Console live page shows no calls or does not update | service on 8001/8002 down, or its gateway event stream down | section 4, step 5; check `[gw-*]` for `watchSteps error` |
| `check-network.sh`: `Connection refused` | containers not running | `docker compose -f besu/docker-compose.yml ps`; `bash besu/start-network.sh` |
| Block number stays at `0x0` | fewer than three validators running | `docker compose -f besu/docker-compose.yml logs` |
| Playwright live specs `skipped` | service A not reachable on 8001 | section 4, steps 4–5 |
| `build` fails with `EPERM` on `console/node_modules/@esbuild/win32-x64/esbuild.exe` (Windows) | the running console dev server holds the file; `npm ci` has already emptied part of `node_modules` | `bash scripts/live-e2e.sh down`, then `build` again |

## 10. Verification status of this runbook

### 2026-11-03 — `reset`, `up` and `check` on Windows 11 (Git Bash, Docker Desktop, Node 24.13)

- `reset`, then `up` on a fresh chain: the Besu genesis step failed until `besu/start-network.sh` set
  `MSYS_NO_PATHCONV=1` (Git Bash rewrote `/data/...` to `C:/Program Files/Git/data/...`). After the fix, `up` exited 0
  with all seven health checks OK.
- `check` passed all four live specs then present: `flow-im-margin-call-pledge` (31.3 s),
  `flow-vm-margin-call-transfer` (25.8 s), `flow-return` (37.4 s), `flow-default-enforcement` (28.4 s).
- With `flow-oracle-update` added: `check --grep flow-oracle-update` passed (12.9 s). The next full `check` on the
  same chain passed four specs and failed `flow-vm-margin-call-transfer`, with the call left `agreed`: the first run's
  VM call (USD 9,850,000) had left the pledgor 5,150,000 tUSD, below this run's call (8,083,000), so
  `settleByTransfer` reverted (`task-live-spec-balance-aware-amounts`).
- After a second `reset`, `up` and `check` ran all five specs on fresh balances: four passed and `flow-return` failed
  in its setup. Gateway B's `decision` write was rejected with "Nonce too low (transaction nonce 0 below sender account
  nonce 5)": B's own node (bank-b) supplied nonce 0. The Besu containers had not restarted (started during `up`, 0
  restarts), and afterwards all four nodes reported the same height, 3 peers and the same pending nonce for B. The
  cause is not known. `check --grep flow-return` on the same chain then passed (37.3 s).
- With `flow-revaluation-top-up` added: `build` while the stack was running failed with `EPERM` on the console's
  `esbuild.exe` (section 9); `down`, `build`, `up` then worked. `check --grep flow-revaluation-top-up` passed (1.2 min)
  on the used chain. The next full `check` failed `flow-return` once at the final CDM state comparison (A and B
  reported different `stateHash` values; a minute later both gave the same hash for every return call). Each party
  reports `converged` for the steps its own node shows, so the spec now polls until both fold the same step count to
  the same hash. The full `check` after that failed `flow-vm-margin-call-transfer` with `ERC20InsufficientBalance`
  (`0xe450d38c`): the pledgor had 4,982,000 tUSD left (`task-live-spec-balance-aware-amounts`).
- After a third `reset`, `up` failed once in the contract deploy with an RPC internal error (-32603) on the new
  chain; a second `up` exited 0. `check` then passed all six specs (3.3 min): `flow-im-margin-call-pledge` (29.5 s),
  `flow-vm-margin-call-transfer` (26.0 s), `flow-return` (37.9 s), `flow-default-enforcement` (27.8 s),
  `flow-oracle-update` (12.3 s), `flow-revaluation-top-up` (1.0 min).

### 2026-11-01 — GitHub Codespace, `check` run from the Windows host through a `gh` tunnel

Codespace on `e2e-wiring` at `9909d9d` (4-core), stack started by `postStartCommand`. From Windows 11 (Git Bash),
`gh codespace ports forward 5173:5173 8001:8001 8002:8002 8201:8201 8202:8202 8300:8300 -c <codespace>` tunnelled
the six ports to `127.0.0.1`. `live-e2e.sh status` showed all six healthy (store `count: 0`), and
`live-e2e.sh check` passed both live specs: `flow-im-margin-call-pledge` (30.0 s) and `flow-vm-margin-call-transfer`
(28.1 s), exit 0.

- `gh codespace ports forward` tunnels only ports listed in `forwardPorts`. Before `cbaf7ed` added 8201, 8202 and
  8300, `check`'s health precondition could not pass over a tunnel.
- With `gh` 2.83.2, forwarding a port that an earlier `gh` session had already forwarded failed with
  `create tunnel port failed … 400: Bad Request`, and neither a Codespace restart nor `gh codespace rebuild --full`
  cleared it. `gh` 2.103.3 forwarded the same ports without the error.
- `gh` 2.103.3 exits the whole forward when one port refuses the connection, so open the tunnel only after the stack
  is up.
- `gh codespace ssh` fails: the image has no sshd.
- An older Codespace, rebuilt after `git pull`, failed in `up` with "besu did not produce a block within 120 s". It
  was deleted without finding the cause.

### 2026-11-01 — `scripts/live-e2e.sh check` on Windows 11 (Git Bash, Docker Desktop)

- With the stack down, `check` printed the health checks and exited 1 with "stack not up".
- After `up` (existing chain and deployment, store `count: 144`), `check` ran both live specs:
  `flow-im-margin-call-pledge` passed, and `flow-vm-margin-call-transfer` failed with the call left `agreed`. In
  `stack.log`, gateway A's `settleByTransfer` reverted. The pledgor had 4,185,000 tUSD free, and the VM test transfers
  between 1,000,000 and 9,999,000 tUSD per run (`console/e2e/live.spec.ts`); every VM call left `agreed` on this
  chain (6,933,000 to 9,569,000) is above that balance. This is test data running out on a long-lived chain, not a
  fault in `check`.
- `check --grep flow-vm` ran only the VM spec, so Playwright arguments pass through; it failed the same way.
- `check` exited 1 in both failing runs, matching Playwright's result.

### 2026-11-01 — dev container with `appPort`, both live flows driven from the Windows host

A fresh dev container from commit `c9e0983`, created with `@devcontainers/cli` 0.90.0. The CLI applied `appPort`: the
`docker run` line carries `-p 127.0.0.1:5173:5173 -p 127.0.0.1:8001:8001 -p 127.0.0.1:8002:8002`. Build and start-up
passed as in the entry below. From the Windows host, `localhost:5173` served the container's console dev server
(`CONSOLE_HOST=0.0.0.0`), `localhost:8001` and `:8002` answered `/api/v1/health` with `ok: true`, and a CORS preflight
returned `204` with `Access-Control-Allow-Origin: *`. Run from `console/` on the host:

```bash
E2E_BASE_URL=http://localhost:5173 E2E_REQUIRE_STACK=1 npx playwright test e2e/live.spec.ts
```

Result: 2 passed (`flow-im-margin-call-pledge` 38.3 s, `flow-vm-margin-call-transfer` 31.7 s). Both services'
`/api/v1/state` then listed the IM and VM calls as `settled`. No IDE was involved; VS Code's `forwardPorts` handling
was not exercised.

### 2026-11-01 — dev container, created with `@devcontainers/cli` 0.90.0 on Docker Desktop (Windows 11)

A fresh checkout of commit `383a6f5`, so no Besu files, no deployment and no build output. `postCreateCommand`
(`live-e2e.sh build`) ran `npm ci` in all four packages, installed `cdm-ext` through `cdm-ext/mvnw` (no `mvn` in the
image) and built the jar in about 10 minutes. `postStartCommand` (`live-e2e.sh up`) generated the Besu network inside
Docker-in-Docker, deployed the contracts and passed all five health checks plus console `HTTP 200`. After the start
command ended, `orchestrate.mjs` and both services were still running in their own session (`setsid`) and
`live-e2e.sh status` repeated the results. Not covered: VS Code port forwarding to a host browser (the CLI does not
forward ports) and a flow driven in the console.

### 2026-10-31 — CI, `ubuntu-latest` (fresh runner)

GitHub Actions run `41253964256` of `e2e-live-stack.yml` (PR #8, head `2307781`) passed every step: the section 3
build, then `bash scripts/live-e2e.sh up` on a runner with no Besu network files and no deployment. The script
generated the network, deployed the contracts, started the stack and reported all five health checks `"ok":true`
(store `count: 0`) and console `HTTP 200`; `live-e2e.sh status` repeated the same results. The job does not drive a
flow and does not tear the stack down.

### 2026-10-30 — `scripts/live-e2e.sh` on Windows 11 (Git Bash, Docker Desktop)

- `up` from stopped Besu containers passed all five health checks and console `HTTP 200`; the stack kept running
  after the script exited.
- A second `up` over a running stack replaced every listening process: new PIDs on all six ports, the old processes
  gone, no port conflicts.
- `down` freed all ports and stopped the four Besu containers.
- Not run: `reset` (it deletes the chain).

### 2026-10-29 — sections 1–5 on Windows 11 (Docker Desktop, JDK 25, Node 24)

- Section 4 by hand against a persisted chain (contract redeploy skipped, `besu.json` still valid): four Besu
  containers with peers `0x3` and 2 s blocks; `orchestrate.mjs` started store (127 documents), both gateways, both
  services and the console; all five health checks answered.
- Section 5, Playwright live specs: both `flow-im-margin-call-pledge` and `flow-vm-margin-call-transfer` passed
  (33.5 s and 31.2 s) after the per-test timeout in `console/e2e/live.spec.ts` was raised to 180 s (commit `7d49e20`).

### 2026-10-26 — Linux container without Docker

Observed:

- `./mvnw install -DskipTests` in `cdm-ext/` (run as `mvn -f cdm-ext/pom.xml install -DskipTests`) and
  `mvn -DskipTests package` in `services/collateral/` succeed in that order and produce
  `services/collateral/target/collateral-service.jar`.
- `npm ci` succeeds in `store/` and `gateway/` on Node 22.22.
- The store starts, prints its startup line and the `no PARTY_TOKENS` warning, answers `/store/v1/health`, and returns
  401 for a docs request without a token.
- Without `contracts/deployments/besu.json`, the gateway and the service exit with the error messages listed in
  section 9.

Not verified in that container (no Docker): the Besu steps, `deploy:besu`, `npm run cycle`, `orchestrate.mjs` end to
end, and the Playwright live specs. The 2026-10-29 to 2026-10-31 entries above cover those steps.

Not verified anywhere yet: the full reset (section 8 or `live-e2e.sh reset`).
