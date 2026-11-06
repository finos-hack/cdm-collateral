```yaml
id: wp-adr-ci-runs-live-specs
kind: decision
timestamp: 2026-11-03T17:05:51Z
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: db38e95ee8c10dee9650ada2a61e3c4905116a3a
  contentHash: db38e95ee8c10dee9650ada2a61e3c4905116a3a
  timestamp: 2026-11-03T17:05:51Z
createdAt: 2026-11-03T17:05:51Z
updatedAt: 2026-11-06T21:48:08Z
```
# ADR: CI runs the Playwright live specs for every CALM flow against the live stack

After `scripts/live-e2e.sh up`, the `e2e-live-stack.yml` job installs Playwright Chromium with its system libraries.
It then runs `scripts/live-e2e.sh check`, which runs every spec in `console/e2e/live.spec.ts` with
`E2E_REQUIRE_STACK=1`. The specs cover:
- `flow-im-margin-call-pledge`;
- `flow-vm-margin-call-transfer`;
- `flow-return`;
- `flow-default-enforcement`;
- `flow-oracle-update`;
- `flow-revaluation-top-up`.

On failure, the job uploads `console/test-results/` as an artifact.

This supersedes the CI part of [[wp-adr-live-stack-local-ui-driven]]: CI now checks the flows end to end, not only
that the stack starts healthy. The local part of that ADR stands. The engineer brings the stack up on their own
machine and drives the flows by hand in the console, or with the same specs.

**Context.** [[task-e2e-remaining-flows]] is done when `e2e-live-stack.yml` passes with all the flow specs running.
That ADR's consequences left the specs to "return to CI later". Since then the specs have their own timeouts. On a
fresh chain all six pass locally, and the runner chain is always fresh.

**Consequences.**
- A pull request that touches the stack paths runs the full flow set: about 3–4 minutes more on top of the bring-up.
- A spec failure fails the job.
- The intermittent failures seen locally can now fail CI: the stale nonce on gateway B and the deploy RPC error
  (`docs/runbook-e2e.md` §10). Pledgor balance depletion does not occur on a fresh chain.

Accepted by the project owner on 2026-11-03 ("Run specs in CI", the recommended option).
