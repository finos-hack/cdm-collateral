```yaml
id: artifact-test-framework-plan
name: Test framework plan
kind: document
location: architecture/testing.md
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 9ae499a1f078db987641f81be32f5a995ed8f218
  contentHash: 9ae499a1f078db987641f81be32f5a995ed8f218
  timestamp: 2026-10-16T20:21:13Z
  confidence: 0.75
createdAt: 2026-10-16T20:21:13Z
updatedAt: 2026-10-18T01:27:28Z
```
# Test framework plan

Test layers (contract unit and property tests, Python unit and API tests, gateway unit and integration against a Besu
container, service contract tests, UI component tests, Playwright end-to-end with N party consoles, CALM validation),
end-to-end scenarios per CALM flow, and a traceability table from each accepted ASR and ADR to a test. Plan only.

Revised 2026-10-16T21:36:47Z (source `70532bbf71d41c99c9efad27c0e9ed009891292a`): margin call contract tests and invariants; traceability rows for
`concept-asr-onchain-call-state` and `wp-adr-margin-call-state-onchain`.

Revised 2026-10-16T22:15:03Z (source `030d173b1a7f835b860f9cca1cb4d482d59f360d`): proposal rejection and acceptance scenarios and contract tests.

Revised 2026-10-18T01:27:28Z (source `6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630`): service unit and API tests in JUnit 5 (`javalin-testtools`, jqwik and JaCoCo as assumptions) instead of pytest (`wp-adr-java-cdm-stack`).
