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
| 1 | Besu QBFT network (validators `mkt`, `bank-a`, `bank-b`, `bank-c`; non-validator `ccp` for the CCP BANK-C) | Docker containers `besu-<node>` | JSON-RPC 8545 / 8547 / 8549 / 8551 / 8553, WebSocket one port higher | `bash besu/check-network.sh` | `bash besu/start-network.sh` |
| 2 | Contracts (margin call, collateral control, repo, securities loan, triparty, CCP clearing, reconciliation, tokens, oracle feed, record keeper register, provenance anchors) | one-off deploy | — | `../../contracts/deployments/besu.json` exists | `npm run deploy:besu` in `../../contracts` |
| 3 | CDM payload store | `node store/src/server.ts` | 8300 | `curl localhost:8300/store/v1/health` | `../../orchestrate.mjs` |
| 4 | Ledger gateway, bank-a | `node gateway/src/server.ts` (`NODE=bank-a`) | 8201 | `curl localhost:8201/ledger/v1/health` | `../../orchestrate.mjs` |
| 4 | Ledger gateway, bank-b | `node gateway/src/server.ts` (`NODE=bank-b`) | 8202 | `curl localhost:8202/ledger/v1/health` | `../../orchestrate.mjs` |
| 4 | Ledger gateway, bank-c (the triparty agent BANK-T) | `node gateway/src/server.ts` (`NODE=bank-c`) | 8203 | `curl localhost:8203/ledger/v1/health` | `../../orchestrate.mjs` |
| 4 | Ledger gateway, ccp (the CCP BANK-C) | `node gateway/src/server.ts` (`NODE=ccp`) | 8204 | `curl localhost:8204/ledger/v1/health` | `../../orchestrate.mjs` |
| 4 | Ledger gateway, mkt (market operator, oracle publisher key) | `node gateway/src/server.ts` (`NODE=mkt`) | 8200 | `curl localhost:8200/ledger/v1/health` | `../../orchestrate.mjs` |
| 5 | Oracle service (default notices; mock market data and price publishing, `flow-oracle-update`; the transfer agent of tMMF, which confirms each tMMF movement on chain, `task-authoritative-record-settlement-enforcement`) | `java -jar services/oracle/target/oracle-service.jar` | 8100 | `curl localhost:8100/oracle/v1/health` | `../../orchestrate.mjs`, 2 s after the gateways |
| 5 | Collateral service A (pledgor, bank-a) | `java -jar services/collateral/target/collateral-service.jar` | 8001 | `curl localhost:8001/api/v1/health` | `../../orchestrate.mjs`, 2 s after the gateways |
| 5 | Collateral service B (secured party, bank-b) | same jar, `PARTY_ID=B` | 8002 | `curl localhost:8002/api/v1/health` | `../../orchestrate.mjs`, 2 s after the gateways |
| 5 | Collateral service T (triparty agent BANK-T, bank-c; triparty routes only) | same jar, `PARTY_ID=T` | 8003 | `curl localhost:8003/api/v1/health` | `../../orchestrate.mjs`, 2 s after the gateways |
| 5 | Collateral service C (the CCP BANK-C, ccp; CCP routes only) | same jar, `PARTY_ID=C` | 8004 | `curl localhost:8004/api/v1/health` | `../../orchestrate.mjs`, 2 s after the gateways |
| 6 | Party console (Vite dev server) | `npm run dev` in `../../console` | 5173 | open `http://localhost:5173/#/live/A` | `../../orchestrate.mjs` |

Request path for one lifecycle step: console → collateral service → (CDM document to the payload store) → ledger
gateway → Besu. Chain events flow back: Besu WebSocket → gateway `/ledger/v1/events` → service `/api/v1/events` →
console (Server-Sent Events).

## 2. Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Docker with Compose | any current | Besu network (image `hyperledger/besu:26.9.0`) |
| Java | 21 | `cdm-ext`, collateral service |
| Maven | 3.9.x, or the wrapper `../../cdm-ext/mvnw` | `cdm-ext`, collateral service |
| Node.js | 24 (gateway README); 22.22 also runs the store and gateway (type stripping is on by default from 22.18) | contracts, store, gateways, console, `../../orchestrate.mjs` |

The dev container ([`../../.devcontainer/devcontainer.json`](../../.devcontainer/devcontainer.json)) provides all four.

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

`../../services/collateral` has no Maven wrapper; without a system `mvn`, use
`cdm-ext/mvnw -f services/collateral/pom.xml -q -DskipTests package` from the repository root.

Rebuild order matters: after a change under `../../cdm-ext`, re-run the `install` before re-packaging the service, or the
service builds against the previous extension in `~/.m2`.

## 4. Start the stack

### One command: `../../scripts/live-e2e.sh`

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
([`../../.devcontainer/devcontainer.json`](../../.devcontainer/devcontainer.json)).

`up` does the following, in order:

1. **Stop-and-replace:** stops the `../../orchestrate.mjs` process recorded in `.live-e2e.pid` from an earlier `up`, then
   kills any process still listening on 8300, 8200, 8201, 8202, 8203, 8204, 8100, 8001, 8002, 8003, 8004, 5173 or 4173.
2. Starts Besu: `docker compose up -d` when `../../besu/.env` and `besu/networkFiles/genesis.json` exist, otherwise
   `bash besu/start-network.sh`. Waits up to 120 s for a non-zero block height on 8545.
3. Runs `npm run deploy:besu` only when `../../contracts/deployments/besu.json` is absent. It never redeploys over an
   existing deployment.
4. Starts `node orchestrate.mjs` detached, with output in `../../stack.log` at the repository root.
5. Polls the seven health checks of step 5 every 3 s for up to 180 s. On success it prints them, the console status
   (`5173  HTTP 200`) and the two console URLs, then exits 0 with the stack still running. On timeout it prints the
   last state and exits 1.
6. When the deployment marks tokens `provenanceRequired` (tUST and tMMF) and nothing is anchored yet, seeds their
   fixture provenance once through service A (`POST /api/v1/provenance/seed`, `task-document-provenance`). If the seed
   fails, it prints `provenance seed failed; seed it from the Provenance card in the console`. Until the provenance is
   seeded, a secured party refuses tUST and tMMF as collateral (the provenance gate). A deployment made before
   `ProvenanceAnchors` existed has no `contracts.provenanceAnchors` and needs a `reset`.

It stops with `missing services/collateral/target/collateral-service.jar` (or `…/oracle-service.jar`) when a jar is
not built. The script runs
in bash on Linux, macOS, Codespaces, WSL and Git Bash on Windows. The CI workflow
`../../.github/workflows/e2e-live-stack.yml` runs the same `up` command after the section 3 build. Since 2026-11-11 it
runs only on demand (`workflow_dispatch`, from the Actions tab), to save GitHub Actions minutes; the full live suite
runs locally before every pull request (`task-ci-actions-minutes`).

The steps below are the same sequence done by hand.

### In a claude.ai web session (cloud workspace)

A claude.ai web session gives the agent a Linux workspace with Docker, JDK 21, Maven, Node 22 and a preinstalled
Chromium. The stack builds, starts and passes `check` there (section 10, 2026-11-08), with these differences from a
developer machine. For a Claude Code cloud session (claude.ai/code), the environment settings and setup script in
[`claude-code-cloud.md`](claude-code-cloud.md) cover the same differences.

- **Network allowlist.** Outbound HTTPS goes through a proxy that admits package managers by default. Add these
  entries under claude.ai Settings > Capabilities > Allowed websites (Pro and Max plans; on Team and Enterprise an
  owner adds them under Organization settings > Capabilities). Entries took effect in a running session.

  | Entry | Needed by |
  |---|---|
  | `repo1.maven.org`, `repo.maven.apache.org` | `build` (Maven dependencies) |
  | `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`, `*.docker.com` | Besu image pull (layers come from `production.cloudfront.docker.com`) |
  | `binaries.soliditylang.org` | `hardhat test` and `deploy:besu` (solc download) |

- **Docker daemon.** The daemon is not running at session start. Start it before `up`:
  `(setsid nohup dockerd >/tmp/dockerd.log 2>&1 &)`, then wait until `docker info` succeeds.
- **One turn.** Processes left running after the agent's reply are stopped, including `dockerd` and the Besu
  containers. Run `up` and `check` in the same turn; the chain on disk is kept for the next `up`.
- **Browser.** Chromium is preinstalled and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set. Pass it to `check`:
  `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome bash scripts/live-e2e.sh check`. The revision
  directory name (`chromium-1243`) can differ; `ls /opt/pw-browsers` shows it.
- **Root shell.** The workspace shell runs as uid 0. `../../besu/start-network.sh` runs the genesis step with
  `--entrypoint /opt/besu/bin/besu`, so no manual step is needed. Without that flag the image entrypoint
  `besu-entry.sh`, for uid 0, runs Besu twice (once with `--print-paths-and-exit`, once for the command); the first run
  writes `besu/networkFiles/` and the second fails with
  `java.lang.IllegalArgumentException: Output directory already exists.` A script from before this change shows that
  error on any host where the shell user is root, for example under `sudo`.
- **Resources.** 2 CPU cores and 7.8 GB RAM: the full `check` took 13.9 to 15.2 min with a load average up to 6 and no
  timeouts.

### Step 1 — Besu network

```bash
bash besu/start-network.sh
```

First run: generates the genesis file and four validator keys into `../../besu/networkFiles`, copies one key into each
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

Signs as the `mkt` account with `../../besu/mkt/data/key` and writes `contracts/deployments/besu.json` (contract addresses,
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

`../../orchestrate.mjs` refuses to start, with a message naming the fix, when `contracts/deployments/besu.json` or the service
jar is missing. Otherwise it:

1. mints one bearer token per party for the payload store (new tokens on every run, never written to disk);
2. starts the store on 8300 with `PARTY_TOKENS` and `DATA_DIR=store/data`;
3. starts gateway bank-a on 8201, gateway bank-b on 8202, gateway bank-c (the triparty agent BANK-T) on 8203, gateway
   ccp (the CCP BANK-C) on 8204 and the market operator's gateway mkt on 8200;
4. after 2 s, starts the oracle service on 8100 (writing through gateway mkt), then service A on 8001, service B on
   8002, service T on 8003 and service C on 8004, each with its own `STORE_TOKEN` and `ORACLE_URL=http://localhost:8100`, from the
   repository root (so they find `besu.json` and write `data/<node>.db`);
5. starts the console dev server on 5173.

Every output line carries the child's prefix: `[store]`, `[gw-a]`, `[gw-b]`, `[gw-t]`, `[gw-c]`, `[gw-mkt]`, `[oracle]`,
`[svc-a]`, `[svc-b]`, `[svc-t]`, `[svc-c]`, `[console]`.
Expected startup lines:

```
[store] cdm payload store on http://localhost:8300/store/v1 (data: …/store/data)
[gw-a] ledger gateway for bank-a (0x…) on http://localhost:8201/ledger/v1
[gw-b] ledger gateway for bank-b (0x…) on http://localhost:8202/ledger/v1
[gw-mkt] ledger gateway for mkt (0x…) on http://localhost:8200/ledger/v1
[oracle] oracle service on http://localhost:8100/oracle/v1 -> operator gateway http://localhost:8200
[svc-a] collateral service: party A (Pledgor) 0x… on http://localhost:8001/api/v1 -> gateway http://localhost:8201
[svc-b] collateral service: party B (Secured Party) 0x… on http://localhost:8002/api/v1 -> gateway http://localhost:8202
[svc-t] collateral service: triparty agent BANK-T (Triparty Agent) 0x… on http://localhost:8003/api/v1 -> gateway http://localhost:8203
[svc-c] collateral service: CCP BANK-C (Central Counterparty) 0x… on http://localhost:8004/api/v1 -> gateway http://localhost:8204
[console]   ➜  Local:   http://localhost:5173/
```

`../../orchestrate.mjs` keeps running when one child exits. A line `[<name>] exited with <code>` means that component is
down while the others continue; read the lines with the same prefix above it.

### Step 5 — Health checks

In a second terminal:

```bash
curl -s localhost:8300/store/v1/health    # {"ok":true,"count":<documents>}
curl -s localhost:8201/ledger/v1/health   # {"node":"bank-a","account":"0x…","ok":true}
curl -s localhost:8202/ledger/v1/health   # {"node":"bank-b",…}
curl -s localhost:8203/ledger/v1/health   # {"node":"bank-c",…}
curl -s localhost:8204/ledger/v1/health   # {"node":"ccp",…}
curl -s localhost:8200/ledger/v1/health   # {"node":"mkt",…}
curl -s localhost:8100/oracle/v1/health   # {"service":"oracle","ok":true}
curl -s localhost:8001/api/v1/health      # {"party":"A","role":"Pledgor","address":"0x…","ok":true}
curl -s localhost:8002/api/v1/health      # {"party":"B","role":"Secured Party",…}
curl -s localhost:8003/api/v1/health      # {"party":"T","role":"Triparty Agent",…}
curl -s localhost:8004/api/v1/health      # {"party":"C","role":"Central Counterparty",…}
```

All eleven must answer before step 6.

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

Two-way initial margin (`flow-two-way-im-default`): each party pledges on one leg and secures the other. The leg
selector at the top of each console ("A pledges to B", "B pledges to A") picks the leg the role panels act on; it starts
on the leg A pledges on. With A's leg in escrow, A selects "B pledges to A", issues an IM call to B, and B agrees,
proposes tUSD and pledges it. After `Declare default & enforce` on A's leg, B selects "B pledges to A" and clicks
`Reclaim my IM from A`: B's service builds the CDM `CollateralReclaim` and B's gateway calls `reclaim`, which returns
B's whole escrow on that leg once the feed records A in default. The balances card shows both legs' escrow.

GMRA terms (`flow-repo-gmra-terms`): the "GMRA terms" card in each console shows the pair's GMRA 2011 elections
(cdm-ext `GmraTerms`, Party1 BANK-A, Party2 BANK-B), the terms hash and whether the terms verify against the chain. A
picks "MTA of B", enters a new amount and clicks `Propose GMRA amendment → B`: A's service builds the CDM
`GmraTermsAmendment` and A's gateway calls `proposeTermsAmendment` (kind GMRA). B clicks `Consent to GMRA amendment`;
B's service verifies the document against the terms in force and B's gateway calls `decideTermsAmendment`. The pair's
GMRA terms hash moves on-chain and both services fold the amendment. The CSA terms are a separate chain and do not
change.

GMSLA terms (`flow-gmsla-terms`): the "GMSLA terms" card in each console shows the pair's GMSLA 2010 elections (CDM's
`LegalAgreement` with its GMSLA elections, plus the minimum transfer amounts and default margin of cdm-ext
`GmslaPrototypeElections`, held as cdm-ext `GmslaTerms`), the terms hash and whether the terms verify against the chain.
A enters a new notification time and clicks `Propose GMSLA amendment → B`: A's service builds the cdm-ext
`GmslaTermsAmendment` and A's gateway calls `proposeTermsAmendment` (kind GMSLA). B clicks `Consent to GMSLA
amendment`; B's service verifies the document against the terms in force and B's gateway calls `decideTermsAmendment`.
The pair's GMSLA terms hash moves on-chain and both services fold the amendment. The GMRA chain does not change. The
baseline elections are the assumptions listed in `../analysis/sme-question-ledger.md` (GST-1 to GST-6).

Securities loans (`flow-gmsla-loan-delivery-return`): in the "Securities loans (GMSLA)" card, A enters the loaned
security and quantity, the collateral (tUSD for cash, or tUST) and the rate (the rebate rate against cash, the fee rate
against tUST), and clicks `Book loan: lend to B`. The margin defaults to the GMSLA default margin. A's service computes
the collateral with cdm-ext `GmslaRequiredCollateral` (Market Value at the feed price × margin, rounded up), builds CDM's
execution event and the cdm-ext `GmslaLoan`, and A's gateway calls `book` on `SecuritiesLoan`. B clicks `Affirm loan`
after its service rebuilds the event and checks the price and the collateral. Each party clicks `Settle delivery`; the
second instruction moves the securities to B and the collateral to A by title transfer. B enters a quantity and clicks
`Return part` (or `Return in full`), and A clicks `Agree return of …`. Each return is CDM's `Create_BusinessEvent` over
a quantity change, with the collateral position reduced to what A keeps, qualified by cdm-ext `Qualify_GmslaReturn`.
The lender redelivers the collateral in proportion to the quantity returned (cdm-ext `GmslaReturnCollateral`). The card
shows the last return's qualification beside CDM's (defect D4). Both services must be on the same business date. The
rules are the assumptions in `../analysis/sme-question-ledger.md` (LDR-1 to LDR-6). BANK-B's test balance holds
5,000 tUST so that it can post tUST as collateral.

Securities lending marks (`flow-gmsla-marking`): the "Securities lending marks (GMSLA)" card shows the pair's open loans
marked together at the feed prices on the business date. For each loan it shows the lender's requirement (Market Value
× margin, cdm-ext `GmslaLoanRequirement`), the collateral value at the feed price without a haircut, and the exposure
from this party's side. It also shows the margin this party holds net from settled GMSLA calls, and the net figure
(cdm-ext `GmslaNetExposure`). When the net figure exceeds the party's GMSLA minimum transfer amount, the party clicks
`Call GMSLA margin from …`. Its service publishes the cdm-ext `GmslaMarkStatement` and issues a VM call by title
transfer whose IssueCall step names the GMSLA and carries the statement's hash. The called party's service agrees in
full only if it rebuilds the same statement. It delivers tUSD or tUST covering the amount at the feed prices. The spec
raises the tMMF price to 1.10 so that A calls B for 510,000, then restores it so that B calls the 510,000 back, and
returns the loan. The rules are the assumptions in `../analysis/sme-question-ledger.md` (MRK-1 to MRK-6).

Recalls (`flow-gmsla-recall`): in the "Securities loans (GMSLA)" card, the lender enters a quantity in the Recall column
of an open loan and clicks `Recall part` (or `Recall in full`). Its service builds the cdm-ext `GmslaRecallNotice`, due
two business days after the business date (weekends skipped; the loan's CDM `RecallProvision`), and A's gateway calls
`recall` on `SecuritiesLoan`. Both consoles show `recall of … due …`, and `(overdue)` once the business date is after the
due date. The borrower returns through the loan's return entry, which starts at the quantity recalled, and the lender
agrees as for any return. A settled return reduces the recall and clears it when it returns as much. The lender clicks
`Withdraw recall` to withdraw a pending recall. Loans booked before this deployment have no `RecallProvision` and cannot
be recalled. The rules are the assumptions in `../analysis/sme-question-ledger.md` (RCL-1 to RCL-6).

Substitutions (`flow-gmsla-substitution`): for an open loan against securities, the borrower's Substitution column
shows `Substitute tAGY` (or `Substitute tUST`, the security other than the current collateral and the loaned one).
`tAGY` is a test agency bond deployed for loan collateral only (feed price 99.20, BANK-B test balance 5,000); it is not
eligible under the CSA. The borrower's service builds the cdm-ext `GmslaLoanSubstitution` with the substitute quantity
at the feed prices on the business date, and its gateway calls `requestSubstitution`. The lender's console shows
`… tAGY for … tUST requested` with `Agree substitution` and `Refuse substitution`; agreeing moves the substitute to
the lender and the tUST back to the borrower in one transaction. No return can be instructed while a substitution is
pending. The rules are the assumptions in `../analysis/sme-question-ledger.md` (LSB-1 to LSB-6).

Rebates (`flow-gmsla-rebate`): for a delivered loan against tUSD, the borrower's Rebate column shows `Bill rebate <start> to
<end>`: from the billed-through date (or the delivery date) to the business date, or to the return date of a returned
loan. The borrower's service builds the cdm-ext `GmslaLoanInvoice`, one part per stretch of constant cash held, and its
gateway calls `bill`. The lender's console shows `rebate … tUSD for … to …` with each part's cash held and accrual, and
`Pay … tUSD` and `Refuse invoice`; paying moves the tUSD from the lender to the borrower and both consoles show `billed
through …`. Totals are whole tUSD (tUSD has no decimals). Loans booked before this deployment start from their
delivery. The rules are the assumptions in `../analysis/sme-question-ledger.md` (RBT-1 to RBT-6).

Lending fees (`flow-gmsla-lending-fee`): for a delivered loan against securities, the lender's Rate billing column
shows `Bill fee <start> to <end>`, over the same periods as the rebate. The fee accrues on the loaned quantity
outstanding at the loaned security's feed price on the lender's business date, one price per invoice. The borrower's
console shows `fee … tUSD for … to … at <price>` with each part, and `Pay … tUSD` and `Refuse invoice`; the
borrower's service refuses an invoice whose price is not its own feed price. The rules are the assumptions in
`../analysis/sme-question-ledger.md` (FEE-1 to FEE-6).

Securities lending default (`flow-gmsla-default-close-out`): in the "Securities lending default (GMSLA)" card of the
non-defaulting party B clicks `Declare A's default and close out` (or `Close out A's default` when the oracle feed
already shows it). B's service notifies the default to the oracle service if needed, serves the Default Notice on-chain
(the baseline GMSLA has automatic early termination not applicable) and records the close-out statement: every open
loan of the pair closes out at once, valued at the Default Market Value of the loaned securities against the collateral
the lender holds, both at the feed prices, with the fee or rebate accrued since the billed-through date and any margin
held under the pair's GMSLA calls; one balance in tUSD remains. No securities or collateral move. Both services show the
statement as verified, and the party that owes the balance clicks `Pay USD …`. The rules are the assumptions in
`../analysis/sme-question-ledger.md` (DFL-1 to DFL-9).

Triparty terms (`flow-triparty-terms`): in the "Triparty terms" card A clicks `Propose triparty terms (giver BANK-A,
agent BANK-T)`. A's service builds the cdm-ext `TripartyTerms` (A as the giver, B as the receiver, BANK-T as the agent,
the hash of the GMRA terms in force, and the profile: tUST at a 2% haircut, tAGY at 3% up to half of the Purchase
Price) and records its hash on `TripartySettlement`. B, and then BANK-T in its own console (`#/live/T`), each see
`terms checked against this party's own build ✓` and click `Affirm triparty terms`; after both the terms show
`in effect on-chain ✓`. The giver or the receiver can `Terminate triparty terms`; any of the three can refuse a
proposal. The terms and the profile are the assumptions in `../analysis/sme-question-ledger.md` (TPT-1 to TPT-6).

Triparty trade start (`flow-triparty-trade-start`): under B-giver terms in effect (B gives, A receives), B deposits
2,000 tUST ranked 1 and 4,000 tAGY ranked 2 with `Deposit with BANK-T` in the terms card; the "Free at the agent" table
shows them held on `TripartySettlement`. B enters a Purchase Price of 500,000 and clicks `Request triparty repo`: B's
service builds the cdm-ext `TripartyRepoRequest` and records its hash. A sees `request checked ✓` and clicks `Affirm
triparty repo request`. In `#/live/T` the agent clicks `Allocate collateral`: its service runs cdm-ext
`AllocateTriparty` over B's free account at the feed prices, in B's ranking, with tAGY capped at half of the Purchase
Price after haircuts; 2,000 tUST and at most 2,598 tAGY cannot cover 500,000, so the card shows `the deposit cannot
cover the Purchase Price within the profile: nothing allocated` and nothing is written on-chain. B deposits 1,000 tUST
more; the agent allocates again: 3,000 tUST and 2,190 tAGY (42.15% of the Purchase Price), books the CDM repo with one
collateral position per asset in the cdm-ext `TripartyAllocation`, and records its hash with the tokens and amounts.
A's and B's services each recompute the allocation (`allocation recomputed by this party ✓`); A clicks `Settle purchase
against the allocation`, and in one transaction 500,000 tUSD moves from A to B and the allocated tokens move from B's
free account to the repo's account. B then clicks `Withdraw free tAGY`. The repo stays open, so the terms cannot be
terminated until trade end (task-triparty-trade-end). The allocation rules are the assumptions in
`../analysis/sme-question-ledger.md` (TPS-1 to TPS-7).

Triparty revaluation (`flow-triparty-revaluation`): with a settled trade-start repo (3,000 tUST and 2,190 tAGY held,
1,810 tAGY free) and the agent's business date three days after the Purchase Date, the operator lowers tUST to 96.00
and tAGY to 97.00. In `#/live/T` the agent clicks `Revalue collateral` on the repo: its service runs cdm-ext
`RevalueTriparty` over the holding and B's free account at the feed prices against the Repurchase Price accrued to the
date (500,208.33); the holding is worth 488,297.10 after haircuts, so 127 free tAGY are topped up and the card shows
`topped up from the giver's free account` and `+127 tAGY`. The cdm-ext `TripartyRevaluation` carries CDM's valuation
update and the terms change of the repo's collateral; `TripartySettlement.revalue` replaces the holding in one
transaction and keeps the hash with its block. A's and B's services each recompute the revaluation from the chain at
the block before it (`recomputed from the chain ✓`). The operator raises tAGY to 101.00 and returns tUST to 98.40; the
agent revalues again and 164 tAGY are released to B's free account. The prices and the agent's business date are
restored at the end. The revaluation rules are the assumptions in `../analysis/sme-question-ledger.md` (TPR-1 to
TPR-8).

Triparty substitution (`flow-triparty-substitution`): with a settled trade-start repo (3,000 tUST and 2,190 tAGY held)
and 1,500 tUST more deposited by B, B picks tAGY and 1,000 units in its repo row and clicks `Request substitution`: its
service builds the cdm-ext `TripartySubstitutionRequest` and records its hash on `TripartySettlement`; the row shows the
request awaiting the agent. In `#/live/T` the agent clicks `Substitute collateral`: its service runs cdm-ext
`SubstituteTriparty` at its business date (the Purchase Date in the spec, so the required value is 500,000), returns the
1,000 tAGY to B's free account and replaces them with 998 of B's free tUST; the cdm-ext `TripartySubstitution` carries
the terms change of the repo's collateral and CDM's proposed and accepted workflow steps (`CDM workflow: request and
execution`). A's and B's services recompute it from the chain at the block before (`recomputed from the chain ✓`). B
then asks for the other 1,190 tAGY; its 502 free tUST cannot replace them, so the agent declines and nothing moves.
When a revaluation or substitution records a concentration breach, the agent's row offers `Swap out N excess <token>`,
which requests and substitutes the units over the limit. The substitution rules are the assumptions in
`../analysis/sme-question-ledger.md` (TPU-1 to TPU-7).

Triparty trade end (`flow-triparty-trade-end`): with a settled trade-start repo and the agent's business date set to
its Repurchase Date (the button is absent the day before), the agent clicks `Prepare trade end` in `#/live/T`: its
service builds the cdm-ext `TripartyTradeEnd` (CDM's repurchase event, one release per held asset, the Repurchase Price
of 500,486 tUSD) and records its hash and the price on `TripartySettlement`; the row shows the trade end. A's and B's
services rebuild it from the chain at the block before (`rebuilt by this party ✓`). B clicks `Settle repurchase
(500,486 tUSD)`: in one transaction the price moves from B to A and the 3,000 tUST and 2,190 tAGY return to B's free
account; the repo shows `repurchased on-chain ✓` in every console. The spec then ends every other settled repo under
the B-giver terms through the services, each at its own Repurchase Date, withdraws B's free collateral and terminates
Triparty reporting (`flow-triparty-reporting`, which runs before trade end): with a settled trade-start repo, 1,810
tAGY free and the agent's business date on the Purchase Date, the agent clicks `Send report` in the B-giver terms card
in `#/live/T`: its service builds the cdm-ext `TripartyReport` (each settled repo under the terms with its exposure, its
holding valued after haircuts and CDM's `CollateralPortfolio` of it, and B's free collateral) and records its hash on
`TripartySettlement`. The card shows the repo at 500,026.56 after haircuts against 500,000, covered, and 1,810 tAGY
free. A's and B's services rebuild the report from the chain at the block before (`rebuilt from the chain ✓`). The
report's content is the assumption in `../analysis/sme-question-ledger.md` (TPP-1 to TPP-5).

the terms. The trade-end rules are the assumptions in `../analysis/sme-question-ledger.md` (TPE-1 to TPE-6).

Repo margin maintenance (`flow-repo-margin-maintenance`): the "Repo margin (GMRA)" card shows each purchased repo's
exposure, the Net Margin held and the Net Exposure at the service's business date. When the Net Exposure exceeds the
party's minimum transfer amount, `Call margin` issues a `VM` call whose CDM issuance names the GMRA. The called party's
service recomputes the amount before agreeing in full; the call then settles by title transfer as a VM call does, in tUSD
or securities valued at the feed price with no haircut. The holder of Cash Margin pays interest on it from the same card,
at a rate entered by hand. The rules are the assumptions listed in `../analysis/sme-question-ledger.md` (RPM-1 to RPM-3).

Repo reprice (`flow-repo-reprice`): when the Net Exposure exceeds the party's minimum transfer amount, the same card offers
`Reprice open repos` as an alternative to the call. The offer instructs one CDM reprice event per purchased repo; the other
party's `Agree reprice` builds the same events from the feed price and its business date and settles each one in
`RepoSettlement`: the cash difference moves and the stored prices and trade hash change, and the securities stay where they
are. No margin call is created. Both parties' business dates and the feed price must be the same when agreeing; otherwise the
agreement is refused and the proposer can offer again. The rules are the assumptions listed in
`../analysis/sme-question-ledger.md` (RPR-1 to RPR-6).

Repo adjustment (`flow-repo-adjustment`): the same card also offers `Adjust open repos`. The Purchase Price stays the same
and the quantity becomes the Purchase Price times the Margin Ratio divided by the feed price, rounded up. On agreement the
seller delivers the extra securities, or the buyer returns the surplus, and the seller pays the Price Differential accrued
to that date, in one transaction per repo. No margin call is created, and the same-inputs rule of a reprice applies. The
rules are the assumptions listed in `../analysis/sme-question-ledger.md` (RAD-1 to RAD-6).

Repo substitution (`flow-repo-substitution`): in the "Repos" card the Seller of a purchased repo clicks `Substitute tMMF`
(or `Substitute tUST`). All the repo's securities are replaced by a quantity with at least their Market Value at the feed
prices, rounded up. The Buyer clicks `Agree substitution` or `Refuse substitution`. On agreement both securities move in one
transaction, no cash moves, and the Purchase Price and Repurchase Price do not change. The rules are the assumptions listed
in `../analysis/sme-question-ledger.md` (SUB-1 to SUB-6).

Repo interest and income (`flow-repo-income`): in the "Repos" card the Seller of a purchased repo clicks `Pay accrued interest`.
The Buyer agrees or refuses; on agreement the Seller pays the Price Differential accrued to the business date, less earlier
interim payments, and the Repurchase Price falls by that amount. The Buyer enters the income per unit and the income date
and clicks `Pay income`; the Seller agrees or refuses, and the Buyer pays income per unit times the quantity in tUSD. The
rules are the assumptions listed in `../analysis/sme-question-ledger.md` (INC-1 to INC-6).

Repo roll (`flow-repo-roll`): when the business date is the Repurchase Date of a purchased repo, either party enters the new
Repurchase Date and the repo rate in the "Repos" card and clicks `Roll repo`. The other party agrees or refuses. On agreement
the Seller pays the Price Differential to the old Repurchase Date in tUSD, the securities stay with the Buyer, and the repo
accrues at the new rate to the new date. The rules are the assumptions listed in `../analysis/sme-question-ledger.md`
(ROL-1 to ROL-7).

Repo pair-off (`flow-repo-pair-off`): when A has sold securities to B and B has sold the same security and quantity back to
A for the same cash token, and the business date is their common Repurchase Date, either party clicks `Pair off with …` on
one repo in the "Repos" card. The other party sees the net amount it receives or pays and clicks `Agree pair-off` or
`Refuse pair-off`. On agreement both repos are repurchased in one transaction, no securities move, and the Seller of the
repo with the higher Repurchase Price pays the difference in tUSD. The rules are the assumptions listed in
`../analysis/sme-question-ledger.md` (POF-1 to POF-7).

Buy/sell-back (`flow-repo-buy-sell-back`): in the "Repos" card A sets `Type` to `Buy/sell-back` and clicks `Book
buy/sell-back: sell to B`; the trade carries CDM's trade type `BuySellBack` and settles like a repo. During the term B,
the Buyer, enters the income per unit and date and clicks `Enter income`; A sees how far the Sell Back Price falls (the
income plus interest at the repo rate to the Repurchase Date) and agrees or refuses. No cash moves: on the Repurchase Date
A pays the lower Sell Back Price. A buy/sell-back has no interim interest, a roll nets the income against the interest,
and it pairs off only with another buy/sell-back. The rules are the assumptions listed in
`../analysis/sme-question-ledger.md` (BSB-1 to BSB-8).

Default close-out (`flow-repo-default-close-out`): in the "Repo default (GMRA paragraph 10)" card of the non-defaulting
party B clicks `Declare A's default and close out` (or `Close out A's default` when the oracle feed already shows it). B's
service notifies the default to the oracle service if needed, serves the Default Notice on-chain (the baseline GMRA terms
elect no automatic early termination) and records the close-out statement: every purchased repo and buy/sell-back of the
pair closes out at once, valued at its Repurchase Price to the Early Termination Date against the Default Market Value of
its securities at the feed price, with any margin held under the pair's GMRA calls; one balance in tUSD remains. No
securities move. Both services show the statement as verified, and the party that owes the balance clicks `Pay USD …`.
The rules are the assumptions listed in `../analysis/sme-question-ledger.md` (DCO-1 to DCO-8).

Repo purchase and repurchase (`flow-repo-purchase-repurchase`): in the "Repos" card A picks the security, enters the
Purchase Price in tUSD, the repo rate and the term and clicks `Book repo: sell to B`. A's service computes the quantity
from the feed price and the Margin Ratio (the GMRA default unless entered), builds the repo `TradeState` with CDM's
`Create_BusinessEvent`, the Repurchase Price with cdm-ext `RepoRepurchasePrice`, and A's gateway calls `book` on the
`RepoSettlement` contract. B's service rebuilds the trade from the booked document and checks the on-chain amounts;
B clicks `Affirm repo`. Each party then clicks `Settle purchase`: its gateway approves its leg and instructs with the
hash of the cdm-ext `RepoSettlement` document, and the second instruction moves the securities to B and the tUSD to A
in one transaction. `Settle repurchase` appears once the service's business date is on or after the Repurchase Date;
set it in the card (`Set business date`). The second repurchase instruction returns the securities and pays the
Repurchase Price.

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

Cancellation flow (`flow-call-cancellation`): on an issued call, the calling party's console offers `Withdraw call`
(with an optional reason); the call shows `cancelled on-chain ✓` in both consoles. On an answered call that is not
settled (agreed, partly agreed or disputed), either console offers `Request cancellation`; the call then shows
`cancellation requested by <party>` and takes no other step until the other party clicks `Accept cancellation` or
`Refuse cancellation`. On acceptance a proposal not yet delivered is shown `cancelled` and no collateral moves. These
rules are assumptions awaiting a business SME (`task-sme-call-cancellation-rules`).

Settlement netting flow (`flow-settlement-netting`): B's interest card has `Hold for settlement netting`; a statement
stated with it stays `stated` until it is netted (or paid alone). The "Settlement netting" card in each console lists
the agreed VM calls with an accepted tUSD proposal, the agreed return calls and the held Interest Amounts between A and
B, and the net (`Net: A pays USD … in tUSD`). The party owing the net clicks `Settle netted`; the calls then show
`settled in netting <id>` and the card lists the netting with `statement verified ✓`. Initial margin calls do not
appear. The rules are assumptions awaiting a business SME (`task-sme-settlement-netting-rules`).

Replacement flow (`flow-call-replacement`): on a cancelled call it issued, the calling party's console offers a
`Replacement amount (USD)` field and `Issue replacement call`. The new call keeps the cancelled call's kind and called
party; the cancelled call then shows `replaced by <call>` and the new call `replaces <call>` in both consoles. A
cancelled call takes one replacement.

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
`flow-substitution`, `flow-interest-on-cash`, `flow-settlement-netting`, `flow-call-cancellation`,
`flow-call-replacement`, `flow-agreement-amendment` (it restores the baseline terms), `flow-allocation`,
`flow-reconciliation`, `flow-two-way-im-default`, `flow-repo-gmra-terms` (it restores the baseline MTA) and
`flow-repo-purchase-repurchase` (it sets both business dates back to today; the seller pays the Price Differential,
which the top-up before each run restores), `flow-repo-margin-maintenance` (it restores the tUST price and both
business dates, and the seller calls the margin back after the repurchase) and `flow-repo-reprice` (it restores the tUST
price and both business dates after the repurchase; the seller pays the Price Differential, which the top-up restores)
and `flow-repo-adjustment`, `flow-repo-substitution`, `flow-repo-income`, `flow-repo-roll`, `flow-repo-pair-off`, `flow-repo-buy-sell-back` and `flow-repo-default-close-out` (the same; the default close-out
offsets a repo with a buy/sell-back of the same size so no securities drain, and restores A's default status as it found it),
and `flow-gmsla-terms` (it restores the baseline notification time), and `flow-gmsla-loan-delivery-return` (every loan
it books is returned in full, so every balance ends where it started), and `flow-gmsla-marking` (it restores the tMMF
price, the borrower calls the margin back, and the loan is returned), and `flow-gmsla-recall` (it restores both
business dates, and every loan it books is returned in full), and `flow-gmsla-substitution` (the return after the
substitution redelivers the tAGY, so every balance ends where it started), and `flow-gmsla-rebate` (it restores both business
dates and returns its loan; the lender's tUSD falls by the rebates it pays), and `flow-gmsla-lending-fee` (the
same, with the borrower paying the fees), and `flow-gmsla-default-close-out` (two loans of the same tMMF against
tUST in opposite directions offset, so the close-out leaves every holding where it was and only the difference of the
fees moves; it restores A's default status as it found it), and `flow-triparty-terms` (it terminates the terms it
makes effective and leaves the second proposal refused). `flow-triparty-trade-start` leaves one open triparty repo per
run, `flow-triparty-revaluation` and `flow-triparty-substitution` one each, until `flow-triparty-trade-end`
ends every settled repo under the B-giver terms, returns B's collateral and terminates the terms; the next run's specs
make new B-giver terms. Since `v0.1-demo` four specs cover tokens whose record is kept off the ledger and document
provenance: `flow-registered-collateral` (a tMMF pledge and its enforcement are settled on-chain but complete only when
the transfer agent confirms its register; the spec pauses the agent with `PUT /oracle/v1/register/paused` and checks
both consoles before and after), `flow-registered-collateral-gmsla` (delivery and return of a tMMF loan, with the
delivery's ledger anchor on both parties), `flow-registered-collateral-triparty` (deposit and withdrawal of tMMF under
terms whose profile includes it) and `flow-provenance` (A seeds the fixture provenance from its console if none is
anchored, both parties read each path complete and identical, and a pledge of tMMF to bank-c is not covered by its
control agreement). The top-up before each run restores B's free balances
(`../../contracts/scripts/test-balances.json`, 20,000 tUST and 16,000 tAGY for bank-b).
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
| Store | `[store]` in `../../stack.log` | startup line only; no per-request logging | startup warning `store: no PARTY_TOKENS configured …` when started without tokens (every docs request then returns 401) |
| Gateways | `[gw-a]`, `[gw-b]`, `[gw-mkt]` | startup line only | `<METHOD> <path> failed: <message>` per failed request (contract reverts appear here); `watchSteps error: <message>` when the Besu WebSocket subscription fails |
| Services | `[svc-a]`, `[svc-b]` | startup line only | uncaught startup exceptions (stack trace). Request errors are **not** printed: they return HTTP 400 `{"error": "<message>"}`, visible in the browser devtools Network tab or the console UI. A failed gateway event-stream connection is retried every 2 s without logging |
| Console | `[console]` | Vite URL lines | Vite compile errors; browser-side errors appear in the browser devtools console |
| Console preview (`../../console/serve.sh`, run by hand) | `console/.preview.log` | the production preview | — |

State that persists across stack restarts:

| Path | Contents | Written by |
|---|---|---|
| `besu/<node>/data/` | chain database and node key | Besu |
| `../../besu/networkFiles`, `besu/.env` | genesis, validator keys, bootnode | `start-network.sh` (first run) |
| `../../contracts/deployments/besu.json` | deployment registry | `deploy:besu` |
| `store/data/<hash>.json` | CDM documents and their reader allowlists | store |
| `../../data/bank-a.db`, `data/bank-b.db` | per-party SQLite workflow store | services (run from the repository root) |

All of these paths are git-ignored.

## 7. Stop

- Everything started by `scripts/live-e2e.sh up`, keeping the chain: `bash scripts/live-e2e.sh down`.
- Store, gateways, services, console: Ctrl-C in the `../../orchestrate.mjs` terminal (stops every child).
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

Remove the Besu directories together: `start-network.sh` regenerates keys only when `../../besu/networkFiles/genesis.json`
is missing, and old `besu/<node>/data/` chain databases do not match a new genesis. The Besu containers write as
`BESU_USER` from `besu/.env`; if `rm` reports permission denied, run it with the same user or with `sudo`.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `../../orchestrate.mjs`: `missing contracts/deployments/besu.json` | contracts not deployed | section 4, step 2 |
| `../../orchestrate.mjs`: `missing services/collateral/target/collateral-service.jar` | jar not built | section 3 |
| Maven cannot resolve `local.cdmx:cdmx-java:0.0.1-SNAPSHOT` when packaging the service | extension not installed in `~/.m2` | `(cd cdm-ext && ./mvnw -q install -DskipTests)`, then package again |
| `deploy:besu`: `mkt node key not found at …` | Besu never started on this clone | section 4, step 1 |
| `[gw-*]`: `deployment registry not found at …/besu.json` | contracts not deployed | section 4, step 2, then restart step 4 |
| `[svc-*]`: `contracts/deployments/besu.json not found upward from <dir>` | service started outside the repository | run from the repository root or set `REPO_ROOT` |
| `[svc-*] exited with 1` shortly after start | startup exception; see the stack trace above the line | fix the named cause, restart step 4 |
| Service actions return 400 mentioning the store, or the store returns 401 / 403 | store token mismatch: a service or the store was restarted on its own, so its token no longer matches (tokens are minted per `../../orchestrate.mjs` run) | stop and restart `../../orchestrate.mjs` as a whole; do not restart one child |
| `Cannot find package 'viem'` from `[store]` or `[gw-*]` | Node dependencies not installed | `npm --prefix store ci`, `npm --prefix gateway ci` |
| `SyntaxError` on a type annotation in a `.ts` file | Node too old for type stripping | Node 24 (or 22.18 or later) |
| `[console]` reports `Port 5173 is in use, trying another one…` | a `../../console/serve.sh` preview started by hand holds 5173 (`scripts/live-e2e.sh up` stops it first) | use the URL printed by `[console]`, or stop the preview first: `kill -- -$(cat console/.preview.pid)` |
| Console live page shows no calls or does not update | service on 8001/8002 down, or its gateway event stream down | section 4, step 5; check `[gw-*]` for `watchSteps error` |
| `check-network.sh`: `Connection refused` | containers not running | `docker compose -f besu/docker-compose.yml ps`; `bash besu/start-network.sh` |
| Block number stays at `0x0` | fewer than three validators running | `docker compose -f besu/docker-compose.yml logs` |
| Playwright live specs `skipped` | service A not reachable on 8001 | section 4, steps 4–5 |
| `build` fails with `EPERM` on `../../console/node_modules/@esbuild/win32-x64/esbuild.exe` (Windows) | the running console dev server holds the file; `npm ci` has already emptied part of `node_modules` | `bash scripts/live-e2e.sh down`, then `build` again |

## 10. Verification status of this runbook

### 2026-11-08 — claude.ai web session (cloud workspace, 2 cores, Docker 29.9.2, JDK 21.0.12, Node 22.23)

At commit `e276f39`, following section 4 "In a claude.ai web session":

- `build` exited 0 in 2 min 40 s. Unit suites: `contracts` 83 passing, `console` 104 passed, `cdm-ext` 242,
  `../../services/collateral` 65 and `services/oracle` 13 run with 0 failures.
- The first `../../besu/start-network.sh` failed at the genesis step as described there; after the manual steps the network
  started (four nodes, peers `0x3`, four validators).
- `up` exited 0 in 96 s with the seven health checks OK and the console at HTTP 200.
- `check` with `CHROMIUM_PATH` passed all 27 live specs then present, exit 0 in 13.9 min.

At commit `3a99cb9` (`main` at `dc55bed` plus this runbook section), with `../../besu/start-network.sh` calling the Besu
binary for the genesis step (`--entrypoint /opt/besu/bin/besu`):

- `build` exited 0 in 61 s; `reset` exited 0 and removed the chain, the keys and the deployment.
- `up` exited 0 in 125 s as root on the new chain: the genesis step wrote `../../besu/networkFiles` without
  `Output directory already exists`, the script wrote `besu/.env` and the node keys, and the seven health checks were
  OK.
- `check` with `CHROMIUM_PATH` passed all 29 live specs, exit 0 in 15.2 min.

Not run in this workspace: `npm run cycle`.

### 2026-11-03 — `reset`, `up` and `check` on Windows 11 (Git Bash, Docker Desktop, Node 24.13)

- `reset`, then `up` on a fresh chain: the Besu genesis step failed until `../../besu/start-network.sh` set
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
  `../../stack.log`, gateway A's `settleByTransfer` reverted. The pledgor had 4,185,000 tUSD free, and the VM test transfers
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
returned `204` with `Access-Control-Allow-Origin: *`. Run from `../../console` on the host:

```bash
E2E_BASE_URL=http://localhost:5173 E2E_REQUIRE_STACK=1 npx playwright test e2e/live.spec.ts
```

Result: 2 passed (`flow-im-margin-call-pledge` 38.3 s, `flow-vm-margin-call-transfer` 31.7 s). Both services'
`/api/v1/state` then listed the IM and VM calls as `settled`. No IDE was involved; VS Code's `forwardPorts` handling
was not exercised.

### 2026-11-01 — dev container, created with `@devcontainers/cli` 0.90.0 on Docker Desktop (Windows 11)

A fresh checkout of commit `383a6f5`, so no Besu files, no deployment and no build output. `postCreateCommand`
(`live-e2e.sh build`) ran `npm ci` in all four packages, installed `cdm-ext` through `../../cdm-ext/mvnw` (no `mvn` in the
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

### 2026-10-30 — `../../scripts/live-e2e.sh` on Windows 11 (Git Bash, Docker Desktop)

- `up` from stopped Besu containers passed all five health checks and console `HTTP 200`; the stack kept running
  after the script exited.
- A second `up` over a running stack replaced every listening process: new PIDs on all six ports, the old processes
  gone, no port conflicts.
- `down` freed all ports and stopped the four Besu containers.
- Not run: `reset` (it deletes the chain).

### 2026-10-29 — sections 1–5 on Windows 11 (Docker Desktop, JDK 25, Node 24)

- Section 4 by hand against a persisted chain (contract redeploy skipped, `besu.json` still valid): four Besu
  containers with peers `0x3` and 2 s blocks; `../../orchestrate.mjs` started store (127 documents), both gateways, both
  services and the console; all five health checks answered.
- Section 5, Playwright live specs: both `flow-im-margin-call-pledge` and `flow-vm-margin-call-transfer` passed
  (33.5 s and 31.2 s) after the per-test timeout in `../../console/e2e/live.spec.ts` was raised to 180 s (commit `7d49e20`).

### 2026-10-26 — Linux container without Docker

Observed:

- `./mvnw install -DskipTests` in `../../cdm-ext` (run as `mvn -f cdm-ext/pom.xml install -DskipTests`) and
  `mvn -DskipTests package` in `services/collateral/` succeed in that order and produce
  `services/collateral/target/collateral-service.jar`.
- `npm ci` succeeds in `../../store` and `gateway/` on Node 22.22.
- The store starts, prints its startup line and the `no PARTY_TOKENS` warning, answers `/store/v1/health`, and returns
  401 for a docs request without a token.
- Without `../../contracts/deployments/besu.json`, the gateway and the service exit with the error messages listed in
  section 9.

Not verified in that container (no Docker): the Besu steps, `deploy:besu`, `npm run cycle`, `../../orchestrate.mjs` end to
end, and the Playwright live specs. The 2026-10-29 to 2026-10-31 entries above cover those steps.

Not verified anywhere yet: the full reset (section 8 or `live-e2e.sh reset`).
