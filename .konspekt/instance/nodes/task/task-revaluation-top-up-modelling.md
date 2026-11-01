```yaml
id: task-revaluation-top-up-modelling
type: task
title: Confirm with a business SME how a revaluation shortfall is called: margin call or a dedicated top-up call
status: open
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: a0a131229621583bdc928c4ec7e06c59defc6b9b
  contentHash: a0a131229621583bdc928c4ec7e06c59defc6b9b
  timestamp: 2026-11-01T15:57:23Z
  confidence: 0.75
createdAt: 2026-11-01T15:57:23Z
updatedAt: 2026-11-01T15:57:23Z
```
# Task: confirm how a revaluation top-up is modelled

Under [[goal-business-case]]. When a pledged token's price or NAV falls and the secured party's revaluation shows a
shortfall, the prototype must issue some call for more collateral. Two options:

1. **Margin call:** an ordinary IM margin call for the shortfall, following `flow-im-margin-call-pledge`. This is
   what the CALM description of `flow-revaluation-top-up` says.
2. **Dedicated top-up call:** a separate call kind with its own CDM representation and on-chain record.

The project owner judged this a business SME decision (2026-11-01) and chose option 1 as the interim basis for
[[task-e2e-remaining-flows]]. This task records the SME's answer, and whether option 1 stands. If the SME picks
option 2, `flow-revaluation-top-up` and its implementation change.
