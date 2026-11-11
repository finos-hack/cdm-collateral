```yaml
id: wp-adr-gmsla-loan-delivery-return
kind: decision
subtype: adr
timestamp: 2026-11-11T16:38:28Z
review: proposed
provenance:
  conversationId: gmsla-loan-delivery-return
  sourceRef: 0459d62f952baa979a166c76641c678927e782b0
  contentHash: 0459d62f952baa979a166c76641c678927e782b0
  timestamp: 2026-11-11T16:38:28Z
  confidence: 0.55
createdAt: 2026-11-11T16:38:28Z
updatedAt: 2026-11-11T16:38:28Z
```
# ADR: a securities loan is a CDM trade booked by the lender and affirmed by the borrower; delivery and each return swap the loaned securities and the collateral atomically on a new SecuritiesLoan contract

For [[task-gmsla-loan-delivery-return]] (section C, row 13 of the workflow map), within
[[wp-adr-securities-lending-gmsla-scope]]. The project owner chose on 2026-11-11 (source `0459d62f952baa979a166c76641c678927e782b0`: "1a 2a 3a 4a 5a 6a
7a 8a"), after the CDM check recorded in that task. The rest of this record is the maintainer's proposal.

- **The loan (1a).** CDM's execution `BusinessEvent` from `Create_BusinessEvent`, in the shape the CDM check found
  valid:
  - one `AssetPayout` with `tradeType` `SecurityLending` for the loaned securities (Party1 the Lender, Party2 the
    Borrower);
  - the collateral in a `CollateralPortfolio` position. For tUST it is a `TransferableProduct` with an `AssetPayout`
    (Borrower to Lender). For cash (tUSD) it is an `InterestRatePayout` (Lender to Borrower) at the rebate rate;
  - eligibility with the loan's margin as `marginPercentage`.

  The lender's service builds it and publishes it to the payload store, and the contract records its hash. The
  borrower's service rebuilds it from the same inputs and checks the hash before affirming, as for repo
  (`wp-adr-repo-purchase-repurchase`). Either party can lend.
- **Returns (2a).** Each return is CDM's `Create_BusinessEvent` over one quantity-change instruction (`Decrease`, the
  loaned quantity returned) on the trade state in force. A full return sets the closed state's `activityDate`.
  `cdm-ext` `Qualify_GmslaReturn` names the event `FullReturn` or `PartialReturn`: one quantity-change instruction
  that decreases a securities lending trade, and whether the loaned quantity after is zero. It resolves D4 for the
  prototype, where CDM gives `Termination` (and `FullReturn` against tUST) or `PartialTermination`. CDM's
  qualifications are recorded beside it.
- **Collateral on a return (3a).** The collateral redelivered on a partial return is the collateral held times the
  quantity returned over the quantity outstanding, rounded down to whole units (`cdm-ext` `GmslaReturnCollateral`). A
  full return redelivers all that remains. CDM's event leaves the collateral position unchanged. The service therefore
  sets the after trade state's collateral position quantity to the collateral that remains, and the other party's
  check repeats that step.
- **Initial collateral (4a).** The Market Value of the loaned securities at the oracle price on the booking date,
  times the loan's margin, rounded up to whole units of the collateral (`cdm-ext` `GmslaRequiredCollateral`). For tUST
  collateral, that value is divided by the tUST price. The margin is the loan's own, or the GMSLA default margin
  (`wp-adr-gmsla-terms`, 102%) when the lender states none.
- **Settlement (5a).** A new `SecuritiesLoan` contract:
  - `book` (lender: borrower, loaned token and quantity, collateral token and amount, trade hash) and `affirm`
    (borrower, the same hash);
  - delivery: each party instructs the hash of the same `cdm-ext` loan settlement document, and the second
    instruction moves the loaned securities to the borrower and the collateral to the lender in one transaction;
  - each return: both parties instruct the hash of the return's settlement document (the quantity returned and the
    collateral redelivered), and the second instruction moves both back.

  Collateral passes to the lender by outright title transfer (GMSLA 2010); the contract holds no tokens. States:
  Booked, Affirmed, Open, Returned. Each party approves the contract for its tokens.
- **Term (6a).** Open loans: the trade has no termination date unless the lender states one, and a return may be
  instructed on any business day (the service's business date, as for repo).
- **Rates (7a).** A cash-collateral loan states its rebate rate in the collateral's `InterestRatePayout`. A tUST loan
  states its fee rate in a `cdm-ext` `GmslaLoanTerms` record published with the trade. Rows 17 and 18 bill and pay
  them.
- **Prototype (8a).** A "Securities loans (GMSLA)" card in both consoles books, affirms, instructs delivery, and
  instructs a full or partial return. It shows each loan with its CDM qualification and verification. The live spec
  `flow-gmsla-loan-delivery-return` has A lend tMMF to B against tUSD; B returns part, then the rest. A second loan
  against tUST is returned in full. Every balance ends where it started.

**Consequences.**
- A new contract and a new local deployment; the current deployment is kept aside, as for row 11.
- Marking (row 14) reads the open loans and their collateral; recall (row 15) ends in the same return.
- The rules are assumptions for an SME ([[task-sme-gmsla-loan-delivery-return-rules]]).
