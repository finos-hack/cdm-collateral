```yaml
id: task-collateral-service-unit-tests
type: task
title: Add unit tests to the collateral service (services/collateral)
status: open
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 6ffb4961a1429b5c0e5559ecd5f9decc0c2a1086
  contentHash: 6ffb4961a1429b5c0e5559ecd5f9decc0c2a1086
  timestamp: 2026-11-03T14:01:12Z
  confidence: 0.8
createdAt: 2026-11-03T14:01:12Z
updatedAt: 2026-11-03T14:01:12Z
```
# Task: add unit tests to the collateral service

Found on 2026-11-03 while running the unit tests for [[task-e2e-remaining-flows]]: `mvn test` in
`services/collateral` reports BUILD SUCCESS with "No tests to run". The module has no `src/test` directory, so its
eight classes in `src/main/java/collateral/` (about 1,200 lines, including `App`, `CdmFold`, `Gateway` and
`Store`) are exercised only by the live Playwright specs. The project owner asked for this task.

`services/oracle` is the in-repo pattern to follow: JUnit 5 (`junit-jupiter` in its `pom.xml`) and
`AppTest.java` running the Javalin app against a stub gateway.

Done when `services/collateral` has JUnit tests that `mvn test` runs and passes, covering at least the HTTP
endpoints in `App` against a stub gateway and payload store, and the CDM folding in `CdmFold`.
