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
