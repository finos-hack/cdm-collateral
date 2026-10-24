```yaml
id: nw-e2e-first-cycle-scope
kind: constraint
review: proposed
provenance:
  conversationId: e2e-wiring
  sourceRef: 24bd077f551581c621a2d292b02f359e99aa3f75
  contentHash: 24bd077f551581c621a2d292b02f359e99aa3f75
  timestamp: 2026-10-24T20:12:31Z
  confidence: 0.8
createdAt: 2026-10-24T20:12:31Z
updatedAt: 2026-10-24T22:19:05Z
```
# First end-to-end cycle: scope reductions

The first cycle (`wp-first-e2e-cycle`) deliberately reduces scope against the full `task-e2e-wiring` target. Each
reduction is a known gap, not a defect:

- **One flow, two participants.** Only `flow-im-margin-call-pledge` (full agreement, single token tUST), bank-a
  pledgor and bank-b secured party. The other four CALM flows, partial-agreement / dispute / rejection paths, and
  multi-token pledges are not yet wired.
- **CDM content shape.** The collateral service binds each lifecycle message to a real FINOS CDM 7.7.0 object — one
  `MarginCallInstruction` step from the local extension (`cdm-ext` / `local.cdmx:cdmx-java`) — validated with
  `RosettaTypeValidator` and serialised to canonical Rune JSON (ADR `wp-adr-java-cdm-stack`; done in commit `8d2bba1`).
  The on-chain `cdmHash` is keccak-256 over that Rune JSON (commit `aa342a9`), so an on-chain contract or counterparty
  can recompute it. One reduction remains: steps are validated individually rather than folded into a shared
  `MarginCallState` via `Create_MarginCallState` (that cumulative state is what `service-to-peer-service` CDM exchange
  would carry, which this cycle omits).
- **No peer messaging, no oracle service.** The two services share call state through the chain (each reads the
  margin call contract via its gateway) instead of the `service-to-peer-service` CDM exchange. The oracle service is
  not run; prices are on the on-chain feed from deploy, and the gateway reports no events webhook yet.
- **Finality.** A mined QBFT receipt is treated as final; no explicit finalized-block confirmation beyond the receipt.
