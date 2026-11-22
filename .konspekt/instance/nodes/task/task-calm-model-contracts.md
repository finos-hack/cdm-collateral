```yaml
id: task-calm-model-contracts
type: task
title: Add the CCP clearing, record keeper register and provenance anchors contracts to the CALM model
status: resolved
review: accepted
provenance:
  conversationId: v02-demo-release-summary
  sourceRef: ni:///sha-256;tLPKtaJDaXLBydHSDQhLUTlGA11CPCXJ-_sojy2Jk1c
  timestamp: 2026-11-22T21:17:53Z
  confidence: 0.8
createdAt: 2026-11-22T21:17:53Z
updatedAt: 2026-11-22T21:44:54Z
```
# Task: add the CCP clearing, record keeper register and provenance anchors contracts to the CALM model

Under [[goal-architecture-design]]. Follows [[task-v02-demo-release-summary]], which found that
`architecture/prototype.architecture.json` has no nodes for `CcpClearing.sol` ([[task-ccp-workflows]]),
`RecordKeeperRegister.sol` ([[task-authoritative-record-settlement-enforcement]]) or `ProvenanceAnchors.sol`
([[task-document-provenance]]). The project owner asked for them on 2026-11-22.

Done when the three contracts are nodes of the CALM file, in the prototype's composition and deployed on the Besu
network, with their relationships to the contracts and services that use them, and `calm validate --strict` reports
0 errors.

**Done 2026-11-22**, on branch `calm-model-contracts`, for review: the three contract nodes, their place in the
prototype's composition and on the Besu network, relationships `ccp-to-repo-settlement`, `ccp-to-oracle-feed` and
`ccp-to-tokens`; the oracle service's description names its transfer agent role and `oracle-to-gateway` its register
confirmations; the triparty contract's description and the metadata status are brought to `v0.2-demo`.
`calm validate --strict` (CALM CLI 1.40.0): 0 errors, 0 warnings. Not modelled: an actor for the CCP's operations
(BANK-C), which has its own console (`#/live/C`) as the triparty agent has (`triparty-agent-ops`).

**Accepted and resolved 2026-11-22** by the project owner, with its decomposes edge (source `ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU`). Merged in PR #95 (`3b019d5`).
