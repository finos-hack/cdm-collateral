```yaml
id: task-sme-allocation-concentration
type: task
title: Confirm with a business SME how concentration limits apply to a suggested collateral basket
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: 844ed07f9135d9e47306d591ccfec3e236390623
  contentHash: 844ed07f9135d9e47306d591ccfec3e236390623
  timestamp: 2026-11-07T18:27:28Z
  confidence: 0.7
createdAt: 2026-11-07T18:27:28Z
updatedAt: 2026-11-07T18:32:00Z
```
# Task: confirm how concentration limits apply to a suggested basket

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-allocation-ranking]]. [[task-csa-allocation]] left
concentration limits out of scope ([[wp-adr-allocation-scope]]); gap G34 stays partial until they are covered. The
project owner asked for this as an SME task on 2026-11-07. Questions for the SME:

1. **Which limits.** Which concentration limits does a CSA eligibility schedule carry in practice: a share of the
   total collateral per asset, per issuer, per asset class, or an absolute amount?
2. **Measured against what.** Is a limit tested against the collateral already held plus the new basket, against the
   agreed amount of the call, or against the total credit support amount?
3. **Value basis.** Is the limit applied to market value or to value after haircuts?
4. **Breach handling.** When the ranked inventory would breach a limit, does the allocation skip to the next ranked
   asset, cap the asset at the limit, or reject the suggestion? Is an existing breach (after a price move) corrected
   by the next call?

The answers decide the CDM change in `cdmx.collateral.allocation` (a limit on `AllocationCandidate` or a separate
schedule input) and a follow-up build task.
