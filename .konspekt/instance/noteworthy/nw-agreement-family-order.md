```yaml
id: nw-agreement-family-order
kind: decision
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: f2af9c708d4dfb0afca4f8657294d0883797c5b2
  contentHash: f2af9c708d4dfb0afca4f8657294d0883797c5b2
  timestamp: 2026-11-03T14:47:29Z
  confidence: 0.6
createdAt: 2026-11-03T14:47:29Z
updatedAt: 2026-11-03T15:18:20Z
```
# Decision: order of the agreement families after the CSA cycle

Order for section C of `docs/analysis/cdm-workflow-task-map.md`, chosen by the maintainer at the project owner's
request ("your call", 2026-11-03). Proposes an answer to business case §8 item 2, which is still listed as open.

1. Repo, GMRA ([[task-repo-gmra-workflows]]). G20 is P2, and the repo lifecycle scores 4–5 in the other-agreements
   matrix. Margin maintenance under the GMRA is the closest of the four to the CSA margin call (inferred).
2. Securities lending, GMSLA ([[task-securities-lending-gmsla-workflows]]). G21 is P2. Ties with repo on priority;
   placed second because recall (G18) scores 2.
3. Triparty ([[task-triparty-workflows]]). G22 is P3. The agent values, allocates and settles collateral for repo and
   lending trades, so it builds on both (inferred).
4. CCP ([[task-ccp-workflows]]). G23 is P3; lowest coverage (0–2).

Accepted by the project owner on 2026-11-03; business case §8 item 2 is marked decided.
