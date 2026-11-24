```yaml
id: artifact-onchain-privacy-design-canton
name: On-chain privacy design, Canton version
kind: doc
location: docs/architecture/onchain-privacy-canton.md
createdAt: 2026-11-24T01:56:53Z
updatedAt: 2026-11-24T01:56:53Z
review: proposed
provenance:
  sourceRef: ni:///sha-256;2muqnkgM9iOKoUH_RHzIwjtA7d8npou5PoYsQDqrDa8
  conversationId: onchain-data-protection
  timestamp: 2026-11-24T01:56:53Z
  confidence: 0.65
```
# Artifact: on-chain privacy design, Canton version

Draft requested by the project owner (2026-11-23): a version of the on-chain privacy design with Canton as the main
path. It is an alternative to `artifact-onchain-privacy-design` (`docs/architecture/onchain-privacy.md`), which
takes a custom design on Besu as its main path. Neither version is selected.

The document applies `nw-canton-multi-operator-synchronizer`, states which requirements the Canton path meets,
replaces or does not meet (public logic, proof-based enforcement and a visible data flow are the ones given up), and
proposes a five-phase prototype plan. Canton was not run; its claims rest on documentation.
