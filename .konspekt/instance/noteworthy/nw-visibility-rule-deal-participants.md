```yaml
id: nw-visibility-rule-deal-participants
kind: constraint
status: active
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;JwWL_1GaIQ5Ko0WHg18VSabkcelVYpCAcHK3TUvCsBA
  timestamp: 2026-11-23T02:15:35Z
  confidence: 0.8
createdAt: 2026-11-23T02:15:35Z
updatedAt: 2026-11-23T02:22:35Z
```
# Constraint: deal data is visible to the deal's participants only

Stated by the project owner (2026-11-22) for `investigation-onchain-data-protection`:

1. The direct participants in a deal see all of that deal's data.
2. An approved third party (example given: the SEC) may see part of a deal's data, for example who the parties are.
   The owner marked this rule as possible, not settled.
3. Every other participant sees nothing about the deal, including whether it exists.

Working assumption, set by the project owner (2026-11-22, source `09ae468…`): every role a deal names counts as a
direct participant and sees all of that deal's data. This covers the custodian, the triparty agent, the CCP, the
oracle and the record keeper. The owner chose this so the design can proceed; roles and data elements are to be
calibrated later.

Not yet defined: which fields an approved third party sees.
