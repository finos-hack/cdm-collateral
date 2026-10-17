```yaml
id: nw-cdm-stay-on-python
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 694276ed19b4148f2414c57bffdbef67dfbc6b05
  contentHash: 694276ed19b4148f2414c57bffdbef67dfbc6b05
  timestamp: 2026-10-17T16:59:27Z
createdAt: 2026-10-17T16:59:27Z
updatedAt: 2026-10-17T16:59:27Z
```
# Decision: stay on the Python CDM stack for now

The project keeps CDM and the local extension on Python (generator, `rune.runtime`, `finos-cdm`) with the runtime
workarounds in `cdm-ext/tests/cdm_runtime.py` (gap G39, defects D14 and D15). The project owner will contact the
maintainers of the Python stack about the defects; the Java alternative is not evaluated for now.
