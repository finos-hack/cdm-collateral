```yaml
id: artifact-e2e-live-harness
name: Live end-to-end harness
kind: code
location: console/e2e/live.spec.ts
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: ni:///sha-256;JSEksj1FDFsJXCHBJMaVy5nn08H1Zgw6sEftIyRItKk
  timestamp: 2026-10-24T20:12:31Z
  confidence: 0.75
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 24bd077f551581c621a2d292b02f359e99aa3f75
    contentHash: 24bd077f551581c621a2d292b02f359e99aa3f75
createdAt: 2026-10-24T20:12:31Z
updatedAt: 2026-10-24T21:10:54Z
```
# Live end-to-end harness

Playwright live test (`console/e2e/live.spec.ts`) and the stack orchestration script (`orchestrate.mjs`). The test
drives `flow-im-margin-call-pledge` through both wired consoles against the running stack (collateral services →
ledger gateways → Besu): secured party issues, pledgor agrees and proposes, secured party accepts, pledgor pledges,
and both consoles show the call settled on-chain. It is the live counterpart of the architecture `e2e-test-harness`
node; unlike the mock scenario specs it requires the backend stack up, which `orchestrate.mjs` brings up (two
gateways, two services, the console dev server).

First-cycle scope: one flow, two participants, happy path. Verified locally (source
`24bd077f551581c621a2d292b02f359e99aa3f75`): the test passes against the running stack.
