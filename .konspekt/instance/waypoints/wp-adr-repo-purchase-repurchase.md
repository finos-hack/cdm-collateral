```yaml
id: wp-adr-repo-purchase-repurchase
kind: decision
subtype: adr
timestamp: 2026-11-08T01:23:33Z
review: proposed
provenance:
  conversationId: repo-purchase-repurchase
  sourceRef: 80d5c6596368a0436259035ca8d5c4b429f2f9e6
  contentHash: 80d5c6596368a0436259035ca8d5c4b429f2f9e6
  timestamp: 2026-11-08T01:23:33Z
  confidence: 0.7
createdAt: 2026-11-08T01:23:33Z
updatedAt: 2026-11-08T01:23:33Z
```

# ADR: a repo is a CDM TradeState booked by the seller and affirmed by the buyer; a new RepoSettlement contract settles purchase and repurchase delivery versus payment

For [[task-repo-purchase-repurchase]] (section C, row 2 of the workflow map), within [[wp-adr-repo-gmra-scope]] and
under the GMRA of [[wp-adr-repo-gmra-terms]], following the project owner's choices of 2026-11-07 (source `80d5c6596368a0436259035ca8d5c4b429f2f9e6`:
"Go with 'recommended' for the rest of them"):

- **Booking.** The seller's service builds the repo `TradeState` with CDM's `Create_BusinessEvent` from an execution
  instruction shaped like CDM's `repo-execution-func-input.json`: a fixed-rate `InterestRatePayout` on ACT/360, one
  security in a `CollateralPosition` with its `AssetPayout` legs settled delivery versus payment on the Purchase Date
  and the Repurchase Date, USD. The seller is Party1 and the buyer Party2. The buyer's service rebuilds the trade from
  the same inputs, checks that it is the same `TradeState`, and affirms. The trade's CDM hash goes on-chain at booking
  and at affirmation; the contract requires the two hashes to be equal.
- **Purchase Price and quantity.** The seller enters the Purchase Price (tUSD), the rate, the term and the security
  (tUST or tMMF). The quantity is Purchase Price × Margin Ratio ÷ oracle price, rounded up to whole units; the Margin
  Ratio is the trade's own (`marginPercentage`, which CDM 7.7.0 requires to be at least 1), defaulting to the GMRA's
  default Margin Ratio of 1.02.
- **Repurchase Price.** Purchase Price plus the Price Differential, computed by CDM's `FixedAmount` over the term at the
  repo rate on ACT/360 and rounded to whole tUSD. `cdm-ext` adds `RepoRepurchasePrice`, which calls CDM's `FixedAmount`
  with the Purchase Date to Repurchase Date period, and `RepoPurchaseQuantity`, with tests. (Found while probing CDM
  7.7.0 on 2026-11-07: `InterestCashSettlementAmount` needs the payout's `calculationPeriodDates`, which CDM's repo
  sample does not carry, and for a term repo with them CDM's `CalculationPeriod` returns an empty period; so CDM's
  `FixedAmount` is called with the period stated. CDM's own repo sample also fails CDM 7.7.0 validation; the trade the
  services build passes it.) The repurchase is CDM's `Repurchase` business event (`ResolveRepurchaseTransferInstruction`
  and `Create_BusinessEvent`), which sets the trade's quantities to zero.
- **Settlement.** A new `RepoSettlement` contract (`CollateralControl` is at 22.2 KB of the 24.5 KB limit). The seller
  books (trade hash, buyer, security, quantity, cash token, Purchase Price, Repurchase Price), the buyer affirms. For
  each of the purchase and the repurchase, each party approves its leg and instructs with the hash of the CDM event;
  the second instruction moves both legs in one transaction, the securities to the buyer and the tUSD to the seller at
  the purchase, both reversed at the Repurchase Price at the repurchase. The two instructions must carry the same hash.
- **Dates.** Each service holds a business date, which the operator can move forward in the prototype. A service
  instructs the repurchase only on or after the Repurchase Date by its business date. The contract checks no dates
  (Besu's block time cannot be moved forward).
- **Prototype.** A "Repos" card in both consoles: a booking form (the seller), Affirm (the buyer), Settle purchase and
  Settle repurchase, and the trades with their state and both prices. The live spec `flow-repo-purchase-repurchase`:
  A sells tUST to B for tUSD, the purchase settles in one transaction, the business date moves to the Repurchase
  Date, the repurchase settles; it checks the balances, the on-chain hashes, and that both services hold the same
  `TradeState`.

**Consequences.**
- A new contract and a new deployment; the registry gains `repoSettlement`.
- Term repos only; open repos, early termination and repricing are later rows of section C.
- The trade's Margin Ratio is recorded but not maintained; margin maintenance is [[task-repo-margin-maintenance]].
