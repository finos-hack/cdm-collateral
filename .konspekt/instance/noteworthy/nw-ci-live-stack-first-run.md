```yaml
id: nw-ci-live-stack-first-run
kind: fact
review: accepted
provenance:
  conversationId: ci-live-e2e-stack
  sourceRef: ni:///sha-256;mEQNpHMB_4Efh1cqODqw0k12MIVzZ-WzUdHoqYMw85A
  timestamp: 2026-10-31T23:50:39Z
  confidence: 0.95
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: a5702a6802c46733ed2fb65f2c0a95b8c5b28b0c
    contentHash: a5702a6802c46733ed2fb65f2c0a95b8c5b28b0c
createdAt: 2026-10-31T23:50:39Z
updatedAt: 2026-11-15T16:25:13Z
```
# CI live stack: first run of the re-scoped workflow passed

The re-scoped `e2e-live-stack.yml` (commit `e7f4e27`, build → deploy → start → health-check via
`scripts/live-e2e.sh up`, [[wp-adr-live-stack-local-ui-driven]]) ran for the first time on 2026-10-31 and passed:
run `41253964256` (https://github.com/finos-hack/cdm-collateral/actions/runs/41253964256), `pull_request` trigger on
PR #8 (`e2e-wiring → main`), head `2307781`, `ubuntu-latest`, 23:47:12Z → 23:50:39Z (about 3.5 min). The run was
triggered by pushing `e2e-wiring` (`5853dd9..2307781`).

Every step concluded `success`. The `live-e2e.sh up` step deployed the contracts on a fresh chain and reported all
health checks green: store 8300 (`count: 0`), gateways bank-a 8201 / bank-b 8202, services A 8001 (Pledgor) /
B 8002 (Secured Party), console 5173 `HTTP 200`. `live-e2e.sh status` repeated the same results.

Correction to [[nw-ci-live-e2e-stack-status]]: it states that no PR `e2e-wiring → main` had been opened. PR #8 has
been open since 2026-10-25, and `gh run list` shows five runs of the earlier workflow version on it (2026-10-25 to
2026-10-26; four `success`, one `failure`, run `40221005189`). The accurate statement is that the re-scoped version
had never run, because commit `e7f4e27` was not pushed. Next-session item 1 of that note is done by this run; item 4
(push `e2e-wiring`) is done by the push above.
