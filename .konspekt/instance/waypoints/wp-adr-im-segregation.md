```yaml
id: wp-adr-im-segregation
kind: decision
subtype: adr
timestamp: 2026-10-16T19:49:05Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 2fb4e26caea617c016a1f1089b037ff9c5b92cce
  contentHash: 2fb4e26caea617c016a1f1089b037ff9c5b92cce
  timestamp: 2026-10-16T19:49:05Z
createdAt: 2026-10-16T19:49:05Z
updatedAt: 2026-10-16T19:49:05Z
```
# ADR: Initial margin segregation by smart contract

The prototype segregates initial margin with a smart contract on Besu that holds the pledged tokens. The pledgor
pledges into the contract; return needs both parties or the secured party's consent; the secured party can enforce
only after a default; no other movement is possible. States: pledged, returned, enforced.

**Context.** UMR requires initial margin to be segregated, bankruptcy-remote and not reused. The GDF/ISDA sandbox
showed two models: code-enforced segregation (Ownera Collateral Control Contract) and a triparty agent's books with
tokenized settlement (State Street). Constraint `nw-prototype-scope`: the prototype illustrates the concept, so the
model that puts segregation on-chain is preferred. Ledger: `wp-adr-prototype-ledgers`.

**Consequences.** The contract maps to CDM's IM legal terms (custodian, control agreement, enforcement event).
Rests on assumption `nw-assumption-contract-control`. The triparty model can be added later as a configuration where
the controller is an agent.
