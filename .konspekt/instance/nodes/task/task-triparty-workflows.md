```yaml
id: task-triparty-workflows
type: task
title: Implement the triparty collateral workflows
status: open
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.75
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-12T00:36:54Z
```
# Task: implement the triparty collateral workflows

Section C of the workflow map (`docs/analysis/cdm-workflow-task-map.md`), from [[investigation-cdm-workflow-task-map]]. Starts after the ISDA CSA cycle
([[task-csa-workflow-extensions]]), per the build order the project owner set on 2026-11-03; the order among the four
agreement families is set in [[nw-agreement-family-order]] (business case §8 item 2).

Workflows in the analysis for triparty: agent valuation, allocation and settlement. Main CDM gaps: G22. Scope per workflow, prototype flows and live specs are
to be defined when this task starts.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the prototype's repo (1,000,000 tUSD against 10,366
tUST, BANK-A selling to BANK-B) and its collateral schedule functions:

- **The agent as a party.** A third party added to the repo trade with `PartyRoleEnum.TripartyAgent` passes CDM
  validation, and the trade still qualifies as a repurchase agreement. CDM also has `SettlementAgent`, `Custodian` and
  `ThirdPartyCustodian` roles. Nothing else in CDM refers to the agent.
- **The collateral profile.** An `EligibleCollateralSpecification` built as the prototype builds the CSA schedule
  (`CdmAgreement.baselineSchedule`: tUST at a 2% haircut, tAGY at 3%) validates, and `HaircutFor` gives 2% for tUST, 3%
  for tAGY and nothing for tMMF, which the profile leaves out. The cdm-ext concentration functions of the CSA rows apply
  to the same specification.
- **Allocation, substitution, settlement and reporting by the agent: absent.** No function or event in which a third
  party selects collateral against a profile or replaces it (T7, T8). `DeliveryMethodEnum` has DeliveryVersusPayment,
  FreeOfPayment, PreDelivery and PrePayment, no triparty value (T9). No agent report (T12). `CollateralStatusEnum`
  (FullAmount, SettledAmount, InTransitAmount) and `CollateralPortfolio` can hold the agent's allocation as data (T10).
- **The prototype has two parties.** BANK-A and BANK-B, each with a gateway, a service and a Besu account; there is no
  third party in the live stack.

**Scope chosen 2026-11-11** (source `41bdcccfd2c7410720f06a21f0e5ff20ae297d3c`), recorded in [[wp-adr-triparty-scope]] (accepted 2026-11-11): six workflows of a
triparty repo under the GMRA, one task each:

1. [[task-triparty-terms-profile]]: Triparty terms and the collateral profile.
2. [[task-triparty-trade-start]]: Triparty trade start: allocation by the agent and DvP of the cash.
3. [[task-triparty-revaluation]]: Triparty daily revaluation by the agent, with top-up or release.
4. [[task-triparty-substitution]]: Triparty substitution by the agent.
5. [[task-triparty-trade-end]]: Triparty trade end: release of the collateral against repayment.
6. [[task-triparty-reporting]]: The triparty agent's report to both parties.
