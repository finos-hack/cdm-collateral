```yaml
id: wp-adr-per-participant-services
kind: decision
subtype: adr
timestamp: 2026-10-16T20:43:52Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c
  contentHash: 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c
  timestamp: 2026-10-16T20:43:52Z
createdAt: 2026-10-16T20:43:52Z
updatedAt: 2026-10-16T20:43:52Z
```
# ADR: One service stack per participant

Each simulated participant runs its own stack: party console, collateral workflow service, workflow store (own SQLite
file), ledger gateway and keystore holding only its own key. Workflow services exchange margin calls, responses, return
requests and approvals, and default notices with the counterparty's instance over HTTP. The oracle service, mock market
data, the Besu node and the contracts are shared market infrastructure.

**Context.** The first sketch shared one workflow service among all participants, like a margin utility. The human
chose one stack per participant as closer to how firms operate: each party keeps its own books and signs its own
transactions. Constraint `nw-prototype-scope` still applies.

**Consequences.** Each transaction is signed by the party that acts (pledgor signs pledge, secured party signs return
approval and enforce). The two parties' records can diverge and must reconcile with each other and with the chain; the
test plan adds participant-isolation and reconciliation scenarios. All gateways share the single Besu node; one node
per participant is a later option. Direct HTTP between services stands in for a messaging network.
