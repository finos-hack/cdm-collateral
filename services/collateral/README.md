# Collateral workflow service

Off-chain margin workflow service, one instance per participant (architecture node `collateral-service`, ADR
`wp-adr-java-cdm-stack`, ADR `wp-adr-per-participant-services`). Java 21 + Javalin; a SQLite workflow store per
participant; an HTTP client to that participant's ledger gateway. Exposes the margin-call lifecycle REST API the party
console calls (`/api/v1`), builds CDM message content, records it in the store, and submits ledger instructions to the
gateway. Call and pledge state live on-chain; the service reads it back through the gateway.

Part of `task-e2e-wiring`.

## CDM binding

Each lifecycle message is a real CDM object: one `MarginCallInstruction` step from the local extension
(`local.cdmx:cdmx-java`, built from `cdm-ext`) over FINOS CDM 7.7.0 types. `CdmRuntime` holds the CDM Guice injector,
the `RuneJsonObjectMapper` and the `RosettaTypeValidator`, mirroring the extension's own test runtime. For every step
(`issue`, `respond`, `propose`, `decide`, `settle`) the service builds the instruction, validates it (all CDM and
extension conditions — an invalid document never reaches the ledger), serialises it to canonical Rune JSON, records
that JSON in the store, and takes the on-chain `cdmHash` as keccak-256 over it (Ethereum/EVM hashing, so a contract or
counterparty can recompute it). The CDM `callIdentifier` is derived from the shared on-chain callId so both parties
name the same call without peer messaging (`Cdm.cdmCallId`). See `Cdm.java`.

## Payload carrier and cumulative fold

The chain carries only the 32-byte keccak `cdmHash` per step; the CDM document itself lives off-chain in a
content-addressed payload store keyed by that hash (ADR `wp-adr-cdm-payload-carrier`). As each step is built, the
service posts the Rune JSON to the store under its hash (`PayloadStore.put`, `App.record`). A party reconstructs the
full lifecycle from the chain and the store, not from direct peer messaging: it reads the ordered step hashes from the
gateway (`GET /ledger/v1/calls/{id}/steps`), fetches each document from the store, verifies `keccak256(document)`
equals the on-chain hash, then folds the ordered `MarginCallInstruction` steps into a cumulative, validated
`MarginCallState` with `Create_MarginCallState` (`CdmFold.fold`). The fold runs CDM's full cross-party validation
(response matches the call, settlement covers the agreed amount, steps in order). Because both parties fold the same
chain-ordered documents through the same function, they derive an identical `MarginCallState` — verified by comparing
the keccak `stateHash` across both services. See `GET /api/v1/calls/{id}/cdm-state`.

The fold also builds each step's CDM `LedgerAnchor` (gap G25, `nw-ledger-anchor-redesign`; `CdmAnchors`): from the
same `steps` response, each step's transaction, contract, status and the other events of its transaction
(`Create_LedgerAnchor`), with the document hash computed from the payload. The anchors are kept apart from the
`MarginCallState`, so `stateHash` does not change. `cdm-state` returns each step's anchor status
(`MarginCallStepAnchorStatus`: Missing, Pending, Complete or Failed), `anchored` (every step Complete) and the keccak
`anchorHash` of the anchors, which is equal on both services.

## Flows

The service drives the full ISDA CSA lifecycle for both initial and variation margin:

- **Response paths.** Agree in full, agree in part, or dispute (`MarginCallResponseTypeEnum`). A full dispute is
  terminal (nothing to settle); a partial agreement settles the agreed part and records the disputed remainder.
- **Proposal paths.** The receiving party accepts or rejects a collateral proposal; a rejection lets the delivering
  party propose again.
- **Settlement.** Initial margin pledges into the control contract's escrow (`/pledge`); variation margin passes
  title directly (`/transfer`). A proposal may carry several tokens; the gateway approves and moves each. Both fold as
  a delivery lifecycle (issue → respond → propose → decide → settle).
- **Returns.** A return call is issued, agreed through the response step, then settled by releasing escrowed IM
  (`via=release`) or transferring equivalent VM back (`via=transfer`) — a three-step lifecycle
  (issue → respond → settle) that folds like a delivery. See `Cdm.settleReturn`.

Each party folds the chain-ordered steps into a shared `MarginCallState` and the two folds converge (see "Payload
carrier and cumulative fold"). The response states indicative collateral (the actual assets are chosen at proposal
time). Deferred, and tracked as open items:

- **CDM carrier.** The two parties exchange CDM content through the chain hash plus the content-addressed store, not a
  direct `service-to-peer-service` channel. Each party authenticates to the store with a per-party bearer token
  (`STORE_TOKEN`); the store resolves the token to that party's address and enforces the per-document allowlist against
  it, so a party cannot read another's documents by asserting an identity header. Remaining reduction: the store is a
  single shared instance and the scheme is a shared secret (the store is the trusted verifier) — production would use
  mutual TLS or signed requests, and per-party or content-addressed (IPFS) stores. The oracle service is not run;
  prices are already on the on-chain feed from deploy.
- **Scope.** The two ISDA CSA agreements (IM, VM) are wired, with multi-asset proposals and settlement; the other
  agreement families in the analysis (repo, securities lending, triparty, CCP) are not.

## Prerequisites

- Besu running and contracts deployed (`contracts/deployments/besu.json` present).
- A ledger gateway running for this participant (`gateway/`), reachable at `GATEWAY_URL`.

## Build and run

```
mvn -DskipTests package                      # builds target/collateral-service.jar (shaded)
PARTY_ID=A NODE=bank-a ROLE=Pledgor PORT=8001 GATEWAY_URL=http://localhost:8201 STORE_TOKEN=<token-a> \
  java -jar target/collateral-service.jar
PARTY_ID=B NODE=bank-b ROLE="Secured Party" PORT=8002 GATEWAY_URL=http://localhost:8202 STORE_TOKEN=<token-b> \
  java -jar target/collateral-service.jar
```

Run from the repository root (or set `REPO_ROOT`) so the service finds `contracts/deployments/besu.json`. The store
file is `./data/<node>.db`. `STORE_TOKEN` is this party's bearer token for the payload store; the store fails closed, so
it must match an entry in the store's `PARTY_TOKENS` map. `orchestrate.mjs` mints both tokens per run and wires them to
the store and the two services, so the full stack needs no manual token setup.

## REST API (`/api/v1`)

`GET /context`, `GET /state`, `POST /calls` (body `replacesCallId` names a cancelled call the new call replaces; the
service checks it on-chain and with cdm-ext `ReplacementAllowed`, `flow-call-replacement`), `POST /calls/{id}/response`, `POST /calls/{id}/proposal`,
`POST /calls/{id}/decision`, `POST /calls/{id}/pledge` (IM settle), `POST /calls/{id}/transfer` (VM settle),
`POST /calls/{id}/return` (return settle; body `via` = `release` | `transfer`), `POST /calls/{id}/withdraw` (body
`reason`; the calling party, unanswered call), `POST /calls/{id}/cancellation` (body `reason`; either party, answered call
not settled) and `POST /calls/{id}/cancellation/decision` (body `accept`, `reason`; the other party): each builds the
cdm-ext step (`WithdrawCall`, `RequestCancellation`, `DecideCancellation`) that the fold applies
(`flow-call-cancellation`), `GET /calls/{id}/cdm-state` (the
cumulative fold; kept off the hot `/state` poll because the fold scans the chain and the store),
`GET /close-outs` and `POST /close-outs` (body `closeOutAmountUsd`; secured party: default notice if needed, CDM
`CloseOutStatement` from cdm-ext `CloseOutNetting`, then `closeOut` on-chain; the listing fetches each statement by its
on-chain hash and recomputes it, `verified`), `GET /substitutions`, `POST /substitutions` (body `original`,
`substitute`; pledgor), `POST /substitutions/{id}/decision` (body `consent`, `reason`; secured party),
`POST /substitutions/{id}/settle` (pledgor) and `GET /substitutions/{id}/cdm-state` (the steps folded through cdm-ext
`Create_CollateralSubstitution` with the escrow read at the block before each step and kept in the store, since the
node serves state for recent blocks only), `GET /interest`, `POST /interest` (body `periodStart`, `periodEnd`,
`observedRatePct`; secured party: CDM `CollateralInterestStatement` from cdm-ext `Create_CollateralInterestStatement` on
the pledgor's tUSD in escrow under the agreement's `CollateralInterestParameters` in `CdmInterest`, then `stateInterest`
on-chain; the listing fetches each statement by its on-chain hash and recomputes it, `verified`),
`POST /interest/{id}/pay` (pledgor, negative amount), `GET /agreement` (the IM CSA terms in force: CDM's sample
2018 NY law IM CSA with BANK-B as Party1 and BANK-A as Party2 and an MTA of USD 500,000, folded in `CdmAgreement` over
the pair's agreed amendments, each fetched by its on-chain hash and verified; with the contract's agreement hash and
haircuts beside them, `verified`), `POST /amendments` (body `mtaUsd`, `haircuts` [{`token`, `eligible`,
`haircutBps`}]; either party: CDM `CollateralAgreementAmendment` from cdm-ext `Create_CollateralAgreementAmendment`,
then `proposeAmendment` on-chain), `POST /amendments/{id}/decision` (body `consent`; the other party verifies the
amendment and that the on-chain haircut terms are its changes before consenting), and
`GET /api/v1/events` — a Server-Sent Events stream the console subscribes to instead of polling. The service relays
its gateway's chain-event stream (Besu ws → gateway → service → console), so each on-chain step pushes a refresh.
The console's live mode (`console` route `#/live/A|B`) calls these; see `console/src/domain/liveApi.ts`.
