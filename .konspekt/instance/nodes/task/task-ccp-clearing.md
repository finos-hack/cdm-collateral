```yaml
id: task-ccp-clearing
type: task
title: CCP clearing of a bilateral repo by novation to BANK-C
status: open
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
  contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.6
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-12T18:25:00Z
```
# Task: CCP clearing of a bilateral repo by novation to BANK-C

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 27 of the workflow map. A and B submit a booked bilateral repo; BANK-C accepts it and the repo is novated into BANK-A against BANK-C and BANK-C against BANK-B; the cash and securities legs settle through BANK-C.
