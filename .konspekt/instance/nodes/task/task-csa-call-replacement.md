```yaml
id: task-csa-call-replacement
type: task
title: Link a corrected margin call to the cancelled call it replaces
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;SuiyITiE0Li7TjUZZqfg2s2IOVKlx8iX_AU6JBC54yE
  timestamp: 2026-11-06T21:44:40Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 0ca6129cd3db0942293f5dfb317e913ab0b7eb71
    contentHash: 0ca6129cd3db0942293f5dfb317e913ab0b7eb71
createdAt: 2026-11-06T21:44:40Z
updatedAt: 2026-11-06T21:53:01Z
```
# Task: link a corrected margin call to the cancelled call it replaces

Follow-up to [[task-csa-call-cancellation]], row 5 of section B of the workflow map. The project owner asked why a
corrected call had no link to the call it replaces, and chose (2026-11-06, source `0ca6129cd3db0942293f5dfb317e913ab0b7eb71`: "(b) it is") to add the link
in a separate small PR after PR #28. CDM 7.7.0 has no field for it (`MarginCallIssuance` has no "replaces"; only the
generic `WorkflowStep.previousWorkflowStep`), so the CDM side goes in `cdm-ext`, then the prototype flow
`flow-call-replacement`. The rules are assumptions awaiting [[task-sme-call-cancellation-rules]] (question 5).

## Progress 2026-11-06T21:50:38Z

Built on branch `call-replacement`: cdm-ext `IssueCallInstruction.replacesCall` and `ReplacementAllowed` (commit
`dce4688`, `ReplacementTest` 6 tests) and `flow-call-replacement` (commit `1de903f`): `MarginCall.issueReplacementCall`,
gateway route and links, the service check (`CdmReplacementTest`, 2 tests), the console action (2 unit tests), the CALM
flow, docs and task map row 5. Contract tests 44/44, cdm-ext 175/175, service 23/23, console 70/70, live specs 12/12
on a new contract set on the same chain (earlier set kept as `besu.pre-replacement.json`). Design choices are proposed
in [[wp-adr-replacement-call-link]].

## Resolved 2026-11-06T21:53:01Z

Accepted and resolved by the project owner (2026-11-06: "1. yes 2. yes 3. yes"), with [[wp-adr-replacement-call-link]] accepted in the
same decision. Pushed on branch `call-replacement` for review. The rules still await
[[task-sme-call-cancellation-rules]] (question 5).
