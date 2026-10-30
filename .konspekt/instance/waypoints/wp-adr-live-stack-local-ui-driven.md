```yaml
id: wp-adr-live-stack-local-ui-driven
kind: decision
subtype: adr
timestamp: 2026-10-30T02:12:11Z
review: proposed
provenance:
  conversationId: ci-live-e2e-stack
  sourceRef: f5a054bbe2cdd235c112e58fb2c8a77ca4523ee2
  contentHash: f5a054bbe2cdd235c112e58fb2c8a77ca4523ee2
  timestamp: 2026-10-30T02:12:11Z
  confidence: 0.85
createdAt: 2026-10-30T02:12:11Z
updatedAt: 2026-10-30T02:12:11Z
```
# ADR: The live e2e stack runs on the engineer's machine; the collateral flow is driven from the console UI

The live end-to-end stack (four-node Besu network, deployed contracts, CDM payload store, two ledger gateways, two
collateral services, console) is brought up on the engineer's own machine with one command,
`scripts/live-e2e.sh up`, and left running. Running it again stops the previous stack and starts a new one
(stop-and-replace); `scripts/live-e2e.sh down` stops it and keeps the chain on disk. For now the engineer drives the
collateral flow (issue → agree → propose → accept → pledge or transfer title, i.e. post and pay) by hand through the
console UI, as with the clickable mock (`artifact-clickable-ui-html`); it is not automated. CI
(`.github/workflows/e2e-live-stack.yml`) builds, deploys, starts and health-checks the stack through the same script
and does not run the flow. A browser-clickable stack in the devcontainer and Codespaces is deferred to
`task-devcontainer-live-stack`.

**Context.** A GitHub-hosted runner discards its machine when the job ends and accepts no inbound connections, so a
CI job cannot leave a stack running for a person to click. The Playwright live specs (`console/e2e/live.spec.ts`)
failed at the 30 s per-test limit and needed timing changes to pass (commit `7d49e20`). The project owner decided on
2026-10-29: the stack is set up locally on the engineer's machine, a re-run stops and replaces the previous stack, CI
builds, deploys and health-checks and keeps the stack running for the rest of the job, and Codespaces comes later as
its own task. The local devcontainer (`docker-in-docker`) runs the same script. This decision sets where the live
stack runs for now; it does not replace `wp-adr-cloud-dev-environment`.

**Consequences.** CI no longer checks the collateral flow end to end, only that the stack builds, deploys and starts
healthy on a clean machine. The Playwright live specs stay for local runs and can return to CI later. The local stack
keeps the persistent chain across runs (`reset` deletes it), so calls from earlier runs remain visible. An engineer
needs Docker, Node 22+, a JDK and the one-time build (`docs/runbook-e2e.md` sections 2 and 3).
