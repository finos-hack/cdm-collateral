```yaml
id: nw-assumption-contract-control
kind: assumption
status: unvalidated
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8
  timestamp: 2026-10-16T19:49:05Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 2fb4e26caea617c016a1f1089b037ff9c5b92cce
    contentHash: 2fb4e26caea617c016a1f1089b037ff9c5b92cce
createdAt: 2026-10-16T19:49:05Z
updatedAt: 2026-10-16T19:49:05Z
```
# Assumption: smart-contract control satisfies IM segregation

Control of pledged tokens by a smart contract satisfies the regulatory initial-margin segregation requirement (held
away from the receiving party, bankruptcy-remote, not reused). Not legally confirmed; acceptable under
`nw-prototype-scope`.
