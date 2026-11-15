```yaml
id: task-sme-allocation-ranking
type: task
title: Confirm with a business SME the ranking and rules for collateral allocation
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;AsXYIUINnDpedbLb-zp9HWAHvvl0Ycp3ykWPLDkSZCE
  timestamp: 2026-11-07T13:52:51Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: b276b4a7ca75f9adc407b9c513b5477ad0418f4c
    contentHash: b276b4a7ca75f9adc407b9c513b5477ad0418f4c
createdAt: 2026-11-07T13:52:51Z
updatedAt: 2026-11-07T18:15:45Z
```
# Task: confirm the ranking and rules for collateral allocation

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-call-cancellation-rules]],
[[task-sme-interest-daily-balances]] and [[task-sme-settlement-netting-rules]]. The project owner chose the scope for
[[task-csa-allocation]] on 2026-11-07 ([[wp-adr-allocation-scope]]). Questions for the SME:

1. **Default ranking.** The pledgor supplies the order; the default is the registry order. Which default do pledgors
   use in practice: lowest haircut first, highest haircut first (keep high-value assets), funding cost, or another
   cheapest-to-deliver measure?
2. **Rounding.** The last asset is rounded up to whole units. Is overshooting the agreed amount by less than one
   unit's value acceptable, or is a minimum transfer or rounding amount from the CSA applied instead?
3. **Concentration limits.** The allocation does not apply concentration limits yet. Should a suggestion respect the
   schedule's limits against the collateral already held?
4. **Calls covered.** Suggestions are offered for new IM and VM calls only. Does allocation apply to substitution or to
   returns chosen by the secured party?
5. **Cash in the default order.** The registry order puts tUSD (cash) last, so a large call uses cash only after tUST
   and tMMF run out. Should cash come first, last, or be excluded from suggestions unless the pledgor ranks it?
   (Added on the project owner's instruction, 2026-11-07, source `b94ecf05be6e7d479e2ec32ca6f413bdcfb74679`.)
