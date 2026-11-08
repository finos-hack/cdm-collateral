```yaml
id: wp-adr-repo-income
kind: decision
subtype: adr
timestamp: 2026-11-08T20:48:34Z
review: accepted
provenance:
  conversationId: repo-income
  sourceRef: 6add904ae373a15afccd62650872d36b5f15a134
  contentHash: 6add904ae373a15afccd62650872d36b5f15a134
  timestamp: 2026-11-08T20:48:34Z
  confidence: 0.7
createdAt: 2026-11-08T20:48:34Z
updatedAt: 2026-11-08T21:19:44Z
```

# ADR: interim interest reduces the Repurchase Price, manufactured income is entered by hand, and both settle by agreed phases of RepoSettlement

For [[task-repo-income]] (section C, row 7 of the workflow map), within [[wp-adr-repo-gmra-scope]], following the project
owner's choices of 2026-11-08 (source `6add904ae373a15afccd62650872d36b5f15a134`: "Pay accrued, reduce price", "Entered by hand", "Two instructions, one
contract", "Leave out"):

- **Interim interest.** The Seller pays the Buyer the Price Differential accrued to the business date, less earlier interim
  payments, using CDM's `Create_OnDemandInterestPaymentPrimitiveInstruction`. The stored Repurchase Price falls by the
  amount paid. The Buyer's service rebuilds the event and agrees only if it is the same.
- **Manufactured income (GMRA paragraph 5).** CDM has no function for it. The Buyer enters the income per unit and the
  income date; the amount is income per unit times the repo's quantity, rounded to whole tUSD. A `cdm-ext` document records
  it. The Seller's agreement is the check on the input, and the Seller can refuse.
- **Settlement.** `RepoSettlement` gains an interim interest phase and an income phase. The paying party instructs and the
  other party's matching instruction agrees and moves the tUSD in one transaction.
- **Accrual.** CDM records the interim payment in the trade's transfer history and leaves the terms unchanged. `cdm-ext`
  `RepoPriceDifferential` deducts payments dated after the trade's effective date, so the Repurchase Price, exposure, reprice
  and adjustment amounts all use the net accrual.
- **Not built.** CDM's on-demand rate change.
- **Prototype.** Actions in the Repos card and live specs.

**Consequences.**
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-income.json`.
- The rules are assumptions listed in [[task-sme-repo-income-rules]].
