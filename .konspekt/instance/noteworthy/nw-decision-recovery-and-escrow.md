```yaml
id: nw-decision-recovery-and-escrow
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;PDe8Sb-TmLdx2Hi4S1s7wsKxnsf9irZWzsZCg_-oiqM
  timestamp: 2026-11-25T02:15:00Z
  confidence: 0.85
createdAt: 2026-11-25T02:15:00Z
updatedAt: 2026-11-25T02:15:00Z
```
# Decision: duplicate HSMs for a member's own key loss; threshold escrow only for third-party access

Agreed by the project owner (2026-11-24), with the instruction to reference Canton's approach in the design:

- A member's own key loss is covered by a duplicate HSM or HSM cluster holding the same key-encryption key.
- Threshold escrow of the body key exists only for access by someone other than the member.
- Holders: the market operator, an independent trust company and a second independent party; not deal
  counterparties, not the regulator. Threshold 2 of 3.
- Release only on a court order, an insolvency administrator's request, or a member request confirmed by two holders.
  Every release is recorded on-chain as a hash.

Recorded in `docs/architecture/onchain-privacy.md`, section 6.1, with a comparison to Canton.
