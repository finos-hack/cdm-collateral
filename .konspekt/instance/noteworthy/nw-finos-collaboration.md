```yaml
id: nw-finos-collaboration
kind: statement
createdAt: 2026-10-24T00:00:00Z
updatedAt: 2026-10-24T00:00:00Z
review: accepted
provenance:
  sourceRef: 9f8c9a1ebde86329599e8abb73549d3bb31d60dc
  contentHash: 9f8c9a1ebde86329599e8abb73549d3bb31d60dc
  conversationId: spec-writer-2026-10-24
  timestamp: 2026-10-24T14:28:19.786Z
  confidence: 0.6
```
# Statement: the project is carried out in collaboration with FINOS

Stated by the project owner on 2026-10-24: "this entire project is done in collaboration with FINOS". This extends
`nw-repo-shared-with-cdm-maintainers` (CDM Python stack maintainers, FINOS members, are collaborators on the
repository; the repository is intended to become a FINOS project) from a set of collaborators to the whole project.

Consequence for `docs/analysis/business-case.md`: findings and defects reach FINOS CDM through the collaboration, and
FINOS CDM is listed as a collaborator audience. It conflicts with the wording of the accepted ADR
`wp-adr-cdm-local-extensions` ("Nothing is proposed or reported to FINOS"); whether that ADR is amended or superseded
is not decided. The statement does not by itself change where `cdm-ext` is maintained.
