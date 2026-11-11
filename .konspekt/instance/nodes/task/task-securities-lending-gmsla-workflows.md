```yaml
id: task-securities-lending-gmsla-workflows
type: task
title: Implement the securities lending (GMSLA) collateral workflows
status: open
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.75
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-11T16:00:00Z
```
# Task: implement the securities lending (GMSLA) collateral workflows

Section C of the workflow map (`docs/analysis/cdm-workflow-task-map.md`), from [[investigation-cdm-workflow-task-map]]. Starts after the ISDA CSA cycle
([[task-csa-workflow-extensions]]), per the build order the project owner set on 2026-11-03; the order among the four
agreement families is set in [[nw-agreement-family-order]] (business case §8 item 2).

Workflows in the analysis for securities lending (GMSLA): terms, marking, loan return, recall, substitution, rebate and fees. Main CDM gaps: G21 (agreement terms), G12 (marking not calculated), G18 (recall). Scope per workflow, prototype flows and live specs are
to be defined when this task starts.

**CDM check, 2026-11-11** (a temporary test that ran CDM's lending functions on CDM's own samples in
`functions/sec-lending/`):

- Settlement workflows (`RunNewSettlementWorkflow`, `RunReturnSettlementWorkflow` full and part; Java, three steps each:
  the event, the proposed settlement, the settlement): every step fails CDM validation. The execution qualifies as
  `Execution`; the settlement transfer events qualify as no event. The return event has no `instruction`, so
  `Qualify_FullReturn` cannot hold, and CDM has no partial return qualification (defect D26; D4 is a second reason).
  The workflows need a `PostProcessor` binding that CDM's runtime module does not provide.
- Billing (`Create_SecurityLendingInvoice`): the records have no amount and the invoice no `billingSummary`, because the
  amount function reads the lending fee from an `InterestRatePayout` and the security from the collateral path, and
  CDM's lending trade has neither (defect D27). There is no rebate function.
- `Qualify_SecurityLending` holds for CDM's lending trade: one `AssetPayout` (the lent security) and the collateral in
  a `CollateralPortfolio`.
- Recall: `RecallProvision` terms only (recallable, cut-off and notification times, intended settlement date) and a
  `Recall` transfer type; no recall function or event.
- Terms: `GlobalMasterSecuritiesLendingAgreement` holds collateral, Base Currency and Events of Default elections.
- Marking and substitution: no lending function; the CSA and repo functions the prototype uses are the candidates.
