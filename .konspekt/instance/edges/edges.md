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
| e-men-blockchain-ledger-neutrality | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-ledger-neutrality |  | accepted |
| e-men-blockchain-cdm-data-layer | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-cdm-data-layer |  | accepted |
| e-men-blockchain-onchain-asset-identity | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-onchain-asset-identity |  | accepted |
| e-men-blockchain-settlement-finality | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-settlement-finality |  | accepted |
| e-men-blockchain-offchain-dispute | mentions | node:task-blockchain-smart-contracts-applicability | concept:concept-asr-offchain-dispute |  | accepted |
| e-prod-blockchain-applicability | produces | node:task-blockchain-smart-contracts-applicability | artifact:artifact-blockchain-applicability |  | accepted |
| e-drv-ledgerneutrality-ledgers | drives | concept:concept-asr-ledger-neutrality | waypoint:wp-adr-prototype-ledgers |  | accepted |
| e-drv-finality-ledgers | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-prototype-ledgers |  | accepted |
| e-mrk-ledgers-blockchain | marks | waypoint:wp-adr-prototype-ledgers | node:task-blockchain-smart-contracts-applicability |  |
| e-note-arch-prototypescope | notes | node:goal-architecture-design | noteworthy:nw-prototype-scope |  |
| e-mrk-imseg-blockchain | marks | waypoint:wp-adr-im-segregation | node:task-blockchain-smart-contracts-applicability |  |
| e-note-arch-contractcontrol | notes | node:goal-architecture-design | noteworthy:nw-assumption-contract-control |  |
| e-prod-localenv-architecture | produces | node:task-local-environment-setup | artifact:artifact-prototype-architecture |  | accepted |
| e-prod-localenv-testplan | produces | node:task-local-environment-setup | artifact:artifact-test-framework-plan |  | accepted |
| e-prod-localenv-setup | produces | node:task-local-environment-setup | artifact:artifact-setup-windows |  | accepted |
| e-mrk-perparticipant-localenv | marks | waypoint:wp-adr-per-participant-services | node:task-local-environment-setup |  |
| e-sup-callstate-offchaindispute | supersedes | concept:concept-asr-onchain-call-state | concept:concept-asr-offchain-dispute |  |
| e-drv-callstate-callcontract | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-margin-call-state-onchain |  |
| e-mrk-callcontract-localenv | marks | waypoint:wp-adr-margin-call-state-onchain | node:task-local-environment-setup |  |
| e-note-arch-besuvisibility | notes | node:goal-architecture-design | noteworthy:nw-assumption-besu-visibility |  |
| e-dec-arch-privacy | decomposes | node:goal-architecture-design | node:task-onchain-privacy |  |
| e-note-privacy-besuvisibility | notes | node:task-onchain-privacy | noteworthy:nw-assumption-besu-visibility |  |
| e-note-arch-mimicrealflows | notes | node:goal-architecture-design | noteworthy:nw-mimic-real-flows |  |
| e-dec-arch-twowayim | decomposes | node:goal-architecture-design | node:task-two-way-initial-margin |  |
| e-mrk-cloudenv-localenv | marks | waypoint:wp-adr-cloud-dev-environment | node:task-local-environment-setup |  |
| e-dec-localenv-windows | decomposes | node:task-local-environment-setup | node:task-windows-install |  |
| e-prod-localenv-codespaces | produces | node:task-local-environment-setup | artifact:artifact-setup-codespaces |  | accepted |
| e-dec-e2e-clickableui | decomposes | node:goal-end-to-end-flow | node:task-clickable-ui |  |
| e-mrk-uxgrid-clickableui | marks | waypoint:wp-adr-ux-scenario-grid | node:task-clickable-ui |  |
| e-prod-clickableui-html | produces | node:task-clickable-ui | artifact:artifact-clickable-ui-html |  | accepted |
| e-dec-e2e-reactconsole | decomposes | node:goal-end-to-end-flow | node:task-react-console |  |
| e-prod-reactconsole-app | produces | node:task-react-console | artifact:artifact-react-console |  | proposed |
| e-dec-cdmdev-gapanalysis | decomposes | node:goal-cdm-development | node:task-cdm-gap-analysis |  |
| e-dec-cdmdev-gapclosure | decomposes | node:goal-cdm-development | node:task-cdm-gap-closure |  |
