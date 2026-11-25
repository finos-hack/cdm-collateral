```yaml
id: nw-decision-replay-integrity
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;V6KQR3nL0uhP6kuhQg3K3JF3g6TlzvNWvnBFrDKieGE
  timestamp: 2026-11-25T02:24:19Z
  confidence: 0.75
createdAt: 2026-11-25T02:24:19Z
updatedAt: 2026-11-25T02:24:19Z
```
# Decision: how replay integrity is anchored

Elements the project owner set (2026-11-24) for off-chain replay in `docs/architecture/onchain-privacy.md`,
section 8:

1. The logic build is identified by a GitHub release tag and commit hash of the repository, which fix the CDM version
   and other dependencies.
2. Reference datasets are signed.
3. SLSA build provenance (the owner said "SLSA maybe").
4. Replay scope is one specific deal.

The maintainer's elaboration (registry fields, publishers of each dataset, deal-specific schedules kept inside the
deal's encrypted state, cross-agreement rules outside the shared replay) is proposed and not confirmed by the owner.
