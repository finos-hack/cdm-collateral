```yaml
id: task-onchain-privacy
type: task
title: On-chain privacy and confidentiality
status: open
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 70532bbf71d41c99c9efad27c0e9ed009891292a
  contentHash: 70532bbf71d41c99c9efad27c0e9ed009891292a
  timestamp: 2026-10-16T21:34:51Z
createdAt: 2026-10-16T21:34:51Z
updatedAt: 2026-10-16T21:34:51Z
```
# Task: On-chain privacy and confidentiality

Think through what each participant must not see of other parties' margin calls, pledges and disputes, and how the
design keeps it hidden. Starting points: Besu 26.9.0 has no private transactions (checked with `besu --help`); options
include hashes or commitments only on-chain, bilateral or permissioned contracts, encryption of fields, a privacy layer,
and Canton's per-party visibility (second ledger target, `wp-adr-prototype-ledgers`). Lifts or confirms
`nw-assumption-besu-visibility`.
