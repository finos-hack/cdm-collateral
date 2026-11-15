```yaml
id: task-sme-reconciliation-rules
type: task
title: Confirm with a business SME the matching rules, tolerances and cadence for portfolio reconciliation
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;Ka4WSnHugzpj6DbmeXEwMD4u-AXWVOlgljgpfVIoK6I
  timestamp: 2026-11-07T18:37:24Z
  confidence: 0.65
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 9a57e2d1cdefdaf5914d764b3e69381646e0560d
    contentHash: 9a57e2d1cdefdaf5914d764b3e69381646e0560d
createdAt: 2026-11-07T18:37:24Z
updatedAt: 2026-11-07T18:41:40Z
```
# Task: confirm the matching rules, tolerances and cadence for portfolio reconciliation

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-allocation-ranking]] and
[[task-sme-allocation-concentration]]. The project owner chose the scope for [[task-csa-reconciliation]] on 2026-11-07
([[wp-adr-reconciliation-scope]]). Questions for the SME:

1. **Key economic fields.** Which fields must match for a trade to reconcile: the ADR uses product, notional and
   currency, effective and termination dates, fixed rate, floating index, and payer and receiver. Are others required
   (business day conventions, day count, the next payment or reset date)?
2. **Valuation tolerance.** What difference in a trade's valuation counts as a break: an absolute amount, a percentage
   of the larger valuation, or both? Is the tolerance set per trade, per portfolio, or in the CSA?
3. **Cadence.** How often do counterparties reconcile in practice (EMIR and UMR set daily, weekly or quarterly by
   portfolio size)? Should the prototype reconcile on request only, or on a schedule?
4. **Breaks and disputes.** Which breaks justify disputing a call (any economic mismatch, or only a valuation or
   exposure difference above a threshold)? Is a dispute raised only when answering a call, or also against a call
   already agreed?
5. **Snapshot timing.** Must both snapshots share one as-of time (for example the valuation date of the call), and
   what happens when one party's snapshot is late?
