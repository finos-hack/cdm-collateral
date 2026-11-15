```yaml
id: task-sme-triparty-revaluation
type: task
title: Confirm with a business SME the triparty agent's daily revaluation, top-up and release
status: open
review: accepted
provenance:
  conversationId: triparty-revaluation
  sourceRef: ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o
  timestamp: 2026-11-12T04:13:02Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 6a7359a7984c74ea1532a50e8983f72646773375
    contentHash: 6a7359a7984c74ea1532a50e8983f72646773375
createdAt: 2026-11-12T04:13:02Z
updatedAt: 2026-11-12T11:42:00Z
```
# Task: confirm the triparty agent's daily revaluation, top-up and release

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-triparty-trade-start]]. The project owner chose the
design for [[task-triparty-revaluation]] on 2026-11-12 ([[wp-adr-triparty-revaluation]]). The revaluation rules are
assumptions stated from model memory of triparty repo practice, not checked against an agent's documentation.
Questions for the SME:

1. The agent's required value is the Purchase Price plus the repo interest accrued to the day. Do agents use the accrued Repurchase Price, the Purchase Price, or a value the parties report (the "exposure")?
2. There is no threshold: any shortfall is topped up and any excess released. Do agents apply a minimum movement, a tolerance band, or a percentage of the exposure?
3. A top-up comes from the giver's free collateral in the giver's ranking. Do agents top up by the same rule as the initial allocation, or by a separate one?
4. An excess is released from the asset the giver ranked last. Do agents release from a particular asset, pro rata, or by the giver's instruction?
5. When the giver's free collateral cannot cover a shortfall, nothing moves and the shortfall is recorded. Do agents move what they can, notify the parties, or treat it as a margin call between them?
6. A concentration breach caused by price moves alone is recorded and left to substitution. Do agents rebalance during the daily revaluation?
7. The agent revalues on request in the prototype. When and how often do agents revalue, and at which prices (closing, intraday)?
8. The revaluation moves collateral without either party's affirmation. Is the agent's daily reallocation binding on both parties under the triparty agreement?
