```yaml
id: artifact-react-console
name: React party console
kind: application
location: console/
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM
  timestamp: 2026-10-16T23:17:11Z
  confidence: 0.75
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 91117ab560e058b945bc3eb3e35fa977f99a88b3
    contentHash: 91117ab560e058b945bc3eb3e35fa977f99a88b3
createdAt: 2026-10-16T23:17:11Z
updatedAt: 2026-10-16T23:17:11Z
```
# React party console

React 18 + TypeScript + Vite app (`console/`), built from the approved HTML prototype. Mocked state: a pure rule
engine (`src/domain/engine.ts`) stands in for the margin call contract, collateral control contract, oracle feed and
title transfer until the console is wired to the services. Scenario grid with CDM coverage badges; guided mode (same
seven scenarios); free mode (act as any party; contract rejections shown with their reason). Scenarios are data files
that drive the Vitest click-throughs and the Playwright end-to-end tests. Dev container installs it and forwards
port 5173; CI in `.github/workflows/console.yml`.

Verified locally (source `a07fe6c81ec06e579f83c4fabf7d7898504c24c0`): typecheck clean; Vitest 43 tests passed (engine rules, scenario outcomes, component
click-throughs); production build; Playwright 9 tests passed against the build (all guided scenarios, free-mode
enforcement rejection, no horizontal scroll at 400 px); clean `npm ci` from the lockfile. Single-file build
published at https://claude.ai/artifact/7r6H7esz2m5wvK5umoXsoF.
