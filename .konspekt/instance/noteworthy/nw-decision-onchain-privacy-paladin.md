```yaml
id: nw-decision-onchain-privacy-paladin
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;-4YyocQfT3eI-7E7xiiNk4fGj4Ho4YnOH13elX0v2_Y
  timestamp: 2026-11-23T12:35:59Z
  confidence: 0.6
createdAt: 2026-11-23T12:35:59Z
updatedAt: 2026-11-23T12:35:59Z
```
# Decision (tentative): Paladin on the shared Besu network as the main design path

For `investigation-onchain-data-protection`, the project owner answered "Probably A" (2026-11-23) to the choice of main
design path. Option A: each deal's contract logic runs in its own Pente privacy group on the shared Besu network, and
collateral and cash tokens are Noto or Zeto tokens. The alternatives were a separate Besu network per deal or
relationship (B) and Canton behind the ledger gateway (C).

The owner qualified the answer with "probably"; this record is tentative. The notary question for Noto tokens is
open (see O6 in the investigation).
