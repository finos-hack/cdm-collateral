```yaml
id: wp-adr-gmsla-substitution
kind: decision
subtype: adr
timestamp: 2026-11-11T20:05:16Z
review: accepted
provenance:
  conversationId: gmsla-substitution
  sourceRef: 48fe886bd6db13fa671e8e91d418ed0f300f1833
  contentHash: 48fe886bd6db13fa671e8e91d418ed0f300f1833
  timestamp: 2026-11-11T20:05:16Z
  confidence: 0.55
createdAt: 2026-11-11T20:05:16Z
updatedAt: 2026-11-11T22:34:24Z
```
# ADR: the borrower substitutes all the non-cash collateral of one loan with another security meeting the required collateral, with the lender's agreement, settled in one transaction on SecuritiesLoan

For [[task-gmsla-substitution]] (section C, row 16 of the workflow map), within [[wp-adr-securities-lending-gmsla-scope]].
The project owner chose on 2026-11-11 (source `48fe886bd6db13fa671e8e91d418ed0f300f1833`: "1a 2a 3a 4a 5a 6a 7a 8a 9a"), after the CDM check recorded in
that task: `Create_SubstitutionPrimitiveInstruction` validates on the prototype's loans with the loaned lot restated,
`Qualify_Substitution` is false on open and term loans (D22), and CDM has no request, consent or value check. The rest
of this record is the maintainer's proposal.

- **A fourth test security (1a).** A new `TokenizedCollateral` token `tAGY` ("Tokenized US agency bond 4.50% 2031",
  a placeholder ISIN, a feed price of 99.20, haircut 300 bps) deployed with the others, with a BANK-B test balance of
  5,000 restored by the top-up script. It is eligible only as loan collateral; the CSA eligibility schedules and the
  repo flows do not change.
- **Scope (2a).** The borrower of an open loan against non-cash collateral chooses a substitute security other than the
  current one and the loaned security. All the loan's collateral is replaced; cash collateral is out of scope.
- **Value (3a).** The substitute quantity is the loan's required collateral at the substitution date's feed prices: the
  loaned quantity x its price x the margin / the substitute's price, rounded up to whole units (`CdmLoan.requiredCollateral`).
- **Consent (4a).** The borrower's service builds and anchors the request; the lender's agreement is the eligibility
  check. The lender's service rebuilds the event from the chain, the loan's trade, the feed and its business date, and
  refuses a difference. The lender may refuse, which clears the request.
- **Settlement (5a).** `SecuritiesLoan.requestSubstitution(loanId, security, quantity, cdmHash)` by the borrower, one
  pending per loan; `agreeSubstitution(loanId, cdmHash)` by the lender moves the substitute from the borrower to the
  lender and the original collateral from the lender to the borrower, and updates the stored collateral token, amount
  and trade hash in one transaction; `refuseSubstitution(loanId)` clears it. No loaned securities and no cash move.
- **CDM (6a).** The event is built with CDM's `Create_SubstitutionPrimitiveInstruction` (the loaned lot restated as its
  `priceQuantity`, the loan's original effective date passed as the effective date, so the fee accrual does not restart)
  and `Create_BusinessEvent`, and checked with a `cdm-ext` `GmslaIsSubstitution`: the loaned lot and payout unchanged,
  the collateral changed, the trade open, the effective date unchanged. The substitution date is the event date.
- **Other actions (7a).** A substitution is refused while a return or another substitution is pending; a return is
  refused while a substitution is pending. A pending recall does not block it, and the recall stays.
- **Prototype (8a).** A "Substitute tAGY" (or the other eligible security) action for the borrower in the Loans card and
  Agree and Refuse for the lender; a collateral column showing the current security; live spec `flow-gmsla-substitution`.
- **Deployment (9a).** A contract change and a new deployment; the previous one is kept as
  `besu.pre-gmsla-substitution.json`.

**Consequences.**
- `SecuritiesLoan` is redeployed with a new token; the gateways, the services' token configuration and the console's
  token list gain `tAGY`.
- Row 14's marking values the loan's collateral at the new security's feed price after a substitution.
- The rules are assumptions for an SME ([[task-sme-gmsla-substitution-rules]]).

**Corrected 2026-11-11** by the project owner (source `5c46c4b1f99b00e2dc2b5850c4c92d07ef0bee3e`: "1b"), after the row 16 PR: CDM's substitution terms
change replaces only the collateral portfolio, so the trade after still named the original collateral as eligible. The
substitution event now also sets the eligible collateral to the substitute, with the loan's margin, so the trade after
names what it holds. Substitution documents built before this change no longer rebuild; loans booked on the row 17
deployment are not affected.
