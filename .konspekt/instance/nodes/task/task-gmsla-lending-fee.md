```yaml
id: task-gmsla-lending-fee
type: task
title: Lending fee on loans against non-cash collateral
status: open
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T23:29:22Z
```
# Task: lending fee on loans against non-cash collateral

Row 18 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** CDM's invoice has no amounts on CDM's own sample (S11; defect D27).
- **Scope:** The borrower pays the lender a fee at the agreed rate on the value of the loaned securities, billed for a period and paid in tUSD.
- **`cdm-ext`:** the fee amount and billing records in `cdm-ext`, producing CDM's `BillingRecord` and `SecurityLendingInvoice` (defect D27).
- **Prototype:** a fee invoice agreed by both services and paid on-chain; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran CDM 7.7.0 over a loan in the prototype's shape (100,000 tMMF at 1.00
lent by BANK-A to BANK-B against 1,037 tUST, margin 1.02, fee 0.5% in cdm-ext `GmslaLoanTerms`), for the period
2026-11-11 to 2026-12-11 (30 days):

- **`Create_SecurityLendingInvoice` on the loan as booked** gives one billing record whose transfer carries only the
  settlement date: no amount, payer, receiver, asset or transfer type. The invoice has no `billingSummary` and fails
  validation, and the record's reset fails it too (`AveragingCalculation.precision`, `AveragingCalculationMethod.isWeighted`).
  The observation of the loaned security's price and of the collateral's give the same result. This is D27 on the
  prototype's own loan: the trade's payout holds no `InterestRatePayout`.
- **With a fee `InterestRatePayout` added to the trade's payout** (payer Party2, the borrower; receiver Party1; fixed
  0.5% ACT/360; its quantity a reference to the loaned shares), the trade passes CDM validation, and
  `Create_SecurityLendingInvoice` gives the amount: 42.50 (unrounded, 42.4999...983) at the tMMF price 1.00, and 46.75
  at 1.10, payer BANK-B and receiver BANK-A. That is the observed price x the loaned shares x the margin (1.02) x the
  rate x 30/360: CDM's `ResolveSecurityFinanceBillingAmount` bills the fee on the market value times the margin, the
  collateral requirement, not on the market value. The transfer still has no asset, transfer type or unit, the invoice
  still has no `billingSummary` (`Create_BillingSummary` has no implementation, D27), and the reset still fails
  validation.
- **`FixedAmount`** over the same fee payout with the loaned securities' market value (100,000 x 1.00) as the notional
  gives 41.67 (41.666...65, unrounded).
- The price is a single observation for the whole record (`ResolveObservationAverage` over the observations given);
  CDM has no daily accrual on a changing market value. The prototype's feed has the current price only, no history.
- CDM has no fee invoice agreement and no record of which periods are billed; row 17's `SecuritiesLoan.bill`,
  `payBill` and `refuseBill` already bill either party's rate (wp-adr-gmsla-rebate, 10a), so no contract change is
  needed for the fee.

**Design chosen 2026-11-11** (source `1577efddfacbb1f2fedacd57705e2f766a8b44bc`: "1a 2a 3a 4a 5a 6a 7a 8a 9a"), recorded in [[wp-adr-gmsla-lending-fee]]
(proposed); the rules are questions for an SME in [[task-sme-gmsla-fee-rules]].
