```yaml
id: task-gmsla-default-close-out
type: task
title: Securities lending default and close-out
status: open
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T23:49:14Z
```
# Task: securities lending default and close-out

Row 19 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** elections only (S19, S25, score 2: G15): `EventsOfDefault`, automatic early termination.
- **Scope:** An Event of Default, the close-out of every loan of the pair at its value against the collateral held, and one net balance in the Base Currency, as the GMRA close-out of `task-repo-default-close-out`.
- **`cdm-ext`:** a GMSLA close-out statement, reusing the GMRA close-out design where the agreements agree.
- **Prototype:** close-out on `SecuritiesLoan`; a live spec that restores the default status it changes.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran CDM 7.7.0 over the prototype's loans (100,000 tMMF lent by BANK-A to
BANK-B against 102,000 tUSD, and against 1,037 tUST; and the tUST loan after a return of 40,000) and over the
prototype's baseline GMSLA:

- **CDM's termination event** (`Create_TerminationInstruction` through `Create_BusinessEvent`, as
  `CdmRepoDefault.termination` builds it for a repo) passes CDM validation on each loan and qualifies as `Termination`.
  The loans against tUST also qualify as `FullReturn`; the cash loan does not. `Qualify_GmslaReturn` (cdm-ext) gives
  nothing, so a close-out is not read as a return. The closed state is `Terminated`; CDM leaves the collateral
  position as it was (102,000 tUSD, 1,037 tUST, 623 tUST after the partial return), and the event carries no amount.
- **The GMSLA elections** are CDM's `EventsOfDefault`, one `EventsOfDefaultElection` per party; the prototype's baseline
  has automatic early termination `NotApplicable` for both parties, Base Currency USD.
- **CDM has no GMSLA default valuation or close-out:** no Default Market Value (GMSLA paragraph 11), no set-off of the
  delivery and redelivery obligations, no net balance. The prototype's cdm-ext GMRA functions
  (`GmraDefaultMarketValue`: quantity x price, rounded) and the GMRA statement design (`wp-adr-repo-default-close-out`)
  can be reused: per loan, the lender is owed the Default Market Value of the loaned securities and the borrower the
  value of the collateral it delivered (cash at par, securities at their Default Market Value), with GMSLA margin
  held under row 14's calls set off as for the GMRA.
- **`SecuritiesLoan`** has no oracle reference and no close-out; the repo close-out (`RepoSettlement.closeOutDefault`)
  reads the oracle's default record and closes every open repo of the pair in one call.
