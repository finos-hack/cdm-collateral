```yaml
id: artifact-collateral-service
name: Collateral workflow service
kind: application
location: services/collateral/
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: 24bd077f551581c621a2d292b02f359e99aa3f75
  contentHash: 24bd077f551581c621a2d292b02f359e99aa3f75
  timestamp: 2026-10-24T20:12:31Z
  confidence: 0.8
createdAt: 2026-10-24T20:12:31Z
updatedAt: 2026-10-24T21:10:54Z
```
# Collateral workflow service

Off-chain margin workflow service (`services/collateral/`, Java 21 + Javalin) realizing architecture node
`collateral-service` and ADR `wp-adr-java-cdm-stack`; one instance per participant (ADR
`wp-adr-per-participant-services`). It exposes the margin-call lifecycle REST API the party console calls
(`/api/v1`), builds CDM message content, records it in a per-participant SQLite workflow store (`./data/<node>.db`),
and submits ledger instructions to that participant's gateway. Call and pledge state live on-chain and are read back
through the gateway.

First-cycle scope (see `nw-e2e-first-cycle-scope`): implements `flow-im-margin-call-pledge`. CDM content is carried as
CDM-field-named canonical JSON (`MarginCallIssuance`, `MarginCallResponse`, `CollateralProposal`) hashed with SHA-256
to the bytes32 recorded on-chain; full `org.finos.cdm:cdm-java` / `cdm-ext` object binding is deferred. The two
parties' services share state through the chain rather than the `service-to-peer-service` CDM exchange, and the
oracle service is not run (prices are on the on-chain feed from deploy).

Verified locally (source `24bd077f551581c621a2d292b02f359e99aa3f75`): the shaded jar builds under Maven; two instances
(A pledgor 8001, B secured party 8002) drive the full cycle through `/api/v1` and record CDM messages in SQLite, with
balances reflecting on-chain escrow.
