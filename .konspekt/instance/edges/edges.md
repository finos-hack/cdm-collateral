```yaml
provenance:
  conversationId: setup
  timestamp: 2026-10-14T23:04:53Z
review: accepted
```
# Edges

Single typed edge table (konspekt serialization v1). `from` / `to` are
`type:id`. `provenance` and `review` are the file-level defaults above.
`weight` is meaningful only for `relates` and `links`. Edge kinds:
`decomposes`, `mentions`, `relates`, `links`, `produces`, `notes`, `marks`,
`supersedes`.

| id | kind | from | to | weight |
|----|------|------|----|--------|
| e-dec-adoption-setupiter | decomposes | node:goal-test-konspekt-adoption | node:task-repo-setup-iteration |  |
| e-dec-cdmdata-cdmanalysis | decomposes | node:goal-data-cdm-taxonomies-specs | node:task-cdm-current-state-analysis |  |
| e-dec-cdmdata-otheragreements | decomposes | node:goal-data-cdm-taxonomies-specs | node:task-cdm-collateral-other-agreements |  |
| e-prod-cdmanalysis-csamatrix | produces | node:task-cdm-current-state-analysis | artifact:artifact-cdm-csa-coverage-matrix |  | accepted |
| e-prod-cdmanalysis-conceptmodel | produces | node:task-cdm-current-state-analysis | artifact:artifact-collateral-conceptual-model |  | accepted |
| e-dec-cdmdata-standards | decomposes | node:goal-data-cdm-taxonomies-specs | node:task-collateral-standards-inventory |  |
| e-prod-standards-inventory | produces | node:task-collateral-standards-inventory | artifact:artifact-collateral-standards-inventory |  | accepted |
| e-prod-cdmanalysis-findings | produces | node:task-cdm-current-state-analysis | artifact:artifact-collateral-findings |  | accepted |
| e-prod-standards-findings | produces | node:task-collateral-standards-inventory | artifact:artifact-collateral-findings |  | accepted |
| e-prod-otheragreements-matrix | produces | node:task-cdm-collateral-other-agreements | artifact:artifact-cdm-other-agreements-matrix |  | accepted |
| e-prod-otheragreements-flows | produces | node:task-cdm-collateral-other-agreements | artifact:artifact-collateral-flow-diagrams |  | accepted |
| e-dec-cdmdata-taxonomy | decomposes | node:goal-data-cdm-taxonomies-specs | node:task-collateral-taxonomy-inventory |  |
| e-prod-taxonomy-inventory | produces | node:task-collateral-taxonomy-inventory | artifact:artifact-collateral-taxonomy-inventory |  | accepted |
| e-prod-taxonomy-findings | produces | node:task-collateral-taxonomy-inventory | artifact:artifact-collateral-findings |  | accepted |
| e-prod-taxonomy-defects | produces | node:task-collateral-taxonomy-inventory | artifact:artifact-cdm-defects |  | accepted |
| e-prod-taxonomy-mapping | produces | node:task-collateral-taxonomy-inventory | artifact:artifact-collateral-asset-taxonomy-mapping |  | accepted |
| e-dec-arch-blockchain | decomposes | node:goal-architecture-design | node:task-blockchain-smart-contracts-applicability |  |
| e-dec-arch-localenv | decomposes | node:goal-architecture-design | node:task-local-environment-setup |  |
| e-men-blockchain-ledger-neutrality | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-ledger-neutrality |  | proposed |
| e-men-blockchain-cdm-data-layer | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-cdm-data-layer |  | proposed |
| e-men-blockchain-onchain-asset-identity | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-onchain-asset-identity |  | proposed |
| e-men-blockchain-settlement-finality | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-settlement-finality |  | proposed |
| e-men-blockchain-offchain-dispute | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-offchain-dispute |  | proposed |
| e-prod-blockchain-applicability | produces | node:task-blockchain-smart-contracts-applicability | artifact:artifact-blockchain-applicability |  | proposed |
