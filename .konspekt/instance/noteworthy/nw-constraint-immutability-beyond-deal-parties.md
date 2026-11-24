```yaml
id: nw-constraint-immutability-beyond-deal-parties
kind: constraint
status: active
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;_nYG9QNdSbUoTuVu82gqYVXQOEMbp5RaX_08SFk_6TY
  timestamp: 2026-11-24T00:30:43Z
  confidence: 0.75
createdAt: 2026-11-24T00:30:43Z
updatedAt: 2026-11-24T01:41:21Z
```
# Constraint: a deal's record must not depend on the deal's own parties alone

Stated by the project owner (2026-11-23) for `investigation-onchain-data-protection`: a collateral deal has two or
three parties. If only the parties' own nodes hold and confirm the deal's history, immutability is at risk; with two
nodes the parties are back to a "he said / she said" situation.

Maintainer reading (proposed): the ordering and integrity of each deal step must be recorded by a set of nodes larger
than, and independent of, the deal's parties. Confidentiality of deal content is still governed by
`nw-visibility-rule-deal-participants`.

Effect on the options (inferred):

- Paladin (O6, `nw-decision-onchain-privacy-paladin`): meets this when the shared Besu network has validators beyond
  any one deal's parties; Pente commitments are copied by every validator.
- Canton alone (O8): meets this only if the synchronizer is operated by parties independent of the deal and its
  encrypted message history is retained, not pruned, for the required period.
- A separate network per deal (O7): fails this with two or three validators.

Update 2026-11-24 (maintainer, from Canton documentation, not exercised): confirmations are signed and sequenced, the
sequencer can run as a BFT set across several operators, and pruning is optional. A Canton deployment with a
retained, multi-operator synchronizer meets this constraint on the documentation; see
`docs/architecture/onchain-privacy.md` section 3.3.
