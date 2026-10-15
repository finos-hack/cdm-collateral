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
