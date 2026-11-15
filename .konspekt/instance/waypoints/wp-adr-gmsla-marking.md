```yaml
id: wp-adr-gmsla-marking
kind: decision
subtype: adr
timestamp: 2026-11-11T18:15:49Z
review: accepted
provenance:
  conversationId: gmsla-marking
  sourceRef: ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw
  timestamp: 2026-11-11T18:15:49Z
  confidence: 0.55
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: e56a84b64d6211be054d63c35b84556e556a0feb
    contentHash: e56a84b64d6211be054d63c35b84556e556a0feb
createdAt: 2026-11-11T18:15:49Z
updatedAt: 2026-11-11T18:19:11Z
```
# ADR: the pair's securities loans are marked together under GMSLA paragraph 5.4; the party the net figure favours calls through the existing margin-call path, above its minimum transfer amount

For [[task-gmsla-marking]] (section C, row 14 of the workflow map), within [[wp-adr-securities-lending-gmsla-scope]].
The project owner chose on 2026-11-11 (source `e56a84b64d6211be054d63c35b84556e556a0feb`: "1a 2a 3a 4a 5a 6a 7a 8a"), after the CDM check recorded in that
task: CDM computes no exposure, and its settlement amount values a loan only at the booked price (D29). The rest of this
record is the maintainer's proposal.

- **The mark (1a).** On the business date, at the feed prices, for each party as lender:
  - the requirement: for each of its open loans, the Market Value of the loaned securities outstanding × the loan's
    margin;
  - the collateral it holds: each loan's collateral position at the feed price (tUSD at 1);
  - the party's exposure: the requirement less the collateral it holds.

  The pair's net figure from one party's side is its exposure as lender, less the other party's exposure as lender, less
  the net margin it holds from settled GMSLA calls. `cdm-ext` `GmslaLoanRequirement`, `GmslaLoanCollateralValue` and
  `GmslaNetExposure` compute it.
- **Who calls (2a).** The party whose net figure is positive. A lender short of collateral calls the borrower for more,
  and a borrower that has delivered too much calls for the excess back (a call the other way, which the lender settles).
- **Threshold (3a).** The call amount is the net figure when it exceeds the calling party's minimum transfer amount in
  the GMSLA terms (`wp-adr-gmsla-terms`), otherwise zero (`cdm-ext` `GmslaMarginCallAmount`). One GMSLA call per pair
  may be open at a time.
- **Settlement (4a).** A VM call by title transfer on the existing margin-call path, with a CDM issuance that names the
  GMSLA, as for GMRA calls (`wp-adr-repo-margin-maintenance`). The called party proposes tUSD or tUST, the caller
  accepts, and the collateral moves through `CollateralControl`. The net margin a party holds is the value at the feed
  prices of the collateral of the pair's settled GMSLA calls, delivered to it less delivered by it.
- **Record (5a).** `cdm-ext` `GmslaMarkStatement`: the business date, each open loan's loaned quantity, price, Market
  Value, margin, requirement and collateral value, the net margin held, and the net figure. The caller publishes it, and
  the call's CDM issuance carries its hash; the called party rebuilds it from the chain and the feed before proposing.
  CDM's valuation event is not applied to the loans, because it would change each loan's trade hash on-chain.
- **Collateral value (6a).** At the feed price, without the eligibility haircut; the loan's margin is the buffer.
- **Returns (7a).** A return redelivers only the loan's own collateral (`wp-adr-gmsla-loan-delivery-return`). Margin
  from calls stays with the pair until the next mark nets it off.
- **Prototype (8a).** A "Securities lending marks (GMSLA)" card shows the mark and the call it allows. The live spec
  `flow-gmsla-marking` has A lend 5,000,000 tMMF to B against tUSD. The operator raises the tMMF price to 1.10, A calls
  B for the shortfall, and B delivers tUSD through the call. The price is restored and B calls the excess back. The loan
  is returned, and every balance ends where it started.

**Consequences.**
- No contract change and no new deployment; the call path and `SecuritiesLoan` are as they are.
- Recall (row 15) and default (row 19) read the same mark.
- The rules are assumptions for an SME ([[task-sme-gmsla-marking-rules]]).
