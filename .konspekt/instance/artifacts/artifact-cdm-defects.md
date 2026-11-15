```yaml
id: artifact-cdm-defects
name: Defects found in CDM — collateral scope
kind: document
location: docs/analysis/defects.md
version: cdm-7.6.0
review: accepted
provenance:
  conversationId: cdm-data-taxonomy
  sourceRef: ni:///sha-256;xr-tzMxBAA0pmldc0WBwr3dKYiEJoLMMfrBw_OQOzwA
  timestamp: 2026-10-15T23:55:50Z
  confidence: 0.85
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 2e9d537257293259626a3455694bb5c35146e859
    contentHash: 2e9d537257293259626a3455694bb5c35146e859
createdAt: 2026-10-15T23:55:50Z
updatedAt: 2026-10-18T01:27:28Z
```
# Defects found in CDM — collateral scope

Defects D1–D13 in CDM 7.6.0 model content, sample data and documentation found during the collateral analyses, each
with source file, line numbers and a link at commit f685b4b, severity, effect and (where clear) the fix. Not
reported to FINOS; D4 and D7 have open CDM issues (#5109, #4692).

Revised 2026-10-17T01:16:19Z (source `9ab0cbf86284cce4606e93eabb8507c9d009d7b7`): D14, defects in the CDM 7.7.0 Python package found while testing the extension.

Revised 2026-10-17T13:40:02Z (source `0f2f88c5496b77b3cef85e94a5ec0236fa765099`): D14 extended (failure inside generated functions; metadata check switched off);
D15, Rune Python generator 10.15.1.0.

Revised 2026-10-18T01:27:28Z (source `6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630`): D16 added (Python and Java Rune JSON differ for choice types); the project moved to Java (`wp-adr-java-cdm-stack`), so D14–D16 no longer affect it; they stay recorded for the CDM Python maintainers.
