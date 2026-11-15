```yaml
id: task-sme-repo-substitution-rules
type: task
title: Confirm with a business SME the rules for substituting repo securities under the GMRA
status: open
review: accepted
provenance:
  conversationId: repo-substitution
  sourceRef: ni:///sha-256;DoZH4LDhjHi9vXUENXrlFG9GGTyOc96xzZBO7Ewugqk
  timestamp: 2026-11-08T19:59:37Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 1f591034dc560e55251b72785553d524701abbf3
    contentHash: 1f591034dc560e55251b72785553d524701abbf3
createdAt: 2026-11-08T19:59:37Z
updatedAt: 2026-11-08T20:23:50Z
```
# Task: confirm the rules for substituting repo securities under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-adjustment-rules]]. The project owner chose the
design for [[task-repo-substitution]] on 2026-11-08. The details below are assumptions ([[wp-adr-repo-substitution]]).
Questions for the SME:

1. **Value.** Must the substitute's Market Value be at least that of the securities it replaces, on the substitution date,
   with quantity rounded up to whole units?
2. **Eligibility.** The prototype accepts any security with a feed price and relies on the Buyer's agreement. Does the GMRA
   or Annex I limit which securities may be substituted?
3. **Scope.** The prototype replaces all the securities of one repo. Is a partial substitution in scope?
4. **Accrual.** The prototype moves no cash and keeps the Repurchase Price. Is that correct under paragraph 8?
5. **Refusal.** May the Buyer refuse without a reason?
6. **Margin after the substitution.** A rounded-up substitute may leave a small excess with the Buyer, and later price moves
   follow the new security. Is any margin step required at the substitution?
