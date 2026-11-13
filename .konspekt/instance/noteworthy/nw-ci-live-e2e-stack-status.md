```yaml
id: nw-ci-live-e2e-stack-status
kind: fact
review: accepted
provenance:
  conversationId: ci-live-e2e-stack
  sourceRef: 16306102ad473abb9b5140f1c2af6e9b8fc40aca
  contentHash: 16306102ad473abb9b5140f1c2af6e9b8fc40aca
  timestamp: 2026-10-30T02:12:11Z
  confidence: 0.9
createdAt: 2026-10-27T01:19:47Z
updatedAt: 2026-10-30T02:19:00Z
```
# CI live e2e stack: local verification status and next steps

Session checkpoint for [[task-ci-live-e2e-stack]]. Since [[wp-adr-live-stack-local-ui-driven]] (proposed
2026-10-30), the live stack runs on the engineer's machine via `scripts/live-e2e.sh up` and the collateral flow is
driven by hand through the console UI; it is not automated for now. The CI workflow `.github/workflows/e2e-live-stack.yml`
was re-scoped in commit `e7f4e27` to build → deploy → start → health-check by calling the same script (no Playwright,
no `test:e2e`, no teardown). The workflow has **never run**: it is not on the default branch (so `workflow_dispatch`
is unavailable), and no PR `e2e-wiring → main` has been opened to fire the `pull_request` trigger. On a GitHub-hosted
runner the job's machine is discarded at job end, so the job can only verify that the stack assembles and starts.

The sections below record the 2026-10-29 runbook run and the live-spec fix, which came before the decision; the
Playwright live specs stay for local runs.

## Runbook sections 1–4 verified on native Windows (2026-10-29, Windows 11 + Docker Desktop, JDK 25, Node 24)

Ran [[artifact-e2e-runbook]] (`../../../docs/setup/runbook-e2e.md`) against the prebuilt artifacts on disk (`besu/networkFiles`,
`contracts/deployments/besu.json` from the Oct 24 deploy, `services/collateral/target/collateral-service.jar`). Started
the Docker engine (Docker Desktop was stopped); the four Besu containers resumed with the persisted chain (peers `0x3`,
four validators, 2 s blocks). Skipped the contract redeploy because the chain persisted and `besu.json` is still valid
against it (a redeploy would overwrite `besu.json` and orphan the stored documents). `orchestrate.mjs` brought up store
(8300, 127 docs), gateways bank-a (8201) / bank-b (8202), services A (8001) / B (8002) and the console (5173); all five
health checks green, no child exits.

## Live specs: the 30 s per-test cap failed both flows, now fixed

First `E2E_REQUIRE_STACK=1 npm run test:e2e -- e2e/live.spec.ts` run: **both the IM and VM live flows failed** at the
final `settled on-chain ✓` assertion, each hitting the 30 s per-test `timeout` (`console/playwright.config.ts`). The
service API showed the two outcomes differed:

- **IM** (`USD 1,700,000`): on-chain `state: settled` — the backend settled; only the Playwright UI window timed out.
- **VM** (`USD 8,100,000`): on-chain `state: agreed` — the `Transfer title` settlement step did not complete before
  the 30 s cap (the captured page snapshot still showed the `Transfer title` button). This differs from the earlier
  2026-10-26 run where VM passed; the cold-started chain and larger stored-doc set (127 vs 118) raised per-step latency
  enough that the full VM flow also exceeded 30 s.

Root cause: each live flow chains about six on-chain writes (2 s QBFT blocks) plus SSE propagation (Besu ws → gateway →
service → console), a total above the 30 s per-test cap. The per-step `toBeVisible({timeout: 15_000})` windows sit under
that cap, so the whole flow runs out of budget before the final settlement step renders.

## Fix applied — `console/e2e/live.spec.ts` (commit `7d49e20`)

1. `test.setTimeout(180_000)` per live test (the config default stays 30 s, so the mock scenario specs are unchanged).
2. Per-step windows raised to 30 s via a `STEP_TIMEOUT` constant (replaced the `15_000` windows).
3. `waitForSettledOnChain(kind, amountUsd)` polls each party's `/api/v1/state` until the matching call reports
   `settled` **before** the console `settled on-chain ✓` assertion, so SSE lag to an open page cannot fail the test
   after the backend has settled.
4. Per-run call amount widened from 90 to 9000 distinct values (`(Date.now() % 9000) * 1_000`) so the label does not
   match a leftover call on the persistent chain.

Re-run after the fix: **both flows pass** — IM 33.5 s, VM 31.2 s. Both exceed the old 30 s cap, confirming the cap was
the failing condition for both. `tsc --noEmit` reported no type errors.

## Local bring-up script and CI re-scope (2026-10-30)

- `scripts/live-e2e.sh` (`up` | `down` | `reset` | `status`, commit `e7f4e27`). Verified on Windows 11 (Git Bash,
  Docker Desktop): `up` from stopped Besu passed all five health checks and console 200; the stack outlived the
  script; a second `up` over a running stack replaced every listening process (new PIDs on all six ports, old ones
  gone, no port conflicts); `down` freed all ports and stopped the four containers. `reset` was not run (it deletes
  the chain). The first `up` exited 52 (curl empty reply while Besu was starting); the poll was fixed to retry.
- `*.sh text eol=lf` in `.gitattributes` (commit `3caa6f5`): with `core.autocrlf=true`, a Windows checkout wrote CRLF
  into shell scripts, which bash rejects.
- `.devcontainer/devcontainer.json` forwards 8001/8002 (commit `d4b0fcb`, [[task-devcontainer-live-stack]]).

## Resolution (2026-10-30)

The project owner resolved [[task-ci-live-e2e-stack]] on 2026-10-30 under [[wp-adr-live-stack-local-ui-driven]]
instead of retitling it. Its node text ("run the live e2e flows in CI") records the original goal; the ADR records
the scope it was resolved under (CI builds, deploys and health-checks; the flow is driven by hand). The re-scoped
workflow had not run when the task was resolved.

## Next session (resume here)

Deferred by the project owner on 2026-10-30:

1. Run `e2e-live-stack.yml` once (PR `e2e-wiring → main`, or after merge via `workflow_dispatch`) to confirm the
   re-scoped job builds, deploys and passes the health checks on `ubuntu-latest`. It has never run.
2. Add `scripts/live-e2e.sh` to the runbook ([[artifact-e2e-runbook]]) and update its §10 verification status.
3. Open the devcontainer, run `scripts/live-e2e.sh up` and drive one flow in the browser to verify the 8001/8002
   forwarding ([[task-devcontainer-live-stack]]; its other gaps — backend start-up wiring, Codespaces
   `VITE_SERVICE_*_URL` — remain open there).
4. Push `e2e-wiring` (not pushed; the session's commits start at `7d49e20`).
5. Accept or revise `nw-ci-live-stack-steps` and its edge `e-note-cilivestack-steps`, proposed on 2026-10-25 and
   still `review: proposed`.

The stack is stopped (runbook section 7): no stack process running, four Besu containers stopped with the chain kept on
disk. The Docker Desktop engine was left running.
