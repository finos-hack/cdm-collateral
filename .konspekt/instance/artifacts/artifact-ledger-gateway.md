```yaml
id: artifact-ledger-gateway
name: Ledger gateway
kind: application
location: gateway/
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: ni:///sha-256;JSEksj1FDFsJXCHBJMaVy5nn08H1Zgw6sEftIyRItKk
  timestamp: 2026-10-24T20:12:31Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 24bd077f551581c621a2d292b02f359e99aa3f75
    contentHash: 24bd077f551581c621a2d292b02f359e99aa3f75
createdAt: 2026-10-24T20:12:31Z
updatedAt: 2026-10-24T21:10:54Z
```
# Ledger gateway

Ledger-neutral gateway (`gateway/`, TypeScript + viem, run by Node 24) realizing ASR
`concept-asr-ledger-neutrality` and ADR `wp-adr-prototype-ledgers`. One instance per participant: it loads only that
participant's Besu node key (`besu/<node>/data/key`) and signs every write with it. The `LedgerAdapter` interface
(`src/besu.ts`) is the seam a second ledger would implement; `BesuAdapter` submits the margin-call lifecycle
(issue, respond, propose, decide, approve+pledge) over the node's JSON-RPC and waits for the mined receipt as finality
(`concept-asr-settlement-finality`). The HTTP server (`src/server.ts`, `/ledger/v1`) is what the collateral workflow
service and the console call; `src/run-cycle.ts` drives the full IM pledge happy path and asserts on-chain state.

Verified locally (source `24bd077f551581c621a2d292b02f359e99aa3f75`): `run-cycle.ts` against the running Besu network
asserts call settled, proposal accepted, 60,000 tUST escrowed and the pledgor balance reduced; the HTTP endpoints
serve two participant gateways (bank-a 8201, bank-b 8202) used by the services and the live console test.
