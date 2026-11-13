```yaml
id: artifact-e2e-runbook
name: End-to-end stack runbook
kind: document
location: docs/setup/runbook-e2e.md
review: accepted
provenance:
  conversationId: e2e-runbook
  sourceRef: 1bf15826f5f85f9c9eae3457462a1fc31140be9c
  contentHash: 1bf15826f5f85f9c9eae3457462a1fc31140be9c
  timestamp: 2026-10-26T11:56:19Z
  confidence: 0.75
createdAt: 2026-10-26T11:56:19Z
updatedAt: 2026-10-26T11:56:19Z
```
# End-to-end stack runbook

Operator runbook for the live end-to-end stack (`../../../docs/setup/runbook-e2e.md`): component and port table with health checks;
prerequisites; one-time build (Node dependencies, `cdm-ext` install into `~/.m2`, service jar); start order (Besu
network, contract deploy, optional `npm run cycle` chain/gateway check, `orchestrate.mjs` for store, gateways,
services and console); manual and Playwright flow driving; per-component log locations and error formats; on-disk
state; stop and full reset; troubleshooting keyed on observed error messages.

Verified in a container without Docker (2026-10-26): the `cdm-ext` install and service package succeed in that order;
`npm ci` in `store/` and `gateway/` on Node 22.22; store startup, health and 401 without a token; gateway and
service startup errors without `besu.json`. Not verified there: the Besu steps, `deploy:besu`, `orchestrate.mjs` end
to end, and the live Playwright specs.

Records one previously undocumented prerequisite: the collateral service depends on `local.cdmx:cdmx-java`, so
`cdm-ext` must be installed (`./mvnw install`) before `mvn package` in `services/collateral/`.
