```yaml
id: task-sme-triparty-terms-profile
type: task
title: Confirm with a business SME the triparty terms and the collateral profile
status: open
review: proposed
provenance:
  conversationId: triparty-terms-profile
  sourceRef: 6d0f24d02ec0a2e8263d04901b8f42e3e7519c33
  contentHash: 6d0f24d02ec0a2e8263d04901b8f42e3e7519c33
  timestamp: 2026-11-12T00:45:37Z
  confidence: 0.6
createdAt: 2026-11-12T00:45:37Z
updatedAt: 2026-11-12T00:45:37Z
```
# Task: confirm the triparty terms and the collateral profile

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-default-rules]]. The project owner chose the
design for [[task-triparty-terms-profile]] on 2026-11-11 ([[wp-adr-triparty-terms-profile]]). The terms and the profile
are assumptions stated from model memory of triparty repo practice and from the prototype's CSA rows, not checked
against an agent's documentation. Questions for the SME:

1. A triparty repo has a triparty agreement between the giver, the receiver and the agent, beside the GMRA between the giver and the receiver. Which terms does the triparty agreement hold that the prototype's terms leave out (the agent's fees, its liability, the cut-off times, the accounts)?
2. The prototype's profile reuses the CSA schedule: US Treasuries at a 2% haircut and agency debt at 3%. Is that a usual triparty repo profile, or do agents' profiles usually state margin as a ratio per asset class?
3. The profile limits agency debt to 50% of the allocated value after haircuts. Are concentration limits in triparty profiles usually per asset class, per issuer, or both, and measured before or after haircuts?
4. Either the giver or the receiver may propose the terms, and the agent affirms them. Is the agent a party to the triparty agreement that consents to its terms, or only its operator?
5. The terms are set once and only terminated, not amended. How are changes to a profile agreed in practice, and do they apply to repos already allocated?
6. The giver or the receiver can terminate the triparty terms while nothing is allocated. What notice does termination take, and can the agent terminate?
