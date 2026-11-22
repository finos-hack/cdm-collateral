```yaml
id: task-calm-model-contracts
type: task
title: Add the CCP clearing, record keeper register and provenance anchors contracts to the CALM model
status: open
review: proposed
provenance:
  conversationId: v02-demo-release-summary
  sourceRef: ni:///sha-256;tLPKtaJDaXLBydHSDQhLUTlGA11CPCXJ-_sojy2Jk1c
  timestamp: 2026-11-22T21:17:53Z
  confidence: 0.8
createdAt: 2026-11-22T21:17:53Z
updatedAt: 2026-11-22T21:17:53Z
```
# Task: add the CCP clearing, record keeper register and provenance anchors contracts to the CALM model

Under [[goal-architecture-design]]. Follows [[task-v02-demo-release-summary]], which found that
`architecture/prototype.architecture.json` has no nodes for `CcpClearing.sol` ([[task-ccp-workflows]]),
`RecordKeeperRegister.sol` ([[task-authoritative-record-settlement-enforcement]]) or `ProvenanceAnchors.sol`
([[task-document-provenance]]). The project owner asked for them on 2026-11-22.

Done when the three contracts are nodes of the CALM file, in the prototype's composition and deployed on the Besu
network, with their relationships to the contracts and services that use them, and `calm validate --strict` reports
0 errors.
