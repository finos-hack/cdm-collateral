```yaml
id: nw-decision-submission-path
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;CPmbQ9fu5K9RY-bM7oWC6sJ39rgecpYhYBKwnvdvYkU
  timestamp: 2026-11-25T02:35:51Z
  confidence: 0.85
createdAt: 2026-11-25T02:35:51Z
updatedAt: 2026-11-25T02:35:51Z
```
# Decision: designated submission nodes, fresh account per stream, resubmission and rotation

Agreed by the project owner (2026-11-24), after rejecting submission through the member's own node:

- Members submit through validators run by institutions party to no deal, not through their own validator.
- Each stream uses a fresh sender account; zero gas price; no account allow-list.
- On timeout a member resubmits the same signed transaction to another submission node.
- Members rotate among submission nodes.

The owner asked for this to be positioned as an enhancement over Canton; `docs/architecture/onchain-privacy.md`,
section 10.2, compares the two.
