```yaml
id: task-repo-default-close-out
type: task
title: Repo default and close-out under GMRA paragraph 10
status: open
review: proposed
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 098fab36b2d91ff22a659917fbb8c77ca7aa4108
  contentHash: 098fab36b2d91ff22a659917fbb8c77ca7aa4108
  timestamp: 2026-11-07T23:11:58Z
  confidence: 0.8
createdAt: 2026-11-07T23:11:58Z
updatedAt: 2026-11-07T23:11:58Z
```

# Task: repo default and close-out under GMRA paragraph 10

Row 11 of the repo workflows (section C of the workflow map), added to [[task-repo-gmra-workflows]] by the project
owner on 2026-11-07 (source `098fab36b2d91ff22a659917fbb8c77ca7aa4108`: "3. 11th task"), after the ten workflows of [[wp-adr-repo-gmra-scope]].

- **CDM status:** absent (R20 default and R23 close-out, score 0).
- **Scope:** GMRA paragraph 10: an Event of Default; the Repurchase Date of every repo accelerated; the Default Market
  Value of the securities and cash each party owes under the default valuation terms; the amounts netted to one
  balance payable by one party.
- **`cdm-ext`:** the GMRA close-out calculation over the terms of [[task-repo-gmra-terms]], alongside the ISDA 2002
  Section 6(e) close-out in `cdmx.collateral.closeout`.
- **Prototype:** default notices through `services/oracle` as in `flow-default-enforcement`; the net balance settled
  on-chain; a live spec.

The details are decided when the task starts.
