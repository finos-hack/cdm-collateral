```yaml
id: wp-adr-gmsla-lending-fee
kind: decision
subtype: adr
timestamp: 2026-11-11T23:29:22Z
review: accepted
provenance:
  conversationId: gmsla-lending-fee
  sourceRef: 1577efddfacbb1f2fedacd57705e2f766a8b44bc
  contentHash: 1577efddfacbb1f2fedacd57705e2f766a8b44bc
  timestamp: 2026-11-11T23:29:22Z
  confidence: 0.6
createdAt: 2026-11-11T23:29:22Z
updatedAt: 2026-11-11T23:42:15Z
```
# ADR: the lender bills the lending fee on the loaned securities' market value at the billing date's feed price, through row 17's billing; the borrower's agreement pays it in tUSD

For [[task-gmsla-lending-fee]] (section C, row 18 of the workflow map), within [[wp-adr-securities-lending-gmsla-scope]],
reusing the billing of [[wp-adr-gmsla-rebate]] (10a there). The project owner chose on 2026-11-11 (source `1577efddfacbb1f2fedacd57705e2f766a8b44bc`:
"1a 2a 3a 4a 5a 6a 7a 8a 9a"), after the CDM check recorded in that task: CDM's invoice gives no amount on the
prototype's loan (D27); with a fee `InterestRatePayout` on the trade CDM bills the market value times the margin;
`FixedAmount` on the market value gives the fee without it. The rest of this record is the maintainer's proposal.

- **Basis (1a).** The fee accrues on the market value of the loaned securities outstanding: the quantity in force in
  each part of the period x the loaned security's feed price on the billing date, without the margin. One price per
  invoice: the feed keeps no price history.
- **Computation (2a, 3a).** The fee rate stays in `cdm-ext` `GmslaLoanTerms`; booked trades are unchanged. The invoice
  builds a fee `InterestRatePayout` (fixed rate, ACT/360, the borrower paying the lender) and, for each part, CDM's
  `FixedAmount` over it with the part's market value as the notional and `CalculationPeriodRange` for the part.
- **Period and parts (4a).** As for the rebate: from the billed-through date, or the delivery date, to the business
  date, or to the return date of a returned loan; split at each settled return (the quantity changes). A substitution
  leaves the loaned quantity, so it does not split the fee.
- **Billing and payment (5a).** The lender's service builds and anchors the `cdm-ext` `GmslaLoanInvoice` with rate type
  `Fee` and the loaned security's price; the borrower's service rebuilds it from its own documents, its business date
  and its feed, and pays in tUSD, or refuses. The payment event is a transfer of type `InterestReturn`, as for the rebate:
  CDM's `ScheduledTransferEnum` has no lending-fee type, and a transfer of that type qualifies as `CashTransfer`.
- **Rounding (6a).** Half-up to whole tUSD once per invoice, as for the rebate.
- **Prototype (7a).** The Loans card's Rebate column becomes "Rate billing" (the card already has a "Rate" column
  showing the rate): "Bill fee … to …" for the lender, "Pay … tUSD" and
  "Refuse invoice" for the borrower. Live spec `flow-gmsla-lending-fee`.
- **Deployment (8a).** None: `SecuritiesLoan.bill`, `payBill` and `refuseBill` already bill either party's rate.
- **CDM's basis (9a).** A question for the SME: is the fee charged on the loan value or on the collateral value?

**Consequences.**
- The two services must see the same feed price on the billing date for the invoice to rebuild.
- The rules are assumptions for an SME ([[task-sme-gmsla-fee-rules]]).
