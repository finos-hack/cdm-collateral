```yaml
id: wp-adr-repo-buy-sell-back
kind: decision
subtype: adr
timestamp: 2026-11-11T01:42:28Z
review: proposed
provenance:
  conversationId: repo-buy-sell-back
  sourceRef: a778f993a5a736fc18ae08c6df925fd62a81d0f5
  contentHash: a778f993a5a736fc18ae08c6df925fd62a81d0f5
  timestamp: 2026-11-11T01:42:28Z
  confidence: 0.6
createdAt: 2026-11-11T01:42:28Z
updatedAt: 2026-11-11T01:42:28Z
```

# ADR: a buy/sell-back is a repo with CDM's trade type BuySellBack, income lowers the sell-back price, and the repo flows apply except interim interest

For [[task-repo-buy-sell-back]] (section C, row 10 of the workflow map), within [[wp-adr-repo-gmra-scope]]. The project
owner chose on 2026-11-11 (source `a778f993a5a736fc18ae08c6df925fd62a81d0f5`): (1a) a "Repo / Buy/sell-back" choice when
booking, with the trade type stored on-chain; (2a) the existing income flow, where agreed income lowers the sell-back
price and nothing is paid; (3a) every current repo flow applies except interim interest; (4a) only trades of the same
type pair off. The rest of this record is the maintainer's proposal.

**What CDM gives.** A buy/sell-back has the repo's product shape with `AssetPayout.tradeType` `BuySellBack`; CDM's
`Qualify_BuySellBack` then holds and `Qualify_RepurchaseAgreement` does not. Checked 2026-11-11 over a `CdmRepo` trade and
every `CdmRepo` event: each result is valid, keeps the trade type and one `InterestRatePayout` (G30), and qualifies as a
buy/sell-back. CDM's event qualifications do not test the product type. CDM has no buy/sell-back economics: the enum's
definition says the income reduces the repurchase price, with interest for the delay, and no CDM function computes it.

- **Booking.** The service builds the trade with the trade type; the buyer's check rebuilds it, so the type is part of
  the trade hash. `RepoSettlement` gains `bookBuySellBack` (the same arguments as `book`) and a view of the type.
- **Income.** The Buyer enters the income per unit and income date, and the Seller agrees or refuses, as for a repo's
  manufactured income. The document is a `cdm-ext` buy/sell-back income record with the income amount (income per unit
  x quantity) and the deduction: the amount plus interest at the repo rate (ACT/360) from the income date to the
  Repurchase Date, fixed when agreed. On agreement no cash moves; the contract adds the deduction to the repo's income
  deduction. The trade does not change. A CDM transfer is not used, because no cash is transferred.
- **Sell-back.** The Seller pays the Repurchase Price less the income deduction. A `cdm-ext` function gives the Sell Back
  Price, and the repurchase settlement document carries it.
- **Margin.** A buy/sell-back's Transaction Exposure uses the accrued Repurchase Price less the income deduction.
- **Reprice, adjustment, substitution.** As for a repo; the income deduction carries over to the new trade.
- **Roll.** The Seller pays the Price Differential less the income deduction; if the deduction is larger, the Buyer pays
  the difference. The deduction then resets to zero for the new term.
- **Pair-off.** Only two trades of the same type pair off (`RepoPairOffMatches` and the contract check it). The net is
  the difference of the two Sell Back Prices.
- **Interim interest.** Not offered for a buy/sell-back; the contract rejects it.
- **Prototype.** The booking choice and the income action in the Repos card, and a live spec.

**Consequences.**
- `cdm-ext` gains the buy/sell-back income record, the deduction and the Sell Back Price.
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-buy-sell-back.json`.
- The rules are assumptions listed in [[task-sme-repo-buy-sell-back-rules]].
