```yaml
id: task-gmsla-loan-delivery-return
type: task
title: Securities loan delivery against collateral, and full and partial return
status: resolved
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
    contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T18:10:31Z
```
# Task: securities loan delivery against collateral, and full and partial return

Row 13 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** CDM's settlement workflows fail CDM validation on CDM's own samples; only the execution qualifies; the return event has no instruction and no return qualification can hold (S9, S13; defects D26 and D4).
- **Scope:** A loan of a security token from lender to borrower against cash collateral (tUSD) or non-cash collateral (for example tUST against a tMMF loan), delivered in one transaction; full and partial return of the loaned securities against redelivery of the collateral.
- **`cdm-ext`:** the loan and return events built from CDM's lower-level functions (`Create_Return`, `Create_BusinessEvent`) with the instruction filled in, in the trade shape `Qualify_SecurityLending` accepts (one `AssetPayout` and a `CollateralPortfolio`); a return qualification if CDM's cannot hold.
- **Prototype:** a new `SecuritiesLoan` contract for delivery against collateral and return; loans held by both services as CDM trades; gateway, service, console and a live spec that leaves the shared balances as it found them.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran on CDM's lending sample trade and on loans in the prototype's shape:
tMMF lent by BANK-A (Party1, Lender) to BANK-B (Party2, Borrower), against cash (tUSD) or tUST.

- **The loan.** One `AssetPayout` (`tradeType` `SecurityLending`) holds the loaned securities. The collateral sits in
  a `CollateralPortfolio` position. Against tUST, the position's `TransferableProduct` carries an `AssetPayout`
  (Borrower to Lender). Against cash, it carries an `InterestRatePayout` (Lender to Borrower, the rebate rate), because
  `AssetPayoutUnderlierNotCash` forbids cash in an `AssetPayout`.
- **What CDM validation needs beyond its sample:**
  - asset types and a party role on each asset, the cash asset included;
  - settlement terms on the payouts;
  - quantities on the collateral positions and on their payouts;
  - eligibility criteria with `isIncluded`;
  - an issuer on the portfolio identifier;
  - the closed state's `activityDate` on a full return, as `CdmRepo` already sets.
- **Execution.** With these, the execution built by `Create_BusinessEvent` passes CDM validation for both kinds of
  collateral. It qualifies as `Execution`, and the trade as `SecurityLending`.
- **Returns.** A return built by `Create_BusinessEvent` over a quantity-change instruction passes validation.
  - A partial return qualifies as `PartialTermination`.
  - A full return qualifies as `Termination`, and against non-cash collateral also as `FullReturn` (the D4 collision;
    against cash `FullReturn` cannot hold).
  - `Create_Return` on the same loan is valid but carries no instruction and qualifies as no event (D26).
- **The collateral after a return.** The return changes only the loaned quantity. The collateral position keeps its
  quantity, so CDM's event does not record the redelivery of collateral.

**Design chosen 2026-11-11** (source `0459d62f952baa979a166c76641c678927e782b0`: "1a 2a 3a 4a 5a 6a 7a 8a"), recorded in
[[wp-adr-gmsla-loan-delivery-return]] (accepted 2026-11-11); the rules are questions for an SME in
[[task-sme-gmsla-loan-delivery-return-rules]].

**Built 2026-11-11** to [[wp-adr-gmsla-loan-delivery-return]]: cdm-ext `GmslaLoan`, `GmslaLoanTerms`,
`GmslaLoanSettlement`, `GmslaRequiredCollateral`, `GmslaReturnCollateral` and `Qualify_GmslaReturn`; the
`SecuritiesLoan` contract (new deployment); gateway `/ledger/v1/loans`; service `CdmLoan` and `/api/v1/loans`; the
console's "Securities loans (GMSLA)" card; live spec `flow-gmsla-loan-delivery-return`, which passes locally. Both kinds
of loan pass CDM validation through booking, delivery, a partial return and a full return. CDM qualifies the full return
of the tUST loan as both `FullReturn` and `Termination` (D4). BANK-B's test balance now holds 5,000 tUST.

**Resolved 2026-11-11**: PR #60 merged (source `27940ebe8edf7fc4e79374b55bf7b097597d1d84`).
