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
updatedAt: 2026-10-24T23:08:58Z
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
  can recompute it. The steps are also folded into a cumulative, validated `MarginCallState` via
  `Create_MarginCallState`, and both parties' folds converge to an identical state (commit `2494e39`); this reduction
  is lifted.
- **CDM carrier, no oracle service.** The two parties exchange CDM content through the on-chain step hash plus a
  content-addressed payload store (Pattern A, ADR `wp-adr-cdm-payload-carrier`, commits `6530b14`/`3a89b7c`/`2494e39`),
  not a direct `service-to-peer-service` channel. Each party reads the ordered step hashes from the chain, fetches each
  document from the store, verifies `keccak256(document)` against the on-chain hash, and folds the result. Remaining
  reductions on the carrier: the store is a single shared instance with asserted (not authenticated) party identity,
  and the gateway reports no events webhook yet (parties poll). The oracle service is not run; prices are on the
  on-chain feed from deploy.
- **Finality.** A mined QBFT receipt is treated as final; no explicit finalized-block confirmation beyond the receipt.
