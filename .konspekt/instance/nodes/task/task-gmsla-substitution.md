```yaml
id: task-gmsla-substitution
type: task
title: Substitution of non-cash collateral
status: open
review: proposed
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:11:27Z
```
# Task: substitution of non-cash collateral

Row 16 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** S10 scored it 4: `Create_SubstitutionPrimitiveInstruction` exists, with no securities lending sample; for repo it could not qualify during the term (D22).
- **Scope:** The borrower replaces non-cash collateral with other eligible collateral of sufficient value.
- **`cdm-ext`:** whatever CDM's substitution lacks for a loan, found by running it over the prototype's loans first.
- **Prototype:** substitution on `SecuritiesLoan`; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
