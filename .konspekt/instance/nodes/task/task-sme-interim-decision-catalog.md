```yaml
id: task-sme-interim-decision-catalog
type: task
title: Catalog the decisions made while waiting for SMEs
status: resolved
review: accepted
provenance:
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T01:58:15Z
  confidence: 0.8
createdAt: 2026-11-22T01:58:15Z
updatedAt: 2026-11-22T03:03:17Z
```
# Task: catalog the decisions made while waiting for SMEs

Under [[goal-cdm-development]]. The project owner asked (2026-11-21) for a catalog of the decisions made while waiting
for SMEs, as a column in the SME question ledger. `docs/analysis/sme-question-ledger.md` gains an **Interim
decision** column: what the prototype does for each of the 229 questions until the SME answers, taken from the
question's task node. `docs/sme-questions.html` shows it (`build_site.mjs`).

27 questions have no recorded interim behaviour (`none recorded`): CAN-1 to CAN-7, NET-1 to NET-3, NET-5, REC-2 to
REC-5, RPR-5, RAD-5, SUB-5, INC-5, TPT-1, and REG-6 to REG-10 and PROV-1, PROV-2 (gaps G40 and G41, not modelled yet). The CAN node says the project owner chose rules on 2026-11-06 but does not
state them.

Maintenance: a task that adds a question or changes the prototype's behaviour for one updates its Interim decision in
the same commit.
