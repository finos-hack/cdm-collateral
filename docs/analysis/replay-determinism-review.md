# Replay determinism review of the collateral workflow service

Review for open item 1 of [`docs/architecture/onchain-privacy.md`](../architecture/onchain-privacy.md) (section 14.2),
against the requirements in its sections 8.1 to 8.4. Date: 2026-11-24 (UTC). Branch:
`investigation/onchain-data-protection`.

**Scope and method.** Static reading of `services/collateral` (38 main Java files, about 14,500 lines), following the
margin call path (issue, check, respond, fold) and searching every main file for clock reads, random values, network
reads, floating point, unordered collections, locale-dependent calls and build settings. Nothing was compiled or run.
Each finding cites file and line on this branch. It is not a full audit of all 47 workflows.

## What already works

The service already performs a replay of the kind the design needs, for the margin call lifecycle:

- **Fold of chain-ordered documents.** `CdmFold.fold` (`CdmFold.java`) reads the ordered step documents of one call
  and applies each to the running `MarginCallState` with CDM's `Create_MarginCallState`, running CDM's full
  validation. Both parties fold the same documents and compare a keccak `stateHash` of the result
  (`App.java` 5011 to 5049; `services/collateral/README.md`, "Payload carrier and cumulative fold").
- **No clock in the fold.** Step times inside the fold are a fixed base time plus one minute per step (`CdmFold.java`,
  `T0`), not the wall clock.
- **Documents are checked against chain hashes** before folding (`App.java` 5023 to 5027).
- **Collateral valuation uses integer arithmetic matching the contract.** `valueAfterHaircut` (`App.java` 4777 to
  4780) uses `BigInteger` with the same formula as `CollateralControl`.
- **Several amounts round explicitly** (`CdmRepoMargin.java` 64, `CdmGmslaMark.java` 137, `CdmInterest.java` 101).
- **Position maps that feed output are ordered** (`CdmReconciliation.java` 248, a `TreeMap`).

## Findings

Severity: **High** means two honest members can compute different results from the same envelope. **Medium** means a
difference is possible under conditions that occur in operation. **Low** means a difference needs an unusual
configuration or a change of build.

| # | Severity | Finding | Where | Change needed |
|---|---|---|---|---|
| 1 | High | Prices are read live from the gateway when a call is checked, not taken from a version named in the call. A price published between issue and check changes the result. | `feedPrices()`, `App.java` 4762 to 4769; used by `valueOf`, 4782 | The envelope names the price dataset version (section 8.2); replay reads that version. |
| 2 | High | Haircuts and eligibility are read live from `/pair-terms`, cached for 3 seconds by wall clock. | `pairHaircuts()`, `App.java` 2422 to 2433 | Haircuts come from the deal's agreed schedule in its state, or a named dataset version. |
| 3 | High | The called party re-derives the GMSLA mark statement "at the feed prices and business date" at the time it checks, and rejects the call if the hash differs. Same cause as findings 1 and 4. | `checkGmslaCall`, `App.java` 4113 to 4127 | Recompute at the prices and business date named in the envelope. |
| 4 | High | The business date defaults to the service's local date and can be moved per service by the operator. Two members on different dates mark differently. | `businessDate = LocalDate.now()`, `App.java` 3606; setter 3611 to 3614 | Business date comes from the envelope's epoch number (section 6). The operator override stays a test tool outside replay. |
| 5 | Medium | Agreement and rulebook building use `LocalDate.now()` with the JVM's default time zone. Near midnight two members in different zones produce different dates. | `App.java` 542, 701, 2549, 2593, 2736, 2764, 2892 | Use the envelope's business date. |
| 6 | Medium | Enforcement and reclaim instructions read `LocalDate.now(UTC)` and `ZonedDateTime.now(UTC)`. Deterministic across zones, but differs between submitter and a later replay. | `CdmEnforcement.java` 55, 68; `CdmReclaim.java` 48, 58 | Use the envelope's business date and block timestamp. |
| 7 | Medium | Response deadlines are computed from the submitter's clock. | `App.java` 4003, 4105 and 5543 (`System.currentTimeMillis()`) | Deadlines in blocks or business days from the opening envelope (section 7). |
| 8 | Medium | The build cannot be reproduced. The CDM extension is a `0.0.1-SNAPSHOT` installed into the local Maven repository from `cdm-ext`; the shaded JAR has no fixed output timestamp, so its digest differs on every build. No release workflow produces provenance; the only tag is `v0.1-demo`. | `services/collateral/pom.xml` 22 to 26, 68 onward; `cdm-ext/pom.xml` 9; `.github/workflows/` | Release versions instead of snapshots; set `project.build.outputTimestamp`; a release workflow that publishes the artifact digest and SLSA provenance (section 8.1). |
| 9 | Low | The state hash is taken over JSON from `RuneJsonObjectMapper`, whose field order follows the generated CDM classes. Stable within one build; a CDM or extension upgrade can change it. The repository already has an RFC 8785 canonicalizer (`Jcs.java`), used only for provenance records. | `App.java` 5047 to 5049; `CdmRuntime.toJson` | Either hash over `Jcs.canonical`, or treat every upgrade as a new logic build activated at a block (section 8.1). |
| 10 | Low | Case conversion of identifiers and hashes uses the default locale (`toLowerCase()`, `toUpperCase()` without `Locale.ROOT`). Under a Turkish locale, letters such as `I` convert differently. | For example `Cdm.java` 278, `CdmEnforcement.java` 49, `Store.java` 141 to 176, `ProvenanceLive.java` 36 to 66 | Use `Locale.ROOT`, or fix the JVM locale in the service's launch configuration. |
| 11 | Low | `BigDecimal.divide` without a `MathContext`. It throws on a non-terminating result; with power-of-ten scales it terminates, so the result is the same everywhere, but a non-decimal scale would fail. | `CdmReconciliation.java` 224 to 225; `App.java` 1844, 3742, 3771, 3896 | Pass an explicit scale and rounding mode. |
| 12 | Info | Call, amendment and snapshot identifiers come from `System.nanoTime()` and `UUID.randomUUID()`. Acceptable: the submitter generates them once and they travel in the envelope. They must never be regenerated during replay. | `App.java` 1738, 2550, 2737, 4004, 4099, 5340, 5545 and about a dozen more | None, beyond keeping identifier generation out of the replay path. |
| 13 | Info | Several checks read other calls between the same pair (for example margin held across settled GMSLA calls). This fits the replay scope if the deal is the agreement (section 8.3), but the reads go through the gateway. | `gmslaMarginHeld`, `App.java` 4027 onward; `repoMarginState`, 3901 | In replay, read earlier calls of the same agreement from the deal's own stream. |

## Summary

The fold already gives the design's replay model for the margin call lifecycle. The main gap is that the inputs to a
call (prices, haircuts, business date) are read live when a member checks the call, instead of being named in the
call and read from fixed versions. Findings 1 to 4 must be fixed before phase 1 can show that honest members always
agree. Findings 5 to 8 belong in phase 1 as well; finding 8 is a precondition for section 8.1. Findings 9 to 11 can
follow.

Not covered: the 46 workflows other than the margin call lifecycle, the oracle service, the extension's own Rosetta
functions in `cdm-ext`, and behaviour at run time.
