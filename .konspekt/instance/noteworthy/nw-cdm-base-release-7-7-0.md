```yaml
id: nw-cdm-base-release-7-7-0
kind: decision
status: active
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 9ab0cbf86284cce4606e93eabb8507c9d009d7b7
  contentHash: 9ab0cbf86284cce4606e93eabb8507c9d009d7b7
  timestamp: 2026-10-17T01:16:19Z
createdAt: 2026-10-17T01:16:19Z
updatedAt: 2026-10-17T01:16:19Z
```
# Decision: CDM 7.7.0 is the base release

The project builds on CDM 7.7.0 (commit 1c97666, `finos-cdm` 7.7.0 on PyPI) instead of 7.6.0. 7.7.0 changes six
files, all interest-rate reset instruction composition; the coverage matrices and the gap register hold unchanged
and carry a release note.
