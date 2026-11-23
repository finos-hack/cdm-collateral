```yaml
id: nw-proposal-deal-scoped-noto-hooks
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q
  timestamp: 2026-11-23T12:51:04Z
  confidence: 0.55
createdAt: 2026-11-23T12:51:04Z
updatedAt: 2026-11-23T12:51:04Z
```
# Proposed decision: deal-scoped Noto tokens in hooks mode for collateral movements

Proposed by the maintainer (2026-11-23) when the project owner asked it to resolve the open items of
`investigation-onchain-data-protection`. Evidence: `docs/analysis/bank-use-of-besu.md`.

1. Each deal moves collateral and cash through Noto token instances scoped to that deal, in hooks mode. The hooks are
   the deal's Pente contract; the notary is a deal participant (the custodian where the deal names one, otherwise the
   collateral provider).
2. The underlying asset stays on its home ledger or shared token and is encumbered once at deal entry, following the
   encumbrance pattern attributed to the DTCC Collateral AppChain.
3. Zeto is deferred. Revisit it if notary visibility within a deal is unacceptable, or if Zeto's in-circuit encryption
   is shown to give the regulator a view.

Reasons: a Noto notary sees all state of its token. A token scoped to one deal limits that view to the deal, and the
notary is a participant under `nw-visibility-rule-deal-participants`. Hooks mode avoids the basic-mode rule that only
a lock's creator may unlock it, which does not fit a default in which the collateral receiver takes the asset.

Open, inferred: the encumbrance at deal entry is itself a base-ledger event and may reveal the deal to outsiders.
Hook error handling must be tested, because the Noto documentation describes a hook that neither calls back nor reverts
as "undefined behavior".
