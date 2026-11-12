```yaml
id: task-ccp-default
type: task
title: CCP member default: close-out and the default fund waterfall
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
# Task: CCP member default: close-out and the default fund waterfall

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 29 of the workflow map. The oracle records a member's default; BANK-C closes out the defaulter's cleared repos at the feed prices and covers the loss from the defaulter's IM, its default fund contribution, BANK-C's own capital and the other members' contributions, in that order.
