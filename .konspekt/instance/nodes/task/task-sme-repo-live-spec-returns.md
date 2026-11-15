```yaml
id: task-sme-repo-live-spec-returns
type: task
title: Confirm with a business SME whether a live spec should return amounts such as the Price Differential
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
# Task: confirm whether a live spec should return amounts such as the Price Differential

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-two-way-im-rules]]. The project owner placed this in
the SME backlog on 2026-11-08 (source `d7075ebf2ed8b09469e486de0a8c51320ad977a7`: "same as #1"). The question was raised on
[[task-repo-purchase-repurchase]]: the live spec `flow-repo-purchase-repurchase` leaves the 875 tUSD Price Differential
with the buyer on every run, and `check` restores the free balances before each run. Should a live spec also return
such amounts itself?
