```yaml
id: nw-decision-nullifier-decommission-and-set-growth
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;b0QtzxyiaiCamsFkMzjHkA5qpd0r9D-rvzRFCLjp2HY
  timestamp: 2026-11-26T15:28:23Z
  confidence: 0.9
createdAt: 2026-11-26T15:28:23Z
updatedAt: 2026-11-26T15:28:23Z
```
# Decision: decommission records in the deal stream; append-only nullifier set for the prototype

Agreed by the project owner (2026-11-26):

- Every releasing step (return, substitution, enforcement) carries the released nullifier and the retired and new
  lot identifiers inside its encrypted body. Nothing about the release is recorded in clear.
- The public nullifier set stays append-only and unpruned in the prototype.
- The production design carries an explicit section on storing only an indexed Merkle root of the set on-chain,
  with members keeping the tree off-chain.

Recorded in `docs/architecture/onchain-privacy.md` sections 9.3 and 9.5.
