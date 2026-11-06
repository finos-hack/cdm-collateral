```yaml
id: nw-architecture-json-is-source
kind: decision
review: proposed
provenance:
  conversationId: adr-asr-traceability
  sourceRef: 78166fa212300a29ebb5956aa5db810841378e26
  contentHash: 78166fa212300a29ebb5956aa5db810841378e26
  timestamp: 2026-11-06T21:49:38Z
  confidence: 0.9
createdAt: 2026-11-06T21:49:38Z
updatedAt: 2026-11-06T21:49:38Z
```
# Decision: the CALM file is edited by hand; the generator script is retired

`architecture/prototype.architecture.json` is the source of the prototype architecture and is edited directly.
`architecture/generate_architecture.py` is removed: on 2026-11-06 it no longer produced the committed file (six flows,
and metadata and relationship edits, existed only in the JSON). The project owner chose this over bringing the script
up to date. The `adrs` field is the one generated part: `architecture/sync_adrs.py` rewrites it from the
`subtype: adr` waypoints, leaving out rejected and superseded ADRs.
