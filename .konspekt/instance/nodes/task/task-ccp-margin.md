```yaml
id: task-ccp-margin
type: task
title: CCP daily variation margin and initial margin
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
# Task: CCP daily variation margin and initial margin

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 28 of the workflow map. BANK-C calls each member daily for variation margin on its cleared repos and for initial margin at the rulebook's percentage of the exposure, as CDM MarginCallIssuance under the CCP rulebook, settled in tUSD.
