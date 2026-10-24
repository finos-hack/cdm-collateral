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
that JSON in the store, and takes the on-chain `cdmHash` over it. The CDM `callIdentifier` is derived from the shared
on-chain callId so both parties name the same call without peer messaging (`Cdm.cdmCallId`). See `Cdm.java`.

## First-cycle scope

This instance implements `flow-im-margin-call-pledge` (issue → respond → propose → decide → pledge). Deferred, and
tracked as open items:

- **Stateful CDM fold.** Steps are validated individually rather than folded into a shared `MarginCallState` via
  `Create_MarginCallState`; that cumulative state is what `service-to-peer-service` CDM exchange would carry, which
  this cycle omits. The response states indicative collateral (the actual assets are chosen at proposal time).
- **Hash algorithm.** The on-chain CDM hash is SHA-256 over the Rune JSON, not keccak-256. No verifier recomputes
  it in this flow; aligning the algorithm across the on-chain/off-chain verifiers is a separate task.
- **Peer messaging.** The two parties' services share call state through the chain (each reads the margin call
  contract via its gateway) rather than the `service-to-peer-service` CDM exchange. The oracle service is not run;
  prices are already on the on-chain feed from deploy.
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
`POST /calls/{id}/decision`, `POST /calls/{id}/pledge`. The console's live mode (`console` route `#/live/A|B`) calls
these; see `console/src/domain/liveApi.ts`.
