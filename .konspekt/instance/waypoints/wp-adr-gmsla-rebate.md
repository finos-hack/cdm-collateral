```yaml
id: wp-adr-gmsla-rebate
kind: decision
subtype: adr
timestamp: 2026-11-11T20:39:13Z
review: proposed
provenance:
  conversationId: gmsla-rebate
  sourceRef: 7aad715d9ef96f8f93b411878275c88a846e99a8
  contentHash: 7aad715d9ef96f8f93b411878275c88a846e99a8
  timestamp: 2026-11-11T20:39:13Z
  confidence: 0.55
createdAt: 2026-11-11T20:39:13Z
updatedAt: 2026-11-11T20:39:13Z
```
# ADR: the party receiving a loan's rate bills it for the period since the last billing, accrued day by day on what was held; the payer's agreement pays it in tUSD on SecuritiesLoan

For [[task-gmsla-rebate]] (section C, row 17 of the workflow map), within [[wp-adr-securities-lending-gmsla-scope]].
The project owner chose on 2026-11-11 (source `7aad715d9ef96f8f93b411878275c88a846e99a8`: "1a 2a 3a 4a 5a 6a 7a 8a 9a 10a"), after the CDM check recorded
in that task: CDM's `Create_SecurityLendingInvoice` gives no amount on the prototype's cash loan (D27), `FixedAmount`
over the collateral's `InterestRatePayout` gives the rebate when given the cash held as notional, CDM's on-demand
interest payment refuses a loan, and a transfer of type `InterestReturn` qualifies as `CashTransfer`. The rest of this
record is the maintainer's proposal.

- **Generic billing (10a).** One mechanism bills either rate of a loan. The direction follows the rate type: against
  cash collateral the lender pays the borrower the rebate (this row); against non-cash collateral the borrower pays the
  lender the fee (row 18, [[task-gmsla-lending-fee]], which adds the fee's accrual basis). The party receiving the rate
  bills; the paying party agrees. Because of this, the document of 4a is named `GmslaLoanInvoice` (with its rate type)
  and the contract functions of 5a `bill`, `payBill` and `refuseBill`.
- **Period (1a).** From the billed-through date, or the delivery date for the first invoice, to the business date. The
  start day accrues and the end day does not (days = end - start). One invoice per loan may be pending.
- **Amount (2a).** The period is split at each date the cash held changed (each settled return). For each sub-period,
  CDM's `FixedAmount` over the collateral's `InterestRatePayout`, with the cash held in it as the notional and
  `CalculationPeriodRange` for the sub-period, gives the accrual (ACT/360 from the payout). The invoice total is the sum,
  rounded half-up to the cent. The cash held by date comes from the loan's documents: the booking and each return
  document, back from the trade hash.
- **Billing and payment (3a).** The borrower's service builds and anchors the invoice. The lender's service rebuilds it
  from the chain, the loan's documents and its business date, and refuses a difference. The lender pays or refuses.
- **Document (4a).** `cdm-ext` `GmslaLoanInvoice`: CDM's `SecurityLendingInvoice` (one `BillingRecord` per sub-period
  with its `recordTransfer` amount, payer and receiver, and a `GrandTotal` `billingSummary`, which CDM leaves empty,
  D27), the sub-periods' notionals, and CDM's payment event: a `Create_BusinessEvent` over a transfer instruction of
  type `InterestReturn` qualified as `CashTransfer`. It is anchored by its own hash; the loan's trade hash does not move.
- **On-chain (5a).** `SecuritiesLoan.bill(loanId, periodEnd, amount, invoiceHash)` by a party of the loan, one pending
  per loan, `periodEnd` after the billed-through date; `payBill(loanId, invoiceHash)` by the other party moves the
  amount in tUSD from it to the biller and sets the billed-through date to `periodEnd`; `refuseBill(loanId)` by the payer
  clears it. The contract records the billed-through date; the services check the period.
- **Rates (6a).** Rebate rates at or above zero only; a negative rate is refused at booking.
- **Returned loans (7a).** A returned loan can be billed up to its return date, once; nothing accrues after it.
- **Prototype (8a).** A "Bill rebate" button for the borrower and "Pay … " and "Refuse invoice" for the lender in the
  Loans card, with the billed-through date shown; live spec `flow-gmsla-rebate`.
- **Deployment (9a).** A contract change and a new deployment; the previous one is kept as `besu.pre-gmsla-rebate.json`.

**Consequences.**
- `SecuritiesLoan` is redeployed. Loans booked before it carry no billed-through date and start from their delivery.
- Row 18 reuses the billing; it adds only the fee's accrual basis and direction.
- The rules are assumptions for an SME ([[task-sme-gmsla-rebate-rules]]).
