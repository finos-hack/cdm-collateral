```yaml
id: nw-assumption-besu-visibility
kind: assumption
status: unvalidated
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 70532bbf71d41c99c9efad27c0e9ed009891292a
  contentHash: 70532bbf71d41c99c9efad27c0e9ed009891292a
  timestamp: 2026-10-16T21:34:51Z
createdAt: 2026-10-16T21:34:51Z
updatedAt: 2026-10-16T21:34:51Z
```
# Assumption: all participants may see on-chain margin data in the prototype

On the prototype's Besu network every node can read all contract state, so every participant sees all margin call
amounts, states and pledges, including calls between other parties. Acceptable for the prototype (test data only,
`nw-prototype-scope`); not acceptable for production. Examined in `task-onchain-privacy`.
