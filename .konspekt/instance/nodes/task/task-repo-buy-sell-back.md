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
updatedAt: 2026-11-11T02:10:00Z
```
# Task: buy/sell-back

Row 10 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** qualification only (R14, score 4: G33).
- **Scope:** A buy/sell-back between the pair as a trade type on the same flows: purchase and forward sale settled delivery versus payment, with the economics of a buy/sell-back (no income passed back; it is in the forward price).
- **`cdm-ext`:** buy/sell-back economics and qualification over CDM's `AssetPayoutTradeTypeEnum.BuySellBack`.
- **Prototype:** a buy/sell-back purchase and forward sale on-chain; a live spec.

The details are decided when the task starts. Design chosen 2026-11-11 (source `a778f993a5a736fc18ae08c6df925fd62a81d0f5`): a trade type chosen
at booking, income lowering the sell-back price, the repo flows except interim interest, and pair-off only within one
type ([[wp-adr-repo-buy-sell-back]], accepted 2026-11-11); the rules are assumptions in [[task-sme-repo-buy-sell-back-rules]].

**Check for gap G30 (defect D7) when the task starts:** CDM's repo qualification accepts one `InterestRatePayout` only. Run a
temporary test over the buy/sell-back trade and each of its events (`Qualify_BuySellBack` has the same rule): count the payouts and evaluate CDM's qualification function on each resulting trade.
Record the result in the G30 row of `docs/analysis/cdm-workflow-task-map.md` (checked on 2026-11-10 for the repo events of `CdmRepo` built through row C8).
Done 2026-11-11: a `CdmRepo` trade with `AssetPayout.tradeType` `BuySellBack`, through every `CdmRepo` event (book, the buyer's
check, repurchase, reprice, adjust, substitute, interim interest, roll, pair-off), stays valid, keeps one `InterestRatePayout`
and the trade type, and qualifies as a buy/sell-back (`Qualify_BuySellBack`) and not as a repo. CDM's event qualifications do
not test the product type. CDM has no buy/sell-back economics: the enum's definition says the income on the securities
reduces the repurchase price, with interest from the income date, and no CDM function computes it.

**Built 2026-11-11:** `cdm-ext` (`RepoIsBuySellBack`, `BuySellBackIncome`, `BuySellBackIncomeDeduction`,
`BuySellBackSellBackPrice`; `RepoPairOffMatches` and `RepoPairOffNetAmount` extended), `bookBuySellBack`, the income deduction
and the Sell Back Price in `RepoSettlement`, the gateway, service and console, and the live spec `flow-repo-buy-sell-back`,
which passes on a local stack.
