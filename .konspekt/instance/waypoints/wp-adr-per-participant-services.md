```yaml
id: wp-adr-per-participant-services
kind: decision
subtype: adr
timestamp: 2026-10-16T20:43:52Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So
  timestamp: 2026-10-16T20:43:52Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c
    contentHash: 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c
createdAt: 2026-10-16T20:43:52Z
updatedAt: 2026-10-16T21:09:56Z
```
# ADR: One service stack per participant

Each simulated participant runs its own stack: party console, collateral workflow service, workflow store (own SQLite
file), ledger gateway and keystore holding only its own key. Workflow services exchange margin calls, responses, return
requests and approvals, and default notices with the counterparty's instance over HTTP. Each participant also runs its
own Besu validator node (four QBFT validators by default: market operator, BANK-A, BANK-B, BANK-C), and its gateway
connects to that node. The oracle service, mock market data and the contracts are shared.

**Context.** The first sketch shared one workflow service among all participants, like a margin utility. The human
chose one stack per participant as closer to how firms operate: each party keeps its own books and signs its own
transactions. Constraint `nw-prototype-scope` still applies.

**Consequences.** Each transaction is signed by the party that acts (pledgor signs pledge, secured party signs return
approval and enforce). The two parties' records can diverge and must reconcile with each other and with the chain; the
test plan adds participant-isolation and reconciliation scenarios. The four-validator network keeps producing blocks with one
node down (tested natively on 2026-10-16). Direct HTTP between services stands in for a messaging network.

Revised 2026-10-16T21:09:56Z on the human's instruction (source `2996ac2d303ef1b99234173cb0b618ba1a45aca9`): one Besu validator node per participant.
