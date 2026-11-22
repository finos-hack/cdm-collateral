# cdm-collateral

A prototype that uses the FINOS Common Domain Model (CDM, written in the Rune DSL) as the data standard for
collateral management, with each workflow settled on a private Hyperledger Besu network. The repository holds the
analysis of CDM for collateral, a local extension of CDM for what it lacks (`cdm-ext`), and a working prototype of 47
collateral workflows across five agreement families, each checked by a live end-to-end test.

Contents:

1. [Analysis: where it is](#1-analysis-where-it-is)
2. [CDM defects: fixed and not fixed](#2-cdm-defects-fixed-and-not-fixed)
3. [CDM gaps: closed, deferred to SMEs, open](#3-cdm-gaps-closed-deferred-to-smes-open)
4. [Flows built](#4-flows-built)
5. [Running the prototype](#5-running-the-prototype)
6. [Repository layout](#6-repository-layout)

## 1. Analysis: where it is

All analysis is in [`docs/analysis/`](docs/analysis/). CDM versions: the analysis read CDM 7.6.0 (commit `f685b4b`);
`cdm-ext` and the prototype are built on CDM 7.7.0.

| Document | What it holds |
|---|---|
| [`cdm-csa-coverage-matrix.md`](docs/analysis/cdm-csa-coverage-matrix.md) | CDM's coverage of collateral under ISDA credit support documents, scored 0 to 5 per capability |
| [`cdm-other-agreements-coverage-matrix.md`](docs/analysis/cdm-other-agreements-coverage-matrix.md) | The same for repo (GMRA), securities lending (GMSLA), triparty and CCP margin |
| [`findings.md`](docs/analysis/findings.md) | What CDM does not cover (modelling gaps), with evidence |
| [`defects.md`](docs/analysis/defects.md) | What CDM gets wrong (D1 to D30), and whether this repository fixed each one ([section 2](#2-cdm-defects-fixed-and-not-fixed)) |
| [`gap-register.md`](docs/analysis/gap-register.md) | Findings and defects consolidated into 41 gaps (G1 to G41), with priority and closure status ([section 3](#3-cdm-gaps-closed-deferred-to-smes-open)) |
| [`cdm-workflow-task-map.md`](docs/analysis/cdm-workflow-task-map.md) | One row per collateral workflow: CDM status, what `cdm-ext` adds, the prototype flow, its live spec and PR ([section 4](#4-flows-built)) |
| [`sme-question-ledger.md`](docs/analysis/sme-question-ledger.md) | Every question for a business SME, with the project owner's interim decision |
| [`sme-brief-registered-assets.md`](docs/analysis/sme-brief-registered-assets.md) | Brief for an SME on registered and claim-based tokens (REG-1 to REG-5): research and interim rules |
| [`collateral-conceptual-model.md`](docs/analysis/collateral-conceptual-model.md), [`collateral-flows.md`](docs/analysis/collateral-flows.md) | The conceptual model and one flow diagram per agreement family, coloured by CDM coverage |
| [`collateral-standards-inventory.md`](docs/analysis/collateral-standards-inventory.md) | Standards a CDM-based collateral implementation should know, and whether CDM uses each |
| [`collateral-taxonomy-inventory.md`](docs/analysis/collateral-taxonomy-inventory.md), [`collateral-asset-taxonomy-mapping.md`](docs/analysis/collateral-asset-taxonomy-mapping.md) | Classification schemes for collateral data, and the four ways CDM can classify an eligible asset |
| [`business-case.md`](docs/analysis/business-case.md) | The problem, who it serves, and the value (draft) |
| [`references.md`](docs/analysis/references.md) | External sources provided by the project owner |

Other documents:

- Architecture: [`architecture/README.md`](architecture/README.md) (the prototype, with the CDM workflows in CALM in
  [`prototype.architecture.json`](architecture/prototype.architecture.json)) and
  [`docs/architecture/blockchain-applicability.md`](docs/architecture/blockchain-applicability.md).
- The local CDM extension: [`cdm-ext/README.md`](cdm-ext/README.md).
- History and presentation: [`docs/presentations/project-narrative.md`](docs/presentations/project-narrative.md) (14
  October to 4 November 2026) and the SME introduction deck: [`docs/index.html`](docs/index.html) (generated from
  [`docs/presentations/intro_deck/`](docs/presentations/intro_deck/), with the PDF there).
- Decisions (ADRs `wp-adr-*`), tasks and the change log are konspekt records in
  [`.konspekt/instance/`](.konspekt/instance/).

## 2. CDM defects: fixed and not fixed

CDM is used as published and never edited, and no defect has been reported to FINOS. "Fixed" means `cdm-ext` has a
corrected function or type, or the prototype works around the defect so it no longer affects results. Per defect, with
how it was fixed: [`defects.md`, In this repository](docs/analysis/defects.md#in-this-repository).

| Status | Count | Defects |
|---|---|---|
| Fixed | 16 | D1 additional haircut reads the FX haircut field; D2 margin ratio applied as a multiplier; D4 full return and termination qualifications collide; D5 substitution qualified as renegotiation; D17 Valuation Percentage subtracted as a haircut *(workaround)*; D18 a changed criterion overwrites the first criterion; D19 `distinct` on an alias does not compile *(workaround)*; D20 `Qualify_Reprice` cannot hold for a repo; D21 adjustment overwrites the cash quantity; D22 repo substitution cannot be qualified; D24 pair-off fails CDM's own validation; D26 lending return event has no instruction *(workaround)*; D27 lending invoice has no amounts; D28 agreement check ignores master agreement elections; D29 settlement amount reverses payer and receiver; D30 eligibility check cannot match by ISIN |
| Not fixed, no effect on the prototype | 3 | D7 repo qualification allows one interest payout; D13 event samples without a qualifier; D23 roll's closing leg carries the new termination date |
| Not fixed | 8 | D3 and D6 faults in CDM's repo sample and documentation; D8 rating check by text equality; D9 to D12 misspellings and text; D25 CDM's repurchase event fails `Qualify_Repurchase` |
| Not applicable | 3 | D14 to D16: the Python build, retired on 2026-10-18 for CDM's Java distribution |

## 3. CDM gaps: closed, deferred to SMEs, open

The gap register consolidates the findings and defects into 41 gaps. They are closed by local extensions in this
repository only; nothing is proposed to FINOS. Per gap: [`gap-register.md`, Closure status](docs/analysis/gap-register.md#closure-status) (also as a page:
[`docs/gap-register.html`](docs/gap-register.html)).

| Status | Count | Gaps |
|---|---|---|
| Closed | 21 | G1 to G10 (margin call lifecycle, proposals, disputes, settlement, portfolio, returns, valuation, concentration, VM amounts, exposure netting); G12 repo and lending exposure; G14 enforcement; G18 recall; G19 and G20 GMRA and GMSLA terms; G22 triparty; G23 CCP; G24 and G25 tokenized assets and ledger anchors; G29 tests; G39 Java toolchain |
| Partial | 7 | G15 close-out (open: ISDA Termination Events); G16 substitution (open: at a CCP); G17 interest and income (open: GMSLA manufactured payments, CCP interest); G21 GMSLA clause library; G33 CDM's Java lending workflows; G34 allocation (open: cost optimisation); G35 reconciliation (open: CCP) |
| Deferred by the project owner | 1 | G26 mapping to ISO 20022 and FpML collateral messages |
| Open | 10 | G11 rating eligibility; G27 taxonomy mapping; G28 regulatory references; G30, G31 and G32 not hit by the prototype or not fixable locally; G37 and G38 transfer type and title-transfer roles; G40 physical assets such as aircraft and asset-finance agreements; G41 provenance linking identities and legal documents |
| Out of scope | 2 | G13 ISDA SIMM; G36 regulatory reporting |

**Deferred to SMEs.** Fifteen of the closed or partial gaps rest on an interim assumption of the project owner. Their
open questions are in [`sme-question-ledger.md`](docs/analysis/sme-question-ledger.md): 229 questions in 40 sections,
one section per `task-sme-*` task, none answered yet. The same questions as a page:
[`docs/sme-questions.html`](docs/sme-questions.html). Which sections belong to which gap:
[`gap-register.md`, Questions deferred to SMEs](docs/analysis/gap-register.md#questions-deferred-to-smes).

## 4. Flows built

All 47 workflows of the [workflow map](docs/analysis/cdm-workflow-task-map.md) are built and pass their live spec in
[`console/e2e/live.spec.ts`](console/e2e/live.spec.ts) (53 specs; last full run 2026-11-13 on a reset chain). Each
row lists its CDM status, the `cdm-ext` work, the prototype flow and the PR.

| Agreement family | Map rows | Workflows | PRs |
|---|---|---|---|
| ISDA CSA margin cycle | A1 to A9 | Margin call issue and response; collateral proposal and eligibility; pledge into escrow; VM title transfer; return of excess IM; default and enforcement; oracle price update; revaluation and top-up; two-way IM | #5, #11, #13 to #15, #40 |
| Other ISDA CSA workflows | B1 to B8 | Close-out netting; substitution; interest on cash collateral; amendment of terms; call cancellation; settlement netting; allocation; reconciliation | #25 to #28, #32, #35 to #37 |
| Repo (GMRA) | C1 to C11 | Terms and amendment; purchase and repurchase DvP; margin maintenance; repricing; adjustment; substitution; interest and manufactured income; roll; pair-off; buy/sell-back; default and close-out | #44 to #50, #52, #55, #56, #58 |
| Securities lending (GMSLA) | C12 to C19 | Terms and amendment; loan delivery and return; marking to market; recall; substitution; rebate; lending fee; default and close-out | #59 to #65 |
| Triparty (GMRA repo, agent BANK-T) | C20 to C25 | Terms and collateral profile; trade start with the agent's allocation; daily revaluation; substitution; trade end; the agent's report | #65 |
| CCP (GMRA repo, BANK-C) | C26 to C30 | Membership, rulebook and default fund; clearing by novation; daily VM and IM; member default and waterfall; porting | #66 |

## 5. Running the prototype

- Build, start, check, drive, stop and reset the live stack: [`docs/setup/runbook-e2e.md`](docs/setup/runbook-e2e.md)
  (`bash scripts/live-e2e.sh up | check | down | reset`).
- Environments: [GitHub Codespaces](docs/setup/setup-codespaces.md), [local Windows](docs/setup/setup-windows.md),
  [Claude Code cloud](docs/setup/claude-code-cloud.md).

## 6. Repository layout

| Path | What |
|---|---|
| [`cdm-ext/`](cdm-ext/) | The local CDM extension (`cdmx`), in Rune, generated to Java |
| [`contracts/`](contracts/) | Solidity contracts (margin calls, repo and lending settlement, triparty, CCP clearing, oracle feed) |
| [`gateway/`](gateway/) | Ledger gateway between a party's service and its Besu node |
| [`services/`](services/) | The collateral workflow service (Java, builds and checks the CDM documents) and the oracle |
| [`store/`](store/) | Content-addressed store of the CDM documents the parties exchange |
| [`console/`](console/) | Party console (React) and the live and scenario end-to-end specs |
| [`besu/`](besu/), [`scripts/`](scripts/), [`orchestrate.mjs`](orchestrate.mjs) | The Besu network and the scripts that run the stack |
| [`architecture/`](architecture/) | Architecture description and the CALM model |
| [`docs/`](docs/) | Analysis, setup guides, presentations, architecture notes and the fleet design |
| [`.konspekt/`](.konspekt/) | Project state: goals, tasks, decisions, transitions ([`AGENTS.md`](AGENTS.md)) |
