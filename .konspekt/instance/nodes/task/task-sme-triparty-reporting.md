```yaml
id: task-sme-triparty-reporting
type: task
title: Confirm with a business SME the triparty agent's report to both parties
status: open
review: accepted
provenance:
  conversationId: triparty-reporting
  sourceRef: ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w
  timestamp: 2026-11-12T13:55:00Z
  confidence: 0.55
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 8816e213ab23a58fce8e77558228fcd381a4d8f5
    contentHash: 8816e213ab23a58fce8e77558228fcd381a4d8f5
createdAt: 2026-11-12T13:55:00Z
updatedAt: 2026-11-12T20:48:00Z
```
# Task: confirm the triparty agent's report to both parties

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-triparty-trade-end]]. The maintainer proposed the
design for [[task-triparty-reporting]] on 2026-11-12 ([[wp-adr-triparty-reporting]], awaiting review). The report's
content is an assumption stated from model memory of triparty repo practice, not checked against an agent's report.
Questions for the SME:

1. The agent reports all settled repos under one set of terms with the giver's free collateral in one report. Do agents report per repo, per terms, or per giver and receiver across their repos?
2. The report states the exposure as the Repurchase Price accrued to the day. Is that the exposure agents report, or the value the parties gave them?
3. The report states each asset's price, haircut and value after haircuts, and whether the repo is covered. Which fields do the giver and the receiver use to reconcile, and in which format (for example ISO 20022 colr messages)?
4. The giver's free collateral is reported to both parties. Is the giver's unallocated inventory shown to the receiver?
5. The agent reports on request in the prototype. How often and at which cut-offs do agents report?
