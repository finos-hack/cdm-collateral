```yaml
id: nw-proposal-regulator-selective-disclosure
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q
  timestamp: 2026-11-23T12:51:04Z
  confidence: 0.65
createdAt: 2026-11-23T12:51:04Z
updatedAt: 2026-11-23T12:51:04Z
```
# Proposed decision: the regulator receives selective disclosures and is not a privacy-group member

Proposed by the maintainer (2026-11-23) when the project owner asked it to resolve the open items of
`investigation-onchain-data-protection`. Evidence: `docs/analysis/bank-use-of-besu.md`.

1. The approved regulator is not a member of any deal's Pente privacy group.
2. For each deal event the regulator is entitled to, a deal participant sends the regulator a disclosure package: the
   selected private states with their salts. The regulator verifies them against the salted hashes on the base ledger.
3. Disclosed fields for the prototype: the parties' identifiers, the agreement type, and the CDM event type and date.
   This follows the owner's example ("who the parties are") in `nw-visibility-rule-deal-participants`.
4. The prototype gives the regulator no power to freeze, block or reverse collateral movements.

Reasons: a group member sees all deal data, which exceeds the rule's "some", and must sign every transition, so an
unavailable regulator would stop the deal. Drex was rejected partly because the authority's view was not specified
(report, section on Drex).

Not yet defined: which participant sends the package, and whether it is sent on every event or on request.
