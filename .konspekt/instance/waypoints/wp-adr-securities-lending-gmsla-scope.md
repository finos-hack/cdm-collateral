```yaml
id: wp-adr-securities-lending-gmsla-scope
kind: decision
subtype: adr
timestamp: 2026-11-11T15:11:27Z
review: proposed
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:11:27Z
```
# ADR: securities lending under the GMSLA covers seven workflows and default; loans are CDM trades held by both services and settled on a new SecuritiesLoan contract; marking is aggregated per pair

For [[task-securities-lending-gmsla-workflows]] (section C, row 12 of the workflow map), following the project owner's
choices of 2026-11-11 (source `58c01e3dad7c97cb870c00fde33af78f4201e5dd`: "1a 2a 3a 4a 5a 6a 7a"), after the CDM check recorded in that task:

- **Scope.** Seven workflows, in this build order: terms, loan delivery and return, marking, recall, substitution,
  rebate, lending fee. Loan delivery is not in the analysis list; return cannot be built without it.
- **Default and close-out.** Added as an eighth task, built after the seven, as for repo.
- **Collateral.** Both kinds: cash collateral in tUSD, on which the lender pays a rebate, and non-cash collateral (for
  example tUST against a tMMF loan), on which the borrower pays a lending fee.
- **Where the loans live.** Each loan is a CDM `TradeState` in the shape `Qualify_SecurityLending` accepts (one
  `AssetPayout` for the loaned securities and the collateral in a `CollateralPortfolio`), held by both parties'
  services off-chain. A new `SecuritiesLoan` contract settles delivery against collateral, return and recall; the
  chain records each event's hash and any transfer it causes.
- **Defects D26 and D27.** CDM's settlement workflows and invoice are not used as they are. Loan and return events are
  built from CDM's lower-level functions (`Create_Return`, `Create_BusinessEvent`) with the instruction filled in; fee
  and rebate billing is in `cdm-ext` and produces CDM's `BillingRecord` and `SecurityLendingInvoice` types.
- **Marking.** The pair's loans are marked together (aggregation under GMSLA paragraph 5.4), and the call settles
  through the existing margin-call path.
- **Parties.** Principal to principal: BANK-A and BANK-B, each lender or borrower. No agent lender, though CDM's samples
  have one.
- **Process.** As for repo: one task per workflow under [[task-securities-lending-gmsla-workflows]], in this build
  order, each with its own live spec; the task map's section C has one row per workflow. Rows 12 to 19 are lending;
  triparty and CCP move to rows 20 and 21.

1. [[task-gmsla-terms]]: GMSLA agreement terms and their amendment.
2. [[task-gmsla-loan-delivery-return]]: Securities loan delivery against collateral, and full and partial return.
3. [[task-gmsla-marking]]: Securities lending marking to market and margin transfer.
4. [[task-gmsla-recall]]: Recall of loaned securities.
5. [[task-gmsla-substitution]]: Substitution of non-cash collateral.
6. [[task-gmsla-rebate]]: Rebate on cash collateral.
7. [[task-gmsla-lending-fee]]: Lending fee on loans against non-cash collateral.
8. [[task-gmsla-default-close-out]]: Securities lending default and close-out.

**Consequences.**
- A second settlement contract beside `RepoSettlement`; the gateway, services and console gain loan views.
- The live specs must leave the shared tUST, tUSD and tMMF balances as they found them.
- The details of each workflow (which elections, which CDM functions, the contract changes) are decided in its own
  task, after a temporary test of CDM's functions over the prototype's loans.
