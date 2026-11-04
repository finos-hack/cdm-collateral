```yaml
id: nw-ledger-anchor-redesign
kind: decision
review: proposed
provenance:
  conversationId: cdm-development
  sourceRef: 67989287b51231983b6e1159a2195a185f5d16b3
  contentHash: 67989287b51231983b6e1159a2195a185f5d16b3
  timestamp: 2026-11-04T02:21:16Z
  confidence: 0.7
createdAt: 2026-11-04T02:21:16Z
updatedAt: 2026-11-04T02:21:16Z
```
# Decision: ledger anchors as append-only records derived from the chain (G25 redesign)

Replaces [[nw-ledger-reference-and-token-identity]], which the project owner rejected on 2026-11-04. The redesign
follows [[concept-asr-onchain-call-state]]: the chain records each call state change, and CDM content is checked
against the hash recorded on-chain. Work: [[task-g25-ledger-anchor-redesign]] ([[task-cdm-gap-closure]]).

1. **No edits to existing records.** `AnchorCollateralEvent`, `AnchorMarginCallStep` and the optional
   `ledgerReference` attributes on `MarginCallStepRecord`, `CollateralEvent`, `CollateralEnforcement` and
   `CollateralSubstitution` are removed. A CDM record does not change after it is created.
2. **An append-only `LedgerAnchor` record.** It names the anchored record (event or step identifier), the hash of
   the anchored document, and a 0..* list of transaction references (network, contract, transaction hash, block, log
   index, contract event). Each reference has a status: Mined, Final or Reverted. An enforcement or substitution with
   several transfers has one reference per transaction; a reverted transaction is recorded as Reverted.
3. **Derived from the chain.** Both parties build the anchors from on-chain data with the same function, in the fold
   the collateral service already runs (`App.cdmStateFor`). The folded `MarginCallState` holds no ledger data, so its
   `stateHash` is equal on both parties.
4. **The hashed document is defined.** For a margin call step it is the step's `MarginCallInstruction`, as the
   service hashes it today; for enforcement and substitution it is the instruction, never the event that holds the
   result. The hash is keccak256 over the Rune JSON bytes; a test checks that the Java and the generated Python
   serializers produce the same bytes for the same instruction.
5. **Checks against the chain.** A function states whether a CDM step and its anchors agree: every transfer the step
   implies has a Final reference and none is Reverted. A state with a missing or reverted reference is reported and
   is not treated as complete.
6. **G24 is kept** (`TokenizedAsset`, `TokenForAsset`, `AssetForToken`) and gains completion rules: for a Registered
   or Claim asset a Final on-chain transfer does not by itself make a call Settled or Enforced; the record keeper's
   confirmation is also needed. The exact rule waits for [[task-sme-registered-asset-completion]].
