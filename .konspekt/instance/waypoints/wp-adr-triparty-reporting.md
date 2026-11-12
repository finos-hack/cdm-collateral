```yaml
id: wp-adr-triparty-reporting
kind: decision
subtype: adr
timestamp: 2026-11-12T13:55:00Z
review: proposed
provenance:
  conversationId: triparty-reporting
  sourceRef: 8816e213ab23a58fce8e77558228fcd381a4d8f5
  contentHash: 8816e213ab23a58fce8e77558228fcd381a4d8f5
  timestamp: 2026-11-12T13:55:00Z
  confidence: 0.5
createdAt: 2026-11-12T13:55:00Z
updatedAt: 2026-11-12T13:55:00Z
```
# ADR: the agent reports every settled repo under the terms and the giver's free collateral on its business date as CDM collateral portfolios, records the report's hash, and the giver and the receiver rebuild it from the chain

For [[task-triparty-reporting]] (section C, row 25 of the workflow map), within [[wp-adr-triparty-scope]], over the repos
of [[wp-adr-triparty-trade-start]] as [[wp-adr-triparty-revaluation]] and [[wp-adr-triparty-substitution]] leave them.
The project owner asked for this row's build and full test without a design round (2026-11-12: "Move to 25 and 26 - one
build/full test for both"); this record is the maintainer's proposal, built and awaiting review, after the CDM check
recorded in that task.

- **Trigger.** The agent sends a report for one terms on request (`Send report` in `#/live/T`), on its business date.
- **Content.** A cdm-ext `TripartyReport`: the terms hash, the report date, one `TripartyRepoReport` per settled repo
  under the terms, and the giver's free collateral. Each repo report has the repo id and trade id, the exposure (cdm-ext
  `TripartyRequiredValue`: the Repurchase Price accrued to the date), each held asset valued at the feed price less its
  haircut (`TripartyValued`), the value after haircuts, whether it covers the exposure, the concentration breaches, and
  CDM's form of the holding: the repo's `CollateralPortfolio` with its identifier (the trade id, issued by the agent),
  each position `SettledAmount` with its haircut as `treatment`, and two `CollateralBalance` rows after and before
  haircuts from the giver to the receiver. The free collateral is a `CollateralPortfolio` of the free positions with no
  balance, and their values.
- **Verification.** The giver and the receiver each rebuild the report from the chain at the block before it (the
  repos under the terms and their states, holdings, the free account and the feed prices, through the gateway) and the
  repo documents in their payload stores; a report that differs is shown with its difference.
- **Contract.** `TripartySettlement.recordReport(termsId, reportHash)` (the agent, terms in effect) and
  `reportsOf(termsId)` (each hash with its block). A new deployment.
- **Console.** The agent's `Send report` per terms; each party sees the latest report: per repo the exposure, the value
  after haircuts and the coverage, the free collateral, and its own check.
- **Live spec.** `flow-triparty-reporting`: with a settled trade-start repo and tAGY free, the agent sends a report; A
  and B rebuild it; the repo shows 500,026.56 after haircuts against 500,000 on the Purchase Date, and 1,810 tAGY free.

**Consequences.**
- `TripartySettlement` changes again; a new deployment.
- The report's content is an assumption; the questions are in [[task-sme-triparty-reporting]].
