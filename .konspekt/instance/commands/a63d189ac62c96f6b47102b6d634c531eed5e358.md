cd console && npx tsc --noEmit -p . && npm run build && npx vitest run && npx playwright test e2e/scenarios.spec.ts
