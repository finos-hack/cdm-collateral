```yaml
id: nw-ledger-anchor-implementation
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;CKhBuSKli3RZj-QSJxMhIp1a9z01s_08wQs7qEe8u90
  timestamp: 2026-11-04T02:39:30Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 39f7c17397e2c6cac4dc35d76c7f3571c6c65217
    contentHash: 39f7c17397e2c6cac4dc35d76c7f3571c6c65217
createdAt: 2026-11-04T02:39:30Z
updatedAt: 2026-11-04T02:39:30Z
```
# Decision: how the ledger anchor redesign is implemented (G25)

Implements [[nw-ledger-anchor-redesign]] for [[task-g25-ledger-anchor-redesign]] in
`cdm-ext/rosetta/cdmx-collateral-ledger-*.rosetta`. These are the choices that note leaves open:

1. **Java-only serializer test.** Item 4 of the redesign asks for a Java against generated Python byte test. The
   Python build of the extension is retired (`wp-adr-java-cdm-stack`), so `LedgerTest` checks that the Rune JSON of
   an instruction is byte-identical after a round trip, which keeps its keccak256 hash stable. A second serializer
   would need its own test when one is added.
2. **Which events an anchor holds.** `Create_LedgerAnchor` takes the contract events read from the chain in chain
   order and keeps those that carry the record's hash, plus the events without a hash in the same transactions (for
   example the ERC-20 Transfer logs of a settlement). It fails if no event carries the hash.
3. **Expected transactions.** CDM does not say how many ledger transactions a record needs, so `AnchorStatus` takes
   the number from the caller. `MarginCallStepAnchorStatus` uses one per step. Complete means at least that many
   distinct Final transactions and none that is only Mined; any Reverted transaction makes the status Failed.
4. **Provisional confirmation rule.** `TransferComplete` needs a Complete anchor. A Registered or Claim token also
   needs a `RecordKeeperConfirmation` from the token's record keeper (matched by name) for the same asset and record.
   [[task-sme-registered-asset-completion]] may change this rule.
5. **Attribute name.** The anchor's record kind is `recordKind`: `recordType` is a reserved word in Rune.
6. **Not done yet.** The collateral service does not build anchors from the gateway's events. G4 and G14 do not
   call `TransferComplete`; their CDM status records what the parties instructed, and the anchor functions report
   whether the ledger agrees.
