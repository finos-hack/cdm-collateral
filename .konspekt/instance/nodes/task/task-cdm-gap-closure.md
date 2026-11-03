```yaml
id: task-cdm-gap-closure
type: task
title: CDM gap closure
status: active
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: c559e965491f960d039091cb857d61d9cb85ac25
  contentHash: c559e965491f960d039091cb857d61d9cb85ac25
  timestamp: 2026-10-17T00:22:35Z
createdAt: 2026-10-17T00:22:35Z
updatedAt: 2026-11-03T18:04:30Z
```
# Task: CDM gap closure

Close the gaps established by `task-cdm-gap-analysis`.

Order agreed 2026-10-17T13:40:02Z (source `0f2f88c5496b77b3cef85e94a5ec0236fa765099`): margin call lifecycle (G1, G3–G6) on CDM 7.7.0's instruction composition
pattern; then valuation (G7–G10), enforcement (G14), token and ledger types (G24, G25).

Agreed 2026-10-17T16:03:44Z: balances (G5) are done together with valuation (G7–G10); the workflow service and the console build stay
parked (`task-react-console`).

Progress 2026-10-17T16:03:44Z: G1 and G4 events, qualification and CDM transfers in `cdm-ext/` (`wp-adr-cdm-collateral-events`,
proposed); CDM Python package defects worked around in the extension runtime (D14 extended, D15 extended). Gap
register shows G1 and G4 as closed, proposed for review.

Findings captured 2026-10-17T16:53:35Z (project owner's request): findings X1–X3 (`docs/analysis/findings.md`), defects D14 (`Now()`,
repositories, `@data` cause corrected) and D15 (repositories), gaps G37 (collateral transfer type), G38 (title-transfer
party roles), G39 (Python toolchain; Python versus Java open), all proposed for review.

Accepted 2026-10-17T17:00:55Z: `wp-adr-cdm-collateral-events` (project owner).

Java spike 2026-10-18T00:07:05Z (project owner's request): `cdm-ext/java/` generates the same Rune with CDM's toolchain against
`cdm-java` 7.7.0; the 23 tests pass in JUnit with no workarounds and with CDM's full validation. Cross-language Rune
JSON fails for choice types (D16). CI job `java` added to `cdm-ext.yml`. Language decision unchanged
(`nw-cdm-stay-on-python`) until the project owner decides.

Decided 2026-10-18T01:27:28Z: Java for CDM and the services, Javalin, Java code, Python build retired (`wp-adr-java-cdm-stack`). G39 closed.

Progress 2026-11-03T18:04:30Z (valuation group started; G5 together with it, as agreed 2026-10-17):
- G7 closed (proposed, for review): `cdmx.collateral.valuation` corrects D1, and restates the three CDM callers on top
  of the corrected function.
- G5 closed (proposed, for review): `cdmx.collateral.portfolio` `ApplyCollateralEvent`
  ([[nw-portfolio-per-pair-post-haircut]]).
- Extension tests: 41 pass; the collateral service builds against the new jar. Found along the way:
  [[nw-cdm-valuation-percentage-as-haircut]]. Next: G8 (concentration limits), G9 (VM CSA amounts), G10 (exposure
  netting).
