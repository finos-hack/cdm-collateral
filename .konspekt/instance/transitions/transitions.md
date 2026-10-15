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
