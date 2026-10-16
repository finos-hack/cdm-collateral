```yaml
id: task-two-way-initial-margin
type: task
title: Two-way initial margin
status: open
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 030d173b1a7f835b860f9cca1cb4d482d59f360d
  contentHash: 030d173b1a7f835b860f9cca1cb4d482d59f360d
  timestamp: 2026-10-16T22:15:03Z
createdAt: 2026-10-16T22:15:03Z
updatedAt: 2026-10-16T22:15:03Z
```
# Task: Two-way initial margin

Under the uncleared margin rules both parties post initial margin to each other; each is pledgor on its own leg and
secured party on the other, the amounts differ and the legs are not netted. Keep the contracts and data structures
free of a one-direction assumption (roles per pledge, two calls and two pledges per agreement per margin date), then add
two-way flows, console views of both legs and an end-to-end scenario. Agreed on 2026-10-16: design for it now, demo one
direction first.
