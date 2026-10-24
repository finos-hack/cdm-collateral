```yaml
id: nw-e2e-first-cycle-scope
kind: constraint
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
# First end-to-end cycle: scope reductions

The first cycle (`wp-first-e2e-cycle`) deliberately reduces scope against the full `task-e2e-wiring` target. Each
reduction is a known gap, not a defect:

- **One flow, two participants.** Only `flow-im-margin-call-pledge` (full agreement, single token tUST), bank-a
  pledgor and bank-b secured party. The other four CALM flows, partial-agreement / dispute / rejection paths, and
  multi-token pledges are not yet wired.
- **CDM content shape.** The collateral service builds CDM-field-named canonical JSON and hashes it with SHA-256 to
  the on-chain bytes32. Full `org.finos.cdm:cdm-java` object binding and the `cdm-ext` lifecycle types (ADR
  `wp-adr-java-cdm-stack`) are deferred. The hash is SHA-256, not keccak-256; no verifier recomputes it in this flow,
  so algorithm alignment across on-chain/off-chain verifiers is a separate task.
- **No peer messaging, no oracle service.** The two services share call state through the chain (each reads the
  margin call contract via its gateway) instead of the `service-to-peer-service` CDM exchange. The oracle service is
  not run; prices are on the on-chain feed from deploy, and the gateway reports no events webhook yet.
- **Finality.** A mined QBFT receipt is treated as final; no explicit finalized-block confirmation beyond the receipt.
