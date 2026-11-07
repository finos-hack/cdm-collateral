# Business case — CDM-based collateral management

Output for goal `goal-business-case` ("the problem, who it serves, and the value that justifies building it").
Artifact record `artifact-business-case` (proposed). Draft, 2026-10-24.

This document states the case; it does not repeat the analyses it rests on. Every problem statement cites a finding
ID from [`findings.md`](findings.md) or a consequence ID from
[`../architecture/blockchain-applicability.md`](../architecture/blockchain-applicability.md) (§4, B1–B5), where the
evidence (files, line numbers, sources) is kept. Each value claim is labelled:

- **Observed** — stated in a cited source or shown by a test or artifact in this repository.
- **Hypothesis** — expected, not yet shown; the prototype or a later task has to test it.

Project scope applies throughout (`nw-prototype-scope`): the project builds a prototype to illustrate the concept,
and stated assumptions are acceptable in place of production-grade evidence.

## Key to the identifiers

This document refers to findings, defects and gaps by short IDs defined in other analysis files, so a reader who
meets "F2, O8" for the first time can follow the prefix to the file that defines it. Each ID below links to where
its full statement, evidence and line references are kept.

| Prefix | Examples | What it identifies | Defined in |
|---|---|---|---|
| F | F2 | A CDM finding for collateral management | [`findings.md`](findings.md) |
| M | M2, M3, M4 | A margin or amount-calculation finding | [`findings.md`](findings.md) |
| S | S1–S4 | A messaging or standards finding (ISO 20022 `colr`, FpML) | [`findings.md`](findings.md); detail in [`collateral-standards-inventory.md`](collateral-standards-inventory.md) |
| TX | TX1–TX5 | A taxonomy finding (asset and credit-rating classification) | [`findings.md`](findings.md); detail in [`collateral-taxonomy-inventory.md`](collateral-taxonomy-inventory.md) |
| O | O1–O3, O8–O12 | A finding for the other agreement families (repo, securities lending, triparty, CCP margin) | [`findings.md`](findings.md); detail in [`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md) |
| X | X1–X3 | A finding found while building the local extension against CDM 7.7.0 | [`findings.md`](findings.md) |
| B | B1–B5 | A tokenization or on-chain consequence | [`../architecture/blockchain-applicability.md`](../architecture/blockchain-applicability.md) (§4) |
| G | G1–G39 | A gap in the gap register | [`../cdm-development/gap-register.md`](../cdm-development/gap-register.md) |
| D | D9–D15 | A CDM defect | [`defects.md`](defects.md) |

Three prefixes are defined in this document and nowhere else: **V1–V7** are the value claims (§3), **C1–C2** are the
completion goals (§4), and **S1–S8** in §7 are this document's success criteria — a separate numbering from the
S-prefixed messaging findings in the table above, which this document cites only in §1.

## 1. Problem

Collateral management between counterparties runs on bilateral agreements (ISDA CSA, GMRA, GMSLA, triparty, CCP
rulebooks; [`collateral-flows.md`](collateral-flows.md)). The FINOS Common Domain Model (CDM) is the industry data
standard intended to give these processes one machine-readable representation. For collateral, CDM 7.6.0 / 7.7.0
covers agreement terms and eligibility but not the workflow that moves collateral:

| Gap | Effect on a collateral workflow | Source |
|---|---|---|
| Margin call types exist with no function, primitive instruction or business event that creates or processes a call, response, dispute, transfer or balance update | A firm cannot run a margin call through CDM; each implementation builds its own lifecycle outside the standard | F2, O8 |
| CDM lifecycle events are trade-based; a margin call has no trade | No CDM event type records the steps of a margin call | X1 |
| No mapping to ISO 20022 `colr` or FpML collateral process messages | The messages firms exchange today cannot be produced from or read into CDM objects | S1 |
| Eligible assets are classified by four taxonomies with no mapping between them | Eligibility schedules written against one taxonomy cannot be checked against assets classified by another | TX4 |
| Credit ratings have no scale or order | Minimum-rating eligibility criteria cannot be evaluated | TX3 |
| No attribute identifies a tokenized asset on a ledger (network, token contract, DTI) | Tokenized collateral cannot be represented as eligible collateral | B1 |
| Repo and securities-lending collateral calculation, triparty and cleared margin are absent or thin | The gap extends beyond the ISDA CSA to the other agreement families | O1–O3, O9, O10 |

The CDM Collateral Working Group listed margin call issuance and response as an area where CDM may help (F2, external
context); no CDM issue proposing the functions or events was found. The gap is known and not scheduled.

In parallel, tokenized collateral is moving from pilots to market infrastructure. The GDF/ISDA sandbox ran margin
calls "generated from CDM-based analytics" into on-chain settlement "in under two minutes" (applicability §2–§3,
[GDF]). DTCC's tokenization service runs on Canton and on DTCC's private Besu network, with "settlement and
collateral" on its roadmap (applicability §1, [DTCC]). The sandbox supplied the margin-call layer from a vendor
product, because CDM has none (B2).

**Problem statement.** There is no open, standards-based implementation of the collateral margin-call lifecycle
that connects CDM agreement terms to collateral settlement, on traditional or tokenized rails.

## 2. Who it serves

| Audience | What they need from this project | Source of the audience |
|---|---|---|
| **First audience:** FINOS CDM (collaborator), CDM users and the CDM Collateral Working Group | A worked example of the margin-call lifecycle in Rune DSL, with tests, and the CDM findings and defects found while building it | `nw-repo-shared-with-cdm-maintainers`; F2 external context; [`defects.md`](defects.md); `cdm-ext/README.md` |
| Pledgor operations | Receive and answer margin calls, propose collateral, call for returns, using one shared representation of the call | Participant `pledgor-ops`, `architecture/prototype.architecture.json` |
| Secured party operations | Issue calls, revalue collateral, accept or reject proposals, enforce on default | Participant `secured-party-ops`, `architecture/prototype.architecture.json` |
| Market data operator | Publish prices, NAV and ratings that both parties' calculations use | Participant `market-operator`, `architecture/prototype.architecture.json` |
| Tokenized-collateral initiatives | A reference for the CDM-to-ledger interface (B2) and the asset identity a token needs to be eligible collateral (B1) | Applicability §1–§4 |

The project is carried out in collaboration with FINOS. Maintainers of the CDM Python stack, who are FINOS members,
are collaborators on this repository, and the repository is intended to become a FINOS project
(`nw-repo-shared-with-cdm-maintainers`). Findings and defects reach FINOS CDM through that collaboration. The
extension in `cdm-ext/` is maintained in this repository (`wp-adr-cdm-local-extensions`; `cdm-ext/README.md`).
The case is written for FINOS CDM and the Collateral Working Group first (decided 2026-10-24); §3 leads with V1,
the claim that audience can check in this repository, and S5 measures delivery to it.

## 3. Value

| # | Claim | Label | Evidence or test |
|---|---|---|---|
| V1 | The margin-call lifecycle can be expressed in CDM's own DSL (Rune) on top of CDM 7.7.0, without editing CDM | **Observed** | `cdm-ext/` builds `MarginCallState`, one instruction and `Apply…` function per step, and `CollateralEvent`; `MarginCallTest` and `EventTest` run the im-call, im-dispute and im-return scenarios and pass CDM's full validation of each event (`cdm-ext/README.md`) |
| V2 | Both parties holding the same CDM representation of a margin call removes the per-firm format translation in call exchange | **Hypothesis** | First milestone (qualitative): the two participant workflow services of `task-e2e-wiring` exchange only CDM objects over the peer messaging API and reach the same state (S2). After G26 closes (measured): comparison against an ISO 20022 `colr` baseline (S8) |
| V3 | Executable eligibility and call calculation in CDM lets both parties compute the same call amount from the same terms | **Hypothesis**, partly observed | CDM's Delivery/Return Amount functions run for the ISDA 2018 IM CSA only (M3); concentration limits and rating order are missing (M2, TX3) |
| V4 | Settlement against tokenized collateral reaches a deterministic finality point, so a collateral movement has a defined "settled" moment | **Hypothesis** for this prototype; **observed** in the GDF sandbox | `concept-asr-settlement-finality`; Besu QBFT network in this repository; [GDF] settlement in under two minutes |
| V5 | A ledger-neutral gateway keeps the workflow independent of one ledger (Besu ERC-20 now, Canton CIP-56 later) | **Hypothesis** | `concept-asr-ledger-neutrality`; tested when a second adapter is added |
| V6 | A shared ledger reduces, but does not remove, reconciliation between parties | **Observed** in sources | Applicability §3, reconciliation row ([IEI]) |
| V7 | Faster settlement could support a lower margin period of risk | **Hypothesis** (sources argue it; regulators have not adopted it) | Applicability §3 ([FCA]) |

Value this project does not claim: production readiness, regulatory approval of tokenized collateral, capital
treatment, or legal settlement finality protection, which the sources state is not yet in place in the UK
(applicability §5).

## 4. Completion goals

The project is complete when both goals below are met. They define 100% coverage; §5 groups the asset classes the
goals apply to, and §6 states the first milestone toward them.

**C1 — Close every known in-scope gap.** Every gap that
[`../cdm-development/gap-register.md`](../cdm-development/gap-register.md) classifies P1, P2 or P3 is closed by a
local extension in `cdm-ext/` (`wp-adr-cdm-local-extensions`), with tests (G29). A gap whose register closure kind is
"none locally" or "none for now" (G32, G33) counts as closed when it is documented as a note in the register. The register holds 39 gaps: 15 P1, 12 P2, 9 P3 and 3
classified out of scope. Its closure-status table records G1, G2, G4, G6 and G39 as closed (G1 and G4 proposed, for
review) and G3 as partial; the other 33 are open. The register is the list of record: this document does not copy
it, and a gap added to the register is added to C1.

**C2 — Support every known flow for all five agreement families.** Every lifecycle step in the flow of each family
in [`collateral-flows.md`](collateral-flows.md) runs through CDM objects built by `cdm-ext`:

| Family | Parties | Flow of record | Gaps specific to the family |
|---|---|---|---|
| ISDA CSA (IM and VM) | pledgor, secured party | [ISDA CSA](collateral-flows.md#isda-csa); [`collateral-conceptual-model.md`](collateral-conceptual-model.md) | G1–G10, G14, G15, G38 |
| Repo (GMRA) | seller, buyer | [Repo (GMRA)](collateral-flows.md#repo-gmra) | G12, G15, G19, G20, G30 |
| Securities lending (GMSLA) | lender, borrower | [Securities lending (GMSLA)](collateral-flows.md#securities-lending-gmsla) | G12, G17, G18, G19, G21, G33 |
| Triparty | collateral giver, collateral receiver, triparty agent | [Triparty](collateral-flows.md#triparty) | G22, G34 |
| CCP margin | clearing member (and clients), CCP | [CCP margin](collateral-flows.md#ccp-margin) | G23, G15 |

Gaps not listed against a family apply across families: G11, G16, G24–G29, G31, G32, G37 and G39 (closed). G13
and G36 are the register's out-of-scope gaps, and G35 was until 2026-11-07; all three are discussed below.

**Gaps outside C1.** The three gaps the register classified out of scope — G13 (ISDA SIMM: the IM amount comes from a
risk engine), G35 (reconciliation) and G36 (regulatory reporting of margin) — were project non-goals (§6). The
register's reason for G35 ("the shared ledger replaces reconciliation in the prototype") conflicts with V6, which the
sources support: a shared ledger reduces reconciliation but does not remove it. G35 moved back into
scope on 2026-11-07 (§8 item 3).

## 5. Collateral asset coverage

The assets that can be posted as collateral are too many to list one by one. ISDA's Collateral Asset Definitions
alone hold 178 country-specific codes, and CDM's equity index list holds 342 indices
([`collateral-asset-taxonomy-mapping.md`](collateral-asset-taxonomy-mapping.md)). The completion goals therefore
apply to **asset groupings**. Each grouping below collects rows of the 17-category mapping in
`collateral-asset-taxonomy-mapping.md`, which maps each category to CDM criteria, ISDA codes, EU/UK EMIR classes,
US CFTC classes and ISO 10962 CFI.

| Grouping | Mapping rows | Examples | Coverage on canonical |
|---|---|---|---|
| Cash | 1 | cash in any currency | Mapped in all four taxonomies (CFI: none) |
| Sovereign and public-sector debt | 3–10 | government bills and bonds, regional and local authority debt, agency and GSE debt, multilateral development banks, international organisations | Mapped |
| Bank and corporate debt | 11–13, 15 | covered bonds, corporate bonds, commercial paper, convertible bonds | Mapped |
| Securitised debt | 14 | senior tranches, MBS, ABS | Mapped |
| Equities | 16 | equities in a main index | Mapped |
| Funds | 17 | money market funds, ETFs, mutual funds | Mapped; tokenized money market funds are the case studied in [GDF] and [CSA] |
| Commodities | 2 | gold | Mapped (gold only) |
| Tokenized forms of the above | applies to every grouping | tokenized treasuries, tokenized MMF shares, DTCC tokenized securities | Not representable: gap G24 (B1, B5) |
| Assets outside the regulatory eligibility classes | none | real estate, credit claims, letters of credit | No taxonomy in the mapping classifies them (search boundary: `docs/` on `e2e-wiring`) |

Tokenization is a second dimension: a tokenized asset belongs to its economic grouping (a tokenized treasury is
sovereign debt) and also needs the on-chain identity of `concept-asr-onchain-asset-identity`.

Derivative contracts appear in the five families as the exposure being collateralised (the trades behind an ISDA CSA,
the cleared positions behind CCP margin), not as eligible collateral; none of the four taxonomies in the mapping
classifies a derivative as an eligible asset. Whether the last grouping (real estate and other assets outside the
regulatory classes) is in scope for C1 and C2 is an open decision (§8 item 4).

## 6. First milestone and non-goals

**First milestone.** The prototype demonstrates the five CALM flows in `architecture/prototype.architecture.json`,
run end to end against real services and on-chain state (`task-e2e-wiring`). Four are ISDA CSA initial-margin
flows on tokenized collateral and the fifth publishes the prices and ratings they use, so the milestone covers part
of one family in C2:

1. `flow-im-margin-call-pledge` — initial margin call, collateral proposal and on-chain pledge;
2. `flow-oracle-update` — oracle price and rating update;
3. `flow-revaluation-top-up` — collateral revaluation and top-up call;
4. `flow-return` — return of initial margin;
5. `flow-default-enforcement` — default and enforcement.

**Non-goals of the first milestone.**

- Privacy between participants on the prototype network: every Besu node reads all contract state
  (`nw-assumption-besu-visibility`); examined separately in `task-onchain-privacy`.
- Production data, keys or market data: the prototype uses test tokens, a development keystore and a mock market
  data source (`dev-keystore`, `mock-market-data` in the CALM model).

**Non-goals of the project.**

- Merging `cdm-ext` into the FINOS CDM model: the extension is maintained in this repository
  (`wp-adr-cdm-local-extensions`; see §8 item 1).
- ISDA SIMM calculation (G13) and regulatory reporting of margin (G36), classified out of scope in the gap register.
  Reconciliation (G35) was a non-goal until 2026-11-07 (§8 item 3).

## 7. Success criteria

The case is supported when each criterion below has a recorded result. Criteria S1–S3 measure the first milestone
and are checkable in this repository; S4 depends on a ledger decision and S5 on delivery to the first audience; S6–S7
measure the completion goals; S8 follows G26.

| # | Criterion | Supports | How it is checked |
|---|---|---|---|
| S1 | All five CALM flows run end to end with CDM objects built by `cdm-ext` and validated by CDM's validator at each step | V1, V2 | End-to-end test harness (`e2e-test-harness`) per `architecture/testing.md` |
| S2 | Both participants' workflow services reach the same `MarginCallState` for each scenario from the same inputs | V2, V3 | Comparison of the two workflow stores after each flow run |
| S3 | Every collateral movement in the flows has a recorded finality point on the ledger before the workflow marks it settled | V4 | Ledger gateway finalized-event reports to the workflow service |
| S4 | The same workflow runs against a second ledger adapter without workflow code changes | V5 | Not yet scheduled; depends on the second ledger target (`wp-adr-prototype-ledgers`) |
| S5 | FINOS CDM and the Collateral Working Group receive the consolidated findings and defects (`findings.md`, `defects.md`) and the `cdm-ext` reference implementation with its tests | First audience (§2) | Delivery recorded through the FINOS collaboration |
| S6 | Every P1–P3 gap in the gap register has closure status `closed` | C1 | Closure-status table of `gap-register.md` |
| S7 | Every lifecycle step of each of the five families' flows runs through `cdm-ext` with tests, for each asset grouping in scope (§5) | C2 | One end-to-end scenario per family and step; coverage table to be added to `collateral-flows.md` |
| S8 | The margin-call exchange of S2, run once with CDM objects and once with ISO 20022 `colr` messages mapped through G26, needs no per-firm translation step in the CDM run | V2 (measured) | Scheduled after G26 closes |

## 8. Open decisions

1. **ADR wording against the FINOS collaboration — resolved 2026-10-24.** `wp-adr-cdm-local-extensions` was amended
   on 2026-10-24: its "Nothing is proposed or reported to FINOS" clause is superseded to record that findings and
   defects reach FINOS through the collaboration (§2), while the project formally sits outside FINOS governance for
   now and the `cdm-ext` extensions stay maintained in this repository. The amendment is also recorded in
   `nw-finos-collaboration`.
2. **Order of the families after the first milestone — decided 2026-11-03.** C2 covers all five families. After the
   ISDA CSA cycle, repo is built first, then securities lending, triparty and CCP margin (O1–O3, O9, O10), as recorded
   in `nw-agreement-family-order` and `docs/analysis/cdm-workflow-task-map.md`.
3. **G35 classification — decided 2026-11-07.** Reconciliation (G35) moves back into scope, given V6 (§4, Gaps outside
   C1): each party's CDM records against the chain, and the trade portfolios between the parties
   (`wp-adr-reconciliation-scope`).
4. **Assets outside the regulatory classes.** Whether real estate, credit claims, letters of credit and other assets
   no taxonomy in the mapping classifies are in scope for C1 and C2. If they are, a new gap is needed in the
   register, because CDM's `AssetType` hierarchy was mapped only for the 17 categories.
