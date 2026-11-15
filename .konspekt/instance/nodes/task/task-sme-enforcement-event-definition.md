```yaml
id: task-sme-enforcement-event-definition
type: task
title: Confirm with a business SME what an Enforcement Event is under the IM Security Agreement
status: open
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;Gb4QAEcv7DyAP0gcu7znukNqBvFVsy-sTschc8JOE5w
  timestamp: 2026-11-03T23:55:33Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 674efc0066984797811930c097b69847c345e30e
    contentHash: 674efc0066984797811930c097b69847c345e30e
createdAt: 2026-11-03T23:55:33Z
updatedAt: 2026-11-04T00:10:23Z
```
# Task: confirm the Enforcement Event definition

Under [[goal-cdm-development]]. G14 ([[task-cdm-gap-closure]]) decides when the secured party may enforce against
segregated initial margin from CDM's `SecurityAgreementElections -> enforcementEvent`, which has two booleans,
`earlyTerminationDate` and `failureToPay`, and no definition. The reading in `EnforcementEventOccurred`
([[nw-enforcement-event-by-election]]) is kept for now (the project owner, 2026-11-03). Questions for the SME, against
the Security Agreement text (for example the ISDA 2016 Phase One Euroclear or Clearstream security agreements):

1. With no elections, is the Enforcement Event an Early Termination Date reached, or does a continuing Event of
   Default suffice?
2. What does `earlyTerminationDate = False` remove: the trigger, or a distinction between designated and deemed Early
   Termination Dates?
3. Does `failureToPay` mean the ISDA MA Section 5(a)(i) Event of Default from the notice, a failure under the security
   agreement itself, or something with its own grace period?
4. Under Automatic Early Termination no notice is given; the model's `DefaultNotice` needs a notice date.
5. Are Specified Conditions (Termination Events treated as defaults) Enforcement Events?

The answers change `EnforcementEventOccurred` and `EnforcementTest`.
