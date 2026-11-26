```yaml
id: nw-decision-asset-lifecycle
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
# Decision: asset lifecycle for encumbrance proofs

Agreed by the project owner (2026-11-26):

- The holder of record (custodian, triparty agent, CCP, or a holder node for contract-held IM) derives each lot's
  nullifier as a keyed hash of the lot identifier; the inventory commitment binds lot to nullifier.
- Partial pledge: split the lot first. Return: retire the lot and reissue under a new lot identifier; the old
  nullifier stays in the set. Substitution: retire plus pledge in one step. Enforcement: retire and reissue to the
  secured party.
- Proofs are accepted against the current or previous inventory commitment (published each business day).
- Title-transfer flows (VM under a title-transfer CSA, bilateral repo) carry no nullifier and no proof.
- The five-apple illustration is not added to the design as a figure (owner, item 5); section 9.2 carries it as a table.

Recorded in `docs/architecture/onchain-privacy.md` section 9.1 and 9.2.
