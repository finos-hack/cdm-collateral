```yaml
id: task-gmsla-rebate
type: task
title: Rebate on cash collateral
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
updatedAt: 2026-11-12T00:00:26Z
```
# Task: rebate on cash collateral

Row 17 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** no rebate function (S12, score 2): `PriceSubTypeEnum.Rebate` only.
- **Scope:** The lender pays the borrower a rebate at the agreed rate on cash collateral held, billed for a period and paid in tUSD.
- **`cdm-ext`:** the rebate amount and billing records in `cdm-ext`, producing CDM's `BillingRecord` and `SecurityLendingInvoice` (defect D27).
- **Prototype:** a rebate invoice agreed by both services and paid on-chain; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran CDM 7.7.0 over a loan in the prototype's shape (100,000 tMMF lent by
BANK-A to BANK-B against 102,000 tUSD, margin 1.02, rebate 4% ACT/360 in the collateral's `InterestRatePayout`), for
the period 2026-11-11 to 2026-12-11:

- **`Create_SecurityLendingInvoice`** over a billing instruction for the loan, with an observation of the loaned
  security's price, gives one billing record whose transfer carries only the settlement date: no amount, no payer or
  receiver, no asset. The invoice has no `billingSummary` and fails validation, and the record's reset fails it too
  (`AveragingCalculation.precision`). This is D27 on the prototype's own loan: `ResolveSecurityFinanceBillingAmount`
  reads the rate from the trade's payout and the lent securities from the collateral path, the reverse of where a
  cash loan holds them.
- **`FixedAmount`** over the collateral's `InterestRatePayout`, with the cash held (102,000) as the notional and
  `CalculationPeriodRange` for the period (30 days), gives 340.00 (102,000 x 4% x 30/360) with a tail of decimal noise
  (339.99...9864), so it needs rounding. Without a notional it gives nothing: the payout's quantity is a reference to
  the collateral position that the function does not resolve.
- **`Create_OnDemandInterestPaymentPrimitiveInstruction`** (used for repo interim interest) refuses the loan: its
  condition requires a single `InterestRatePayout` in the trade's payout.
- **A transfer instruction** of 340 USD, `ScheduledTransfer` of type `InterestReturn` from the lender to the
  borrower, through `Create_BusinessEvent`, passes validation and qualifies as `CashTransfer` (not `SecurityTransfer`).
  It adds one entry to the transfer history and leaves the loaned quantity, the collateral and the trade unchanged.
- CDM has no rebate amount function for a loan, no invoice agreement and no record of which periods are billed.

**Design chosen 2026-11-11** (source `7aad715d9ef96f8f93b411878275c88a846e99a8`: "1a 2a 3a 4a 5a 6a 7a 8a 9a 10a"), recorded in [[wp-adr-gmsla-rebate]]
(proposed); the rules are questions for an SME in [[task-sme-gmsla-rebate-rules]].

The project owner resolved the task on 2026-11-11 (source `9331a6a4b0aafc5103c06651a1a61309c35e4f3e`: "1. resolve them"): row 17 is built and `flow-gmsla-rebate` passes (on main since 611c9ee).
