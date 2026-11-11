```yaml
id: wp-adr-gmsla-recall
kind: decision
subtype: adr
timestamp: 2026-11-11T19:17:49Z
review: proposed
provenance:
  conversationId: gmsla-recall
  sourceRef: 72146b83411def7096cb21b1d196e0988e884c38
  contentHash: 72146b83411def7096cb21b1d196e0988e884c38
  timestamp: 2026-11-11T19:17:49Z
  confidence: 0.55
createdAt: 2026-11-11T19:17:49Z
updatedAt: 2026-11-11T19:17:49Z
```
# ADR: the lender recalls all or part of a loan by an anchored cdm-ext notice due two business days later; the borrower settles it through the existing return

For [[task-gmsla-recall]] (section C, row 15 of the workflow map), within [[wp-adr-securities-lending-gmsla-scope]].
The project owner chose on 2026-11-11 (source `72146b83411def7096cb21b1d196e0988e884c38`: "1a 2a 3a 4a 5a 6a 7a 8a 9a"), after the CDM check recorded in
that task: CDM holds a `RecallProvision` and a `Recall` transfer type, but a `Recall` transfer qualifies only as
`SecurityTransfer` and leaves the loan unchanged, and CDM has no recall notice. The rest of this record is the
maintainer's proposal.

- **The notice (1a).** `cdm-ext` `GmslaRecallNotice`: the loan identifier, the trade hash it recalls, the lender and the
  borrower, the quantity recalled, the notice date and the intended settlement date. The lender's service publishes it;
  the borrower's service rebuilds it from the chain, the loan's trade and the business date, and checks it.
- **On the contract (2a).** `SecuritiesLoan.recall(loanId, quantity, settlementDate, noticeHash)`, by the lender of an
  open loan with no recall pending, for at most the quantity outstanding, records the pending recall.
  `withdrawRecall(loanId, withdrawalHash)` removes it. The borrower settles through the existing `instructReturn`; a
  settled return clears the recall when it returns at least the quantity recalled, and otherwise reduces the quantity
  still recalled. A contract change and a new deployment.
- **Intended settlement date (3a, 4a).** The notice date plus two business days, weekends skipped (`cdm-ext`
  `GmslaRecallSettlementDate`). New loans are booked with CDM's `RecallProvision` on the trade's `TerminationProvision`
  (`isRecallable`, `intendedSettlementDate` two business days after the notice), and the notice reads its offset from
  it.
- **Quantity (5a).** All or part of the quantity outstanding.
- **Overdue (6a).** Both services and the console show a recall overdue when the business date is after its intended
  settlement date. No remedy is built here: buy-in and default are row 19.
- **Collateral (7a).** Unchanged by the notice. The return redelivers collateral as in
  `wp-adr-gmsla-loan-delivery-return` (`GmslaReturnCollateral`), and the mark of `wp-adr-gmsla-marking` counts the loan
  in full until the return settles.
- **Withdrawal (8a).** The lender withdraws a pending recall before the return settles, by a `cdm-ext`
  `GmslaRecallWithdrawal` naming the notice's hash, anchored by its own hash.
- **Prototype (9a).** The loans card shows a pending recall, its due date and whether it is overdue, with
  `Recall …` and `Withdraw recall` for the lender. The live spec `flow-gmsla-recall` has A lend 100,000 tMMF to B against
  tUSD. A recalls 40,000, and B returns them and A agrees, which clears the recall. A recalls the rest; with the business
  date moved past the due date it shows overdue; B returns the rest and the loan is returned. A recall on a second loan
  is withdrawn and moves nothing. Every balance ends where it started.

**Consequences.**
- `SecuritiesLoan` is redeployed; the current deployment is kept beside it as before.
- A borrower's own return (row 13) is unchanged; it also reduces a pending recall.
- The rules are assumptions for an SME ([[task-sme-gmsla-recall-rules]]).
