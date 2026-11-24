```yaml
id: nw-requirements-onchain-privacy
kind: constraint
status: active
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;t1titEEgFzJ7QUsek46-60OyT_assA_7D-YkFO4_t0U
  timestamp: 2026-11-24T01:21:13Z
  confidence: 0.8
createdAt: 2026-11-24T01:21:13Z
updatedAt: 2026-11-24T01:21:13Z
```
# Constraint: requirements for the on-chain privacy design

Stated by the project owner (2026-11-23) for `docs/architecture/onchain-privacy.md`, in the context of collateral
management flows between financial institutions:

1. Transparency of the data flow, with authorized access to the data.
2. Immutability of data and of evidence.
3. Public logic.
4. Scale: the prototype's number of flows (the owner said 50 or the actual number; the repository states 47
   workflows) and asset types in the high hundreds.

The owner ended the list with "etc."; it is not closed. The document's section 2.2 adds requirements R11 to R19
proposed by the maintainer; they are not part of this record.
