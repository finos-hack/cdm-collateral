```yaml
id: wp-adr-prototype-ledgers
kind: decision
subtype: adr
timestamp: 2026-10-16T19:30:54Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;W_6Ev0j1zn7b0l8-TydnvRDwVNHRRr6IWwyfjnmfRv4
  timestamp: 2026-10-16T19:30:54Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 156003750853115a8c254d36bc96078d723bd6af
    contentHash: 156003750853115a8c254d36bc96078d723bd6af
createdAt: 2026-10-16T19:30:54Z
updatedAt: 2026-10-16T19:30:54Z
```
# ADR: Prototype ledgers — Besu first, Canton second

The prototype uses Hyperledger Besu as its first ledger and Canton as the second target, both behind the same
ledger-neutral interface.

**Context.** ASRs `concept-asr-ledger-neutrality` and `concept-asr-settlement-finality`. DTCC's tokenization service
runs on Canton Network (CIP-56) and on "Besu — DTCC's private network" (ERC-20) at launch; DTC holds most US securities
used as collateral. Besu is EVM-compatible, supports permissioned networks with deterministic-finality consensus, and
runs locally as a development node. The ISDA and GDF sources are ledger-neutral; the GDF/ISDA sandbox settled across
Ethereum, Hedera and Besu.

**Consequences.** The local environment includes a Besu development network and an EVM toolchain. The ledger
interface must also cover a non-EVM token model (Canton CIP-56). Other ledgers (Stellar, Arc, public Ethereum) can be
added behind the same interface.
