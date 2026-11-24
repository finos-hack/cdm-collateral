```yaml
id: nw-decision-prototype-builds-all-phases
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;_Dn7TKbJbk72yXrTQ1or_VulpYmoZKHos1iqqcNtgqE
  timestamp: 2026-11-24T15:19:38Z
  confidence: 0.85
createdAt: 2026-11-24T15:19:38Z
updatedAt: 2026-11-24T15:19:38Z
```
# Decision: the prototype builds all four privacy phases, one after another

Stated by the project owner (2026-11-24): "the prototype builds them all, one by one", referring to the four phases in
section 13 of `docs/architecture/onchain-privacy.md`:

1. Envelope log, member replay and acknowledgements for one margin call flow.
2. Regulator header key; proof of a deal's history by one party.
3. Encumbrance circuit and custodian inventory commitment.
4. Threshold escrow, member change and the remaining flows.

Effect on earlier records: `nw-prototype-scope` says the prototype keeps full visibility because it uses test data.
This decision brings on-chain privacy into the prototype's scope. `nw-prototype-scope` is not edited here.
