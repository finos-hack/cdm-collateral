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
updatedAt: 2026-10-25T01:16:38Z
```
# First end-to-end cycle: scope reductions

The first cycle (`wp-first-e2e-cycle`) deliberately reduces scope against the full `task-e2e-wiring` target. Each
reduction is a known gap, not a defect:

- **Flows wired, two participants.** The full ISDA CSA lifecycle is wired for both initial and variation margin
  (commits `a1c8708`/`11cd42f`): agree-in-full / partial / dispute responses, proposal accept / reject with
  re-propose, IM pledge and VM title transfer, and three-step returns (release escrow or transfer back). All seven
  paths fold to an identical cross-party `MarginCallState` against the live stack, and a proposal may carry several
  tokens — multi-asset proposal and settlement are wired (commit `9a5c8e1`). Remaining reduction: the two ISDA CSA
  agreements (IM, VM) are wired while the other agreement families in the analysis (repo, securities lending,
  triparty, CCP) are not.
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
  document from the store, verifies `keccak256(document)` against the on-chain hash, and folds the result. The gateway
  now pushes on-chain events over Server-Sent Events (eth_subscribe over the Besu ws), relayed to the console through
  the service, so state changes push instead of being polled (commit `688ba4b`). The store no longer trusts an asserted
  party header: each party authenticates with a per-party bearer token (`STORE_TOKEN`), the store resolves it to that
  party's address and enforces the per-document allowlist, and it fails closed with no tokens configured (commit
  `ac6474a`). Remaining reduction on the carrier: the store is a single shared instance and the scheme is a
  shared secret (the store is the trusted verifier) — production would use mutual TLS or signed requests, and per-party
  or content-addressed (IPFS) stores. The oracle service is not run; prices are on the on-chain feed from deploy.
- **Finality.** A mined QBFT receipt is treated as final; no explicit finalized-block confirmation beyond the receipt.
