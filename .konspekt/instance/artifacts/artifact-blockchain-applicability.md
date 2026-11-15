```yaml
id: artifact-blockchain-applicability
name: Blockchain and smart contracts — applicability to CDM-based collateral management
kind: document
location: docs/architecture/blockchain-applicability.md
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;o4FBNlrIoD_A3RYzlBcaW_9SO2sIY-njQBp8Tg_ALSg
  timestamp: 2026-10-16T02:55:34Z
  confidence: 0.75
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: dc9865cb385fc2de9212ad62a89b55c55d0338e8
    contentHash: dc9865cb385fc2de9212ad62a89b55c55d0338e8
createdAt: 2026-10-16T02:55:34Z
updatedAt: 2026-10-16T19:49:05Z
```
# Blockchain and smart contracts — applicability to CDM-based collateral management

First-pass analysis from the seven reference documents (ISDA, GDF, Intelligence Economy Institute): whether ISDA points
at Hyperledger Besu (no — ledger-neutral; Besu is one of four ledgers in the GDF/ISDA sandbox), the reference
architecture the sources describe, applicability per collateral lifecycle step, consequences for the CDM-based data
design (B1–B5), risks, and five proposed ASRs.

Updated 2026-10-16 with the DTCC tokenization fact sheet (Besu as DTCC's private network, Canton) and the accepted
ledger decision `wp-adr-prototype-ledgers`.

Also records the accepted decision `wp-adr-im-segregation` (2026-10-16).
