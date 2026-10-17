```yaml
id: nw-cdm-python-workarounds
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 0f2f88c5496b77b3cef85e94a5ec0236fa765099
  contentHash: 0f2f88c5496b77b3cef85e94a5ec0236fa765099
  timestamp: 2026-10-17T13:40:02Z
createdAt: 2026-10-17T13:40:02Z
updatedAt: 2026-10-17T13:40:02Z
```
# Decision: work around the CDM Python package defects in our runtime code

Defects in the CDM 7.7.0 Python package (D14) are handled by workarounds in the extension's runtime code
(`cdm-ext/tests/cdm_runtime.py`: import order, metadata check switched off, objects loaded from Rune JSON, CDM's own
conditions checked selectively), not by keeping CDM's asset types out of the extensions. Generator behaviour (D15) is
handled by writing the Rune around it, each case listed in `cdm-ext/README.md`.
