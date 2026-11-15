```yaml
id: task-repo-income
type: task
title: Repo interest and manufactured income
status: resolved
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: ni:///sha-256;STJirKt2MoMm9lBaaCwnSam9QDrdl3_syYsofLZjtpE
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
    contentHash: 43bd267adffbb70e3a740c20620deed96d966092
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-08T21:55:20Z
```
# Task: repo interest and manufactured income

Row 7 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** repo interest, rate change and interim payment usable as is (R12, score 5); GMRA paragraph 5 income on the purchased securities not covered by a matrix row.
- **Scope:** GMRA paragraph 5: income paid on purchased securities passes from the buyer to the seller; repo interest (the price differential) and an on-demand interim interest payment.
- **`cdm-ext`:** the manufactured income payment, if CDM has no function for it.
- **Prototype:** income and interim interest paid on-chain in tUSD; a live spec.

The details are decided when the task starts.

**Rate input (2026-11-07,** source `84f74941a221fc7241c20cf18a88a87067400bc1`: "4. by hand for the prototype"**):** in the prototype the overnight rate for
Net Margin interest (the `netMarginInterest` election, USD-SOFR) is entered by hand, as the CSA interest rate is; the
oracle does not publish it.

**Design chosen 2026-11-08** (source `6add904ae373a15afccd62650872d36b5f15a134`), recorded in [[wp-adr-repo-income]] (proposed).
