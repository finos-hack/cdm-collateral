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
updatedAt: 2026-11-07T21:55:23Z
```
# Task: Two-way initial margin

Under the uncleared margin rules both parties post initial margin to each other; each is pledgor on its own leg and
secured party on the other, the amounts differ and the legs are not netted. Keep the contracts and data structures
free of a one-direction assumption (roles per pledge, two calls and two pledges per agreement per margin date), then add
two-way flows, console views of both legs and an end-to-end scenario. Agreed on 2026-10-16: design for it now, demo one
direction first.

**Design chosen 2026-11-07** (source `57ae0e7cbeb65ec44ba5e313131802c0d6f53c10`: "1. a 2. yes 3. yes 4. yes 5. go
ahead"), recorded in [[wp-adr-two-way-im]] (proposed): legs identified from the calls, all IM flows per leg, and a
pledgor reclaim when its secured party defaults. Questions for the SME are in [[task-sme-two-way-im-rules]].

Built on branch `two-way-im` (2026-11-07): `CollateralControl.reclaim` and its tests, cdm-ext
`Create_CollateralReclaim`, the collateral service per leg (call header roles from the call, per-leg terms,
revaluation and escrow reconciliation, `POST /api/v1/reclaims`, no `ROLE` setting), the gateway reclaim route and
event, the console leg selector and reclaim card, and the live spec `flow-two-way-im-default`. All 16 live specs pass
on a new contract set (the previous deployment is kept as `besu.pre-two-way-im.json`).
