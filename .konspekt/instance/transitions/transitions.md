# Transitions

Append-only log of every `review` and `status` assignment in this instance, for
entities and edges, one row per assignment in the order written
(`spec/architecture/SERIALIZATION.md` § Transitions). `ref` is `type:id` or
`edge:<id>`. An empty `from` marks a birth row. `source`, when present, is the
`sources/` excerpt holding the human acceptance or authority verb. `by`, when
present, is the principal that wrote the value; it is required on a row that
writes `accepted` once the instance declares principals
(`spec/architecture/AUTHORITY.md`).

A new instance starts with no rows: it has no atoms yet, so the first write of
each atom appends that atom's birth row. The file's presence opts the instance
into state history — an instance without it is v1-conformant and records none.

| ref | field | from | to | timestamp | source | by |
|-----|-------|------|----|-----------|--------|----|
| node:node-app-setup | review |  | accepted | 2026-10-15T00:18:11Z | df5298515334f4f37dc86dfd54b8e0805558203b | denisurusov |
| node:node-app-setup | status |  | active | 2026-10-15T00:18:11Z |  |  |
| node:goal-test-konspekt-adoption | review |  | accepted | 2026-10-15T02:15:25Z | b625196f2f2fd6cf48bdbf8771dabda407a20f1e | denisurusov |
| node:goal-test-konspekt-adoption | status |  | active | 2026-10-15T02:15:25Z | b625196f2f2fd6cf48bdbf8771dabda407a20f1e | denisurusov |
| node:task-repo-setup-iteration | review |  | accepted | 2026-10-15T02:15:25Z | b625196f2f2fd6cf48bdbf8771dabda407a20f1e | denisurusov |
| node:task-repo-setup-iteration | status |  | active | 2026-10-15T02:15:25Z | b625196f2f2fd6cf48bdbf8771dabda407a20f1e | denisurusov |
| edge:e-dec-adoption-setupiter | review |  | accepted | 2026-10-15T02:15:25Z | b625196f2f2fd6cf48bdbf8771dabda407a20f1e | denisurusov |
| node:goal-architecture-design | review |  | accepted | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-architecture-design | status |  | open | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-business-case | review |  | accepted | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-business-case | status |  | open | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-end-to-end-flow | review |  | accepted | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-end-to-end-flow | status |  | open | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-data-cdm-taxonomies-specs | review |  | accepted | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:goal-data-cdm-taxonomies-specs | status |  | open | 2026-10-15T02:46:38Z | 82d9f5b6f0f462ef766727975fd6e34ca1b8359d | denisurusov |
| node:task-cdm-current-state-analysis | review |  | accepted | 2026-10-15T12:24:36Z | c06f71f1e33136d841554b3edcac893f013a932a | denisurusov |
| node:task-cdm-current-state-analysis | status |  | open | 2026-10-15T12:24:36Z | c06f71f1e33136d841554b3edcac893f013a932a | denisurusov |
| edge:e-dec-cdmdata-cdmanalysis | review |  | accepted | 2026-10-15T12:24:36Z | c06f71f1e33136d841554b3edcac893f013a932a | denisurusov |
| node:task-cdm-collateral-other-agreements | review |  | accepted | 2026-10-15T12:32:58Z | e4b447e13cef62282de0670bc02b310467ef5d04 | denisurusov |
| node:task-cdm-collateral-other-agreements | status |  | open | 2026-10-15T12:32:58Z | e4b447e13cef62282de0670bc02b310467ef5d04 | denisurusov |
| edge:e-dec-cdmdata-otheragreements | review |  | accepted | 2026-10-15T12:32:58Z | e4b447e13cef62282de0670bc02b310467ef5d04 | denisurusov |
| artifact:artifact-cdm-csa-coverage-matrix | review |  | proposed | 2026-10-15T12:32:58Z |  |  |
| edge:e-prod-cdmanalysis-csamatrix | review |  | proposed | 2026-10-15T12:32:58Z |  |  |
| artifact:artifact-cdm-csa-coverage-matrix | review | proposed | accepted | 2026-10-15T22:33:21Z | d0ddd12ef8783447c7d207f5e33017925a95e138 | denisurusov |
| edge:e-prod-cdmanalysis-csamatrix | review | proposed | accepted | 2026-10-15T22:33:21Z | d0ddd12ef8783447c7d207f5e33017925a95e138 | denisurusov |
| artifact:artifact-collateral-conceptual-model | review |  | proposed | 2026-10-15T22:52:16Z |  |  |
| edge:e-prod-cdmanalysis-conceptmodel | review |  | proposed | 2026-10-15T22:52:16Z |  |  |
| artifact:artifact-collateral-conceptual-model | review | proposed | accepted | 2026-10-15T22:55:58Z | 94293e8ad90754de7d8477febce19fe2f106917c | denisurusov |
| edge:e-prod-cdmanalysis-conceptmodel | review | proposed | accepted | 2026-10-15T22:55:58Z | 94293e8ad90754de7d8477febce19fe2f106917c | denisurusov |
| node:task-cdm-current-state-analysis | status | open | resolved | 2026-10-15T22:55:58Z | 94293e8ad90754de7d8477febce19fe2f106917c | denisurusov |
| node:task-cdm-collateral-other-agreements | status | open | active | 2026-10-15T22:58:45Z | 0b576199aa677a19c4afe85ad893f9bdd3466fb1 | denisurusov |
| node:task-collateral-standards-inventory | review |  | accepted | 2026-10-15T22:58:45Z | 0b576199aa677a19c4afe85ad893f9bdd3466fb1 | denisurusov |
| node:task-collateral-standards-inventory | status |  | active | 2026-10-15T22:58:45Z | 0b576199aa677a19c4afe85ad893f9bdd3466fb1 | denisurusov |
| edge:e-dec-cdmdata-standards | review |  | accepted | 2026-10-15T22:58:45Z | 0b576199aa677a19c4afe85ad893f9bdd3466fb1 | denisurusov |
| artifact:artifact-collateral-standards-inventory | review |  | proposed | 2026-10-15T23:01:30Z |  |  |
| edge:e-prod-standards-inventory | review |  | proposed | 2026-10-15T23:01:30Z |  |  |
| artifact:artifact-collateral-standards-inventory | review | proposed | accepted | 2026-10-15T23:04:45Z | 0b9a35394e1743e57cf2f659f3cf28d82b5d7a6d | denisurusov |
| edge:e-prod-standards-inventory | review | proposed | accepted | 2026-10-15T23:04:45Z | 0b9a35394e1743e57cf2f659f3cf28d82b5d7a6d | denisurusov |
| artifact:artifact-collateral-findings | review |  | proposed | 2026-10-15T23:04:45Z |  |  |
| edge:e-prod-cdmanalysis-findings | review |  | proposed | 2026-10-15T23:04:45Z |  |  |
| edge:e-prod-standards-findings | review |  | proposed | 2026-10-15T23:04:45Z |  |  |
| artifact:artifact-collateral-findings | review | proposed | accepted | 2026-10-15T23:07:41Z | c029f9e7a3a26d6fcce64f03b1372c3960ab6691 | denisurusov |
| edge:e-prod-cdmanalysis-findings | review | proposed | accepted | 2026-10-15T23:07:41Z | c029f9e7a3a26d6fcce64f03b1372c3960ab6691 | denisurusov |
| edge:e-prod-standards-findings | review | proposed | accepted | 2026-10-15T23:07:41Z | c029f9e7a3a26d6fcce64f03b1372c3960ab6691 | denisurusov |
| artifact:artifact-cdm-other-agreements-matrix | review |  | proposed | 2026-10-15T23:10:47Z |  |  |
| edge:e-prod-otheragreements-matrix | review |  | proposed | 2026-10-15T23:10:47Z |  |  |
| artifact:artifact-cdm-other-agreements-matrix | review | proposed | accepted | 2026-10-15T23:25:52Z | d34896439c2f6fe7c2d7428990964e715e081ddc | denisurusov |
| edge:e-prod-otheragreements-matrix | review | proposed | accepted | 2026-10-15T23:25:52Z | d34896439c2f6fe7c2d7428990964e715e081ddc | denisurusov |
| artifact:artifact-collateral-flow-diagrams | review |  | proposed | 2026-10-15T23:35:01Z |  |  |
| edge:e-prod-otheragreements-flows | review |  | proposed | 2026-10-15T23:35:01Z |  |  |
| artifact:artifact-collateral-flow-diagrams | review | proposed | accepted | 2026-10-15T23:38:18Z | 452754ac69e311254b84437f01745b7ca9b4e0da | denisurusov |
| edge:e-prod-otheragreements-flows | review | proposed | accepted | 2026-10-15T23:38:18Z | 452754ac69e311254b84437f01745b7ca9b4e0da | denisurusov |
| node:task-cdm-collateral-other-agreements | status | active | resolved | 2026-10-15T23:43:16Z | 49ae9555adc7a648e1096930260e3933c2ea902a | denisurusov |
| node:task-collateral-standards-inventory | status | active | resolved | 2026-10-15T23:43:16Z | 49ae9555adc7a648e1096930260e3933c2ea902a | denisurusov |
| node:task-collateral-taxonomy-inventory | review |  | accepted | 2026-10-15T23:45:47Z | 342fbd7743d6ba622c0f9c0adac070fd2d538d07 | denisurusov |
| node:task-collateral-taxonomy-inventory | status |  | active | 2026-10-15T23:45:47Z | 342fbd7743d6ba622c0f9c0adac070fd2d538d07 | denisurusov |
| edge:e-dec-cdmdata-taxonomy | review |  | accepted | 2026-10-15T23:45:47Z | 342fbd7743d6ba622c0f9c0adac070fd2d538d07 | denisurusov |
| artifact:artifact-collateral-taxonomy-inventory | review |  | proposed | 2026-10-15T23:48:20Z |  |  |
| edge:e-prod-taxonomy-inventory | review |  | proposed | 2026-10-15T23:48:20Z |  |  |
| edge:e-prod-taxonomy-findings | review |  | proposed | 2026-10-15T23:48:20Z |  |  |
| artifact:artifact-collateral-taxonomy-inventory | review | proposed | accepted | 2026-10-15T23:55:50Z | 2e9d537257293259626a3455694bb5c35146e859 | denisurusov |
| edge:e-prod-taxonomy-inventory | review | proposed | accepted | 2026-10-15T23:55:50Z | 2e9d537257293259626a3455694bb5c35146e859 | denisurusov |
| edge:e-prod-taxonomy-findings | review | proposed | accepted | 2026-10-15T23:55:50Z | 2e9d537257293259626a3455694bb5c35146e859 | denisurusov |
| artifact:artifact-cdm-defects | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| edge:e-prod-taxonomy-defects | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| artifact:artifact-collateral-asset-taxonomy-mapping | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| edge:e-prod-taxonomy-mapping | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| artifact:artifact-cdm-defects | review | proposed | accepted | 2026-10-16T00:27:52Z | 6fff603871a6ddaed03a46fae36b80003b74f7c1 | denisurusov |
| edge:e-prod-taxonomy-defects | review | proposed | accepted | 2026-10-16T00:27:52Z | 6fff603871a6ddaed03a46fae36b80003b74f7c1 | denisurusov |
| artifact:artifact-collateral-asset-taxonomy-mapping | review | proposed | accepted | 2026-10-16T00:27:52Z | 6fff603871a6ddaed03a46fae36b80003b74f7c1 | denisurusov |
| edge:e-prod-taxonomy-mapping | review | proposed | accepted | 2026-10-16T00:27:52Z | 6fff603871a6ddaed03a46fae36b80003b74f7c1 | denisurusov |
| node:task-collateral-taxonomy-inventory | status | active | resolved | 2026-10-16T00:27:52Z | 6fff603871a6ddaed03a46fae36b80003b74f7c1 | denisurusov |
| node:goal-data-cdm-taxonomies-specs | status | open | resolved | 2026-10-16T00:35:35Z | 10e7bafcf7a5969d99e8534b8228ff0a69a8d8bf | denisurusov |
| node:task-blockchain-smart-contracts-applicability | review |  | accepted | 2026-10-16T00:38:00Z | fe2705558d2755b85248ab33c41cae227a827998 | denisurusov |
| node:task-blockchain-smart-contracts-applicability | status |  | open | 2026-10-16T00:38:00Z | fe2705558d2755b85248ab33c41cae227a827998 | denisurusov |
| edge:e-dec-arch-blockchain | review |  | accepted | 2026-10-16T00:38:00Z | fe2705558d2755b85248ab33c41cae227a827998 | denisurusov |
| node:task-local-environment-setup | review |  | accepted | 2026-10-16T00:38:00Z | fe2705558d2755b85248ab33c41cae227a827998 | denisurusov |
| node:task-local-environment-setup | status |  | open | 2026-10-16T00:38:00Z | fe2705558d2755b85248ab33c41cae227a827998 | denisurusov |
| edge:e-dec-arch-localenv | review |  | accepted | 2026-10-16T00:38:00Z | fe2705558d2755b85248ab33c41cae227a827998 | denisurusov |
| node:task-blockchain-smart-contracts-applicability | status | open | active | 2026-10-16T02:47:21Z | ed7176232e1ff62642302f9432d3bb079d443e09 | denisurusov |
| concept:concept-asr-ledger-neutrality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-ledger-neutrality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-cdm-data-layer | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-cdm-data-layer | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-onchain-asset-identity | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-onchain-asset-identity | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-settlement-finality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-settlement-finality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-offchain-dispute | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-offchain-dispute | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| artifact:artifact-blockchain-applicability | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-prod-blockchain-applicability | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| waypoint:wp-adr-prototype-ledgers | review |  | accepted | 2026-10-16T19:30:54Z | 156003750853115a8c254d36bc96078d723bd6af | denisurusov |
| edge:e-drv-ledgerneutrality-ledgers | review |  | proposed | 2026-10-16T19:30:54Z |  |  |
| edge:e-drv-finality-ledgers | review |  | proposed | 2026-10-16T19:30:54Z |  |  |
| edge:e-mrk-ledgers-blockchain | review |  | accepted | 2026-10-16T19:30:54Z | 156003750853115a8c254d36bc96078d723bd6af | denisurusov |
| concept:concept-asr-ledger-neutrality | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| concept:concept-asr-offchain-dispute | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| concept:concept-asr-cdm-data-layer | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| concept:concept-asr-onchain-asset-identity | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| concept:concept-asr-settlement-finality | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-men-blockchain-ledger-neutrality | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-men-blockchain-cdm-data-layer | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-men-blockchain-onchain-asset-identity | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-men-blockchain-settlement-finality | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-men-blockchain-offchain-dispute | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-drv-ledgerneutrality-ledgers | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-drv-finality-ledgers | review | proposed | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| noteworthy:nw-prototype-scope | review |  | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| noteworthy:nw-prototype-scope | status |  | active | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| edge:e-note-arch-prototypescope | review |  | accepted | 2026-10-16T19:43:54Z | d11992be4fcac0fe33247f55804518d19a1121d3 | denisurusov |
| artifact:artifact-blockchain-applicability | review | proposed | accepted | 2026-10-16T19:47:11Z | cac26a66e1421d940c957c481268aa244388300e | denisurusov |
| edge:e-prod-blockchain-applicability | review | proposed | accepted | 2026-10-16T19:47:11Z | cac26a66e1421d940c957c481268aa244388300e | denisurusov |
| waypoint:wp-adr-im-segregation | review |  | accepted | 2026-10-16T19:49:05Z | 2fb4e26caea617c016a1f1089b037ff9c5b92cce | denisurusov |
| edge:e-mrk-imseg-blockchain | review |  | accepted | 2026-10-16T19:49:05Z | 2fb4e26caea617c016a1f1089b037ff9c5b92cce | denisurusov |
| noteworthy:nw-assumption-contract-control | review |  | accepted | 2026-10-16T19:49:05Z | 2fb4e26caea617c016a1f1089b037ff9c5b92cce | denisurusov |
| noteworthy:nw-assumption-contract-control | status |  | unvalidated | 2026-10-16T19:49:05Z | 2fb4e26caea617c016a1f1089b037ff9c5b92cce | denisurusov |
| edge:e-note-arch-contractcontrol | review |  | accepted | 2026-10-16T19:49:05Z | 2fb4e26caea617c016a1f1089b037ff9c5b92cce | denisurusov |
| node:task-blockchain-smart-contracts-applicability | status | active | resolved | 2026-10-16T19:49:05Z | 2fb4e26caea617c016a1f1089b037ff9c5b92cce | denisurusov |
| node:task-local-environment-setup | status | open | active | 2026-10-16T20:08:49Z | 4b19056d8c79b44d09a5d2b5798f74d5dd53fe62 | denisurusov |
| artifact:artifact-prototype-architecture | review |  | proposed | 2026-10-16T20:08:49Z |  |  |
| edge:e-prod-localenv-architecture | review |  | proposed | 2026-10-16T20:08:49Z |  |  |
| artifact:artifact-test-framework-plan | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| edge:e-prod-localenv-testplan | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| artifact:artifact-setup-windows | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| edge:e-prod-localenv-setup | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| artifact:artifact-prototype-architecture | review | proposed | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| edge:e-prod-localenv-architecture | review | proposed | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| artifact:artifact-test-framework-plan | review | proposed | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| edge:e-prod-localenv-testplan | review | proposed | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| artifact:artifact-setup-windows | review | proposed | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| edge:e-prod-localenv-setup | review | proposed | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| waypoint:wp-adr-per-participant-services | review |  | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| edge:e-mrk-perparticipant-localenv | review |  | accepted | 2026-10-16T20:43:52Z | 5cd34412708fc0ffdc4ac2252610f61d5d4fed0c | denisurusov |
| concept:concept-asr-onchain-call-state | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| waypoint:wp-adr-margin-call-state-onchain | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| noteworthy:nw-assumption-besu-visibility | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| node:task-onchain-privacy | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| edge:e-sup-callstate-offchaindispute | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| edge:e-drv-callstate-callcontract | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| edge:e-mrk-callcontract-localenv | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| edge:e-note-arch-besuvisibility | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| edge:e-dec-arch-privacy | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| edge:e-note-privacy-besuvisibility | review |  | accepted | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| noteworthy:nw-assumption-besu-visibility | status |  | unvalidated | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| node:task-onchain-privacy | status |  | open | 2026-10-16T21:34:51Z | 70532bbf71d41c99c9efad27c0e9ed009891292a | denisurusov |
| noteworthy:nw-mimic-real-flows | review |  | accepted | 2026-10-16T22:15:03Z | 030d173b1a7f835b860f9cca1cb4d482d59f360d | denisurusov |
| node:task-two-way-initial-margin | review |  | accepted | 2026-10-16T22:15:03Z | 030d173b1a7f835b860f9cca1cb4d482d59f360d | denisurusov |
| edge:e-note-arch-mimicrealflows | review |  | accepted | 2026-10-16T22:15:03Z | 030d173b1a7f835b860f9cca1cb4d482d59f360d | denisurusov |
| edge:e-dec-arch-twowayim | review |  | accepted | 2026-10-16T22:15:03Z | 030d173b1a7f835b860f9cca1cb4d482d59f360d | denisurusov |
| noteworthy:nw-mimic-real-flows | status |  | active | 2026-10-16T22:15:03Z | 030d173b1a7f835b860f9cca1cb4d482d59f360d | denisurusov |
| node:task-two-way-initial-margin | status |  | open | 2026-10-16T22:15:03Z | 030d173b1a7f835b860f9cca1cb4d482d59f360d | denisurusov |
| waypoint:wp-adr-cloud-dev-environment | review |  | accepted | 2026-10-16T22:20:33Z | 41af88afd7f6994b53858c3b109793a399df3d06 | denisurusov |
| node:task-windows-install | review |  | accepted | 2026-10-16T22:20:33Z | 41af88afd7f6994b53858c3b109793a399df3d06 | denisurusov |
| edge:e-mrk-cloudenv-localenv | review |  | accepted | 2026-10-16T22:20:33Z | 41af88afd7f6994b53858c3b109793a399df3d06 | denisurusov |
| edge:e-dec-localenv-windows | review |  | accepted | 2026-10-16T22:20:33Z | 41af88afd7f6994b53858c3b109793a399df3d06 | denisurusov |
| node:task-windows-install | status |  | open | 2026-10-16T22:20:33Z | 41af88afd7f6994b53858c3b109793a399df3d06 | denisurusov |
| artifact:artifact-setup-codespaces | review |  | proposed | 2026-10-16T22:20:33Z |  |  |
| edge:e-prod-localenv-codespaces | review |  | proposed | 2026-10-16T22:20:33Z |  |  |
| artifact:artifact-setup-codespaces | review | proposed | accepted | 2026-10-16T22:43:35Z | 48da8f8dca28f7daae9b60536dd9576532c351cd | denisurusov |
| edge:e-prod-localenv-codespaces | review | proposed | accepted | 2026-10-16T22:43:35Z | 48da8f8dca28f7daae9b60536dd9576532c351cd | denisurusov |
| node:task-local-environment-setup | status | active | resolved | 2026-10-16T22:43:35Z | 48da8f8dca28f7daae9b60536dd9576532c351cd | denisurusov |
| node:task-clickable-ui | review |  | accepted | 2026-10-16T22:43:35Z | 48da8f8dca28f7daae9b60536dd9576532c351cd | denisurusov |
| node:task-clickable-ui | status |  | open | 2026-10-16T22:43:35Z | 48da8f8dca28f7daae9b60536dd9576532c351cd | denisurusov |
| edge:e-dec-e2e-clickableui | review |  | accepted | 2026-10-16T22:43:35Z | 48da8f8dca28f7daae9b60536dd9576532c351cd | denisurusov |
| waypoint:wp-adr-ux-scenario-grid | review |  | accepted | 2026-10-16T22:48:10Z | 71b1348bad1addc3f8adaa253f5a147a502cb15d | denisurusov |
| edge:e-mrk-uxgrid-clickableui | review |  | accepted | 2026-10-16T22:48:10Z | 71b1348bad1addc3f8adaa253f5a147a502cb15d | denisurusov |
| node:task-clickable-ui | status | open | active | 2026-10-16T22:48:10Z | 71b1348bad1addc3f8adaa253f5a147a502cb15d | denisurusov |
| artifact:artifact-clickable-ui-html | review |  | proposed | 2026-10-16T22:52:27Z |  |  |
| edge:e-prod-clickableui-html | review |  | proposed | 2026-10-16T22:52:27Z |  |  |
| artifact:artifact-clickable-ui-html | review | proposed | accepted | 2026-10-16T23:07:09Z | 91117ab560e058b945bc3eb3e35fa977f99a88b3 | denisurusov |
| edge:e-prod-clickableui-html | review | proposed | accepted | 2026-10-16T23:07:09Z | 91117ab560e058b945bc3eb3e35fa977f99a88b3 | denisurusov |
| node:task-clickable-ui | status | active | resolved | 2026-10-16T23:07:09Z | 91117ab560e058b945bc3eb3e35fa977f99a88b3 | denisurusov |
| node:task-react-console | review |  | accepted | 2026-10-16T23:07:09Z | 91117ab560e058b945bc3eb3e35fa977f99a88b3 | denisurusov |
| node:task-react-console | status |  | active | 2026-10-16T23:07:09Z | 91117ab560e058b945bc3eb3e35fa977f99a88b3 | denisurusov |
| edge:e-dec-e2e-reactconsole | review |  | accepted | 2026-10-16T23:07:09Z | 91117ab560e058b945bc3eb3e35fa977f99a88b3 | denisurusov |
| artifact:artifact-react-console | review |  | proposed | 2026-10-16T23:17:11Z |  |  |
| edge:e-prod-reactconsole-app | review |  | proposed | 2026-10-16T23:17:11Z |  |  |
| node:task-react-console | status | active | open | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| node:goal-cdm-development | review |  | accepted | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| node:goal-cdm-development | status |  | active | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| node:task-cdm-gap-analysis | review |  | accepted | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| node:task-cdm-gap-analysis | status |  | open | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| node:task-cdm-gap-closure | review |  | accepted | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| node:task-cdm-gap-closure | status |  | open | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| edge:e-dec-cdmdev-gapanalysis | review |  | accepted | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| edge:e-dec-cdmdev-gapclosure | review |  | accepted | 2026-10-17T00:22:35Z | c559e965491f960d039091cb857d61d9cb85ac25 | denisurusov |
| waypoint:wp-adr-cdm-local-extensions | review |  | accepted | 2026-10-17T00:25:47Z | 593386d553b3e9523c084f9ad874eb2a715f4235 | denisurusov |
| edge:e-mrk-localext-gapclosure | review |  | accepted | 2026-10-17T00:25:47Z | 593386d553b3e9523c084f9ad874eb2a715f4235 | denisurusov |
| node:task-cdm-gap-analysis | status | open | active | 2026-10-17T00:25:47Z | 593386d553b3e9523c084f9ad874eb2a715f4235 | denisurusov |
| artifact:artifact-cdm-gap-register | review |  | proposed | 2026-10-17T00:25:47Z |  |  |
| edge:e-prod-gapanalysis-register | review |  | proposed | 2026-10-17T00:25:47Z |  |  |
| artifact:artifact-cdm-gap-register | review | proposed | accepted | 2026-10-17T00:29:31Z | 7f37c371e3e7b4d9f046f372b322465e173c88b3 | denisurusov |
| edge:e-prod-gapanalysis-register | review | proposed | accepted | 2026-10-17T00:29:31Z | 7f37c371e3e7b4d9f046f372b322465e173c88b3 | denisurusov |
| node:task-cdm-gap-analysis | status | active | resolved | 2026-10-17T00:29:31Z | 7f37c371e3e7b4d9f046f372b322465e173c88b3 | denisurusov |
| waypoint:wp-adr-cdm-extension-rune | review |  | accepted | 2026-10-17T00:48:29Z | 718789ef3024496c06042f84fc8cf0129ecc58dc | denisurusov |
| waypoint:wp-adr-console-on-extension-rules | review |  | accepted | 2026-10-17T00:48:29Z | 718789ef3024496c06042f84fc8cf0129ecc58dc | denisurusov |
| edge:e-mrk-extrune-gapclosure | review |  | accepted | 2026-10-17T00:48:29Z | 718789ef3024496c06042f84fc8cf0129ecc58dc | denisurusov |
| edge:e-mrk-consolerules-gapclosure | review |  | accepted | 2026-10-17T00:48:29Z | 718789ef3024496c06042f84fc8cf0129ecc58dc | denisurusov |
| node:task-cdm-gap-closure | status | open | active | 2026-10-17T00:48:29Z | 718789ef3024496c06042f84fc8cf0129ecc58dc | denisurusov |
| noteworthy:nw-cdm-base-release-7-7-0 | review |  | accepted | 2026-10-17T01:16:19Z | 9ab0cbf86284cce4606e93eabb8507c9d009d7b7 | denisurusov |
| edge:e-note-cdmdev-baserelease | review |  | accepted | 2026-10-17T01:16:19Z | 9ab0cbf86284cce4606e93eabb8507c9d009d7b7 | denisurusov |
| artifact:artifact-cdm-ext | review |  | proposed | 2026-10-17T01:16:19Z |  |  |
| edge:e-prod-gapclosure-cdmext | review |  | proposed | 2026-10-17T01:16:19Z |  |  |
| artifact:artifact-cdm-ext | review | proposed | accepted | 2026-10-17T13:40:02Z | 0f2f88c5496b77b3cef85e94a5ec0236fa765099 | denisurusov |
| edge:e-prod-gapclosure-cdmext | review | proposed | accepted | 2026-10-17T13:40:02Z | 0f2f88c5496b77b3cef85e94a5ec0236fa765099 | denisurusov |
| noteworthy:nw-cdm-python-workarounds | review |  | accepted | 2026-10-17T13:40:02Z | 0f2f88c5496b77b3cef85e94a5ec0236fa765099 | denisurusov |
| edge:e-note-cdmdev-pythonworkarounds | review |  | accepted | 2026-10-17T13:40:02Z | 0f2f88c5496b77b3cef85e94a5ec0236fa765099 | denisurusov |
| waypoint:wp-adr-cdm-collateral-events | review |  | proposed | 2026-10-17T16:03:44Z |  |  |
| edge:e-mrk-collevents-gapclosure | review |  | proposed | 2026-10-17T16:03:44Z |  |  |
| noteworthy:nw-cdm-stay-on-python | review |  | accepted | 2026-10-17T16:59:27Z | 14f3682a9d131660ccfcbec45a3c662a9ed1f7e8 | denisurusov |
| edge:e-note-cdmdev-stayonpython | review |  | accepted | 2026-10-17T16:59:27Z | 14f3682a9d131660ccfcbec45a3c662a9ed1f7e8 | denisurusov |
| waypoint:wp-adr-cdm-collateral-events | review | proposed | accepted | 2026-10-17T17:00:55Z | e61393e8f33765faa3913c1c4270ef0919a1a43a | denisurusov |
| edge:e-mrk-collevents-gapclosure | review | proposed | accepted | 2026-10-17T17:00:55Z | e61393e8f33765faa3913c1c4270ef0919a1a43a | denisurusov |
| noteworthy:nw-repo-shared-with-cdm-maintainers | review |  | accepted | 2026-10-17T17:07:57Z | 303fc10a2ccd0ad628d55390871ed811a9c34a5c | denisurusov |
| edge:e-note-cdmdev-sharedmaintainers | review |  | accepted | 2026-10-17T17:07:57Z | 303fc10a2ccd0ad628d55390871ed811a9c34a5c | denisurusov |
| node:task-windows-install | status | open | resolved | 2026-10-17T18:32:09Z | f653908353dce5cf20875fa230afab001c9f8ea1 | denisurusov |
| node:task-e2e-wiring | review |  | proposed | 2026-10-17T20:56:54Z |  |  |
| node:task-e2e-wiring | status |  | open | 2026-10-17T20:56:54Z |  |  |
| edge:e-dec-e2e-wiring | review |  | proposed | 2026-10-17T20:56:54Z |  |  |
| waypoint:wp-adr-java-cdm-stack | review |  | accepted | 2026-10-18T01:27:28Z | 6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630 | denisurusov |
| edge:e-sup-javastack-stayonpython | review |  | accepted | 2026-10-18T01:27:28Z | 6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630 | denisurusov |
| edge:e-sup-javastack-pythonworkarounds | review |  | accepted | 2026-10-18T01:27:28Z | 6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630 | denisurusov |
| edge:e-mrk-javastack-gapclosure | review |  | accepted | 2026-10-18T01:27:28Z | 6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630 | denisurusov |
| edge:e-mrk-javastack-e2ewiring | review |  | proposed | 2026-10-18T15:05:37Z |  |  |
| node:task-repo-setup-iteration | status | active | resolved | 2026-10-19T03:55:28Z |  |
| node:task-e2e-wiring | review | proposed | accepted | 2026-10-19T03:55:54Z |  | denisurusov |
| edge:e-dec-e2e-wiring | review | proposed | accepted | 2026-10-19T03:55:54Z |  | denisurusov |
| edge:e-mrk-javastack-e2ewiring | review | proposed | accepted | 2026-10-19T03:55:54Z |  | denisurusov |
| node:task-adopt-agent-fleet | review |  | accepted | 2026-10-22T23:29:00Z | 98439d29e3489c9547264c7d125ced58ceaf03b5 | denisurusov |
| node:task-adopt-agent-fleet | status |  | open | 2026-10-22T23:29:00Z | 98439d29e3489c9547264c7d125ced58ceaf03b5 | denisurusov |
| edge:e-dec-adoption-fleet | review |  | accepted | 2026-10-22T23:29:00Z | 98439d29e3489c9547264c7d125ced58ceaf03b5 | denisurusov |
| artifact:artifact-two-way-im-design | review |  | proposed | 2026-10-23T15:39:17.930Z |  | spec-writer |
| edge:e-prod-twowayim-design | review |  | proposed | 2026-10-23T15:39:17.930Z |  | spec-writer |
| artifact:artifact-two-way-im-design | review | proposed | accepted | 2026-10-23T15:52:41Z |  | denisurusov |
| edge:e-prod-twowayim-design | review | proposed | accepted | 2026-10-23T15:52:41Z |  | denisurusov |
| node:task-adopt-agent-fleet | status | open | resolved | 2026-10-23T16:11:35Z |  | denisurusov |
| artifact:artifact-onchain-privacy-design | review |  | proposed | 2026-10-23T16:22:32.687Z |  | spec-writer |
| edge:e-onchain-privacy-produces-design | review |  | proposed | 2026-10-23T16:22:32.687Z |  | spec-writer |
| artifact:artifact-onchain-privacy-design | review | proposed | accepted | 2026-10-23T16:25:21Z |  | denisurusov |
| edge:e-onchain-privacy-produces-design | review | proposed | accepted | 2026-10-23T16:25:21Z |  | denisurusov |
| node:task-e2e-wiring | status | open | active | 2026-10-23T21:54:35Z | adc651e4f21db3c07ae7d96294f91d86737b76f1 | denisurusov |
| artifact:artifact-business-case | review |  | proposed | 2026-10-24T13:56:51.384Z |  | spec-writer |
| edge:e-business-case-produces-doc | review |  | proposed | 2026-10-24T13:56:51.384Z |  | spec-writer |
| artifact:artifact-business-case | review | proposed | accepted | 2026-10-24T14:11:28.731Z |  | denisurusov |
| edge:e-business-case-produces-doc | review | proposed | accepted | 2026-10-24T14:11:28.731Z |  | denisurusov |
| noteworthy:nw-finos-collaboration | review |  | proposed | 2026-10-24T14:28:19.786Z |  | spec-writer |
| edge:e-note-bizcase-finoscollab | review |  | proposed | 2026-10-24T14:28:19.786Z |  | spec-writer |
| noteworthy:nw-finos-collaboration | review | proposed | accepted | 2026-10-24T14:49:40.776Z |  | denisurusov |
| edge:e-note-bizcase-finoscollab | review | proposed | accepted | 2026-10-24T14:49:40.776Z |  | denisurusov |
| artifact:artifact-ledger-gateway | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-collateral-service | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-live-console-wiring | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-e2e-live-harness | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| waypoint:wp-first-e2e-cycle | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-e2ewiring-gateway | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-e2ewiring-service | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-e2ewiring-harness | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-reactconsole-livewiring | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-mrk-firstcycle-e2ewiring | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-note-e2ewiring-scope | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-ledger-gateway | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| artifact:artifact-collateral-service | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| artifact:artifact-live-console-wiring | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| artifact:artifact-e2e-live-harness | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| waypoint:wp-first-e2e-cycle | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-e2ewiring-gateway | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-e2ewiring-service | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-e2ewiring-harness | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-reactconsole-livewiring | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-mrk-firstcycle-e2ewiring | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-note-e2ewiring-scope | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review | accepted | proposed | 2026-10-24T22:08:40Z |  | denisurusov |
| waypoint:wp-adr-cdm-payload-carrier | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| edge:e-drv-ledgerneutrality-carrier | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| edge:e-drv-cdmdatalayer-carrier | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| edge:e-mrk-carrier-e2ewiring | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| node:task-ci-live-e2e-stack | review |  | proposed | 2026-10-25T01:56:01Z |  | denisurusov |
| node:task-ci-live-e2e-stack | status |  | open | 2026-10-25T01:56:01Z |  |  |
| edge:e-dec-e2ewiring-cilivestack | review |  | proposed | 2026-10-25T01:56:01Z |  | denisurusov |
| node:task-ci-live-e2e-stack | review | proposed | accepted | 2026-10-25T13:05:29Z |  | denisurusov |
| edge:e-dec-e2ewiring-cilivestack | review | proposed | accepted | 2026-10-25T13:05:29Z |  | denisurusov |
| noteworthy:nw-ci-live-stack-steps | review |  | proposed | 2026-10-25T13:12:45Z |  | denisurusov |
| edge:e-note-cilivestack-steps | review |  | proposed | 2026-10-25T13:12:45Z |  | denisurusov |
| artifact:artifact-architecture-payload-carrier-revision | review |  | proposed | 2026-10-25T15:10:03.154Z |  | spec-writer |
| edge:e-architecture-payload-carrier-revision-produces | review |  | proposed | 2026-10-25T15:10:03.154Z |  | spec-writer |
| artifact:artifact-payload-carrier-component-docs | review |  | proposed | 2026-10-25T15:10:09.382Z |  | spec-writer |
| edge:e-payload-carrier-component-docs-produces | review |  | proposed | 2026-10-25T15:10:09.382Z |  | spec-writer |
| artifact:artifact-gap-register-g26-carrier | review |  | proposed | 2026-10-25T15:10:09.711Z |  | spec-writer |
| edge:e-gap-register-g26-carrier-produces | review |  | proposed | 2026-10-25T15:10:09.711Z |  | spec-writer |
| artifact:artifact-architecture-payload-carrier-revision | review | proposed | accepted | 2026-10-25T15:17:17.140Z |  | denisurusov |
| edge:e-architecture-payload-carrier-revision-produces | review | proposed | accepted | 2026-10-25T15:17:17.140Z |  | denisurusov |
| artifact:artifact-payload-carrier-component-docs | review | proposed | accepted | 2026-10-25T15:17:17.360Z |  | denisurusov |
| edge:e-payload-carrier-component-docs-produces | review | proposed | accepted | 2026-10-25T15:17:17.360Z |  | denisurusov |
| artifact:artifact-gap-register-g26-carrier | review | proposed | accepted | 2026-10-25T15:17:17.506Z |  | denisurusov |
| edge:e-gap-register-g26-carrier-produces | review | proposed | accepted | 2026-10-25T15:17:17.506Z |  | denisurusov |
| artifact:artifact-e2e-runbook | review |  | proposed | 2026-10-26T11:56:19Z |  | denisurusov |
| edge:e-prod-e2ewiring-runbook | review |  | proposed | 2026-10-26T11:56:19Z |  | denisurusov |
| node:task-devcontainer-live-stack | review |  | proposed | 2026-10-30T01:30:09Z |  |  |
| node:task-devcontainer-live-stack | status |  | open | 2026-10-30T01:30:09Z |  |  |
| edge:e-dec-e2ewiring-devcontainerstack | review |  | proposed | 2026-10-30T01:30:09Z |  |  |
| edge:e-lnk-cilivestack-devcontainerstack | review |  | proposed | 2026-10-30T01:30:09Z |  |  |
| waypoint:wp-adr-live-stack-local-ui-driven | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| edge:e-mrk-livestacklocal-cilivestack | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| edge:e-mrk-livestacklocal-devcontainerstack | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| noteworthy:nw-ci-live-e2e-stack-status | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| edge:e-note-cilivestack-status | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| waypoint:wp-adr-live-stack-local-ui-driven | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| node:task-devcontainer-live-stack | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| noteworthy:nw-ci-live-e2e-stack-status | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| edge:e-dec-e2ewiring-devcontainerstack | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| edge:e-lnk-cilivestack-devcontainerstack | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| edge:e-mrk-livestacklocal-cilivestack | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| edge:e-mrk-livestacklocal-devcontainerstack | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| edge:e-note-cilivestack-status | review | proposed | accepted | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| node:task-ci-live-e2e-stack | status | open | resolved | 2026-10-30T02:19:00Z | 9deece5d6f0ea8128d8917e40165299b3b18dfc6 | denisurusov |
| noteworthy:nw-ci-live-stack-first-run | review |  | proposed | 2026-10-31T23:50:39Z |  |  |
| edge:e-note-cilivestack-first-run | review |  | proposed | 2026-10-31T23:50:39Z |  |  |
| noteworthy:nw-ci-live-stack-first-run | review | proposed | accepted | 2026-11-01T00:10:00Z | 22139dbfa67bd4a249f7068bac11084c68caf5ad | denisurusov |
| edge:e-note-cilivestack-first-run | review | proposed | accepted | 2026-11-01T00:10:00Z | 22139dbfa67bd4a249f7068bac11084c68caf5ad | denisurusov |
| noteworthy:nw-ci-live-stack-steps | review | proposed | rejected | 2026-11-01T00:10:00Z | 22139dbfa67bd4a249f7068bac11084c68caf5ad | denisurusov |
| edge:e-note-cilivestack-steps | review | proposed | rejected | 2026-11-01T00:10:00Z | 22139dbfa67bd4a249f7068bac11084c68caf5ad | denisurusov |
| edge:e-sup-livestacklocal-cilivestacksteps | review |  | accepted | 2026-11-01T00:10:00Z | 22139dbfa67bd4a249f7068bac11084c68caf5ad | denisurusov |
| node:task-devcontainer-live-stack | status | open | resolved | 2026-11-01T00:40:00Z | 7a0b40227dfaa8c090f24ff18dadc5de671dafb5 | denisurusov |
| node:task-devcontainer-stack-startup | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| node:task-devcontainer-stack-startup | status |  | open | 2026-11-01T01:00:00Z |  |  |
| node:task-codespaces-live-stack | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| node:task-codespaces-live-stack | status |  | open | 2026-11-01T01:00:00Z |  |  |
| edge:e-dec-e2ewiring-devcontainerstartup | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| edge:e-lnk-devcontainerstack-devcontainerstartup | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| edge:e-dec-e2ewiring-codespacesstack | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| edge:e-lnk-devcontainerstartup-codespacesstack | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| node:task-e2e-remaining-flows | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| node:task-e2e-remaining-flows | status |  | open | 2026-11-01T15:57:23Z |  |  |
| node:task-revaluation-top-up-modelling | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| node:task-revaluation-top-up-modelling | status |  | open | 2026-11-01T15:57:23Z |  |  |
| edge:e-dec-e2ewiring-remainingflows | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| edge:e-dec-bizcase-topupmodelling | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| edge:e-lnk-remainingflows-topupmodelling | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| node:task-live-flow-checkout-script | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| node:task-live-flow-checkout-script | status |  | open | 2026-11-01T16:22:08Z |  |  |
| edge:e-dec-e2ewiring-livecheckout | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| edge:e-lnk-remainingflows-livecheckout | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| edge:e-lnk-cilivestack-livecheckout | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| node:task-devcontainer-stack-startup | status | open | resolved | 2026-11-01T21:07:28Z | 71e098075ed6f5310fcd0558fcc16984f99b0612 | denisurusov |
| node:task-live-flow-checkout-script | review | proposed | accepted | 2026-11-01T21:58:21Z |  | denisurusov |
| edge:e-dec-e2ewiring-livecheckout | review | proposed | accepted | 2026-11-01T21:58:21Z |  | denisurusov |
| edge:e-lnk-cilivestack-livecheckout | review | proposed | accepted | 2026-11-01T21:58:21Z |  | denisurusov |
| node:task-live-flow-checkout-script | status | open | resolved | 2026-11-01T21:58:22Z |  | denisurusov |
| node:task-live-spec-balance-aware-amounts | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| node:task-live-spec-balance-aware-amounts | status |  | open | 2026-11-01T22:01:07Z |  |  |
| edge:e-dec-e2ewiring-balanceaware | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| edge:e-lnk-livecheckout-balanceaware | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| edge:e-lnk-remainingflows-balanceaware | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| waypoint:wp-adr-console-same-origin-proxy | review |  | proposed | 2026-11-02T23:15:24Z |  |  |
| edge:e-mrk-sameoriginproxy-codespacesstack | review |  | proposed | 2026-11-02T23:15:24Z |  |  |
| waypoint:wp-adr-console-same-origin-proxy | review | proposed | accepted | 2026-11-03T03:05:59Z | 5c190e38fe670e7310d923d91fea67ab10d39ab9 | denisurusov |
| node:task-codespaces-live-stack | review | proposed | accepted | 2026-11-03T03:05:59Z | 5c190e38fe670e7310d923d91fea67ab10d39ab9 | denisurusov |
| node:task-codespaces-live-stack | status | open | resolved | 2026-11-03T03:05:59Z | 5c190e38fe670e7310d923d91fea67ab10d39ab9 | denisurusov |
| edge:e-mrk-sameoriginproxy-codespacesstack | review | proposed | accepted | 2026-11-03T03:11:11Z | 551fcc742556f79f90b83c29c01b8cbd240e0e4b | denisurusov |
| waypoint:wp-adr-cdm-payload-carrier | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-drv-ledgerneutrality-carrier | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-drv-cdmdatalayer-carrier | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-mrk-carrier-e2ewiring | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-dec-e2ewiring-remainingflows | review | proposed | rejected | 2026-11-03T03:25:20Z | 2d89f9ce09676a084c6672f5a9ba1b887d6112c5 | denisurusov |
| edge:e-dec-e2ewiring-balanceaware | review | proposed | rejected | 2026-11-03T03:25:20Z | 2d89f9ce09676a084c6672f5a9ba1b887d6112c5 | denisurusov |
| edge:e-dec-e2eflow-remainingflows | review |  | accepted | 2026-11-03T03:25:20Z | 2d89f9ce09676a084c6672f5a9ba1b887d6112c5 | denisurusov |
| edge:e-dec-e2eflow-balanceaware | review |  | accepted | 2026-11-03T03:25:20Z | 2d89f9ce09676a084c6672f5a9ba1b887d6112c5 | denisurusov |
| node:task-e2e-wiring | status | active | resolved | 2026-11-03T03:25:20Z | 2d89f9ce09676a084c6672f5a9ba1b887d6112c5 | denisurusov |
| edge:e-dec-e2ewiring-codespacesstack | review | proposed | accepted | 2026-11-03T03:31:02Z | 5c190e38fe670e7310d923d91fea67ab10d39ab9 | denisurusov |
| edge:e-lnk-devcontainerstartup-codespacesstack | review | proposed | accepted | 2026-11-03T03:31:02Z | 5c190e38fe670e7310d923d91fea67ab10d39ab9 | denisurusov |
| edge:e-lnk-remainingflows-livecheckout | review | proposed | accepted | 2026-11-03T03:31:02Z |  | denisurusov |
| node:task-devcontainer-stack-startup | review | proposed | accepted | 2026-11-03T03:32:33Z |  | denisurusov |
| edge:e-dec-e2ewiring-devcontainerstartup | review | proposed | accepted | 2026-11-03T03:32:33Z |  | denisurusov |
| edge:e-lnk-devcontainerstack-devcontainerstartup | review | proposed | accepted | 2026-11-03T03:32:33Z |  | denisurusov |
| node:task-react-console | status | open | resolved | 2026-11-03T03:33:39Z |  | denisurusov |
| node:goal-test-konspekt-adoption | status | active | resolved | 2026-11-03T03:36:56Z |  | denisurusov |
| noteworthy:nw-return-default-flows-wired | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| noteworthy:nw-live-spec-balance-depletion | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| edge:e-note-remainingflows-returndefault | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| edge:e-note-remainingflows-depletion | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| edge:e-note-livecheckout-depletion | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| node:task-e2e-remaining-flows | review | proposed | accepted | 2026-11-03T12:47:43Z |  | denisurusov |
| artifact:artifact-react-console | review | proposed | accepted | 2026-11-03T12:48:28Z |  | denisurusov |
| edge:e-prod-reactconsole-app | review | proposed | accepted | 2026-11-03T12:48:28Z |  | denisurusov |
| artifact:artifact-e2e-runbook | review | proposed | accepted | 2026-11-03T12:48:40Z |  | denisurusov |
| edge:e-prod-e2ewiring-runbook | review | proposed | accepted | 2026-11-03T12:48:40Z |  | denisurusov |
| node:task-revaluation-top-up-modelling | review | proposed | accepted | 2026-11-03T12:49:03Z |  | denisurusov |
| edge:e-dec-bizcase-topupmodelling | review | proposed | accepted | 2026-11-03T12:49:03Z |  | denisurusov |
| edge:e-lnk-remainingflows-topupmodelling | review | proposed | accepted | 2026-11-03T12:49:03Z |  | denisurusov |
| node:task-live-spec-balance-aware-amounts | review | proposed | accepted | 2026-11-03T12:49:19Z |  | denisurusov |
| edge:e-lnk-livecheckout-balanceaware | review | proposed | accepted | 2026-11-03T12:49:19Z |  | denisurusov |
| edge:e-lnk-remainingflows-balanceaware | review | proposed | accepted | 2026-11-03T12:49:19Z |  | denisurusov |
| edge:e-note-balanceaware-depletion | review |  | proposed | 2026-11-03T12:50:15Z |  |  |
| noteworthy:nw-return-default-flows-wired | review | proposed | accepted | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| noteworthy:nw-live-spec-balance-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| edge:e-note-remainingflows-returndefault | review | proposed | accepted | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| edge:e-note-remainingflows-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| edge:e-note-livecheckout-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| edge:e-note-balanceaware-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| node:task-e2e-remaining-flows | status | open | active | 2026-11-03T12:50:48Z | 3ae8b62f2e82d6124c2ca634281230fbbb66b5a8 | denisurusov |
| node:task-collateral-service-unit-tests | review |  | proposed | 2026-11-03T14:01:12Z |  |  |
| node:task-collateral-service-unit-tests | status |  | open | 2026-11-03T14:01:12Z |  |  |
| edge:e-dec-e2eflow-collateralunittests | review |  | proposed | 2026-11-03T14:01:12Z |  |  |
| node:investigation-cdm-workflow-task-map | review |  | proposed | 2026-11-03T14:18:57Z |  |  |
| node:investigation-cdm-workflow-task-map | status |  | active | 2026-11-03T14:18:57Z |  |  |
| edge:e-dec-e2eflow-workflowtaskmap | review |  | proposed | 2026-11-03T14:18:57Z |  |  |
| artifact:artifact-cdm-workflow-task-map | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-csa-workflow-extensions | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-csa-workflow-extensions | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-repo-gmra-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-repo-gmra-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-securities-lending-gmsla-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-securities-lending-gmsla-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-triparty-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-triparty-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-ccp-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-ccp-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| edge:e-prod-workflowtaskmap-map | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-csaextensions | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-repogmra | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-seclendinggmsla | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-triparty | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-ccp | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-lnk-csaextensions-gapclosure | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:investigation-cdm-workflow-task-map | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| artifact:artifact-cdm-workflow-task-map | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| node:task-csa-workflow-extensions | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| node:task-repo-gmra-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| node:task-securities-lending-gmsla-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| node:task-triparty-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| node:task-ccp-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-dec-e2eflow-workflowtaskmap | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-prod-workflowtaskmap-map | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-dec-e2eflow-csaextensions | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-dec-e2eflow-repogmra | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-dec-e2eflow-seclendinggmsla | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-dec-e2eflow-triparty | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-dec-e2eflow-ccp | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-lnk-csaextensions-gapclosure | review | proposed | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| noteworthy:nw-core-cycle-first | review |  | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| edge:e-note-workflowtaskmap-corefirst | review |  | accepted | 2026-11-03T14:47:29Z | f2af9c708d4dfb0afca4f8657294d0883797c5b2 | denisurusov |
| noteworthy:nw-csa-extension-order | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| noteworthy:nw-agreement-family-order | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| edge:e-note-workflowtaskmap-csaorder | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| edge:e-note-csaextensions-csaorder | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| edge:e-note-workflowtaskmap-familyorder | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| noteworthy:nw-csa-extension-order | review | proposed | accepted | 2026-11-03T15:18:20Z | f8f1443bfe0b092cf3b946298cc9462579bc27a9 | denisurusov |
| noteworthy:nw-agreement-family-order | review | proposed | accepted | 2026-11-03T15:18:20Z | f8f1443bfe0b092cf3b946298cc9462579bc27a9 | denisurusov |
| edge:e-note-workflowtaskmap-csaorder | review | proposed | accepted | 2026-11-03T15:18:20Z | f8f1443bfe0b092cf3b946298cc9462579bc27a9 | denisurusov |
| edge:e-note-csaextensions-csaorder | review | proposed | accepted | 2026-11-03T15:18:20Z | f8f1443bfe0b092cf3b946298cc9462579bc27a9 | denisurusov |
| edge:e-note-workflowtaskmap-familyorder | review | proposed | accepted | 2026-11-03T15:18:20Z | f8f1443bfe0b092cf3b946298cc9462579bc27a9 | denisurusov |
| waypoint:wp-adr-oracle-prices-on-request-ratings-offchain | review |  | accepted | 2026-11-03T15:31:39Z | 9fb38c6c305f7d6f3e87894c56f343b421c5df99 | denisurusov |
| edge:e-mrk-oracleadr-remainingflows | review |  | accepted | 2026-11-03T15:31:39Z | 9fb38c6c305f7d6f3e87894c56f343b421c5df99 | denisurusov |
| waypoint:wp-adr-revaluation-outstanding-im-from-calls | review |  | accepted | 2026-11-03T16:24:46Z | 7b7af5a7e92584d713a86f7f0a6dd5c3e64bb860 | denisurusov |
| edge:e-mrk-revaladr-remainingflows | review |  | accepted | 2026-11-03T16:24:46Z | 7b7af5a7e92584d713a86f7f0a6dd5c3e64bb860 | denisurusov |
| noteworthy:nw-revaluation-top-up-excluded | review |  | proposed | 2026-11-03T16:24:46Z |  |  |
| edge:e-note-remainingflows-topupexcluded | review |  | proposed | 2026-11-03T16:24:46Z |  |  |
| edge:e-note-topupmodelling-topupexcluded | review |  | proposed | 2026-11-03T16:24:46Z |  |  |
| noteworthy:nw-revaluation-top-up-excluded | review | proposed | accepted | 2026-11-03T16:35:57Z |  | denisurusov |
| edge:e-note-remainingflows-topupexcluded | review | proposed | accepted | 2026-11-03T16:35:57Z |  | denisurusov |
| edge:e-note-topupmodelling-topupexcluded | review | proposed | accepted | 2026-11-03T16:35:57Z |  | denisurusov |
| waypoint:wp-adr-ci-runs-live-specs | review |  | accepted | 2026-11-03T17:05:51Z | db38e95ee8c10dee9650ada2a61e3c4905116a3a | denisurusov |
| edge:e-mrk-cispecsadr-remainingflows | review |  | accepted | 2026-11-03T17:05:51Z | db38e95ee8c10dee9650ada2a61e3c4905116a3a | denisurusov |
| edge:e-sup-cispecs-livestacklocal | review |  | accepted | 2026-11-03T17:05:51Z | db38e95ee8c10dee9650ada2a61e3c4905116a3a | denisurusov |
| node:task-e2e-remaining-flows | status | active | resolved | 2026-11-03T17:51:55Z |  | denisurusov |
| noteworthy:nw-portfolio-per-pair-post-haircut | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| noteworthy:nw-cdm-valuation-percentage-as-haircut | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| edge:e-note-gapclosure-portfoliopair | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| edge:e-note-gapclosure-valuationpct | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| noteworthy:nw-portfolio-per-pair-post-haircut | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| noteworthy:nw-cdm-valuation-percentage-as-haircut | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| edge:e-note-gapclosure-portfoliopair | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| edge:e-note-gapclosure-valuationpct | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| noteworthy:nw-concentration-held-and-proposed-after-haircuts | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| noteworthy:nw-vm-exposure-from-netting-set | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| edge:e-note-gapclosure-concentration | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| edge:e-note-gapclosure-vmexposure | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| noteworthy:nw-concentration-held-and-proposed-after-haircuts | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| edge:e-note-gapclosure-concentration | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| noteworthy:nw-vm-exposure-from-netting-set | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| edge:e-note-gapclosure-vmexposure | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| noteworthy:nw-closeout-collateral-by-arrangement | review |  | proposed | 2026-11-03T21:52:19Z |  |  |
| edge:e-note-gapclosure-closeout | review |  | proposed | 2026-11-03T21:52:19Z |  |  |
| noteworthy:nw-closeout-collateral-by-arrangement | review | proposed | accepted | 2026-11-03T23:07:44Z |  | denisurusov |
| edge:e-note-gapclosure-closeout | review | proposed | accepted | 2026-11-03T23:07:44Z |  | denisurusov |
| noteworthy:nw-enforcement-event-by-election | review |  | proposed | 2026-11-03T23:08:40Z |  |  |
| edge:e-note-gapclosure-enforcement | review |  | proposed | 2026-11-03T23:08:40Z |  |  |
| noteworthy:nw-enforcement-event-by-election | review | proposed | accepted | 2026-11-03T23:55:33Z |  | denisurusov |
| edge:e-note-gapclosure-enforcement | review | proposed | accepted | 2026-11-03T23:55:33Z |  | denisurusov |
| node:task-sme-enforcement-event-definition | review |  | proposed | 2026-11-03T23:55:33Z |  |  |
| node:task-sme-enforcement-event-definition | status |  | open | 2026-11-03T23:55:33Z |  |  |
| edge:e-dec-cdmdev-smeenforcement | review |  | proposed | 2026-11-03T23:55:33Z |  |  |
| edge:e-lnk-gapclosure-smeenforcement | review |  | proposed | 2026-11-03T23:55:33Z |  |  |
| noteworthy:nw-substitution-csa-lifecycle | review |  | proposed | 2026-11-03T23:59:58Z |  |  |
| edge:e-note-gapclosure-substitution | review |  | proposed | 2026-11-03T23:59:58Z |  |  |
| noteworthy:nw-substitution-csa-lifecycle | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| node:task-sme-enforcement-event-definition | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| edge:e-note-gapclosure-substitution | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| edge:e-dec-cdmdev-smeenforcement | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| edge:e-lnk-gapclosure-smeenforcement | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| noteworthy:nw-dispute-record-beside-call | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| edge:e-note-gapclosure-dispute | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| noteworthy:nw-ledger-reference-and-token-identity | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| edge:e-note-gapclosure-ledger | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| noteworthy:nw-dispute-record-beside-call | review | proposed | accepted | 2026-11-04T02:15:33Z |  | denisurusov |
| edge:e-note-gapclosure-dispute | review | proposed | accepted | 2026-11-04T02:15:33Z |  | denisurusov |
| noteworthy:nw-ledger-reference-and-token-identity | review | proposed | rejected | 2026-11-04T02:21:16Z | 67989287b51231983b6e1159a2195a185f5d16b3 | denisurusov |
| edge:e-note-gapclosure-ledger | review | proposed | rejected | 2026-11-04T02:21:16Z | 67989287b51231983b6e1159a2195a185f5d16b3 | denisurusov |
| noteworthy:nw-ledger-anchor-redesign | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| node:task-g25-ledger-anchor-redesign | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| node:task-g25-ledger-anchor-redesign | status |  | open | 2026-11-04T02:21:16Z |  |  |
| node:task-sme-registered-asset-completion | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| node:task-sme-registered-asset-completion | status |  | open | 2026-11-04T02:21:16Z |  |  |
| edge:e-sup-ledgeranchor-ledgerref | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-note-gapclosure-ledgeranchor | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-dec-gapclosure-g25redesign | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-note-g25redesign-ledgeranchor | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-dec-cdmdev-smeregistered | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-lnk-gapclosure-smeregistered | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| noteworthy:nw-ledger-anchor-redesign | review | proposed | accepted | 2026-11-04T02:27:08Z |  | denisurusov |
| edge:e-note-gapclosure-ledgeranchor | review | proposed | accepted | 2026-11-04T02:27:08Z |  | denisurusov |
| node:task-g25-ledger-anchor-redesign | review | proposed | accepted | 2026-11-04T02:27:22Z |  | denisurusov |
| edge:e-dec-gapclosure-g25redesign | review | proposed | accepted | 2026-11-04T02:27:22Z |  | denisurusov |
| edge:e-note-g25redesign-ledgeranchor | review | proposed | accepted | 2026-11-04T02:27:22Z |  | denisurusov |
| node:task-sme-registered-asset-completion | review | proposed | accepted | 2026-11-04T02:27:36Z |  | denisurusov |
| edge:e-dec-cdmdev-smeregistered | review | proposed | accepted | 2026-11-04T02:27:36Z |  | denisurusov |
| edge:e-lnk-gapclosure-smeregistered | review | proposed | accepted | 2026-11-04T02:27:36Z |  | denisurusov |
| edge:e-sup-ledgeranchor-ledgerref | review | proposed | accepted | 2026-11-04T02:27:08Z |  | denisurusov |
| noteworthy:nw-ledger-anchor-implementation | review |  | proposed | 2026-11-04T02:39:30Z |  |  |
| edge:e-note-g25redesign-implementation | review |  | proposed | 2026-11-04T02:39:30Z |  |  |
| noteworthy:nw-ledger-anchor-implementation | review | proposed | accepted | 2026-11-04T02:46:59Z |  | denisurusov |
| edge:e-note-g25redesign-implementation | review | proposed | accepted | 2026-11-04T02:46:59Z |  | denisurusov |
| node:task-g25-ledger-anchor-redesign | status | open | resolved | 2026-11-04T03:11:51Z | 30d8b3afe7270e41926a27c489077bee1626627e | denisurusov |
| node:task-csa-close-out-netting | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-close-out-netting | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-closeout | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-substitution | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-substitution | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-substitution | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-interest-on-cash | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-interest-on-cash | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-interest | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-amendment | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-amendment | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-amendment | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-call-cancellation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-call-cancellation | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-cancellation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-settlement-netting | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-settlement-netting | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-settlementnetting | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-allocation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-allocation | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-allocation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-reconciliation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-reconciliation | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-reconciliation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| waypoint:wp-adr-closeout-contract-applies-collateral | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| waypoint:wp-adr-substitution-fold-portfolio | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| edge:e-mrk-closeoutadr-closeout | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| edge:e-mrk-subfoldadr-substitution | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| waypoint:wp-adr-closeout-contract-applies-collateral | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| waypoint:wp-adr-substitution-fold-portfolio | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-close-out-netting | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-substitution | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-interest-on-cash | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-amendment | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-call-cancellation | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-settlement-netting | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-allocation | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-reconciliation | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-closeout | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-substitution | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-interest | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-amendment | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-cancellation | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-settlementnetting | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-allocation | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-dec-csaext-reconciliation | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-mrk-closeoutadr-closeout | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| edge:e-mrk-subfoldadr-substitution | review | proposed | accepted | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-close-out-netting | status | open | resolved | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| node:task-csa-substitution | status | open | resolved | 2026-11-06T15:14:18Z | b90a19c5cfa7e4c3b9b980101626ac2bdd894981 | denisurusov |
| waypoint:wp-adr-interest-rate-rules-and-withholding | review |  | proposed | 2026-11-06T15:26:06Z |  |  |
| edge:e-mrk-interestadr-interest | review |  | proposed | 2026-11-06T15:26:06Z |  |  |
| waypoint:wp-adr-interest-rate-rules-and-withholding | review | proposed | accepted | 2026-11-06T15:35:07Z | 16dca9f0c1765191fa8235340845c442d5744245 | denisurusov |
| edge:e-mrk-interestadr-interest | review | proposed | accepted | 2026-11-06T15:35:07Z | 16dca9f0c1765191fa8235340845c442d5744245 | denisurusov |
| node:task-sme-interest-daily-balances | review |  | proposed | 2026-11-06T15:35:07Z |  |  |
| node:task-sme-interest-daily-balances | status |  | open | 2026-11-06T15:35:07Z |  |  |
| edge:e-dec-cdmdev-smeinterest | review |  | proposed | 2026-11-06T15:35:07Z |  |  |
| edge:e-lnk-interest-smeinterest | review |  | proposed | 2026-11-06T15:35:07Z |  |  |
| waypoint:wp-adr-interest-onchain-settlement | review |  | proposed | 2026-11-06T15:51:39Z |  |  |
| edge:e-mrk-interestsettle-interest | review |  | proposed | 2026-11-06T15:51:39Z |  |  |
| waypoint:wp-adr-interest-onchain-settlement | review | proposed | accepted | 2026-11-06T15:52:55Z | 5955eca8c156067c277e351f691178335a87ba30 | denisurusov |
| node:task-sme-interest-daily-balances | review | proposed | accepted | 2026-11-06T15:52:55Z | 5955eca8c156067c277e351f691178335a87ba30 | denisurusov |
| edge:e-mrk-interestsettle-interest | review | proposed | accepted | 2026-11-06T15:52:55Z | 5955eca8c156067c277e351f691178335a87ba30 | denisurusov |
| edge:e-dec-cdmdev-smeinterest | review | proposed | accepted | 2026-11-06T15:52:55Z | 5955eca8c156067c277e351f691178335a87ba30 | denisurusov |
| edge:e-lnk-interest-smeinterest | review | proposed | accepted | 2026-11-06T15:52:55Z | 5955eca8c156067c277e351f691178335a87ba30 | denisurusov |
| node:task-csa-interest-on-cash | status | open | resolved | 2026-11-06T15:52:55Z | 5955eca8c156067c277e351f691178335a87ba30 | denisurusov |
| waypoint:wp-adr-amendment-per-pair-terms | review |  | proposed | 2026-11-06T17:04:10Z |  |  |
| edge:e-mrk-amendterms-amendment | review |  | proposed | 2026-11-06T17:04:10Z |  |  |
| waypoint:wp-adr-amendment-per-pair-terms | review | proposed | accepted | 2026-11-06T19:18:15Z | 73534ab20f26bfc834f5bc6e55c106c8eefd450d | denisurusov |
| edge:e-mrk-amendterms-amendment | review | proposed | accepted | 2026-11-06T19:18:15Z | 73534ab20f26bfc834f5bc6e55c106c8eefd450d | denisurusov |
| node:task-csa-amendment | status | open | resolved | 2026-11-06T19:18:15Z | 73534ab20f26bfc834f5bc6e55c106c8eefd450d | denisurusov |
| node:task-sme-call-cancellation-rules | review |  | proposed | 2026-11-06T20:16:20Z |  |  |
| node:task-sme-call-cancellation-rules | status |  | open | 2026-11-06T20:16:20Z |  |  |
| edge:e-dec-cdmdev-smecancel | review |  | proposed | 2026-11-06T20:16:20Z |  |  |
| edge:e-lnk-cancel-smecancel | review |  | proposed | 2026-11-06T20:16:20Z |  |  |
| waypoint:wp-adr-cancellation-blocks-call | review |  | proposed | 2026-11-06T20:38:13Z |  |  |
| edge:e-mrk-cancelblocks-cancel | review |  | proposed | 2026-11-06T20:38:13Z |  |  |
| waypoint:wp-adr-cancellation-blocks-call | review | proposed | accepted | 2026-11-06T20:45:24Z | c2edefb45dac2ddd6d81594d1c998a6f8f5374df | denisurusov |
| node:task-sme-call-cancellation-rules | review | proposed | accepted | 2026-11-06T20:45:24Z | c2edefb45dac2ddd6d81594d1c998a6f8f5374df | denisurusov |
| edge:e-mrk-cancelblocks-cancel | review | proposed | accepted | 2026-11-06T20:45:24Z | c2edefb45dac2ddd6d81594d1c998a6f8f5374df | denisurusov |
| edge:e-dec-cdmdev-smecancel | review | proposed | accepted | 2026-11-06T20:45:24Z | c2edefb45dac2ddd6d81594d1c998a6f8f5374df | denisurusov |
| edge:e-lnk-cancel-smecancel | review | proposed | accepted | 2026-11-06T20:45:24Z | c2edefb45dac2ddd6d81594d1c998a6f8f5374df | denisurusov |
| node:task-csa-call-cancellation | status | open | resolved | 2026-11-06T20:45:24Z | c2edefb45dac2ddd6d81594d1c998a6f8f5374df | denisurusov |
| node:task-ci-deploy-dropped-tx | review |  | proposed | 2026-11-06T21:19:41Z |  |  |
| node:task-ci-deploy-dropped-tx | status |  | open | 2026-11-06T21:19:41Z |  |  |
| edge:e-lnk-cilivestack-deploydroppedtx | review |  | proposed | 2026-11-06T21:19:41Z |  |  |
| node:task-ci-deploy-dropped-tx | review | proposed | accepted | 2026-11-06T21:21:30Z | 22f981c66f08de2c25660758c56b999391f6a362 | denisurusov |
| edge:e-lnk-cilivestack-deploydroppedtx | review | proposed | accepted | 2026-11-06T21:21:30Z | 22f981c66f08de2c25660758c56b999391f6a362 | denisurusov |
| node:investigation-adr-asr-traceability | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| node:investigation-adr-asr-traceability | status |  | active | 2026-11-06T21:34:07Z |  |  |
| edge:e-dec-archdesign-adrtrace | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-amendterms | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-cancelblocks | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-cancelblocks | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-cdmevents | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-extrune | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-localext | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-closeout | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-finality-closeout | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-consolerules | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-imseg | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-finality-imseg | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-interestsettle | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-finality-interestsettle | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-interestrules | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-javastack | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-perparty | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-reval | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-subst | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-subst | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| noteworthy:nw-architecture-json-is-source | review |  | proposed | 2026-11-06T21:49:38Z |  |  |
| edge:e-note-adrtrace-jsonsource | review |  | proposed | 2026-11-06T21:49:38Z |  |  |
| concept:concept-asr-onchain-feed-scope | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| concept:concept-asr-agreement-type-fidelity | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| edge:e-drv-feedscope-oracleprices | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| edge:e-drv-agreementfidelity-scenariogrid | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| edge:e-dec-archdesign-adrtrace | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-amendterms | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-callstate-cancelblocks | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-cancelblocks | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-cdmevents | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-extrune | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-localext | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-closeout | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-finality-closeout | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-consolerules | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-callstate-imseg | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-finality-imseg | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-interestsettle | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-finality-interestsettle | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-interestrules | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-javastack | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-callstate-perparty | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-callstate-reval | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-callstate-subst | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-drv-cdmdata-subst | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| edge:e-note-adrtrace-jsonsource | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| node:investigation-adr-asr-traceability | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| noteworthy:nw-architecture-json-is-source | review | proposed | accepted | 2026-11-06T21:53:08Z | bd69e3ba82507a26a39a0a1fbcbbfe3d296c09e5 | denisurusov |
| concept:concept-asr-onchain-feed-scope | review | proposed | accepted | 2026-11-06T22:27:21Z | 33850d5be9ec3305f235b5145548d2dab4f1100e | denisurusov |
| concept:concept-asr-agreement-type-fidelity | review | proposed | accepted | 2026-11-06T22:27:21Z | 33850d5be9ec3305f235b5145548d2dab4f1100e | denisurusov |
| edge:e-drv-feedscope-oracleprices | review | proposed | accepted | 2026-11-06T22:27:21Z | 33850d5be9ec3305f235b5145548d2dab4f1100e | denisurusov |
| edge:e-drv-agreementfidelity-scenariogrid | review | proposed | accepted | 2026-11-06T22:27:21Z | 33850d5be9ec3305f235b5145548d2dab4f1100e | denisurusov |
| node:investigation-adr-asr-traceability | status | active | resolved | 2026-11-06T22:40:11Z | 22aa20e558831db58e7cbd2e41943f4ee16e1f11 | denisurusov |
| node:task-csa-call-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| node:task-csa-call-replacement | status |  | open | 2026-11-06T21:44:40Z |  |  |
| waypoint:wp-adr-replacement-call-link | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-dec-csaext-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-lnk-cancel-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-lnk-replacement-smecancel | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-mrk-replacementlink-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| node:task-csa-call-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| waypoint:wp-adr-replacement-call-link | review | proposed | accepted | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| edge:e-dec-csaext-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| edge:e-lnk-cancel-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| edge:e-lnk-replacement-smecancel | review | proposed | accepted | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| edge:e-mrk-replacementlink-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| node:task-csa-call-replacement | status | open | resolved | 2026-11-06T21:53:01Z | 17bdd48517562af268b60766e55747d540486bb2 | denisurusov |
| edge:e-drv-callstate-replacelink | review |  | proposed | 2026-11-06T22:58:01Z |  |  |
| edge:e-drv-cdmdata-replacelink | review |  | proposed | 2026-11-06T22:58:01Z |  |  |
| edge:e-drv-callstate-replacelink | review | proposed | accepted | 2026-11-06T23:02:51Z | ea0ed4c6ddb1c4da0564b4c86fb9a7ed396a0262 | denisurusov |
| edge:e-drv-cdmdata-replacelink | review | proposed | accepted | 2026-11-06T23:02:51Z | ea0ed4c6ddb1c4da0564b4c86fb9a7ed396a0262 | denisurusov |
| waypoint:wp-adr-settlement-netting-scope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| node:task-sme-settlement-netting-rules | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| node:task-sme-settlement-netting-rules | status |  | open | 2026-11-07T04:24:56Z |  |  |
| edge:e-mrk-nettingscope-netting | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-dec-cdmdev-smenetting | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-lnk-netting-smenetting | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-drv-finality-nettingscope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-drv-callstate-nettingscope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-drv-cdmdata-nettingscope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| waypoint:wp-adr-settlement-netting-scope | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| node:task-sme-settlement-netting-rules | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| edge:e-mrk-nettingscope-netting | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| edge:e-drv-finality-nettingscope | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| edge:e-drv-callstate-nettingscope | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| edge:e-drv-cdmdata-nettingscope | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| edge:e-dec-cdmdev-smenetting | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| edge:e-lnk-netting-smenetting | review | proposed | accepted | 2026-11-07T04:38:11Z | 8987810d076eb2cb62faa3b3b572cf1f19796fc4 | denisurusov |
| waypoint:wp-adr-allocation-scope | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| node:task-sme-allocation-ranking | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| node:task-sme-allocation-ranking | status |  | open | 2026-11-07T13:52:51Z |  |  |
| edge:e-mrk-allocscope-alloc | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-dec-cdmdev-smealloc | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-lnk-alloc-smealloc | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-drv-cdmdata-allocscope | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-drv-callstate-allocscope | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| waypoint:wp-adr-allocation-scope | review | proposed | accepted | 2026-11-07T15:58:37Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| edge:e-mrk-allocscope-alloc | review | proposed | accepted | 2026-11-07T15:58:37Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| edge:e-drv-cdmdata-allocscope | review | proposed | accepted | 2026-11-07T15:58:37Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| edge:e-drv-callstate-allocscope | review | proposed | accepted | 2026-11-07T15:58:37Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| node:task-sme-allocation-ranking | review | proposed | accepted | 2026-11-07T15:58:48Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| edge:e-dec-cdmdev-smealloc | review | proposed | accepted | 2026-11-07T15:58:48Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| edge:e-lnk-alloc-smealloc | review | proposed | accepted | 2026-11-07T15:58:48Z | 8e25aca5b93d570808667f6415edf097c11c1d56 | denisurusov |
| node:task-csa-allocation | status | open | resolved | 2026-11-07T18:15:45Z | b94ecf05be6e7d479e2ec32ca6f413bdcfb74679 | denisurusov |
| node:task-sme-allocation-concentration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-sme-allocation-concentration | status |  | open | 2026-11-07T18:27:28Z |  |  |
| node:task-csa-allocation-optimisation | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-csa-allocation-optimisation | status |  | open | 2026-11-07T18:27:28Z |  |  |
| node:task-live-spec-duration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-live-spec-duration | status |  | open | 2026-11-07T18:27:28Z |  |  |
| edge:e-dec-cdmdev-smeallocconc | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-lnk-alloc-smeallocconc | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-dec-csaext-allocopt | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-lnk-alloc-allocopt | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-dec-e2eflow-specduration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-lnk-cilivestack-specduration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-sme-allocation-concentration | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| node:task-csa-allocation-optimisation | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| node:task-live-spec-duration | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| edge:e-dec-cdmdev-smeallocconc | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| edge:e-lnk-alloc-smeallocconc | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| edge:e-dec-csaext-allocopt | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| edge:e-lnk-alloc-allocopt | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| edge:e-dec-e2eflow-specduration | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| edge:e-lnk-cilivestack-specduration | review | proposed | accepted | 2026-11-07T18:32:00Z | a2bc041d64b5866b6881d035f29342b3a34faccd | denisurusov |
| waypoint:wp-adr-reconciliation-scope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| node:task-sme-reconciliation-rules | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| node:task-sme-reconciliation-rules | status |  | open | 2026-11-07T18:37:24Z |  |  |
| edge:e-mrk-reconscope-recon | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-dec-cdmdev-smerecon | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-lnk-recon-smerecon | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-drv-cdmdata-reconscope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-drv-callstate-reconscope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-drv-offchaindispute-reconscope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| waypoint:wp-adr-reconciliation-scope | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| node:task-sme-reconciliation-rules | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| edge:e-mrk-reconscope-recon | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| edge:e-dec-cdmdev-smerecon | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| edge:e-lnk-recon-smerecon | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| edge:e-drv-cdmdata-reconscope | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| edge:e-drv-callstate-reconscope | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| edge:e-drv-offchaindispute-reconscope | review | proposed | accepted | 2026-11-07T18:41:40Z | 51c3390d90b19b0acd543367baf069b4fb9400bd | denisurusov |
| node:task-gateway-receipt-poll | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-gateway-receipt-poll | status |  | open | 2026-11-07T18:54:12Z |  |  |
| node:task-live-read-latency | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-live-read-latency | status |  | open | 2026-11-07T18:54:12Z |  |  |
| node:task-test-chain-block-period | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-test-chain-block-period | status |  | open | 2026-11-07T18:54:12Z |  |  |
| edge:e-dec-specduration-receiptpoll | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| edge:e-dec-specduration-readlatency | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| edge:e-dec-specduration-blockperiod | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-gateway-receipt-poll | review | proposed | accepted | 2026-11-07T19:57:56Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| node:task-live-read-latency | review | proposed | accepted | 2026-11-07T19:57:56Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| node:task-test-chain-block-period | review | proposed | accepted | 2026-11-07T19:57:56Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| edge:e-dec-specduration-receiptpoll | review | proposed | accepted | 2026-11-07T19:57:56Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| edge:e-dec-specduration-readlatency | review | proposed | accepted | 2026-11-07T19:57:56Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| edge:e-dec-specduration-blockperiod | review | proposed | accepted | 2026-11-07T19:57:56Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| node:task-csa-reconciliation | status | open | resolved | 2026-11-07T20:11:29Z | fe94d24c8393576eafa827a5ced53840580becbe | denisurusov |
| node:task-live-test-balances | review |  | proposed | 2026-11-07T20:46:35Z |  |  |
| node:task-live-test-balances | status |  | open | 2026-11-07T20:46:35Z |  |  |
| edge:e-lnk-receiptpoll-testbalances | review |  | proposed | 2026-11-07T20:46:35Z |  |  |
| node:task-gateway-receipt-poll | status | open | resolved | 2026-11-07T20:52:50Z | cf9a296128848aa5cdf9ffde53124e8bcd1672f4 | denisurusov |
| node:task-live-test-balances | review | proposed | accepted | 2026-11-07T20:52:50Z | cf9a296128848aa5cdf9ffde53124e8bcd1672f4 | denisurusov |
| edge:e-lnk-receiptpoll-testbalances | review | proposed | accepted | 2026-11-07T20:52:50Z | cf9a296128848aa5cdf9ffde53124e8bcd1672f4 | denisurusov |
| node:task-live-read-latency | status | open | resolved | 2026-11-07T21:14:36Z | 1f18f384e0b534a4a82dd24e1d9303362296d64e | denisurusov |
| node:task-live-test-balances | status | open | resolved | 2026-11-07T21:14:36Z | 1f18f384e0b534a4a82dd24e1d9303362296d64e | denisurusov |
| node:task-csa-settlement-netting | status | open | resolved | 2026-11-07T21:16:04Z |  | denisurusov |
| node:task-csa-workflow-extensions | status | open | resolved | 2026-11-07T21:18:31Z | fd15e5535b198d08fc024585cf53a29c2edc27ec | denisurusov |
| waypoint:wp-adr-two-way-im | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| node:task-sme-two-way-im-rules | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-mrk-twowayimadr-twowayim | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-drv-callstate-twowayimadr | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-drv-finality-twowayimadr | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-dec-cdmdev-smetwowayim | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-lnk-twowayim-smetwowayim | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| node:task-sme-two-way-im-rules | status |  | open | 2026-11-07T21:24:29Z |  |  |
| waypoint:wp-adr-two-way-im | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| node:task-sme-two-way-im-rules | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| edge:e-mrk-twowayimadr-twowayim | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| edge:e-drv-callstate-twowayimadr | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| edge:e-drv-finality-twowayimadr | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| edge:e-dec-cdmdev-smetwowayim | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| edge:e-lnk-twowayim-smetwowayim | review | proposed | accepted | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| node:task-two-way-initial-margin | status | open | resolved | 2026-11-07T21:58:01Z | 2a303c540e4fec96e3d83b0e45a53afa55defe0f | denisurusov |
| node:task-konspekt-checkpoint-adoption | review |  | proposed | 2026-11-07T22:13:30Z |  |  |
| node:task-konspekt-checkpoint-adoption | status |  | open | 2026-11-07T22:13:30Z |  |  |
| edge:e-dec-konspektadopt-checkpoint | review |  | proposed | 2026-11-07T22:13:30Z |  |  |
| node:task-konspekt-checkpoint-adoption | review | proposed | accepted | 2026-11-07T22:31:16Z | 22bd8364ab05ce0184ff96fe2006969da7db8dea | denisurusov |
| edge:e-dec-konspektadopt-checkpoint | review | proposed | accepted | 2026-11-07T22:31:16Z | 22bd8364ab05ce0184ff96fe2006969da7db8dea | denisurusov |
| waypoint:wp-adr-repo-gmra-scope | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-gmra-terms | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-gmra-terms | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-purchase-repurchase | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-purchase-repurchase | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-margin-maintenance | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-margin-maintenance | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-reprice | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-reprice | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-adjustment | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-adjustment | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-substitution | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-substitution | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-income | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-income | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-roll | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-roll | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-pair-off | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-pair-off | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-buy-sell-back | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-buy-sell-back | status |  | open | 2026-11-07T22:35:17Z |  |  |
| edge:e-mrk-repogmrascope-repogmra | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-drv-cdmdata-repogmrascope | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-drv-finality-repogmrascope | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-gmraterms | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-purchaserepurchase | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-marginmaintenance | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-reprice | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-adjustment | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-substitution | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-income | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-roll | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-pairoff | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-buysellback | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| waypoint:wp-adr-repo-gmra-scope | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| edge:e-mrk-repogmrascope-repogmra | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| edge:e-drv-cdmdata-repogmrascope | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| edge:e-drv-finality-repogmrascope | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| node:task-repo-gmra-terms | review | proposed | accepted | 2026-11-07T23:10:06Z |  | denisurusov |
| edge:e-dec-repogmra-gmraterms | review | proposed | accepted | 2026-11-07T23:10:06Z |  | denisurusov |
| node:task-repo-purchase-repurchase | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-purchaserepurchase | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-margin-maintenance | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-marginmaintenance | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-reprice | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-reprice | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-adjustment | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-adjustment | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-substitution | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-substitution | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-income | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-income | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-roll | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-roll | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-pair-off | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-pairoff | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-buy-sell-back | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| edge:e-dec-repogmra-buysellback | review | proposed | accepted | 2026-11-07T23:11:58Z | 098fab36b2d91ff22a659917fbb8c77ca7aa4108 | denisurusov |
| node:task-repo-default-close-out | review |  | proposed | 2026-11-07T23:11:58Z |  |  |
| node:task-repo-default-close-out | status |  | open | 2026-11-07T23:11:58Z |  |  |
| edge:e-dec-repogmra-defaultcloseout | review |  | proposed | 2026-11-07T23:11:58Z |  |  |
| node:task-repo-default-close-out | review | proposed | accepted | 2026-11-07T23:13:00Z |  | denisurusov |
| edge:e-dec-repogmra-defaultcloseout | review | proposed | accepted | 2026-11-07T23:13:00Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review | proposed | accepted | 2026-11-07T23:13:17Z |  | denisurusov |
| waypoint:wp-adr-repo-gmra-terms | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| edge:e-mrk-gmratermsadr-gmraterms | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| edge:e-drv-cdmdata-gmratermsadr | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| edge:e-drv-finality-gmratermsadr | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| waypoint:wp-adr-repo-gmra-terms | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| edge:e-mrk-gmratermsadr-gmraterms | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| edge:e-drv-cdmdata-gmratermsadr | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| edge:e-drv-finality-gmratermsadr | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| node:task-repo-gmra-terms | status | open | resolved | 2026-11-08T00:02:30Z |  | denisurusov |
| waypoint:wp-adr-repo-purchase-repurchase | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| edge:e-mrk-repopradr-purchaserepurchase | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| edge:e-drv-cdmdata-repopradr | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| edge:e-drv-finality-repopradr | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| waypoint:wp-adr-repo-purchase-repurchase | review | proposed | accepted | 2026-11-08T01:55:28Z | 0ef54baaa98806298dc824298cef7111bd63236a | denisurusov |
| edge:e-mrk-repopradr-purchaserepurchase | review | proposed | accepted | 2026-11-08T01:55:28Z | 0ef54baaa98806298dc824298cef7111bd63236a | denisurusov |
| edge:e-drv-cdmdata-repopradr | review | proposed | accepted | 2026-11-08T01:55:28Z | 0ef54baaa98806298dc824298cef7111bd63236a | denisurusov |
| edge:e-drv-finality-repopradr | review | proposed | accepted | 2026-11-08T01:55:28Z | 0ef54baaa98806298dc824298cef7111bd63236a | denisurusov |
| node:task-repo-purchase-repurchase | status | open | resolved | 2026-11-08T01:55:28Z | 0ef54baaa98806298dc824298cef7111bd63236a | denisurusov |
| waypoint:wp-adr-repo-margin-maintenance | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-mrk-repomarginadr-marginmaint | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-drv-cdmdata-repomarginadr | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-drv-finality-repomarginadr | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-drv-callstate-repomarginadr | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| waypoint:wp-adr-repo-margin-maintenance | review | proposed | accepted | 2026-11-08T14:58:07Z | d7075ebf2ed8b09469e486de0a8c51320ad977a7 | denisurusov |
| edge:e-mrk-repomarginadr-marginmaint | review | proposed | accepted | 2026-11-08T14:58:07Z | d7075ebf2ed8b09469e486de0a8c51320ad977a7 | denisurusov |
| edge:e-drv-cdmdata-repomarginadr | review | proposed | accepted | 2026-11-08T14:58:07Z | d7075ebf2ed8b09469e486de0a8c51320ad977a7 | denisurusov |
| edge:e-drv-finality-repomarginadr | review | proposed | accepted | 2026-11-08T14:58:07Z | d7075ebf2ed8b09469e486de0a8c51320ad977a7 | denisurusov |
| edge:e-drv-callstate-repomarginadr | review | proposed | accepted | 2026-11-08T14:58:07Z | d7075ebf2ed8b09469e486de0a8c51320ad977a7 | denisurusov |
| node:task-sme-repo-margin-exposure | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-margin-exposure | status |  | open | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-live-spec-returns | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-live-spec-returns | status |  | open | 2026-11-08T14:58:07Z |  |  |
| edge:e-dec-cdmdev-smerepomargin | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| edge:e-lnk-repomargin-smerepomargin | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| edge:e-dec-cdmdev-smerepolivespec | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| edge:e-lnk-repopr-smerepolivespec | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-margin-exposure | review | proposed | accepted | 2026-11-08T15:00:04Z |  | denisurusov |
| edge:e-dec-cdmdev-smerepomargin | review | proposed | accepted | 2026-11-08T15:00:04Z |  | denisurusov |
| edge:e-lnk-repomargin-smerepomargin | review | proposed | accepted | 2026-11-08T15:00:04Z |  | denisurusov |
| node:task-sme-repo-live-spec-returns | review | proposed | accepted | 2026-11-08T15:00:21Z |  | denisurusov |
| edge:e-dec-cdmdev-smerepolivespec | review | proposed | accepted | 2026-11-08T15:00:21Z |  | denisurusov |
| edge:e-lnk-repopr-smerepolivespec | review | proposed | accepted | 2026-11-08T15:00:21Z |  | denisurusov |
| node:task-repo-margin-maintenance | status | open | resolved | 2026-11-08T15:44:59Z | c773fad4a30b82770c93c68a8eb759651dfa8c91 | denisurusov |
| waypoint:wp-adr-repo-reprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| node:task-sme-repo-reprice-rules | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| node:task-sme-repo-reprice-rules | status |  | open | 2026-11-08T15:59:51Z |  |  |
| edge:e-mrk-repricadr-reprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-drv-cdmdata-repricadr | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-drv-finality-repricadr | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-dec-cdmdev-smereprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-lnk-reprice-smereprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| waypoint:wp-adr-repo-reprice | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| node:task-sme-repo-reprice-rules | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| edge:e-mrk-repricadr-reprice | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| edge:e-drv-cdmdata-repricadr | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| edge:e-drv-finality-repricadr | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| edge:e-dec-cdmdev-smereprice | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| edge:e-lnk-reprice-smereprice | review | proposed | accepted | 2026-11-08T16:33:21Z | 5bd52142f0109a178957f308c4271992920f507b | denisurusov |
| node:task-repo-reprice | status | open | resolved | 2026-11-08T17:11:10Z | 9d4effea727b889d053d25974d6f494bb561a795 | denisurusov |
| waypoint:wp-adr-repo-adjustment | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| node:task-sme-repo-adjustment-rules | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| node:task-sme-repo-adjustment-rules | status |  | open | 2026-11-08T17:19:27Z |  |  |
| edge:e-mrk-adjadr-adjustment | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-drv-cdmdata-adjadr | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-drv-finality-adjadr | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-dec-cdmdev-smeadjust | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-lnk-adjust-smeadjust | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| waypoint:wp-adr-repo-adjustment | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| node:task-sme-repo-adjustment-rules | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| edge:e-mrk-adjadr-adjustment | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| edge:e-drv-cdmdata-adjadr | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| edge:e-drv-finality-adjadr | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| edge:e-dec-cdmdev-smeadjust | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| edge:e-lnk-adjust-smeadjust | review | proposed | accepted | 2026-11-08T19:12:04Z | 88338189d9f1b0816292679de7665394876c257d | denisurusov |
| node:task-repo-adjustment | status | open | resolved | 2026-11-08T19:31:43Z | 2d9ab942b69f6d8dfb9396efd4f943f1e23aad61 | denisurusov |
| waypoint:wp-adr-repo-substitution | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| node:task-sme-repo-substitution-rules | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| node:task-sme-repo-substitution-rules | status |  | open | 2026-11-08T19:59:37Z |  |  |
| edge:e-mrk-subadr-substitution | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-drv-cdmdata-subadr | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-drv-finality-subadr | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-dec-cdmdev-smesubst | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-lnk-subst-smesubst | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| waypoint:wp-adr-repo-substitution | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| node:task-sme-repo-substitution-rules | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| edge:e-mrk-subadr-substitution | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| edge:e-drv-cdmdata-subadr | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| edge:e-drv-finality-subadr | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| edge:e-dec-cdmdev-smesubst | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| edge:e-lnk-subst-smesubst | review | proposed | accepted | 2026-11-08T20:23:50Z | 4113e61ceb7491d830b0143708f8fc05c885b59a | denisurusov |
| node:task-repo-substitution | status | open | resolved | 2026-11-08T20:45:57Z | 18b7999491e105aa2eea878407ae6999254f1f87 | denisurusov |
| waypoint:wp-adr-repo-income | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| node:task-sme-repo-income-rules | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| node:task-sme-repo-income-rules | status |  | open | 2026-11-08T20:48:34Z |  |  |
| edge:e-mrk-incadr-income | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-drv-cdmdata-incadr | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-drv-finality-incadr | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-dec-cdmdev-smeincome | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-lnk-income-smeincome | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| waypoint:wp-adr-repo-income | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| node:task-sme-repo-income-rules | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| edge:e-mrk-incadr-income | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| edge:e-drv-cdmdata-incadr | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| edge:e-drv-finality-incadr | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| edge:e-dec-cdmdev-smeincome | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| edge:e-lnk-income-smeincome | review | proposed | accepted | 2026-11-08T21:19:44Z | 4d99f087ff103e4c3d5799b9ac5c1f98537f958d | denisurusov |
| node:task-gateway-type-check | review |  | proposed | 2026-11-08T21:19:44Z |  |  |
| node:task-gateway-type-check | status |  | open | 2026-11-08T21:19:44Z |  |  |
| edge:e-dec-cdmdev-gatewaytypecheck | review |  | proposed | 2026-11-08T21:19:44Z |  |  |
| node:task-repo-income | status | open | resolved | 2026-11-08T21:55:20Z | d89c4100ffbdd633e869dcb32468fece0f6d0cc1 | denisurusov |
| node:task-gateway-type-check | review | proposed | accepted | 2026-11-08T21:55:20Z | d89c4100ffbdd633e869dcb32468fece0f6d0cc1 | denisurusov |
| edge:e-dec-cdmdev-gatewaytypecheck | review | proposed | accepted | 2026-11-08T21:55:20Z | d89c4100ffbdd633e869dcb32468fece0f6d0cc1 | denisurusov |
