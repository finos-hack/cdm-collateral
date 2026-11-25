```yaml
id: nw-decision-phase1-replay-fixes
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;II9xdIJ4lnk7xHWyWXGcl6s1YumqCaUYSxlf6W_Z6wg
  timestamp: 2026-11-25T02:28:00Z
  confidence: 0.85
createdAt: 2026-11-25T02:28:00Z
updatedAt: 2026-11-25T02:28:00Z
```
# Decision: phase 1 fixes replay findings 1 to 8; deal-specific schedules stay in deal state

Answers by the project owner (2026-11-24):

1. Phase 1 fixes findings 1 to 8 of `docs/analysis/replay-determinism-review.md` (live prices, live haircuts, GMSLA
   mark re-derivation, local business date, local time-zone dates, clock-based dates in enforcement and reclaim,
   clock-based deadlines, non-reproducible build).
2. Deal-specific eligibility and haircut schedules stay inside the deal's encrypted state and are not committed in
   the public reference data registry.

The owner numbered the second answer "3"; it is taken to answer the second question asked, the only other one open.
