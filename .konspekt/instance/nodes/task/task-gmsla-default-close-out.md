```yaml
id: task-gmsla-default-close-out
type: task
title: Securities lending default and close-out
status: open
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:16:16Z
```
# Task: securities lending default and close-out

Row 19 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** elections only (S19, S25, score 2: G15): `EventsOfDefault`, automatic early termination.
- **Scope:** An Event of Default, the close-out of every loan of the pair at its value against the collateral held, and one net balance in the Base Currency, as the GMRA close-out of `task-repo-default-close-out`.
- **`cdm-ext`:** a GMSLA close-out statement, reusing the GMRA close-out design where the agreements agree.
- **Prototype:** close-out on `SecuritiesLoan`; a live spec that restores the default status it changes.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
