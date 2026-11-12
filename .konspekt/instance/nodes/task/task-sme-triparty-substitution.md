```yaml
id: task-sme-triparty-substitution
type: task
title: Confirm with a business SME the triparty agent's substitution of collateral
status: open
review: accepted
provenance:
  conversationId: triparty-substitution
  sourceRef: 38140e048d810e158beb273724813d18a6c01704
  contentHash: 38140e048d810e158beb273724813d18a6c01704
  timestamp: 2026-11-12T11:53:00Z
  confidence: 0.6
createdAt: 2026-11-12T11:53:00Z
updatedAt: 2026-11-12T12:42:00Z
```
# Task: confirm the triparty agent's substitution of collateral

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-triparty-revaluation]]. The project owner chose the
design for [[task-triparty-substitution]] on 2026-11-12 ([[wp-adr-triparty-substitution]]). The substitution rules are
assumptions stated from model memory of triparty repo practice, not checked against an agent's documentation.
Questions for the SME:

1. The giver asks for a number of units of one asset back. Do givers recall specific securities by quantity, whole positions, or a value?
2. The agent replaces the returned units from the giver's free collateral in the giver's ranking until the repo is covered again. Do agents replace by the allocation rule, by equal value, or by the giver's instruction?
3. When the free collateral cannot replace the returned units, the agent declines the whole request. Do agents return part of the request, or queue it until collateral arrives?
4. The agent may start a substitution itself to bring an asset back within its concentration limit. Do agents rebalance breaches on their own, and how quickly?
5. The receiver does not affirm a substitution. Is the receiver notified or asked to consent under the triparty agreement?
6. One substitution request may be pending per repo. Do agents process several recalls on one repo at once, or across a giver's repos together?
7. The substitution takes effect when the agent records it. What cut-off times and settlement timing do agents apply to recalls?
