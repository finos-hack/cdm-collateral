```yaml
id: wp-adr-margin-call-state-onchain
kind: decision
subtype: adr
timestamp: 2026-10-16T21:34:51Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 70532bbf71d41c99c9efad27c0e9ed009891292a
  contentHash: 70532bbf71d41c99c9efad27c0e9ed009891292a
  timestamp: 2026-10-16T21:34:51Z
createdAt: 2026-10-16T21:34:51Z
updatedAt: 2026-10-16T21:34:51Z
```
# ADR: Margin call state recorded by a smart contract

A margin call contract on Besu records each call: ID, agreement, caller and called party, called amount, agreed
amount, disputed amount, settlement deadline, state, and the hash of the CDM `MarginCallIssuance` /
`MarginCallResponse`. The secured party's key issues; the pledgor's key responds (agree, partially agree, dispute).
The collateral control contract accepts a pledge only against an agreed call, up to the agreed amount, and marks the
call settled. CDM content is sent between the two parties' workflow services (HTTP, CDM payload in an envelope with
message ID, sender, receiver, agreement ID and the ID of the message it answers).

**Context.** The human asked whether the messages should flow through smart contracts. Full messages on-chain would
expose all content to every node (Besu 26.9.0 has no private transactions), put large CDM objects in contract storage
and cannot carry legal notices; fully off-chain gives no shared record and no link between call and pledge. The human
chose this hybrid. ASR `concept-asr-onchain-call-state`.

**Consequences.** The two parties no longer reconcile call status. Every Besu node sees call amounts and states
(`nw-assumption-besu-visibility`, to be examined in `task-onchain-privacy`). Default notices remain off-chain legal
notices; only the default status reaches the chain through the oracle feed.
