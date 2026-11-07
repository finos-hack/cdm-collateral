```yaml
id: task-sme-settlement-netting-rules
type: task
title: Confirm with a business SME the rules for settlement netting of collateral movements
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 4152e4ee345e631416a4e46366cf621cd0cbb40c
  contentHash: 4152e4ee345e631416a4e46366cf621cd0cbb40c
  timestamp: 2026-11-07T04:24:56Z
  confidence: 0.6
createdAt: 2026-11-07T04:24:56Z
updatedAt: 2026-11-07T04:24:56Z
```
# Task: confirm the rules for settlement netting of collateral movements

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-call-cancellation-rules]] and
[[task-sme-interest-daily-balances]]. The project owner chose the scope for [[task-csa-settlement-netting]] on 2026-11-06; the details
below are the maintainer's assumptions ([[wp-adr-settlement-netting-scope]]). Questions for the SME:

1. **Delivery and return on one day.** Under one CSA a Valuation Date gives a Delivery Amount or a Return Amount, not
   both. When do a VM delivery and a VM return between the same parties fall due on the same day (two calls from
   different Valuation Dates, a call in each direction), and should they net?
2. **Interest.** Does `netInterestWithMarginCalls` cover netting an Interest Amount with a delivery and with a return?
   Does netting Interest Amounts with each other (`netPostedAndHeldInterest`) belong in the same netting?
3. **Who settles.** Is it enough that the party owing the net pays it, or do both parties first agree a netting
   statement (as in payment netting under ISDA Master Agreement Section 2(c))?
4. **Securities.** Only cash nets here. Do deliveries and returns of the same security net in practice?
5. **Day and cut-off.** Which settlement date and cut-off define the movements that net together?
6. **Initial margin.** Confirm that initial margin, segregated with a custodian, never nets with variation margin or
   interest.
