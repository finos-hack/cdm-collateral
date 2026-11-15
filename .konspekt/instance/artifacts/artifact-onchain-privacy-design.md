```yaml
id: artifact-onchain-privacy-design
name: On-chain privacy and confidentiality design
kind: doc
location: docs/architecture/onchain-privacy.md
createdAt: 2026-10-23T00:00:00Z
updatedAt: 2026-10-23T00:00:00Z
review: accepted
provenance:
  sourceRef: ni:///sha-256;whkcPr5vGRhGfyP3KBwHgRuYvZBFAxfwi17mcztcocs
  conversationId: spec-writer-2026-10-23
  timestamp: 2026-10-23T16:22:32.687Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: fb7fc41f8d17de20191da289faee16fb85ddbf08
    contentHash: fb7fc41f8d17de20191da289faee16fb85ddbf08
```
# Artifact: On-chain privacy and confidentiality design

Design note for `task-onchain-privacy`, to live at `docs/architecture/onchain-privacy.md` (not yet written; this
record proposes it). It closes the ambiguity left by `nw-assumption-besu-visibility`: the architecture says every Besu
node can read margin call data and defers privacy to the task, but nothing states which fields leak today, who must not
see them, or which mitigation the prototype adopts on Besu versus Canton.

Content the document will settle:

1. **Leak inventory.** What a non-party reads today. `MarginCall` stores `_calls` and `_proposalAssets` behind
   public getters (`getCall`, `getProposal`, `getProposalAssets`) and emits `CallIssued` (from, to, kind, amount,
   cdmHash), `CallAnswered` (agreed, disputed amounts). `CollateralControl` holds
   `_pledged[pledgor][securedParty][token]` and emits `Pledged`, `Transferred`, `Returned`, `Enforced` with both
   party addresses and values. `private` in Solidity hides nothing from a node operator. The CDM content itself stays
   off-chain behind `cdmHash`.
2. **Visibility matrix.** For each datum (counterparty pair, call amount, dispute amount, proposed assets, pledged
   balance, default/enforcement), who may see it: the two parties, the custodian or token issuer, the oracle, a
   regulator, other participants (none).
3. **Options assessed against the matrix.** Commitments only on-chain (hash of amount and assets, parties as
   pseudonymous addresses); bilateral or per-agreement contracts on a permissioned group; field encryption with
   per-pair keys; a privacy layer; Canton's per-party visibility (`wp-adr-prototype-ledgers`). Besu 26.9.0 has no
   private transactions, so Besu options are application-level only.
4. **What escrow needs in clear.** `CollateralControl` must move real token quantities, so pledged balances cannot
   be pure commitments on an ERC-20 ledger; the document states this limit and what it implies for Besu in production.
5. **Recommendation and scope.** Prototype keeps full visibility (test data, `nw-prototype-scope`); the
   ledger-neutral interface reserves the hooks (pseudonymous party ids, commitment fields) a production design needs;
   Canton is the path where per-party visibility is native. Records whether `nw-assumption-besu-visibility` is
   confirmed as a prototype-only assumption.

Checked on canonical: `task-onchain-privacy`, `nw-assumption-besu-visibility`, `wp-adr-prototype-ledgers`,
`architecture/README.md` (margin call contract row and the visibility line), `docs/architecture/blockchain-applicability.md`
(visibility note), `contracts/contracts/{MarginCall,CollateralControl}.sol` (state, getters, events), and `artifacts/`
(no existing privacy artifact). Not checked: Canton/Daml code (none on canonical yet) or a production participant list.
