```yaml
id: task-triparty-reporting
type: task
title: The triparty agent's report to both parties
status: open
review: accepted
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-12T13:55:00Z
```
# Task: The triparty agent's report to both parties

Row 25 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no report or reconciliation by an agent (T12, score 0); `CollateralStatusEnum` and `CollateralBalance` hold positions as data (T10).
- **Scope:** The agent reports to the giver and the receiver the exposure, the collateral allocated with its values and haircuts, and the giver's unallocated balance; each party checks the report against its own records.
- **`cdm-ext`:** a triparty report type over CDM's `CollateralPortfolio`.
- **Prototype:** BANK-T's service builds the report and its hash goes on-chain; both parties' services verify it; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.

**Binding switch** from [[task-triparty-trade-end]] to this task on the project owner's "Move to 25 and 26 - one
build/full test for both. When the tests pass, raise a PR. While PR runs - move to CCP flows" (2026-11-12, source
`8816e213ab23a58fce8e77558228fcd381a4d8f5`), on branch `triparty`. Row 26 of the workflow map is CCP (`task-ccp-workflows`); the maintainer read the
instruction as this row's build and full test, then the PR, then CCP.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the trade-start repo's collateral portfolio:

- **The repo's portfolio as a report.** `CollateralPortfolio` with a `portfolioIdentifier` issued by BANK-T, each
  `CollateralPosition` with `collateralPositionStatus` `SettledAmount` and its haircut as `treatment`
  (`valuationTreatment.haircutPercentage`, `isIncluded` required), and two `CollateralBalance` rows (`SettledAmount`,
  `PostHaircut` and `PreHaircut`, in the base currency, from the giver to the receiver) validates. A position status
  of `FullAmount` is refused (`CollateralPositionStatusSettledOrInTransitOnly`).
- **The giver's free collateral.** A portfolio of the free positions with no balance validates; a `CollateralBalance`
  needs a payer and a receiver, which the free collateral at the agent has not.
- **Exposure and the report itself.** CDM has no agent report (T12); `MarginCallExposure` belongs to margin calls under
  a credit support document. The exposure, the coverage and the report are cdm-ext's.

**Built 2026-11-12** to [[wp-adr-triparty-reporting]] (proposed; the project owner asked for the build without a
design round):

- **cdm-ext** (`cdmx.collateral.triparty`): `TripartyReport` (condition `FreeMatchesValued`) and `TripartyRepoReport`
  (conditions `ValueIsTheSum`, `CoveredMeansCovered`, `OnePositionPerAsset`, `PostHaircutBalance`).
- **Contract** `TripartySettlement`: `recordReport` (the agent, terms in effect) and `reportsOf`. 1 new hardhat test.
- **Gateway** routes `/ledger/v1/triparty/terms/:id/report` (POST), `/reports` and `/at?block=` (the repos with their
  states and holdings, the free account and the feed prices at a block).
- **Service** `CdmTriparty.report`, `verifyReport`, `reportView`; the agent's report route; the giver's and the
  receiver's rebuild from the chain at the block before and the repo documents of that block. `CdmTripartyReportTest`,
  3 tests.
- **Console**: `Send report` in the terms card in `#/live/T`; the latest report with its check in every terms card.
- **Live spec** `flow-triparty-reporting`, before `flow-triparty-trade-end`, which ends its repo. bank-b's test balance
  targets are now 20,000 tUST and 16,000 tAGY: each triparty spec before trade end holds collateral at the agent until
  trade end returns it.

**Full run 2026-11-12** on a new deployment (chain reset): `cdm-ext` 313 tests, collateral service 135, oracle 13, 128
contract tests, gateway and console typechecks, 139 console tests; the live suite, 47 of 48 in 30.7 min.
`flow-settlement-netting` failed once: B's service read A's new margin call before B's node had the block
(`getCall` reverted as for an unknown call); it passed on its own straight after (41.2 s). No triparty code is on that
path; the read-after-write between the bank nodes is a flake to look at separately.
