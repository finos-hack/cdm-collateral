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

## First-cycle scope

This instance implements `flow-im-margin-call-pledge` (issue → respond → propose → decide → pledge). Each party folds
the chain-ordered steps into a shared `MarginCallState` and the two folds converge (see "Payload carrier and
cumulative fold"). The response states indicative collateral (the actual assets are chosen at proposal time).
Deferred, and tracked as open items:

- **CDM carrier.** The two parties exchange CDM content through the chain hash plus the content-addressed store, not a
  direct `service-to-peer-service` channel; the store is a single shared instance with asserted (not authenticated)
  party identity. The oracle service is not run; prices are already on the on-chain feed from deploy.
- **Pledge.** Single-asset pledge per call.

## Prerequisites

- Besu running and contracts deployed (`contracts/deployments/besu.json` present).
- A ledger gateway running for this participant (`gateway/`), reachable at `GATEWAY_URL`.

## Build and run

```
mvn -DskipTests package                      # builds target/collateral-service.jar (shaded)
PARTY_ID=A NODE=bank-a ROLE=Pledgor PORT=8001 GATEWAY_URL=http://localhost:8201 \
  java -jar target/collateral-service.jar
PARTY_ID=B NODE=bank-b ROLE="Secured Party" PORT=8002 GATEWAY_URL=http://localhost:8202 \
  java -jar target/collateral-service.jar
```

Run from the repository root (or set `REPO_ROOT`) so the service finds `contracts/deployments/besu.json`. The store
file is `./data/<node>.db`.

## REST API (`/api/v1`)

`GET /context`, `GET /state`, `POST /calls`, `POST /calls/{id}/response`, `POST /calls/{id}/proposal`,
`POST /calls/{id}/decision`, `POST /calls/{id}/pledge`, `GET /calls/{id}/cdm-state` (the cumulative fold; kept off the
hot `/state` poll because the fold scans the chain and the store). The console's live mode (`console` route
`#/live/A|B`) calls these; see `console/src/domain/liveApi.ts`.
