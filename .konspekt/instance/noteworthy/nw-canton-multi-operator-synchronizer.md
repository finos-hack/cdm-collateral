```yaml
id: nw-canton-multi-operator-synchronizer
kind: constraint
status: active
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;4iebMs3V6tuqDZPyrAASj18WJH5iFmx2bvz5BN-53NI
  timestamp: 2026-11-24T01:52:54Z
  confidence: 0.8
createdAt: 2026-11-24T01:52:54Z
updatedAt: 2026-11-24T01:52:54Z
```
# Constraint: a Canton deployment requires an independent multi-operator synchronizer

Stated by the project owner (2026-11-23): if Canton is used, the project requires an independent, multi-operator
synchronizer. The owner stated that this removes the project's objection to Canton on immutability
(`nw-constraint-immutability-beyond-deal-parties`).

The owner's message ended mid-sentence; what follows from this for the main design path is not recorded.
