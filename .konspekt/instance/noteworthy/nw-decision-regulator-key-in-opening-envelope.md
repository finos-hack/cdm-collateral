```yaml
id: nw-decision-regulator-key-in-opening-envelope
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;feScQ9ilPoCtiU-2sikJQzG3iL6f9XMA4er6bVx8tr8
  timestamp: 2026-11-25T02:44:38Z
  confidence: 0.9
createdAt: 2026-11-25T02:44:38Z
updatedAt: 2026-11-25T02:44:38Z
```
# Decision: the opening envelope carries the header key encrypted to the regulator

Chosen by the project owner (2026-11-24): each deal's opening envelope carries the header key encrypted to the
regulator's public key. Handover is then on-chain by construction, and the escalation question does not arise.

Supersedes the off-chain handover in `nw-decision-regulator-key-handover`; the rest of that record (no on-chain
acknowledgement, optional private acknowledgement, regulator monitoring of new streams) stands.
