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
| node:node-app-setup | review |  | accepted | 2026-10-15T00:18:11Z | df5298515334f4f37dc86dfd54b8e0805558203b |  |
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
