# CDM collateral workflow → task map

Part of `investigation-cdm-workflow-task-map` (goal `goal-end-to-end-flow`). One row per collateral workflow that this
repository's analysis identifies, with its CDM status, the prototype flow that implements it (the CDM workflows in
[`architecture/prototype.architecture.json`](../../architecture/prototype.architecture.json), written in CALM), what
is built, and the task that closes what is missing.

Sources: [`cdm-csa-coverage-matrix.md`](cdm-csa-coverage-matrix.md),
[`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md),
[`findings.md`](findings.md), [`collateral-conceptual-model.md`](collateral-conceptual-model.md),
[`collateral-flows.md`](collateral-flows.md), [`business-case.md`](business-case.md) and the gap register
[`../cdm-development/gap-register.md`](../cdm-development/gap-register.md) (gap IDs G1–G39). Implementation status is
as of `main` at `916f51f` (PR #11, 2026-11-03).

Build order, set by the project owner on 2026-11-03: the ISDA CSA cycle first (sections A and B), then the four other
agreement families (section C). Section B starts only after the rest of section A is done: `flow-oracle-update`,
`flow-revaluation-top-up` and the valuation gaps G7–G10 (`nw-core-cycle-first`, project owner). The order of the
rows in section B (`nw-csa-extension-order`) and section C (`nw-agreement-family-order`) is proposed by the
maintainer and not yet accepted.

## A. ISDA CSA margin cycle — implemented in the prototype

"Live spec" is a Playwright test in `console/e2e/live.spec.ts` that asserts on-chain state through the gateways.

| Workflow | Prototype flow | Built (contracts, gateway, services, console) | Live spec | Open CDM gaps | Task |
|---|---|---|---|---|---|
| Margin call issue and response (agree, partly agree, dispute) | `flow-im-margin-call-pledge` | yes | passes | G3 dispute resolution (partial: the disputed amount is recorded, resolution is not modelled) | `task-cdm-gap-closure` |
| Collateral proposal, eligibility, accept or reject | `flow-im-margin-call-pledge` | yes | passes | G7 haircut (defect D1), G8 concentration limits, G11 rating check (D8) | `task-cdm-gap-closure` (valuation, G7–G10) |
| Pledge settlement into escrow | `flow-im-margin-call-pledge` | yes | passes | G5 balances, G37 transfer type, G38 title-transfer party roles | `task-cdm-gap-closure` |
| Variation margin call and title transfer | `flow-vm-margin-call-transfer` | yes | passes | G9 (no VM call amount; 2018 IM CSA only), G10 exposure | `task-cdm-gap-closure` (valuation, G7–G10) |
| Return of excess initial margin | `flow-return` | yes | passes | none (G6 closed in `cdm-ext`) | `task-e2e-remaining-flows` |
| Default and enforcement against segregated IM | `flow-default-enforcement` | yes (default notices through `services/oracle`) | passes | G14 enforcement step | `task-e2e-remaining-flows`; G14 in `task-cdm-gap-closure` |
| Oracle price and rating update | `flow-oracle-update` | `OracleFeed.publishPrice` only | none | input to G7 and G11 | `task-e2e-remaining-flows` |
| Revaluation and top-up call | `flow-revaluation-top-up` | no | none | revaluation and top-up scores 2 (CSA matrix) | `task-e2e-remaining-flows`; modelling question `task-revaluation-top-up-modelling` |
| Two-way initial margin (one leg per direction) | variant of the pledge, return and default flows | no (one direction only) | none | not scored | `task-two-way-initial-margin` |

## B. ISDA CSA workflows with no prototype flow

Rows are in the proposed build order (`nw-csa-extension-order`): gap-register priority first, then workflows that
extend flows the prototype already runs.

| # | Workflow | CDM status | Task |
|---|---|---|---|
| 1 | Close-out netting on default | elections only (0–2): G15, P2 | `task-csa-workflow-extensions` |
| 2 | Substitution | partial (2): works for repo and lending only, qualified as a renegotiation (G16, P2; D5) | `task-csa-workflow-extensions` |
| 3 | Interest on cash collateral | types only (2): G17, P2 | `task-csa-workflow-extensions` |
| 4 | Amendment of agreement terms | modelled for the CSA (4) | `task-csa-workflow-extensions` |
| 5 | Margin call cancellation | no matrix row; only the ISO 20022 message names (colr.005/006, findings) | `task-csa-workflow-extensions` |
| 6 | Settlement netting | absent (0–2), no gap ID; "inside the transfer step when built" (CSA matrix) | `task-csa-workflow-extensions` |
| 7 | Collateral allocation and optimisation | absent (0): G34, P3; the pledgor chooses assets by hand | `task-csa-workflow-extensions` |
| 8 | Reconciliation | absent (0): G35, classified out of scope; reopened as an open decision (business case §8 item 3) | `task-csa-workflow-extensions` (decision first) |

Out of scope per the gap register and business case: ISDA SIMM calculation (G13, input only) and regulatory
reporting (G36).

## C. Other agreement families — after the CSA cycle

Rows are in the proposed build order (`nw-agreement-family-order`): repo and securities lending (P2) before triparty
and CCP (P3).

| Family | Workflows in the analysis | Main gaps | Task |
|---|---|---|---|
| Repo (GMRA) | terms, margin maintenance, reprice, adjustment, roll, repurchase, pair-off, buy/sell-back, substitution, income | G20 terms, G12 net exposure and inverted margin ratio, G33 buy/sell-back, G19 amendment | `task-repo-gmra-workflows` |
| Securities lending (GMSLA) | terms, marking, loan return, recall, substitution, rebate and fees | G21 terms, G12 marking, G18 recall | `task-securities-lending-gmsla-workflows` |
| Triparty | agent valuation, allocation and settlement | G22 | `task-triparty-workflows` |
| CCP | margin call, default management, porting | G23 | `task-ccp-workflows` |

## Cross-cutting

- `task-onchain-privacy`: what each participant must not see of other parties' calls, pledges and disputes.
- `task-collateral-service-unit-tests`: `services/collateral` has no unit tests.
- `task-live-spec-balance-aware-amounts`: live specs drain the pledgor's balances on a persistent chain.
