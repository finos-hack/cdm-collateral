```yaml
id: nw-repo-shared-with-cdm-maintainers
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;rEWviG1MQtrLwSW7xJTSd1Za2xTwNfR5EM6zI6X-HHc
  timestamp: 2026-10-17T17:07:57Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 303fc10a2ccd0ad628d55390871ed811a9c34a5c
    contentHash: 303fc10a2ccd0ad628d55390871ed811a9c34a5c
createdAt: 2026-10-17T17:07:57Z
updatedAt: 2026-10-17T17:07:57Z
```
# Decision: share the repository with the CDM Python maintainers; aim to become a FINOS project

The maintainers of the CDM Python stack (generator, `rune.runtime`, `finos-cdm`) are collaborators on this private
repository, and the project owner contacts them about defects D14 and D15 and gap G39, naming the extension and the
prototype. They are FINOS members. The repository is intended to become a FINOS project. Extensions stay local
(`wp-adr-cdm-local-extensions`); the maintainer still files nothing with FINOS itself.
