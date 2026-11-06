## Maintainer

Open items:
1. Who can cancel, and when? (a) The calling party withdraws the call alone while it is still unanswered. After a response, cancelling needs a request and the other party's acceptance (colr.005/006). (b) Always by request and acceptance, at any point before settlement. (c) Withdrawal only, while unanswered.
2. Calls with a proposal in progress. If a call has a proposed or accepted proposal that has not settled: (a) Cancelling is allowed and the proposal is voided. (b) Cancelling is not allowed once a proposal is accepted.
3. CDM side. (a) Extend the cdm-ext margin-call model with a Cancelled status and cancellation steps (request, and accept or refuse), plus a MarginCallCancelled qualifier. (b) Use CDM's generic WorkflowStep cancel pointing at the issuing step, and have cdm-ext add only the Cancelled status.
4. Wholly disputed calls. Should these also be cancellable, which would give them a way to close? Yes or no.

## User

1. a 2. a 3. a 4. yes - make sure we log all of this into SME backlog. We're making very brave assumptions here
