## Maintainer

Open items (row 18 design; I recommend "a" for each)

1. **Fee basis.** a) Market value of the loaned securities, at the feed price on the billing date, without the margin
   (41.67 in the test). b) CDM's basis: market value x margin (42.50). c) The booked price, constant over the loan.
2. **Computation.** a) `FixedAmount` over a fee payout in the `cdm-ext` invoice, the same as row 17's rebate.
   b) CDM's own billing record, with its gaps filled in.
3. **Where the fee rate lives.** a) In `GmslaLoanTerms`, as now, with the fee payout built only inside the invoice.
   Booked trades are unchanged. b) A fee `InterestRatePayout` on new loans' trade payout, which is CDM's place for it.
4. **Period and parts.** a) The same rules as the rebate: from the billed-through date (or the delivery) to the business
   date or the return date, split at each settled return. A substitution does not change the fee basis.
   b) Calendar months only.
5. **Who bills.** a) The lender bills and the borrower pays or refuses, in tUSD, as the rebate ADR's generic billing
   already says. b) The borrower states and pays.
6. **Rounding.** a) Half-up to whole tUSD, as for the rebate. b) Accrue the remainder into the next invoice.
7. **Console and spec.** a) "Bill fee" for the lender, and Pay or Refuse for the borrower, in the existing Rebate column
   renamed "Rate". The spec `flow-gmsla-lending-fee`: a loan against tUST, a partial return mid-period, an invoice paid,
   a second invoice refused, and a final invoice after the return.
8. **Deployment.** a) None. The contract and the deployment stay as they are.
9. **Recording CDM's fee basis.** a) Add a SME question on whether the GMSLA fee is charged on the loan value or the
   collateral value. b) Also record CDM's basis as a defect.

## User

1a 2a 3a 4a 5a 6a 7a 8a 9a
