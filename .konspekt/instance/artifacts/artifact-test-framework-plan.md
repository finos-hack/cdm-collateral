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
updatedAt: 2026-10-16T20:43:52Z
```
# Test framework plan

Test layers (contract unit and property tests, Python unit and API tests, gateway unit and integration against a Besu
container, service contract tests, UI component tests, Playwright end-to-end with N party consoles, CALM validation),
end-to-end scenarios per CALM flow, and a traceability table from each accepted ASR and ADR to a test. Plan only.
