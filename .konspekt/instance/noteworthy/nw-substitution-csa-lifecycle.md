```yaml
id: nw-substitution-csa-lifecycle
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: f66560c3555c8efa6daf73880fa06b47e62422f9
  contentHash: f66560c3555c8efa6daf73880fa06b47e62422f9
  timestamp: 2026-11-03T23:59:58Z
  confidence: 0.7
createdAt: 2026-11-03T23:59:58Z
updatedAt: 2026-11-04T00:10:23Z
```
# Decision: CSA substitution is its own lifecycle over the portfolio; consent by election; substitute worth at least the original

How gap G16 is closed in part in `cdm-ext/rosetta/cdmx-collateral-substitution-*.rosetta` ([[task-cdm-gap-closure]]):

- **Lifecycle:** request, consent where needed, settlement (ISDA CSA Paragraph 4(d)); statuses Requested, Consented,
  Refused, Settled. Each step is a `CollateralSubstitution` event over CDM's `CollateralPortfolio`, with no trade
  and outside the margin call lifecycle.
- **Consent:** only where the pledgor's CDM `SubstitutionPartyElection -> needsConsent` is true; no election means no
  consent (Paragraph 13 (f)(ii)).
- **Value:** the original items must be held, and their value after haircuts must not exceed the substitute's (the
  proviso to Paragraph 4(d)(ii)).
- **Settlement:** both legs move on the event date (the CSA allows the return up to the Local Business Day after the
  substitute arrives); positions are netted and the balance changes by substitute value less original value.
- **Qualification:** `Qualify_CollateralSubstituted` replaces CDM's `Qualify_Substitution` for CSA collateral, so
  the event is no longer a Renegotiation (D5).

Left to other checks: eligibility (CDM's eligibility functions) and concentration (G8) of the substitute. Not covered:
substitution by a triparty agent (T8) and at a CCP (C18).
