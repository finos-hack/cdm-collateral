```yaml
id: nw-proposal-visibility-metadata-scope
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q
  timestamp: 2026-11-23T12:51:04Z
  confidence: 0.6
createdAt: 2026-11-23T12:51:04Z
updatedAt: 2026-11-23T12:51:04Z
```
# Proposed decision: for the prototype, non-participants may see commitment metadata

Proposed by the maintainer (2026-11-23) when the project owner asked it to resolve the open items of
`investigation-onchain-data-protection`. Evidence: `docs/analysis/bank-use-of-besu.md`.

For the prototype, `nw-visibility-rule-deal-participants` rule 3 ("everyone else sees nothing") is read as:

1. Non-participants see no deal content and cannot identify a deal's parties.
2. Non-participants can see that privacy-group contracts exist and the number and timing of their base-ledger
   transactions. The prototype measures this exposure and does not mitigate it.
3. Recorded for production: batching, randomized timing and padding (listed in SUERF Note 420), or a change in which
   institutions run validators.

Precondition, unverified: point 1 holds only if base-ledger submissions for a group are not signed with accounts
that identify the participants. The Paladin pages read so far do not describe submitter-key handling. If submissions
identify the participants, this reading fails and the topology question must be decided instead.
