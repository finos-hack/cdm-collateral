```yaml
id: task-gateway-type-check
type: task
title: Type-check the gateway in CI
status: resolved
review: accepted
provenance:
  conversationId: repo-income
  sourceRef: ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0
  timestamp: 2026-11-08T21:19:44Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 4d99f087ff103e4c3d5799b9ac5c1f98537f958d
    contentHash: 4d99f087ff103e4c3d5799b9ac5c1f98537f958d
createdAt: 2026-11-08T21:19:44Z
updatedAt: 2026-11-08T23:13:16Z
```
# Task: type-check the gateway in CI

Under [[goal-cdm-development]]. `npx tsc` is not available in `gateway`, so its TypeScript is checked only when it runs. During
[[task-repo-income]] a missing import of `RepoPhase` in `gateway/src/server.ts` reached a live run. Add a type check of
`gateway` to CI, in a separate small PR. The project owner agreed on 2026-11-08 (source `4d99f087ff103e4c3d5799b9ac5c1f98537f958d`).
