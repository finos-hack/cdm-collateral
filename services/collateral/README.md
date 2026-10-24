# Collateral workflow service

Off-chain margin workflow service, one instance per participant (architecture node `collateral-service`, ADR
`wp-adr-java-cdm-stack`, ADR `wp-adr-per-participant-services`). Java 21 + Javalin; a SQLite workflow store per
participant; an HTTP client to that participant's ledger gateway. Exposes the margin-call lifecycle REST API the party
console calls (`/api/v1`), builds CDM message content, records it in the store, and submits ledger instructions to the
gateway. Call and pledge state live on-chain; the service reads it back through the gateway.

Part of `task-e2e-wiring`.

## First-cycle scope

This instance implements `flow-im-margin-call-pledge` (issue → respond → propose → decide → pledge). Deferred, and
tracked as open items:

- **CDM binding.** Message content is built as CDM-field-named canonical JSON (`MarginCallIssuance`,
  `MarginCallResponse`, `CollateralProposal`) and hashed; the hash is the bytes32 recorded on-chain. Full
  `org.finos.cdm:cdm-java` object binding and the local `cdm-ext` lifecycle types (the committed target, ADR
  `wp-adr-java-cdm-stack`) are not yet wired into this service.
- **Hash algorithm.** The on-chain CDM hash is SHA-256 over the canonical JSON, not keccak-256. No verifier recomputes
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
