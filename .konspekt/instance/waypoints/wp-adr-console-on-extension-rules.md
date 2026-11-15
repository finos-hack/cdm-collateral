```yaml
id: wp-adr-console-on-extension-rules
kind: decision
subtype: adr
timestamp: 2026-10-17T00:48:29Z
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;-T2xchAVDPCwaxZulVT_ISvaRx13XVeYc5tSZ71vdAk
  timestamp: 2026-10-17T00:48:29Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 718789ef3024496c06042f84fc8cf0129ecc58dc
    contentHash: 718789ef3024496c06042f84fc8cf0129ecc58dc
createdAt: 2026-10-17T00:48:29Z
updatedAt: 2026-10-18T01:27:28Z
```
# ADR: The console runs on the extensions' rules

The party console's rule engine (`console/src/domain/engine.ts`) is to be replaced by the rules of the CDM
extensions (`wp-adr-cdm-extension-rune`) rather than kept as a separate TypeScript copy. How the console reaches
them (generated TypeScript, or the workflow services' API that runs the generated Python) is open.

**Context.** The engine today performs the steps that the P1 gaps leave outside CDM; two copies of the rules would
drift.

Revised 2026-10-18T01:27:28Z (source `6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630`): the services that run the extension's rules are Java (`wp-adr-java-cdm-stack`); the option "workflow services' API that runs the generated Python" reads "... generated Java".
