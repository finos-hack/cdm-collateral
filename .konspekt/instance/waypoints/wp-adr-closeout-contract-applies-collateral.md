```yaml
id: wp-adr-closeout-contract-applies-collateral
kind: decision
subtype: adr
timestamp: 2026-11-06T14:41:19Z
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 3ed9a6ece72bb47fe574147df6e1dd2aae5fafee
  contentHash: 3ed9a6ece72bb47fe574147df6e1dd2aae5fafee
  timestamp: 2026-11-06T14:41:19Z
  confidence: 0.7
createdAt: 2026-11-06T14:41:19Z
updatedAt: 2026-11-06T14:41:19Z
```
# ADR: at close-out the control contract chooses the collateral applied

For `flow-close-out-netting` ([[task-csa-close-out-netting]], G15), the secured party's service computes the CDM
`CloseOutStatement` with cdm-ext `CloseOutNetting` (ISDA 2002 MA Section 6(e)) and passes the contract only the Early
Termination Amount owed by the pledgor (0 when it is not positive) and the statement's hash. `CollateralControl.closeOut`
then chooses the collateral applied: the pledged tokens in the order first pledged, each in whole units rounded up at
its value after haircut at the feed price, until the amount owed is covered. It transfers those units to the secured
party and returns the rest of the escrow to the pledgor in the same transaction, and requires the pledgor's default on
the oracle feed.

**Context.** Under the security interest of the IM CSA the secured party applies the collateral to what it is owed and
returns any surplus. Tokens are indivisible units, so the value applied cannot equal the statement's
`collateralApplied` exactly. A rule fixed in the contract lets both parties recompute what was applied from the chain
alone, and keeps the secured party from taking more than one unit beyond the amount owed.

**Consequences.**
- The value applied on-chain can exceed the statement's `collateralApplied` by less than one unit of the last token
  applied; both values are reported (`appliedUsd` and `collateralAppliedUsd`).
- The secured party does not choose which assets it keeps; realisation of the applied assets and their market value are
  outside the prototype.
- One Close-out Amount for the whole netting set, no Unpaid Amounts, whole USD (prototype reductions).
- A close-out, like an enforcement, empties the pair's escrow, so revaluation restarts after it.
