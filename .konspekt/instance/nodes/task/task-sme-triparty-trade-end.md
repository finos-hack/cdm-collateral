```yaml
id: task-sme-triparty-trade-end
type: task
title: Confirm with a business SME the triparty trade end through the agent
status: open
review: accepted
provenance:
  conversationId: triparty-trade-end
  sourceRef: ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk
  timestamp: 2026-11-12T12:42:00Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: baffa673bcccdc9dd2a5d617bd8963a25cdd4e41
    contentHash: baffa673bcccdc9dd2a5d617bd8963a25cdd4e41
createdAt: 2026-11-12T12:42:00Z
updatedAt: 2026-11-12T13:49:00Z
```
# Task: confirm the triparty trade end through the agent

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-triparty-substitution]]. The project owner chose the
design for [[task-triparty-trade-end]] on 2026-11-12 ([[wp-adr-triparty-trade-end]]). The trade-end rules are
assumptions stated from model memory of triparty repo practice, not checked against an agent's documentation.
Questions for the SME:

1. The agent prepares the trade end on the Repurchase Date and the giver settles it. Does the agent settle the close-out on its own, or does it wait for the giver's cash?
2. Trade end happens on the Repurchase Date only. How do agents handle open (on-demand) repos and early terminations?
3. The giver pays the Repurchase Price directly to the receiver in the same step as the release. Does the cash move through the agent's books, or through a separate cash agent or payment system?
4. The released collateral returns to the giver's free account at the agent. Is released collateral kept at the agent for the next repo, or delivered back to the giver's custody?
5. A pending substitution blocks the trade end. How do agents handle a recall that is pending at the Repurchase Date?
6. The receiver does not confirm the trade end. Is the receiver's confirmation of the repayment needed before the agent releases?
