```yaml
id: nw-open-challenge-distinguishable-steps
kind: statement
status: active
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;Ck9C1-iKRpm0PXjLfR26SHQlThUC0ngItnNXRDuG3Bc
  timestamp: 2026-11-24T16:19:30Z
  confidence: 0.85
createdAt: 2026-11-24T16:19:30Z
updatedAt: 2026-11-24T16:19:30Z
```
# Open design challenge: step types are distinguishable from public metadata

The project owner parked this on 2026-11-24 as an open design challenge, undecided.

Outsiders can tell pledge, rejection, timeout, ruling and member-change steps apart by metadata the envelope log
contract or the Besu client must read in clear: function selector, gas used, event names, the nullifier and proof
fields, stored step state, and the arbitrator's public key (`docs/architecture/onchain-privacy.md`, section 10.1).

Known options, none chosen: a dummy nullifier and proof on every step hides pledges; hiding rejections and timeouts
would move finality and deadline enforcement off-chain. The prototype runs with the exposure and phase 1 measures it.
