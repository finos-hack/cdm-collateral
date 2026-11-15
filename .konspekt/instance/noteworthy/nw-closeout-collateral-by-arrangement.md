```yaml
id: nw-closeout-collateral-by-arrangement
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;3KJOCN6qG5x0zmpydWM6Q0HWWNdxFhkM4NF8y1K4nHc
  timestamp: 2026-11-03T21:52:19Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: ef36ee9f01c3691510a6674082845047138e3ba7
    contentHash: ef36ee9f01c3691510a6674082845047138e3ba7
createdAt: 2026-11-03T21:52:19Z
updatedAt: 2026-11-03T23:07:44Z
```
# Decision: close-out under ISDA 2002 MA 6(e)(i); collateral enters by arrangement (pledge applied after, title transfer netted in)

How gap G15 is closed in part in `cdm-ext/rosetta/cdmx-collateral-closeout-*.rosetta` ([[task-cdm-gap-closure]]):

- **Early Termination Amount:** the sum of the Close-out Amounts plus the Unpaid Amounts owed to the Non-defaulting
  Party, less those owed to the Defaulting Party. Positive when the Defaulting Party pays. All amounts in the
  Termination Currency; conversion is the caller's.
- **Security interest** (IM pledge, New York law CSA): the collateral the Non-defaulting Party holds is applied after the
  Early Termination Amount, up to what is owed; any surplus is returned. The im-default scenario: USD 11.7m applied
  from USD 12,653,158, USD 953,158 owed back.
- **Title transfer** (English law VM CSA): the Value of the Credit Support Balance is an Unpaid Amount owed to the
  Transferor and is netted into the Early Termination Amount.
- Collateral the Non-defaulting Party posted is the caller's to pass: an Unpaid Amount under title transfer, left out
  under security interest.

Not covered, so G15 stays partial: GMRA, GMSLA and CCP close-out, and Section 6(e)(ii) (Termination Events).
