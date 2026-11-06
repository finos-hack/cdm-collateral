```yaml
id: task-sme-call-cancellation-rules
type: task
title: Confirm with a business SME the rules for cancelling a margin call
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ff7f6cec9c7bbab4c9cd9ce61785cd5393aee845
  contentHash: ff7f6cec9c7bbab4c9cd9ce61785cd5393aee845
  timestamp: 2026-11-06T20:16:20Z
  confidence: 0.75
createdAt: 2026-11-06T20:16:20Z
updatedAt: 2026-11-06T20:45:24Z
```
# Task: confirm the rules for cancelling a margin call

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-interest-daily-balances]]. The project owner chose
these rules for [[task-csa-call-cancellation]] on 2026-11-06 and called them assumptions to be checked ("We're making very brave
assumptions here"). Neither CDM 7.7.0 nor the ISDA CSA defines a margin call cancellation; ISO 20022 defines the
messages (colr.005 request, colr.006 status) but not when each is allowed. Questions for the SME:

1. **Withdrawal before a response.** Can the calling party withdraw an unanswered call alone, without the other
   party's agreement? Is there a cut-off (for example once the Notification Time has passed, or once the called party
   has started to process the call)?
2. **Cancellation after a response.** Once the call is agreed, partly agreed or disputed, does cancellation need the
   other party's acceptance? Can either party request it, or only the calling party? What happens to a request that is
   neither accepted nor refused?
3. **Proposals in progress.** Can a call be cancelled while a collateral proposal is pending, or after the proposal
   is accepted but before settlement? Is the proposal then void, or must it be rejected or withdrawn first? Does the
   answer change once settlement instructions have been sent to a custodian or settlement system?
4. **Wholly disputed calls.** Is cancellation the right way to close a call disputed in full, or is a disputed call
   closed by the dispute resolution (Paragraph 5) and a new call?
5. **Replacement calls.** Is a cancelled call usually replaced by a new call (for example a corrected amount), and
   should the new call refer to the one it replaces?
6. **Reasons.** Is a reason required for a cancellation or a refusal, and is there a standard list (ISO 20022
   colr.005 and colr.006 reason codes)?
7. **After settlement.** Is a settled call ever cancelled, or is the only way back a return call?

The answers set which states the cdm-ext cancellation steps accept and whether the prototype's flow needs a
replacement-call link or reason codes.
