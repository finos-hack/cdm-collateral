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
| e-dec-e2eflow-collateralunittests | decomposes | node:goal-end-to-end-flow | node:task-collateral-service-unit-tests |  | accepted |
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
| e-note-gapclosure-portfoliopair | notes | node:task-cdm-gap-closure | noteworthy:nw-portfolio-per-pair-post-haircut |  | accepted |
| e-note-gapclosure-valuationpct | notes | node:task-cdm-gap-closure | noteworthy:nw-cdm-valuation-percentage-as-haircut |  | accepted |
| e-note-gapclosure-concentration | notes | node:task-cdm-gap-closure | noteworthy:nw-concentration-held-and-proposed-after-haircuts |  | accepted |
| e-note-gapclosure-vmexposure | notes | node:task-cdm-gap-closure | noteworthy:nw-vm-exposure-from-netting-set |  | accepted |
| e-note-gapclosure-closeout | notes | node:task-cdm-gap-closure | noteworthy:nw-closeout-collateral-by-arrangement |  | accepted |
| e-note-gapclosure-enforcement | notes | node:task-cdm-gap-closure | noteworthy:nw-enforcement-event-by-election |  | accepted |
| e-dec-cdmdev-smeenforcement | decomposes | node:goal-cdm-development | node:task-sme-enforcement-event-definition |  | accepted |
| e-lnk-gapclosure-smeenforcement | links | node:task-cdm-gap-closure | node:task-sme-enforcement-event-definition |  | accepted |
| e-note-gapclosure-substitution | notes | node:task-cdm-gap-closure | noteworthy:nw-substitution-csa-lifecycle |  | accepted |
| e-note-gapclosure-dispute | notes | node:task-cdm-gap-closure | noteworthy:nw-dispute-record-beside-call |  | accepted |
| e-note-gapclosure-ledger | notes | node:task-cdm-gap-closure | noteworthy:nw-ledger-reference-and-token-identity |  | rejected |
| e-sup-ledgeranchor-ledgerref | supersedes | noteworthy:nw-ledger-anchor-redesign | noteworthy:nw-ledger-reference-and-token-identity |  | accepted |
| e-note-gapclosure-ledgeranchor | notes | node:task-cdm-gap-closure | noteworthy:nw-ledger-anchor-redesign |  | accepted |
| e-dec-gapclosure-g25redesign | decomposes | node:task-cdm-gap-closure | node:task-g25-ledger-anchor-redesign |  | accepted |
| e-note-g25redesign-ledgeranchor | notes | node:task-g25-ledger-anchor-redesign | noteworthy:nw-ledger-anchor-redesign |  | accepted |
| e-dec-cdmdev-smeregistered | decomposes | node:goal-cdm-development | node:task-sme-registered-asset-completion |  | accepted |
| e-lnk-gapclosure-smeregistered | links | node:task-cdm-gap-closure | node:task-sme-registered-asset-completion |  | accepted |
| e-note-g25redesign-implementation | notes | node:task-g25-ledger-anchor-redesign | noteworthy:nw-ledger-anchor-implementation |  | accepted |
| e-dec-csaext-closeout | decomposes | node:task-csa-workflow-extensions | node:task-csa-close-out-netting |  | accepted |
| e-dec-csaext-substitution | decomposes | node:task-csa-workflow-extensions | node:task-csa-substitution |  | accepted |
| e-dec-csaext-interest | decomposes | node:task-csa-workflow-extensions | node:task-csa-interest-on-cash |  | accepted |
| e-dec-csaext-amendment | decomposes | node:task-csa-workflow-extensions | node:task-csa-amendment |  | accepted |
| e-dec-csaext-cancellation | decomposes | node:task-csa-workflow-extensions | node:task-csa-call-cancellation |  | accepted |
| e-dec-csaext-settlementnetting | decomposes | node:task-csa-workflow-extensions | node:task-csa-settlement-netting |  | accepted |
| e-dec-csaext-allocation | decomposes | node:task-csa-workflow-extensions | node:task-csa-allocation |  | accepted |
| e-dec-csaext-reconciliation | decomposes | node:task-csa-workflow-extensions | node:task-csa-reconciliation |  | accepted |
| e-mrk-closeoutadr-closeout | marks | waypoint:wp-adr-closeout-contract-applies-collateral | node:task-csa-close-out-netting |  | accepted |
| e-mrk-subfoldadr-substitution | marks | waypoint:wp-adr-substitution-fold-portfolio | node:task-csa-substitution |  | accepted |
| e-mrk-interestadr-interest | marks | waypoint:wp-adr-interest-rate-rules-and-withholding | node:task-csa-interest-on-cash |  | accepted |
| e-dec-cdmdev-smeinterest | decomposes | node:goal-cdm-development | node:task-sme-interest-daily-balances |  | accepted |
| e-lnk-interest-smeinterest | links | node:task-csa-interest-on-cash | node:task-sme-interest-daily-balances |  | accepted |
| e-mrk-interestsettle-interest | marks | waypoint:wp-adr-interest-onchain-settlement | node:task-csa-interest-on-cash |  | accepted |
| e-mrk-amendterms-amendment | marks | waypoint:wp-adr-amendment-per-pair-terms | node:task-csa-amendment |  | accepted |
| e-dec-cdmdev-smecancel | decomposes | node:goal-cdm-development | node:task-sme-call-cancellation-rules |  | accepted |
| e-lnk-cancel-smecancel | links | node:task-csa-call-cancellation | node:task-sme-call-cancellation-rules |  | accepted |
| e-mrk-cancelblocks-cancel | marks | waypoint:wp-adr-cancellation-blocks-call | node:task-csa-call-cancellation |  | accepted |
| e-lnk-cilivestack-deploydroppedtx | links | node:task-ci-live-e2e-stack | node:task-ci-deploy-dropped-tx |  | accepted |
| e-dec-archdesign-adrtrace | decomposes | node:goal-architecture-design | node:investigation-adr-asr-traceability |  | accepted |
| e-drv-cdmdata-amendterms | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-amendment-per-pair-terms |  | accepted |
| e-drv-callstate-cancelblocks | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-cancellation-blocks-call |  | accepted |
| e-drv-cdmdata-cancelblocks | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-cancellation-blocks-call |  | accepted |
| e-drv-cdmdata-cdmevents | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-cdm-collateral-events |  | accepted |
| e-drv-cdmdata-extrune | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-cdm-extension-rune |  | accepted |
| e-drv-cdmdata-localext | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-cdm-local-extensions |  | accepted |
| e-drv-cdmdata-closeout | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-closeout-contract-applies-collateral |  | accepted |
| e-drv-finality-closeout | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-closeout-contract-applies-collateral |  | accepted |
| e-drv-cdmdata-consolerules | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-console-on-extension-rules |  | accepted |
| e-drv-callstate-imseg | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-im-segregation |  | accepted |
| e-drv-finality-imseg | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-im-segregation |  | accepted |
| e-drv-cdmdata-interestsettle | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-interest-onchain-settlement |  | accepted |
| e-drv-finality-interestsettle | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-interest-onchain-settlement |  | accepted |
| e-drv-cdmdata-interestrules | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-interest-rate-rules-and-withholding |  | accepted |
| e-drv-cdmdata-javastack | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-java-cdm-stack |  | accepted |
| e-drv-callstate-perparty | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-per-participant-services |  | accepted |
| e-drv-callstate-reval | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-revaluation-outstanding-im-from-calls |  | accepted |
| e-drv-callstate-subst | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-substitution-fold-portfolio |  | accepted |
| e-drv-cdmdata-subst | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-substitution-fold-portfolio |  | accepted |
| e-note-adrtrace-jsonsource | notes | node:investigation-adr-asr-traceability | noteworthy:nw-architecture-json-is-source |  | accepted |
| e-drv-feedscope-oracleprices | drives | concept:concept-asr-onchain-feed-scope | waypoint:wp-adr-oracle-prices-on-request-ratings-offchain |  | accepted |
| e-drv-agreementfidelity-scenariogrid | drives | concept:concept-asr-agreement-type-fidelity | waypoint:wp-adr-ux-scenario-grid |  | accepted |
| e-dec-csaext-replacement | decomposes | node:task-csa-workflow-extensions | node:task-csa-call-replacement |  | accepted |
| e-lnk-cancel-replacement | links | node:task-csa-call-cancellation | node:task-csa-call-replacement |  | accepted |
| e-lnk-replacement-smecancel | links | node:task-csa-call-replacement | node:task-sme-call-cancellation-rules |  | accepted |
| e-mrk-replacementlink-replacement | marks | waypoint:wp-adr-replacement-call-link | node:task-csa-call-replacement |  | accepted |
| e-drv-callstate-replacelink | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-replacement-call-link |  | accepted |
| e-drv-cdmdata-replacelink | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-replacement-call-link |  | accepted |
| e-mrk-nettingscope-netting | marks | waypoint:wp-adr-settlement-netting-scope | node:task-csa-settlement-netting |  | accepted |
| e-dec-cdmdev-smenetting | decomposes | node:goal-cdm-development | node:task-sme-settlement-netting-rules |  | accepted |
| e-lnk-netting-smenetting | links | node:task-csa-settlement-netting | node:task-sme-settlement-netting-rules |  | accepted |
| e-drv-finality-nettingscope | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-settlement-netting-scope |  | accepted |
| e-drv-callstate-nettingscope | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-settlement-netting-scope |  | accepted |
| e-drv-cdmdata-nettingscope | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-settlement-netting-scope |  | accepted |
| e-mrk-allocscope-alloc | marks | waypoint:wp-adr-allocation-scope | node:task-csa-allocation |  | accepted |
| e-dec-cdmdev-smealloc | decomposes | node:goal-cdm-development | node:task-sme-allocation-ranking |  | accepted |
| e-lnk-alloc-smealloc | links | node:task-csa-allocation | node:task-sme-allocation-ranking |  | accepted |
| e-drv-cdmdata-allocscope | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-allocation-scope |  | accepted |
| e-drv-callstate-allocscope | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-allocation-scope |  | accepted |
| e-dec-cdmdev-smeallocconc | decomposes | node:goal-cdm-development | node:task-sme-allocation-concentration |  | accepted |
| e-lnk-alloc-smeallocconc | links | node:task-csa-allocation | node:task-sme-allocation-concentration |  | accepted |
| e-dec-csaext-allocopt | decomposes | node:task-csa-workflow-extensions | node:task-csa-allocation-optimisation |  | accepted |
| e-lnk-alloc-allocopt | links | node:task-csa-allocation | node:task-csa-allocation-optimisation |  | accepted |
| e-dec-e2eflow-specduration | decomposes | node:goal-end-to-end-flow | node:task-live-spec-duration |  | accepted |
| e-lnk-cilivestack-specduration | links | node:task-ci-live-e2e-stack | node:task-live-spec-duration |  | accepted |
| e-mrk-reconscope-recon | marks | waypoint:wp-adr-reconciliation-scope | node:task-csa-reconciliation |  | accepted |
| e-dec-cdmdev-smerecon | decomposes | node:goal-cdm-development | node:task-sme-reconciliation-rules |  | accepted |
| e-lnk-recon-smerecon | links | node:task-csa-reconciliation | node:task-sme-reconciliation-rules |  | accepted |
| e-drv-cdmdata-reconscope | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-reconciliation-scope |  | accepted |
| e-drv-callstate-reconscope | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-reconciliation-scope |  | accepted |
| e-drv-offchaindispute-reconscope | drives | concept:concept-asr-offchain-dispute | waypoint:wp-adr-reconciliation-scope |  | accepted |
| e-dec-specduration-receiptpoll | decomposes | node:task-live-spec-duration | node:task-gateway-receipt-poll |  | accepted |
| e-dec-specduration-readlatency | decomposes | node:task-live-spec-duration | node:task-live-read-latency |  | accepted |
| e-dec-specduration-blockperiod | decomposes | node:task-live-spec-duration | node:task-test-chain-block-period |  | accepted |
| e-lnk-receiptpoll-testbalances | links | node:task-gateway-receipt-poll | node:task-live-test-balances |  | accepted |
| e-mrk-twowayimadr-twowayim | marks | waypoint:wp-adr-two-way-im | node:task-two-way-initial-margin |  | accepted |
| e-drv-callstate-twowayimadr | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-two-way-im |  | accepted |
| e-drv-finality-twowayimadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-two-way-im |  | accepted |
| e-dec-cdmdev-smetwowayim | decomposes | node:goal-cdm-development | node:task-sme-two-way-im-rules |  | accepted |
| e-lnk-twowayim-smetwowayim | links | node:task-two-way-initial-margin | node:task-sme-two-way-im-rules |  | accepted |
| e-dec-konspektadopt-checkpoint | decomposes | node:goal-test-konspekt-adoption | node:task-konspekt-checkpoint-adoption |  | accepted |
| e-mrk-repogmrascope-repogmra | marks | waypoint:wp-adr-repo-gmra-scope | node:task-repo-gmra-workflows |  | accepted |
| e-drv-cdmdata-repogmrascope | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-gmra-scope |  | accepted |
| e-drv-finality-repogmrascope | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-gmra-scope |  | accepted |
| e-dec-repogmra-gmraterms | decomposes | node:task-repo-gmra-workflows | node:task-repo-gmra-terms |  | accepted |
| e-dec-repogmra-purchaserepurchase | decomposes | node:task-repo-gmra-workflows | node:task-repo-purchase-repurchase |  | accepted |
| e-dec-repogmra-marginmaintenance | decomposes | node:task-repo-gmra-workflows | node:task-repo-margin-maintenance |  | accepted |
| e-dec-repogmra-reprice | decomposes | node:task-repo-gmra-workflows | node:task-repo-reprice |  | accepted |
| e-dec-repogmra-adjustment | decomposes | node:task-repo-gmra-workflows | node:task-repo-adjustment |  | accepted |
| e-dec-repogmra-substitution | decomposes | node:task-repo-gmra-workflows | node:task-repo-substitution |  | accepted |
| e-dec-repogmra-income | decomposes | node:task-repo-gmra-workflows | node:task-repo-income |  | accepted |
| e-dec-repogmra-roll | decomposes | node:task-repo-gmra-workflows | node:task-repo-roll |  | accepted |
| e-dec-repogmra-pairoff | decomposes | node:task-repo-gmra-workflows | node:task-repo-pair-off |  | accepted |
| e-dec-repogmra-buysellback | decomposes | node:task-repo-gmra-workflows | node:task-repo-buy-sell-back |  | accepted |
| e-dec-repogmra-defaultcloseout | decomposes | node:task-repo-gmra-workflows | node:task-repo-default-close-out |  | accepted |
| e-mrk-gmratermsadr-gmraterms | marks | waypoint:wp-adr-repo-gmra-terms | node:task-repo-gmra-terms |  | accepted |
| e-drv-cdmdata-gmratermsadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-gmra-terms |  | accepted |
| e-drv-finality-gmratermsadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-gmra-terms |  | accepted |
| e-mrk-repopradr-purchaserepurchase | marks | waypoint:wp-adr-repo-purchase-repurchase | node:task-repo-purchase-repurchase |  | accepted |
| e-drv-cdmdata-repopradr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-purchase-repurchase |  | accepted |
| e-drv-finality-repopradr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-purchase-repurchase |  | accepted |
| e-mrk-repomarginadr-marginmaint | marks | waypoint:wp-adr-repo-margin-maintenance | node:task-repo-margin-maintenance |  | accepted |
| e-drv-cdmdata-repomarginadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-margin-maintenance |  | accepted |
| e-drv-finality-repomarginadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-margin-maintenance |  | accepted |
| e-drv-callstate-repomarginadr | drives | concept:concept-asr-onchain-call-state | waypoint:wp-adr-repo-margin-maintenance |  | accepted |
| e-dec-cdmdev-smerepomargin | decomposes | node:goal-cdm-development | node:task-sme-repo-margin-exposure |  | accepted |
| e-lnk-repomargin-smerepomargin | links | node:task-repo-margin-maintenance | node:task-sme-repo-margin-exposure |  | accepted |
| e-dec-cdmdev-smerepolivespec | decomposes | node:goal-cdm-development | node:task-sme-repo-live-spec-returns |  | accepted |
| e-lnk-repopr-smerepolivespec | links | node:task-repo-purchase-repurchase | node:task-sme-repo-live-spec-returns |  | accepted |
| e-mrk-repricadr-reprice | marks | waypoint:wp-adr-repo-reprice | node:task-repo-reprice |  | accepted |
| e-drv-cdmdata-repricadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-reprice |  | accepted |
| e-drv-finality-repricadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-reprice |  | accepted |
| e-dec-cdmdev-smereprice | decomposes | node:goal-cdm-development | node:task-sme-repo-reprice-rules |  | accepted |
| e-lnk-reprice-smereprice | links | node:task-repo-reprice | node:task-sme-repo-reprice-rules |  | accepted |
| e-mrk-adjadr-adjustment | marks | waypoint:wp-adr-repo-adjustment | node:task-repo-adjustment |  | accepted |
| e-drv-cdmdata-adjadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-adjustment |  | accepted |
| e-drv-finality-adjadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-adjustment |  | accepted |
| e-dec-cdmdev-smeadjust | decomposes | node:goal-cdm-development | node:task-sme-repo-adjustment-rules |  | accepted |
| e-lnk-adjust-smeadjust | links | node:task-repo-adjustment | node:task-sme-repo-adjustment-rules |  | accepted |
| e-mrk-subadr-substitution | marks | waypoint:wp-adr-repo-substitution | node:task-repo-substitution |  | accepted |
| e-drv-cdmdata-subadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-substitution |  | accepted |
| e-drv-finality-subadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-substitution |  | accepted |
| e-dec-cdmdev-smesubst | decomposes | node:goal-cdm-development | node:task-sme-repo-substitution-rules |  | accepted |
| e-lnk-subst-smesubst | links | node:task-repo-substitution | node:task-sme-repo-substitution-rules |  | accepted |
| e-mrk-incadr-income | marks | waypoint:wp-adr-repo-income | node:task-repo-income |  | accepted |
| e-drv-cdmdata-incadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-income |  | accepted |
| e-drv-finality-incadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-income |  | accepted |
| e-dec-cdmdev-smeincome | decomposes | node:goal-cdm-development | node:task-sme-repo-income-rules |  | accepted |
| e-lnk-income-smeincome | links | node:task-repo-income | node:task-sme-repo-income-rules |  | accepted |
| e-dec-cdmdev-gatewaytypecheck | decomposes | node:goal-cdm-development | node:task-gateway-type-check |  | accepted |
| e-mrk-roladr-roll | marks | waypoint:wp-adr-repo-roll | node:task-repo-roll |  | accepted |
| e-drv-cdmdata-roladr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-roll |  | accepted |
| e-drv-finality-roladr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-roll |  | accepted |
| e-dec-cdmdev-smeroll | decomposes | node:goal-cdm-development | node:task-sme-repo-roll-rules |  | accepted |
| e-lnk-roll-smeroll | links | node:task-repo-roll | node:task-sme-repo-roll-rules |  | accepted |
| e-dec-e2eflow-livespecweb | decomposes | node:goal-end-to-end-flow | node:investigation-live-spec-in-claude-web |  | proposed |
| e-dec-adoption-presentation | decomposes | node:goal-adoption | node:task-presentation |  | proposed |
| e-note-workflowtaskmap-defermapping | notes | node:investigation-cdm-workflow-task-map | noteworthy:nw-defer-message-standard-mapping |  | accepted |
| e-note-businesscase-defermapping | notes | node:goal-business-case | noteworthy:nw-defer-message-standard-mapping |  | accepted |
| e-mrk-pofadr-pairoff | marks | waypoint:wp-adr-repo-pair-off | node:task-repo-pair-off |  | accepted |
| e-drv-cdmdata-pofadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-pair-off |  | accepted |
| e-drv-finality-pofadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-pair-off |  | accepted |
| e-dec-cdmdev-smepairoff | decomposes | node:goal-cdm-development | node:task-sme-repo-pair-off-rules |  | accepted |
| e-lnk-pairoff-smepairoff | links | node:task-repo-pair-off | node:task-sme-repo-pair-off-rules |  | accepted |
| e-mrk-bsbadr-buysellback | marks | waypoint:wp-adr-repo-buy-sell-back | node:task-repo-buy-sell-back |  | accepted |
| e-drv-cdmdata-bsbadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-buy-sell-back |  | accepted |
| e-drv-finality-bsbadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-buy-sell-back |  | accepted |
| e-dec-cdmdev-smebsb | decomposes | node:goal-cdm-development | node:task-sme-repo-buy-sell-back-rules |  | accepted |
| e-lnk-bsb-smebsb | links | node:task-repo-buy-sell-back | node:task-sme-repo-buy-sell-back-rules |  | accepted |
| e-mrk-dcoadr-defaultcloseout | marks | waypoint:wp-adr-repo-default-close-out | node:task-repo-default-close-out |  | accepted |
| e-drv-cdmdata-dcoadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-repo-default-close-out |  | accepted |
| e-drv-finality-dcoadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-repo-default-close-out |  | accepted |
| e-dec-cdmdev-smedco | decomposes | node:goal-cdm-development | node:task-sme-repo-default-close-out-rules |  | accepted |
| e-lnk-dco-smedco | links | node:task-repo-default-close-out | node:task-sme-repo-default-close-out-rules |  | accepted |
| e-mrk-slscope-slgmsla | marks | waypoint:wp-adr-securities-lending-gmsla-scope | node:task-securities-lending-gmsla-workflows |  | accepted |
| e-drv-cdmdata-slscope | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-securities-lending-gmsla-scope |  | accepted |
| e-drv-finality-slscope | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-securities-lending-gmsla-scope |  | accepted |
| e-dec-slgmsla-terms | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-terms |  | accepted |
| e-dec-slgmsla-loandeliveryreturn | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-loan-delivery-return |  | accepted |
| e-dec-slgmsla-marking | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-marking |  | accepted |
| e-dec-slgmsla-recall | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-recall |  | accepted |
| e-dec-slgmsla-substitution | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-substitution |  | accepted |
| e-dec-slgmsla-rebate | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-rebate |  | accepted |
| e-dec-slgmsla-lendingfee | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-lending-fee |  | accepted |
| e-dec-slgmsla-defaultcloseout | decomposes | node:task-securities-lending-gmsla-workflows | node:task-gmsla-default-close-out |  | accepted |
| e-mrk-gmslatermsadr-gmslaterms | marks | waypoint:wp-adr-gmsla-terms | node:task-gmsla-terms |  | accepted |
| e-drv-cdmdata-gmslatermsadr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-gmsla-terms |  | accepted |
| e-drv-finality-gmslatermsadr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-gmsla-terms |  | accepted |
| e-dec-cdmdev-smegmslaterms | decomposes | node:goal-cdm-development | node:task-sme-gmsla-terms-baseline |  | accepted |
| e-lnk-gmslaterms-smegmslaterms | links | node:task-gmsla-terms | node:task-sme-gmsla-terms-baseline |  | accepted |
| e-mrk-ldradr-gmslaldr | marks | waypoint:wp-adr-gmsla-loan-delivery-return | node:task-gmsla-loan-delivery-return |  | proposed |
| e-drv-cdmdata-ldradr | drives | concept:concept-asr-cdm-data-layer | waypoint:wp-adr-gmsla-loan-delivery-return |  | proposed |
| e-drv-finality-ldradr | drives | concept:concept-asr-settlement-finality | waypoint:wp-adr-gmsla-loan-delivery-return |  | proposed |
| e-dec-cdmdev-smeldr | decomposes | node:goal-cdm-development | node:task-sme-gmsla-loan-delivery-return-rules |  | proposed |
| e-lnk-gmslaldr-smeldr | links | node:task-gmsla-loan-delivery-return | node:task-sme-gmsla-loan-delivery-return-rules |  | proposed |
