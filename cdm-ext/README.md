# Local CDM extension (`cdmx`)

Extensions to the FINOS Common Domain Model for collateral management, written in the Rune DSL and generated like
CDM itself (decisions `wp-adr-cdm-local-extensions`, `wp-adr-cdm-extension-rune`). Not part of FINOS CDM and not
proposed to FINOS. Gaps are numbered as in [`../docs/cdm-development/gap-register.md`](../docs/cdm-development/gap-register.md).

Built on CDM **7.7.0** (`finos-cdm` on PyPI); Rune Python generator **10.15.1.0** (matches CDM 7.7.0's DSL version
10.15.1); rune-fpml **3.8.0** (CDM's dependency, needed to generate).

## Contents

| File | What |
|---|---|
| `rosetta/cdmx-collateral-proposal-type.rosetta` | G2: `CollateralProposal`, `CollateralProposalDecision`, `CollateralProposalStatusEnum`, with conditions |
| `rosetta/cdmx-collateral-proposal-func.rosetta` | G2: `ProposalCoversAgreedAmount`, `DecideCollateralProposal` |
| `rosetta/cdmx-collateral-margincall-type.rosetta` | G1, G3, G4, G6: `MarginCallState` (call, response, agreed and disputed amounts, proposals, settlement, step records), one instruction type per step, status and step enums |
| `rosetta/cdmx-collateral-margincall-func.rosetta` | `Create_MarginCallState` (applies the one step the call waits for), `NextMarginCallStep`, one `Apply…` function per step |
| `rosetta/cdmx-collateral-event-type.rosetta` | G1, G4: `CollateralEvent` (one applied step: instruction, before and after state, qualifier, transfers) |
| `rosetta/cdmx-collateral-event-func.rosetta` | `Create_CollateralEvent`, `QualifyCollateralEvent` and nine `Qualify_…` functions |
| `rosetta/cdmx-collateral-transfer-func.rosetta` | G4: `Create_CollateralTransfer` (one collateral position as a settled CDM `TransferState`) |
| `tests/test_proposal.py` | Tests of the generated Python: functions, pre-conditions, type conditions, Rune JSON round trip |
| `tests/test_margincall.py` | The console scenarios (im-call, im-dispute, im-return) through the lifecycle; wrong order, amounts and currencies rejected; earlier states unchanged |
| `tests/test_event.py` | The same scenarios as events: qualifiers, transfers on delivery and return, CDM's own conditions on the transfer |
| `tests/data.py` | Rune JSON builders for test data |
| `tests/cdm_runtime.py` | Workarounds for defects in the CDM 7.7.0 Python package and `rune.runtime` (D14) and for generated modules that use names they do not import (D15) |
| `build.sh` | Fetch generator and sources, generate, install on top of `finos-cdm`, run the tests |
| `java/` | Java build of the same Rune (spike, 2026-10-18): `pom.xml` generates the `cdmx` namespaces with CDM's toolchain against `cdm-java` 7.7.0; `src/test/java/cdmx/` holds the same 23 tests in JUnit |

## Build and test

```bash
bash cdm-ext/build.sh        # needs Java 21+, Python 3.11+, git, curl; about 90 s from a clean state
```

`build/` (ignored by git) holds the generator, the CDM and rune-fpml sources, the generated code and a virtual
environment with `finos-cdm` plus the generated `finos.cdmx` package.

## Java build (spike, 2026-10-18)

```bash
mvn -f cdm-ext/java/pom.xml test     # needs Java 21 and Maven 3.9; about 30 s with dependencies cached
```

The same `.rosetta` files, generated to Java with CDM 7.7.0's own toolchain: `org.finos.rune:rune-maven-plugin`
10.15.1 with `RosettaStandaloneSetup`, CDM's `.rosetta` files taken from the `cdm-java` 7.7.0 jar to resolve
references, and `rune-config.yml` limiting generation to `cdmx.*`. The tests run on Guice with CDM's
`CdmRuntimeModule`, load test data with `RuneJsonObjectMapper` and validate with `RosettaTypeValidator`.

| Check | Python (`build.sh`) | Java (`java/`) |
|---|---|---|
| Generation of the four `cdmx` namespaces | passes | passes, first attempt, no warnings (84 Java files) |
| The 23 tests (proposal, lifecycle, events, transfers) | pass with the runtime layer `tests/cdm_runtime.py` and the Rune written around D15 | pass with no runtime layer |
| CDM's own conditions on positions with an asset | fail in CDM's generated code (`PriceQuantityTriangulation`, D14) | pass: every event, state and proposal validates with no failure |
| Build and test time | about 80 s generation plus 18–25 s tests | about 30 s from clean (dependencies cached), 10 s again |

Differences found, none needing a workaround:

- A failed condition raises `ConditionValidator.ConditionException` with the condition's description only (no name);
  conditions the tests check now all have a description.
- An absent list attribute reads as `null` (Python: `[]`).
- Rune JSON needs the top-level `@type`, and a choice value (`Asset`, `Transfer`) is written as the chosen option
  with its own `@type` (`"asset": {"@type": "cdm.base.staticdata.asset.common.Security", ...}`), as in CDM's samples.
  The Python test data uses the Python package's form (`"asset": {"Instrument": {"Security": {...}}}`); see D16.
- The model version is written as `"@version": "${project.version}"`: the extension's version is not set yet.

Cross-language check (a settled event written by Java, read by Python, and the reverse): **fails**, defect D16 in
[`../docs/analysis/defects.md`](../docs/analysis/defects.md). Python reads Java's choice values as empty without an
error, Java rejects Python's form, and Python's `rune_serialize` of a settled event fails (D14).

Not yet checked: whether the Rune written around D15 can be simplified for Java; Java behaviour of `Now()`.

## Generation check (2026-10-17)

The question before writing more extensions: can the extension be generated and used **on top of the published
`finos-cdm` package**, or must CDM be generated together with it?

| Check | Result |
|---|---|
| Regenerate CDM 7.7.0 alone with this toolchain | Same 4,522 files as the published package; contents identical except the build timestamp and the order of classes inside `_bundle.py` |
| Generate CDM + extension | The extension is validated against CDM (two mistakes of mine were caught: wrong import for `Money`, an unused import) and written to its own modules under `finos/cdmx/`; its classes are not inside CDM's `_bundle.py` |
| Published `finos-cdm` 7.7.0 + only the generated `finos/cdmx` | **Works**: 6 of 6 tests pass |
| Package generated together (CDM + extension) | 6 of 6 tests pass |

So the extension can ship as a small package added to the published `finos-cdm`; CDM does not need regenerating.

Found while doing it:

- **Generator:** a Rune `set a -> b -> c: value` on an absent `b` does not create `b` in the generated Python
  (`'NoneType' object has no attribute ...`). Written instead with a constructor expression
  (`set a -> b: B { c: value, ... }`), which is clearer anyway.
- **Serialisation:** the extension serialises with the Rune type name `cdmx.collateral.proposal.CollateralProposal`
  and `@version` `0.0.0`; deserialising needs `namespace_prefix="finos"`. The extension's model version is not set
  yet.
- **CDM 7.7.0 Python package defects** (not in our code; recorded as D14 in
  [`../docs/analysis/defects.md`](../docs/analysis/defects.md)): types nested in other types (an asset inside a
  position, an identifier inside a margin call) kept placeholder field types and could not be loaded; references,
  deep copies and dates with metadata fail in `rune.runtime`. `tests/cdm_runtime.py` works around them on the
  published package (rebuilds all classes at start-up, about 5 s), so positions carry their asset. Test data is
  loaded from Rune JSON with CDM's own conditions skipped; tests check the extension's conditions explicitly, and
  CDM's own conditions where CDM's generated code allows (D14: `PriceQuantityTriangulation`).

## Margin call lifecycle (G1, G3, G4, G6)

CDM 7.7.0 runs multi-step processes as an instruction composition: a state record, one instruction per step, a
function that applies a step and one that names the next step. Its state type is a closed CDM choice, so the
extension mirrors the pattern in `cdmx.collateral.margincall` instead of extending it.

| Step (`MarginCallStepEnum`) | Instruction | Allowed when | Effect |
|---|---|---|---|
| IssueCall | `IssueCallInstruction` (CDM `MarginCallIssuance` + Delivery or Return) | no state yet | status Issued |
| RespondToCall | CDM `MarginCallResponse` | Issued | agreed and disputed amounts; Agreed, PartiallyAgreed or Disputed |
| ProposeCollateral | `CollateralProposal` (G2) | delivery call, agreed, nothing pending or accepted | proposal added |
| DecideProposal | `DecideProposalInstruction` | a proposal pending | proposal Accepted or Rejected (rejected: propose again) |
| SettleCall | `SettleCallInstruction` | delivery: a proposal accepted; return: agreed | Settled; any disputed amount stays recorded |

Each step takes its timestamp as an input (CDM's `Now()` is a native function the Python package cannot load), so
the ledger's block time can be used and tests are deterministic. The call names its pledgor and secured party in
CDM's `MarginCallBase -> partyRole` (condition `PledgorAndSecuredParty`); they are the payer and receiver of the
transfers. Not covered yet: balance updates (G5) and dispute resolution beyond recording the disputed amount (G3).

## Events, qualification and transfers (G1, G4)

CDM records a lifecycle step as a `BusinessEvent`: the instruction, the state after it, an `eventQualifier` set by
qualification functions (`Qualify_…`), and transfers. `BusinessEvent` records trade states (`TradeState`), and CDM's
`Create_Transfer` builds transfers from a trade; a margin call has no trade, and `EventIntentEnum` has no collateral
value. `cdmx.collateral.event` therefore has its own event type of the same shape, and `cdmx.collateral.transfer`
builds CDM's own `TransferState`.

`Create_CollateralEvent(before, stepIdentifier, eventDate, timestamp, instruction)` applies the step with
`Create_MarginCallState` and returns a `CollateralEvent` with `before`, `after`, `eventQualifier` and, for a
settlement, one transfer per collateral position:

| Step | `eventQualifier` | Transfers |
|---|---|---|
| IssueCall | `MarginCallIssued` | none |
| RespondToCall | `MarginCallAgreed`, `MarginCallPartiallyAgreed` or `MarginCallDisputed` | none |
| ProposeCollateral | `CollateralProposed` | none |
| DecideProposal | `CollateralProposalAccepted` or `CollateralProposalRejected` | none |
| SettleCall, delivery | `CollateralDelivered` | each position of the accepted proposal, pledgor → secured party |
| SettleCall, return | `CollateralReturned` | each released position, secured party → pledgor |

Each transfer is a CDM `TransferState` holding an `UnscheduledTransfer` (quantity, asset, settlement date = event
date, payer and receiver) with status `Settled`. CDM's `UnscheduledTransferEnum` has no collateral delivery or return
value (its `Return` is the securities-lending return), so `transferType` stays absent. The transfers pass all of
CDM's own conditions (tested).

### Rune Python generator 10.15.1.0: behaviour the Rune is written around (defect D15)

| Behaviour in generated Python | Written as |
|---|---|
| A function's pre-conditions run before its aliases are assigned, so a condition using an alias sees nothing | Conditions spell out the full paths |
| `set a -> b -> c` on an absent `b` does not create `b` | Constructor expression `B { c: …, ... }` |
| A single item given to a list attribute in a constructor is not wrapped in a list | `[item]` |
| `add` to an absent list fails; list literals do not flatten | `set` the list from a `filter` (always a list), then `add` |
| A function called inside `filter` or `extract` is not imported (from the same namespace or another) | Paths written out instead of the helper; where a helper is needed (`Create_CollateralTransfer`), `tests/cdm_runtime.py` adds the missing functions to the generated modules |
| A standalone generated module constructs CDM types under their bundle-internal names (`finos_cdm_event_common_TransferState`) but imports the short names | `tests/cdm_runtime.py` adds the bundle's classes to the generated modules |
| `if … then … else` inside `extract` builds closures that miss `item` | Update written as "others, then the changed one"; one `extract` per branch |
| `set next: state` followed by `set next -> attribute` writes through to the caller's `state` (seen when the state is also stored in an event) | Each step builds a new object with a constructor |
| `if … then …` without `else` returns `True` when the condition is false | `else empty` written out |
| An `empty` function result is `[]`, not `None` | Callers treat both as "nothing" |
| Constructing an object with an absent metadata field fails in the metadata check | Check switched off for the process (`tests/cdm_runtime.py`) |

The caller's objects are not changed by a step, and an event's `before` state equals the previous event's `after` state (tested).

