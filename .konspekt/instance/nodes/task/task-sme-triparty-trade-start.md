```yaml
id: task-sme-triparty-trade-start
type: task
title: Confirm with a business SME the triparty allocation and the purchase through the agent
status: open
review: accepted
provenance:
  conversationId: triparty-trade-start
  sourceRef: ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k
  timestamp: 2026-11-12T01:20:36Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: dfc25e3ca5487c53cf915b0e61638c428cd4e377
    contentHash: dfc25e3ca5487c53cf915b0e61638c428cd4e377
createdAt: 2026-11-12T01:20:36Z
updatedAt: 2026-11-12T02:16:12Z
```
# Task: confirm the triparty allocation and the purchase through the agent

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-triparty-terms-profile]]. The project owner chose the
design for [[task-triparty-trade-start]] on 2026-11-12 ([[wp-adr-triparty-trade-start]]). The allocation rules are
assumptions stated from model memory of triparty repo practice and from the prototype's CSA allocation, not checked
against an agent's documentation. Questions for the SME:

1. The profile's haircuts take the place of the GMRA margin ratio: the allocated value after haircuts covers the Purchase Price. Is that how triparty repo margin is applied, or is a margin ratio applied on top of the haircuts?
2. The agent allocates in the giver's own ranking of its assets. Do agents allocate in the giver's ranking, by their own optimisation (cheapest to deliver), or by a rule in the triparty agreement?
3. A concentration limit is measured as a share of the Purchase Price the allocation covers. Do agents measure limits against the exposure, the total allocated value, or the giver's whole allocation across repos?
4. When the giver's deposit cannot cover the Purchase Price within the profile, the agent allocates nothing. Do agents allocate partially and report a shortfall, or hold the trade unsettled?
5. The allocated collateral stays in the agent's books in an account per repo, held by the receiver by title. Is the receiver's account at the agent per repo, or one account per giver and receiver?
6. The receiver affirms the agent's allocation before the purchase settles. Does the receiver confirm allocations in practice, or is the agent's allocation binding on both parties?
7. The agent values the collateral at the oracle feed price. Which price sources and times do agents use for the allocation?
