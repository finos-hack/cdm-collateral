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
updatedAt: 2026-10-17T16:53:35Z
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
