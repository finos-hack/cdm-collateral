```yaml
id: nw-proposal-holder-node-contract-im
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;b0QtzxyiaiCamsFkMzjHkA5qpd0r9D-rvzRFCLjp2HY
  timestamp: 2026-11-26T15:28:23Z
  confidence: 0.7
createdAt: 2026-11-26T15:28:23Z
updatedAt: 2026-11-26T15:54:03Z
```
# Proposed decision: a designated holder node is holder of record for contract-held initial margin

The owner asked for the maintainer's view (2026-11-26). Proposed: one holder node per asset ledger publishes the
daily inventory commitment for lots held by the collateral control contract and derives their nullifiers with an
HSM-held key. It learns which lots are pledged, as a custodian under a control agreement does today. Rejected
alternatives: submission-node operators (designed to learn nothing about deals) and the pledgor (could derive two
nullifiers for one lot unless another party commits the binding).

Recorded as proposed in `docs/architecture/onchain-privacy.md` section 9.4; open as section 14.2 item 1.

Owner agreed (2026-11-26, "go with your view"; source ni:///sha-256;SYDRQ18EY6stOBOF-Z49guvhPu8phqYgAsOstEpN9LI). Left `review: proposed` for batch review; section 9.4
and 14.2 of the design updated.
