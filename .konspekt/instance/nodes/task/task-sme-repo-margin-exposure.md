```yaml
id: task-sme-repo-margin-exposure
type: task
title: Confirm with a business SME the GMRA exposure and Net Margin rules of repo margin maintenance
status: open
review: accepted
provenance:
  conversationId: repo-margin-maintenance
  sourceRef: ni:///sha-256;DVI37LCvFDCXGVR2AhM7BTgkWX1L0cIbDe3tZK4IC00
  timestamp: 2026-11-08T14:58:07Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: d7075ebf2ed8b09469e486de0a8c51320ad977a7
    contentHash: d7075ebf2ed8b09469e486de0a8c51320ad977a7
createdAt: 2026-11-08T14:58:07Z
updatedAt: 2026-11-08T14:58:07Z
```
# Task: confirm the GMRA exposure and Net Margin rules of repo margin maintenance

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-two-way-im-rules]]. The project owner placed this in
the SME backlog on 2026-11-08 (source `d7075ebf2ed8b09469e486de0a8c51320ad977a7`: "add to \"pending SME\" backlog"). The details below are the maintainer's
assumptions in [[wp-adr-repo-margin-maintenance]], built in [[task-repo-margin-maintenance]]. Questions for the SME:

1. **Transaction Exposure.** Is it the Repurchase Price accrued to the date times the Margin Ratio, less the market value
   of the securities? The formula was written from model memory of the GMRA and has not been checked against agreement
   text.
2. **Net Exposure.** Is it the sum of the Transaction Exposures across the pair's repos in both directions, less the
   net margin held?
3. **Interest on Cash Margin.** The prototype uses ACT/360 and one rate for the whole period (the project owner's "ok",
   same source), because `NetMarginInterest` has no day count attribute. Is that acceptable?
