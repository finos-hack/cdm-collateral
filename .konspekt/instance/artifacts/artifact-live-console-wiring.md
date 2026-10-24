```yaml
id: artifact-live-console-wiring
name: Live console wiring
kind: code
location: console/src/components/LiveConsole.tsx
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: 24bd077f551581c621a2d292b02f359e99aa3f75
  contentHash: 24bd077f551581c621a2d292b02f359e99aa3f75
  timestamp: 2026-10-24T20:12:31Z
  confidence: 0.75
createdAt: 2026-10-24T20:12:31Z
updatedAt: 2026-10-24T21:10:54Z
```
# Live console wiring

Live mode added to the React party console (`console/src/components/LiveConsole.tsx`,
`console/src/domain/liveApi.ts`, route `#/live/A` and `#/live/B` in `src/App.tsx`). Realizes the architecture
`console-to-service` connection: each live console calls its own participant's collateral workflow service `/api/v1`,
polls on-chain call / proposal / balance state, and offers the lifecycle actions for its role (secured party issues
and decides; pledgor agrees, proposes and pledges). The existing in-browser mock engine (`src/domain/engine.ts`) and
the scenario grid are unchanged; live mode is an added surface.

This span belongs to `task-react-console` (the `task-e2e-wiring` text leaves console wiring there). Verified locally
(source `24bd077f551581c621a2d292b02f359e99aa3f75`): the console type-checks and builds; the Playwright live test
drives the full cycle through both consoles against the running stack.
