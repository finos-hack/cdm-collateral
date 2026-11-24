```yaml
id: nw-decision-onchain-privacy-encrypted-streams
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;Uv30C5_mD5mB3x0CwWfjl33_i1TVyTzZheSy3d-Zk3Y
  timestamp: 2026-11-24T03:19:18Z
  confidence: 0.8
createdAt: 2026-11-24T03:19:18Z
updatedAt: 2026-11-24T03:19:18Z
```
# Decision: try the encrypted deal stream design with selective proofs

Stated by the project owner (2026-11-23): "let's try using this design", referring to the design in
`docs/architecture/onchain-privacy.md` as revised to the owner-supplied version 1.3: encrypted envelopes on the shared
Besu chain, member replay with the existing CDM Java engine, a selective proof for single encumbrance only, threshold
escrow, and no private virtual machine.

In the same message the owner set the validity rule: an explicit acknowledgement from members, not silence counted as
acceptance.

Effect on earlier records: this replaces the tentative choice in `nw-decision-onchain-privacy-paladin`. The Canton
version (`artifact-onchain-privacy-design-canton`) is kept as the alternative. The owner said "try"; the record does
not state that the choice is final.
