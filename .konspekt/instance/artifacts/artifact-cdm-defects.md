```yaml
id: artifact-cdm-defects
name: Defects found in CDM — collateral scope
kind: document
location: docs/analysis/defects.md
version: cdm-7.6.0
review: accepted
provenance:
  conversationId: cdm-data-taxonomy
  sourceRef: 2e9d537257293259626a3455694bb5c35146e859
  contentHash: 2e9d537257293259626a3455694bb5c35146e859
  timestamp: 2026-10-15T23:55:50Z
  confidence: 0.85
createdAt: 2026-10-15T23:55:50Z
updatedAt: 2026-10-17T13:40:02Z
```
# Defects found in CDM — collateral scope

Defects D1–D13 in CDM 7.6.0 model content, sample data and documentation found during the collateral analyses, each
with source file, line numbers and a link at commit f685b4b, severity, effect and (where clear) the fix. Not
reported to FINOS; D4 and D7 have open CDM issues (#5109, #4692).

Revised 2026-10-17T01:16:19Z (source `9ab0cbf86284cce4606e93eabb8507c9d009d7b7`): D14, defects in the CDM 7.7.0 Python package found while testing the extension.

Revised 2026-10-17T13:40:02Z (source `0f2f88c5496b77b3cef85e94a5ec0236fa765099`): D14 extended (failure inside generated functions; metadata check switched off);
D15, Rune Python generator 10.15.1.0.
