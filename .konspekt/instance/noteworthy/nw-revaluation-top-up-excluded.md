```yaml
id: nw-revaluation-top-up-excluded
kind: decision
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: ccf19a7ba620e62c91c5113cd2408a7f5b6c9d82
  contentHash: ccf19a7ba620e62c91c5113cd2408a7f5b6c9d82
  timestamp: 2026-11-03T16:24:46Z
  confidence: 0.7
createdAt: 2026-11-03T16:24:46Z
updatedAt: 2026-11-03T16:24:46Z
```
# Decision: top-up calls do not count toward the revaluation requirement

This note covers how [[wp-adr-revaluation-outstanding-im-from-calls]] is implemented.

**Top-up calls.** A top-up IM call settles as an IM call. Counted as written, it would raise the requirement by its own
amount, its collateral would raise the value by about the same amount, and the shortfall would never close.
- The console's "Issue top-up IM call" button sends `purpose: "top-up"`.
- The issuing service records the tag in its own workflow store (table `call_purpose`).
- The revaluation leaves tagged calls out of the requirement.

The tag is off-chain and held only by the secured party, so the pledgor's service computes a higher requirement. Both
of these change if [[task-revaluation-top-up-modelling]] selects a dedicated top-up call kind with its own on-chain
record (option 2).

**Enforcement.** "Excluding enforced calls" is implemented as counting only calls settled after the pair's last
`Enforced` event. The gateway reads these events through `GET /ledger/v1/settlement-history`. Enforcement seizes the
pair's whole escrow and leaves every call state unchanged, so the cut-off has to be the enforcement block, not the
enforced call.
