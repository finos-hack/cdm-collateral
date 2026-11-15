```yaml
id: concept-asr-onchain-call-state
label: Margin call state on-chain, negotiation off-chain
subtype: asr
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc
  timestamp: 2026-10-16T21:34:51Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 70532bbf71d41c99c9efad27c0e9ed009891292a
    contentHash: 70532bbf71d41c99c9efad27c0e9ed009891292a
createdAt: 2026-10-16T21:34:51Z
updatedAt: 2026-10-16T21:34:51Z
```
# Margin call state on-chain, negotiation off-chain

Each margin call's state (issued, agreed, partially agreed, disputed, settled), amounts, deadline and a hash of the CDM
content are recorded on-chain, each change signed by the party that makes it. The CDM content travels off-chain between
the parties' services and is checked against the hash. A pledge is accepted only against an agreed call, up to the
agreed amount. Dispute resolution stays off-chain; only the fact of a dispute and the disputed amount are recorded.
Supersedes `concept-asr-offchain-dispute`.
