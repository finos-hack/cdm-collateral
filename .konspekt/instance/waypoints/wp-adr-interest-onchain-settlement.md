```yaml
id: wp-adr-interest-onchain-settlement
kind: decision
subtype: adr
timestamp: 2026-11-06T15:51:39Z
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 16dca9f0c1765191fa8235340845c442d5744245
  contentHash: 16dca9f0c1765191fa8235340845c442d5744245
  timestamp: 2026-11-06T15:51:39Z
  confidence: 0.65
createdAt: 2026-11-06T15:51:39Z
updatedAt: 2026-11-06T15:51:39Z
```
# ADR: interest on cash collateral settles in whole tUSD, a negative amount in a second step

For `flow-interest-on-cash` ([[task-csa-interest-on-cash]], G17), within the owner's choice of a direct tUSD transfer with the statement
hash anchored on-chain:

- The prototype agreement's `CollateralInterestParameters` round the Interest Amount to whole USD at period end
  (`Rounding` Nearest, precision 0). tUSD has no decimals, so the statement's `transferAmount` is the on-chain amount,
  and a service checking a received statement also checks that the two agree.
- `CollateralControl.stateInterest` (secured party key) records the amount and the statement hash, and pays a positive
  amount from the secured party to the pledgor in the same transaction. A negative amount stays `Stated` until the
  pledgor pays it with `payInterest`, since the contract cannot spend the pledgor's tUSD without its approval.
- The cash token must be eligible with no haircut. The contract does not check the escrow balance the statement used;
  each party recomputes the statement from its days and the agreement's parameters.

**Context.** The interest is paid outside the escrow (the secured party's own tUSD), so it changes neither the posted
collateral nor any margin call.

**Consequences.**
- Interest below USD 0.50 for a period rounds to zero and moves nothing.
- The live spec covers the positive amount; the negative path is covered by the contract tests and the console.
- The Adjust handling (adding the interest to the posted collateral) is not offered on-chain.
