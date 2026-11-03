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
| e-prod-reactconsole-app | produces | node:task-react-console | artifact:artifact-react-console |  | accepted |
| e-dec-e2e-wiring | decomposes | node:goal-end-to-end-flow | node:task-e2e-wiring |  | accepted |
| e-dec-cdmdev-gapanalysis | decomposes | node:goal-cdm-development | node:task-cdm-gap-analysis |  |
| e-dec-cdmdev-gapclosure | decomposes | node:goal-cdm-development | node:task-cdm-gap-closure |  |
| e-mrk-localext-gapclosure | marks | waypoint:wp-adr-cdm-local-extensions | node:task-cdm-gap-closure |  |
| e-prod-gapanalysis-register | produces | node:task-cdm-gap-analysis | artifact:artifact-cdm-gap-register |  | accepted |
| e-mrk-extrune-gapclosure | marks | waypoint:wp-adr-cdm-extension-rune | node:task-cdm-gap-closure |  |
| e-mrk-consolerules-gapclosure | marks | waypoint:wp-adr-console-on-extension-rules | node:task-cdm-gap-closure |  |
| e-note-cdmdev-baserelease | notes | node:goal-cdm-development | noteworthy:nw-cdm-base-release-7-7-0 |  |
| e-prod-gapclosure-cdmext | produces | node:task-cdm-gap-closure | artifact:artifact-cdm-ext |  | accepted |
| e-note-cdmdev-pythonworkarounds | notes | node:goal-cdm-development | noteworthy:nw-cdm-python-workarounds |  |
| e-mrk-collevents-gapclosure | marks | waypoint:wp-adr-cdm-collateral-events | node:task-cdm-gap-closure |  |
| e-note-cdmdev-stayonpython | notes | node:goal-cdm-development | noteworthy:nw-cdm-stay-on-python |  |
| e-note-cdmdev-sharedmaintainers | notes | node:goal-cdm-development | noteworthy:nw-repo-shared-with-cdm-maintainers |  |
| e-sup-javastack-stayonpython | supersedes | waypoint:wp-adr-java-cdm-stack | noteworthy:nw-cdm-stay-on-python |  |
| e-sup-javastack-pythonworkarounds | supersedes | waypoint:wp-adr-java-cdm-stack | noteworthy:nw-cdm-python-workarounds |  |
| e-mrk-javastack-gapclosure | marks | waypoint:wp-adr-java-cdm-stack | node:task-cdm-gap-closure |  |
| e-mrk-javastack-e2ewiring | marks | waypoint:wp-adr-java-cdm-stack | node:task-e2e-wiring |  | accepted |
| e-dec-adoption-fleet | decomposes | node:goal-test-konspekt-adoption | node:task-adopt-agent-fleet |  | accepted |
| e-prod-twowayim-design | produces | node:task-two-way-initial-margin | artifact:artifact-two-way-im-design |  | accepted |
| e-onchain-privacy-produces-design | produces | node:task-onchain-privacy | artifact:artifact-onchain-privacy-design |  | accepted |
| e-business-case-produces-doc | produces | node:goal-business-case | artifact:artifact-business-case |  | accepted |
| e-note-bizcase-finoscollab | notes | node:goal-business-case | noteworthy:nw-finos-collaboration |  | accepted |
| e-prod-e2ewiring-gateway | produces | node:task-e2e-wiring | artifact:artifact-ledger-gateway |  | accepted |
| e-prod-e2ewiring-service | produces | node:task-e2e-wiring | artifact:artifact-collateral-service |  | accepted |
| e-prod-e2ewiring-harness | produces | node:task-e2e-wiring | artifact:artifact-e2e-live-harness |  | accepted |
| e-prod-reactconsole-livewiring | produces | node:task-react-console | artifact:artifact-live-console-wiring |  | accepted |
| e-mrk-firstcycle-e2ewiring | marks | waypoint:wp-first-e2e-cycle | node:task-e2e-wiring |  | accepted |
| e-note-e2ewiring-scope | notes | node:task-e2e-wiring | noteworthy:nw-e2e-first-cycle-scope |  | accepted |
| e-drv-ledgerneutrality-carrier | drives | concept:concept-asr-ledger-neutrality | waypoint:wp-adr-cdm-payload-carrier |  | accepted |
| e-drv-cdmdatalayer-carrier | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-cdm-payload-carrier |  | accepted |
| e-mrk-carrier-e2ewiring | marks | waypoint:wp-adr-cdm-payload-carrier | node:task-e2e-wiring |  | accepted |
| e-dec-e2ewiring-cilivestack | decomposes | node:task-e2e-wiring | node:task-ci-live-e2e-stack |  | accepted |
| e-note-cilivestack-steps | notes | node:task-ci-live-e2e-stack | noteworthy:nw-ci-live-stack-steps |  | rejected |
| e-architecture-payload-carrier-revision-produces | produces | node:goal-architecture-design | artifact:artifact-architecture-payload-carrier-revision |  | accepted |
| e-payload-carrier-component-docs-produces | produces | node:task-e2e-wiring | artifact:artifact-payload-carrier-component-docs |  | accepted |
| e-gap-register-g26-carrier-produces | produces | node:task-cdm-gap-closure | artifact:artifact-gap-register-g26-carrier |  | accepted |
| e-prod-e2ewiring-runbook | produces | node:task-e2e-wiring | artifact:artifact-e2e-runbook |  | accepted |
| e-dec-e2ewiring-devcontainerstack | decomposes | node:task-e2e-wiring | node:task-devcontainer-live-stack |  | accepted |
| e-lnk-cilivestack-devcontainerstack | links | node:task-ci-live-e2e-stack | node:task-devcontainer-live-stack |  | accepted |
| e-mrk-livestacklocal-cilivestack | marks | waypoint:wp-adr-live-stack-local-ui-driven | node:task-ci-live-e2e-stack |  | accepted |
| e-mrk-livestacklocal-devcontainerstack | marks | waypoint:wp-adr-live-stack-local-ui-driven | node:task-devcontainer-live-stack |  | accepted |
| e-note-cilivestack-status | notes | node:task-ci-live-e2e-stack | noteworthy:nw-ci-live-e2e-stack-status |  | accepted |
| e-note-cilivestack-first-run | notes | node:task-ci-live-e2e-stack | noteworthy:nw-ci-live-stack-first-run |  | accepted |
| e-sup-livestacklocal-cilivestacksteps | supersedes | waypoint:wp-adr-live-stack-local-ui-driven | noteworthy:nw-ci-live-stack-steps |  | accepted |
| e-dec-e2ewiring-devcontainerstartup | decomposes | node:task-e2e-wiring | node:task-devcontainer-stack-startup |  | accepted |
| e-lnk-devcontainerstack-devcontainerstartup | links | node:task-devcontainer-live-stack | node:task-devcontainer-stack-startup |  | accepted |
| e-dec-e2ewiring-codespacesstack | decomposes | node:task-e2e-wiring | node:task-codespaces-live-stack |  | accepted |
| e-lnk-devcontainerstartup-codespacesstack | links | node:task-devcontainer-stack-startup | node:task-codespaces-live-stack |  | accepted |
| e-dec-e2ewiring-remainingflows | decomposes | node:task-e2e-wiring | node:task-e2e-remaining-flows |  | rejected |
| e-dec-bizcase-topupmodelling | decomposes | node:goal-business-case | node:task-revaluation-top-up-modelling |  | accepted |
| e-lnk-remainingflows-topupmodelling | links | node:task-e2e-remaining-flows | node:task-revaluation-top-up-modelling |  | accepted |
| e-dec-e2ewiring-livecheckout | decomposes | node:task-e2e-wiring | node:task-live-flow-checkout-script |  | accepted |
| e-lnk-remainingflows-livecheckout | links | node:task-e2e-remaining-flows | node:task-live-flow-checkout-script |  | accepted |
| e-lnk-cilivestack-livecheckout | links | node:task-ci-live-e2e-stack | node:task-live-flow-checkout-script |  | accepted |
| e-dec-e2ewiring-balanceaware | decomposes | node:task-e2e-wiring | node:task-live-spec-balance-aware-amounts |  | rejected |
| e-lnk-livecheckout-balanceaware | links | node:task-live-flow-checkout-script | node:task-live-spec-balance-aware-amounts |  | accepted |
| e-lnk-remainingflows-balanceaware | links | node:task-e2e-remaining-flows | node:task-live-spec-balance-aware-amounts |  | accepted |
| e-mrk-sameoriginproxy-codespacesstack | marks | waypoint:wp-adr-console-same-origin-proxy | node:task-codespaces-live-stack |  | accepted |
| e-dec-e2eflow-remainingflows | decomposes | node:goal-end-to-end-flow | node:task-e2e-remaining-flows |  | accepted |
| e-dec-e2eflow-balanceaware | decomposes | node:goal-end-to-end-flow | node:task-live-spec-balance-aware-amounts |  | accepted |
| e-note-remainingflows-returndefault | notes | node:task-e2e-remaining-flows | noteworthy:nw-return-default-flows-wired |  | accepted |
| e-note-remainingflows-depletion | notes | node:task-e2e-remaining-flows | noteworthy:nw-live-spec-balance-depletion |  | accepted |
| e-note-livecheckout-depletion | notes | node:task-live-flow-checkout-script | noteworthy:nw-live-spec-balance-depletion |  | accepted |
| e-note-balanceaware-depletion | notes | node:task-live-spec-balance-aware-amounts | noteworthy:nw-live-spec-balance-depletion |  | accepted |
| e-dec-e2eflow-collateralunittests | decomposes | node:goal-end-to-end-flow | node:task-collateral-service-unit-tests |  | proposed |
| e-dec-e2eflow-workflowtaskmap | decomposes | node:goal-end-to-end-flow | node:investigation-cdm-workflow-task-map |  | accepted |
| e-prod-workflowtaskmap-map | produces | node:investigation-cdm-workflow-task-map | artifact:artifact-cdm-workflow-task-map |  | accepted |
| e-dec-e2eflow-csaextensions | decomposes | node:goal-end-to-end-flow | node:task-csa-workflow-extensions |  | accepted |
| e-dec-e2eflow-repogmra | decomposes | node:goal-end-to-end-flow | node:task-repo-gmra-workflows |  | accepted |
| e-dec-e2eflow-seclendinggmsla | decomposes | node:goal-end-to-end-flow | node:task-securities-lending-gmsla-workflows |  | accepted |
| e-dec-e2eflow-triparty | decomposes | node:goal-end-to-end-flow | node:task-triparty-workflows |  | accepted |
| e-dec-e2eflow-ccp | decomposes | node:goal-end-to-end-flow | node:task-ccp-workflows |  | accepted |
| e-lnk-csaextensions-gapclosure | links | node:task-csa-workflow-extensions | node:task-cdm-gap-closure |  | accepted |
| e-note-workflowtaskmap-corefirst | notes | node:investigation-cdm-workflow-task-map | noteworthy:nw-core-cycle-first |  | accepted |
| e-note-workflowtaskmap-csaorder | notes | node:investigation-cdm-workflow-task-map | noteworthy:nw-csa-extension-order |  | accepted |
| e-note-csaextensions-csaorder | notes | node:task-csa-workflow-extensions | noteworthy:nw-csa-extension-order |  | accepted |
| e-note-workflowtaskmap-familyorder | notes | node:investigation-cdm-workflow-task-map | noteworthy:nw-agreement-family-order |  | accepted |
| e-mrk-oracleadr-remainingflows | marks | waypoint:wp-adr-oracle-prices-on-request-ratings-offchain | node:task-e2e-remaining-flows |  | accepted |
| e-mrk-revaladr-remainingflows | marks | waypoint:wp-adr-revaluation-outstanding-im-from-calls | node:task-e2e-remaining-flows |  | accepted |
| e-note-remainingflows-topupexcluded | notes | node:task-e2e-remaining-flows | noteworthy:nw-revaluation-top-up-excluded |  | accepted |
| e-note-topupmodelling-topupexcluded | notes | node:task-revaluation-top-up-modelling | noteworthy:nw-revaluation-top-up-excluded |  | accepted |
| e-mrk-cispecsadr-remainingflows | marks | waypoint:wp-adr-ci-runs-live-specs | node:task-e2e-remaining-flows |  | accepted |
| e-sup-cispecs-livestacklocal | supersedes | waypoint:wp-adr-ci-runs-live-specs | waypoint:wp-adr-live-stack-local-ui-driven |  | accepted |
| e-note-gapclosure-portfoliopair | notes | node:task-cdm-gap-closure | noteworthy:nw-portfolio-per-pair-post-haircut |  | proposed |
| e-note-gapclosure-valuationpct | notes | node:task-cdm-gap-closure | noteworthy:nw-cdm-valuation-percentage-as-haircut |  | proposed |
