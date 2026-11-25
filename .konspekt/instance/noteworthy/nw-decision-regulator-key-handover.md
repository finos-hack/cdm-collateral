```yaml
id: nw-decision-regulator-key-handover
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;oxxzO80GGWrGwrEn19NebmRTlj9kOUT9cB3BFmrO4ak
  timestamp: 2026-11-25T02:41:00Z
  confidence: 0.85
createdAt: 2026-11-25T02:41:00Z
updatedAt: 2026-11-25T02:41:00Z
```
# Decision: header key handed to the regulator off-chain; regulator monitors completeness

Stated by the project owner (2026-11-24):

- Members give the regulator the header key off-chain at deal opening.
- The regulator may acknowledge privately through an off-chain interface, if needed.
- The regulator monitors the chain for new deals, checks that it holds keys for all of them, and escalates outside
  the chain if not.

Not decided: the header fields (the maintainer's suggestion of a notional exposure band was not answered), and how
the regulator identifies whom to escalate to, given fresh sender accounts and submission nodes.
