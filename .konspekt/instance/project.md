```yaml
id: project-cdm-collateral
goal: >-
  <one-line goal>
summary:
  origin: human
  pinned: false
  updatedAt: 2026-10-14T23:04:53Z
personas: [engineer]
binding: required
basis: proposed
store:
  kind: git
  ref: main
  resolve:
    source: https://github.com/denisurusov/cdm-collateral/blob/{ref}/.konspekt/instance/sources/sha-256/{hex}.md
    command: https://github.com/denisurusov/cdm-collateral/blob/{ref}/.konspekt/instance/commands/sha-256/{hex}.md
    entity: https://github.com/denisurusov/cdm-collateral/blob/{ref}/.konspekt/instance/{path}
    edges: https://github.com/denisurusov/cdm-collateral/blob/{ref}/.konspekt/instance/edges/edges.md
    checkpoints: https://github.com/denisurusov/cdm-collateral/blob/{ref}/.konspekt/instance/checkpoints/checkpoints.md
locators:
  allow: []
createdAt: 2026-10-14T23:04:53Z
updatedAt: 2026-10-14T23:04:53Z
```
# CDM Collateral

Seed summary — replace this with a short description of the project's current
state. The maintainer composes the project summary from node summaries; pin it
(`pin project-cdm-collateral`) once you want it human-owned.

Index: `nodes/`, `concepts/`, `noteworthy/`, `artifacts/`, `waypoints/`,
`edges/`.
