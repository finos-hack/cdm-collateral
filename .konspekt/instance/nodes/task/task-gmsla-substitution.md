```yaml
id: task-gmsla-substitution
type: task
title: Substitution of non-cash collateral
status: open
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T20:02:28Z
```
# Task: substitution of non-cash collateral

Row 16 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** S10 scored it 4: `Create_SubstitutionPrimitiveInstruction` exists, with no securities lending sample; for repo it could not qualify during the term (D22).
- **Scope:** The borrower replaces non-cash collateral with other eligible collateral of sufficient value.
- **`cdm-ext`:** whatever CDM's substitution lacks for a loan, found by running it over the prototype's loans first.
- **Prototype:** substitution on `SecuritiesLoan`; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran CDM 7.7.0 over loans in the prototype's shape (100,000 tMMF lent by
BANK-A to BANK-B against 1,037 tUST, margin 1.02, open term), replacing the tUST with 1,040 units of another security:

- **`Create_SubstitutionPrimitiveInstruction`** builds a quantity change (direction `Replace`) and a terms change that
  sets the new collateral portfolio and moves the loan's effective date to the substitution date. Its `priceQuantity`
  input is the loaned lot: with an empty list the event fails validation (`QuantityChangeInstruction.change` is
  required); with the lot restated (100,000 tMMF) it passes.
- **The resulting loan** stays open with 100,000 tMMF on loan, the new collateral security and quantity, and its
  `RecallProvision` kept. The trade lot keeps the loaned security as its observable, so the second half of D22 does not
  apply to loans. The loan's original effective date (2026-11-11) is replaced by the substitution date (2026-11-12).
- **`Qualify_Substitution` is false**, on an open loan and on a loan with a termination date alike, for the reasons of
  D22: it needs a changed payout, and the new effective date equal to the old termination date. No other event
  qualification is true (Termination, PartialTermination, FullReturn checked).
- **Cash collateral:** substituting the tUST portfolio with a cash portfolio also passes validation; the loan's fee
  stays a fee (CDM keeps the payout), so a change between non-cash and cash collateral would leave the fee or rebate
  terms inconsistent.
- CDM has no substitution request, consent, or value check for a loan.
