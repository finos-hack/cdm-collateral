```yaml
id: nw-proposal-asset-level-contracts
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;SYDRQ18EY6stOBOF-Z49guvhPu8phqYgAsOstEpN9LI
  timestamp: 2026-11-26T15:54:03Z
  confidence: 0.7
createdAt: 2026-11-26T15:54:03Z
updatedAt: 2026-11-26T15:54:03Z
```
# Proposed decision: asset-level contracts under the encrypted-streams design

- `TokenizedCollateral`: members' tokens sit in omnibus accounts of the holder of record; client ownership and
  encumbrance are the holder's books, committed daily; movements between clients of one holder are book entries made
  on Final deal steps; only holder-to-holder movements are on-chain; tokens minted into omnibus accounts; `mint`
  restricted to the issuer.
- `ProvenanceAnchors`: unchanged; token documents are asset-level and public. Position- or deal-specific documents go
  in the deal stream.
- `RecordKeeperRegister`: retired. The record keeper is holder of record for Registered and Claim assets, a member of
  each deal moving its asset, and confirms by an envelope in the stream; REG-1, REG-2, REG-4 become deal logic.

Recorded as proposed in `docs/architecture/onchain-privacy.md` section 9.6; open as section 14.2 item 1.
