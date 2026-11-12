```yaml
id: wp-adr-gmsla-default-close-out
kind: decision
subtype: adr
timestamp: 2026-11-12T00:05:02Z
review: proposed
provenance:
  conversationId: gmsla-default-close-out
  sourceRef: 7959b57674d67db7e8b0388d158596713d079aea
  contentHash: 7959b57674d67db7e8b0388d158596713d079aea
  timestamp: 2026-11-12T00:05:02Z
  confidence: 0.55
createdAt: 2026-11-12T00:05:02Z
updatedAt: 2026-11-12T00:05:02Z
```
# ADR: a GMSLA default closes out every delivered loan of the pair at its Default Market Value against the collateral held, and settles one net balance in tUSD

For [[task-gmsla-default-close-out]] (section C, row 19 of the workflow map), within
[[wp-adr-securities-lending-gmsla-scope]], reusing the design of [[wp-adr-repo-default-close-out]]. The project owner
chose on 2026-11-11 (source `7959b57674d67db7e8b0388d158596713d079aea`: "1a 2a 3a 4a 5a 6a 7a 8a 9a"), after the CDM check recorded in that task: CDM's
termination event qualifies on a loan and carries no amount; CDM has the GMSLA's `EventsOfDefault` elections but no
Default Market Value, set-off or net balance. The rest of this record is the maintainer's proposal.

- **Event of Default (1a).** The oracle's default record (`OracleFeed.setDefault`) is the Event of Default, as for the
  GMRA. The non-defaulting party serves a Default Notice naming the Early Termination Date: a `cdm-ext`
  `GmslaDefaultNotice` whose hash `SecuritiesLoan` stores. When the defaulting party's GMSLA election
  (`EventsOfDefaultElection.automaticEarlyTerminationApplies`) is `Applicable`, the Early Termination Date is the date
  of the default and no notice is served. The baseline GMSLA has it `NotApplicable` for both parties.
- **Termination.** Every delivered (open) loan of the pair ends with CDM's termination event
  (`Create_TerminationInstruction`, no intent, `activityDate` the Early Termination Date), one per loan; it qualifies
  as `Termination`, and `Qualify_GmslaReturn` gives nothing for it. A pending return, recall, substitution or invoice
  on those loans lapses. Booked or affirmed loans not yet delivered stay as they are.
- **Values (2a, 3a).** `cdm-ext` `GmslaDefaultLoanValue` per loan, from `GmraDefaultMarketValue` (quantity x price,
  rounded to whole tUSD): the lender is owed the Default Market Value of the loaned securities outstanding at the
  oracle price on the Early Termination Date; the borrower is owed the value of the collateral the lender holds, cash
  at par and securities at their Default Market Value.
- **Unpaid rate (4a).** The rebate or fee accrued from the billed-through date (or the delivery) to the Early
  Termination Date, built as rows 17 and 18 build an invoice (`CdmLoanInvoice`; a fee at the loaned security's oracle
  price on that date), is carried in the loan value as a `GmslaLoanInvoice` and enters the balance: a fee owed by the
  borrower, a rebate owed by the lender. A pending invoice covers part of the same period and lapses.
- **Margin (5a).** Margin one party holds from the other under the pair's settled GMSLA calls (row 14), net per asset:
  cash at par, securities at their Default Market Value, owed back by the holder. Each entry names its calls; after a
  close-out the GMSLA margin views no longer count them.
- **Net balance (6a).** A `cdm-ext` `GmslaCloseOutStatement` sets every value off into one balance in the Base
  Currency, payable by the party that owes it. No securities or collateral move: the borrower keeps the loaned
  securities and the lender the collateral. The statement's hash and the balance are recorded on-chain; the payer's
  service rebuilds the statement from its own loan documents, the chain's billed-through dates and margin, and the
  prices the statement states, and pays in tUSD.
- **Contract (7a).** `SecuritiesLoan` takes the oracle's address at deployment and gains `serveDefaultNotice`,
  `closeOutDefault` (every open loan of the pair to a new state `ClosedOut`, with the close-out id), `payCloseOut` and
  their views. A new deployment; the previous one is kept as `besu.pre-gmsla-default-close-out.json`.
- **Agreements (8a).** One statement per agreement: a GMSLA close-out does not include the pair's repos, and the GMRA
  close-out does not include its loans.
- **Prototype (9a).** A "Securities lending default (GMSLA)" card beside the Loans card: the non-defaulting party's
  "Close out" with a preview of the statement once the counterparty is in default (or to declare it), and "Pay"
  for the party that owes the balance. Live spec `flow-gmsla-default-close-out`, which restores the defaulting party's
  default status as it found it.

**Consequences.**
- A contract change and a new deployment.
- The two services must see the same oracle prices on the Early Termination Date for the statement to rebuild.
- The rules are assumptions for an SME ([[task-sme-gmsla-default-rules]]).
