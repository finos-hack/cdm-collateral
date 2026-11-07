```yaml
id: task-repo-buy-sell-back
type: task
title: Buy/sell-back
status: open
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-07T23:11:58Z
```
# Task: buy/sell-back

Row 10 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** qualification only (R14, score 4: G33).
- **Scope:** A buy/sell-back between the pair as a trade type on the same flows: purchase and forward sale settled delivery versus payment, with the economics of a buy/sell-back (no income passed back; it is in the forward price).
- **`cdm-ext`:** buy/sell-back economics and qualification over CDM's `AssetPayoutTradeTypeEnum.BuySellBack`.
- **Prototype:** a buy/sell-back purchase and forward sale on-chain; a live spec.

The details are decided when the task starts.
