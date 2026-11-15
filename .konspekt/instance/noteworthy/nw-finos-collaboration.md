```yaml
id: nw-finos-collaboration
kind: statement
createdAt: 2026-10-24T00:00:00Z
updatedAt: 2026-10-24T14:54:16Z
review: accepted
provenance:
  sourceRef: ni:///sha-256;zSo_obkmH_WlTo1ceb7X_gpAqLWPwU7qDSl3K6Gc13Q
  conversationId: spec-writer-2026-10-24
  timestamp: 2026-10-24T14:28:19.786Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 9f8c9a1ebde86329599e8abb73549d3bb31d60dc
    contentHash: 9f8c9a1ebde86329599e8abb73549d3bb31d60dc
```
# Statement: the project is carried out in collaboration with FINOS

Stated by the project owner on 2026-10-24: "this entire project is done in collaboration with FINOS". This extends
`nw-repo-shared-with-cdm-maintainers` (CDM Python stack maintainers, FINOS members, are collaborators on the
repository; the repository is intended to become a FINOS project) from a set of collaborators to the whole project.

Consequence for `docs/analysis/business-case.md`: findings and defects reach FINOS CDM through the collaboration, and
FINOS CDM is listed as a collaborator audience. The wording of the accepted ADR `wp-adr-cdm-local-extensions`
("Nothing is proposed or reported to FINOS") was amended on 2026-10-24 to record this: findings and defects reach
FINOS through the collaboration, while the project formally sits outside FINOS governance for now. The statement does
not by itself change where `cdm-ext` is maintained.
