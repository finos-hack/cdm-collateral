```yaml
id: wp-adr-console-on-extension-rules
kind: decision
subtype: adr
timestamp: 2026-10-17T00:48:29Z
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 718789ef3024496c06042f84fc8cf0129ecc58dc
  contentHash: 718789ef3024496c06042f84fc8cf0129ecc58dc
  timestamp: 2026-10-17T00:48:29Z
createdAt: 2026-10-17T00:48:29Z
updatedAt: 2026-10-17T00:48:29Z
```
# ADR: The console runs on the extensions' rules

The party console's rule engine (`console/src/domain/engine.ts`) is to be replaced by the rules of the CDM
extensions (`wp-adr-cdm-extension-rune`) rather than kept as a separate TypeScript copy. How the console reaches
them (generated TypeScript, or the workflow services' API that runs the generated Python) is open.

**Context.** The engine today performs the steps that the P1 gaps leave outside CDM; two copies of the rules would
drift.
