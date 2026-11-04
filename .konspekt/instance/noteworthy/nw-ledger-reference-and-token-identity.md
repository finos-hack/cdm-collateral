```yaml
id: nw-ledger-reference-and-token-identity
kind: decision
review: proposed
provenance:
  conversationId: cdm-development
  sourceRef: 1196485feb767867744d28d3eebfaaac64e6fc01
  contentHash: 1196485feb767867744d28d3eebfaaac64e6fc01
  timestamp: 2026-11-04T00:15:20Z
  confidence: 0.7
createdAt: 2026-11-04T00:15:20Z
updatedAt: 2026-11-04T00:15:20Z
```
# Decision: token identity as a TokenizedAsset beside the CDM Asset; ledger references attached to CDM records after mining

How gaps G24 and G25 are closed in `cdm-ext/rosetta/cdmx-collateral-ledger-*.rosetta` ([[task-cdm-gap-closure]]):

- **Token identity (G24):** `TokenizedAsset` links a CDM `Asset` (for example a Security with its ISIN) to its
  network, contract address, token standard, decimals, ISO 24165 DTI, and which record is legally authoritative: Bearer
  (the ledger), Registered (an off-ledger register) or Claim (an intermediary's books). The record keeper is named when
  the ledger is not authoritative. `TokenForAsset` and `AssetForToken` map between the two. CDM's `Asset` cannot
  be extended, so the token sits beside it. The DTI format is not checked ([[concept-asr-onchain-asset-identity]]).
- **Ledger references (G25):** `LedgerReference` (network, contract, transaction hash, block, log index, contract event,
  content hash) is an optional attribute on margin call step records and on the margin call, enforcement and
  substitution events. `AnchorCollateralEvent` and `AnchorMarginCallStep` attach it once the transaction is mined.
  Existing function signatures are unchanged, so the collateral service is unaffected. `ContentAnchored` compares the
  hash recorded on-chain with one the caller computes (Rune has no hash function; in the prototype keccak256 of the CDM
  JSON) ([[concept-asr-onchain-call-state]]).
