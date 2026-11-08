```yaml
id: wp-adr-repo-margin-maintenance
kind: decision
subtype: adr
timestamp: 2026-11-08T14:35:55Z
review: proposed
provenance:
  conversationId: repo-margin-maintenance
  sourceRef: ae0dea272a7d57577b0c8d0625863feb6ded3a8c
  contentHash: ae0dea272a7d57577b0c8d0625863feb6ded3a8c
  timestamp: 2026-11-08T14:35:55Z
  confidence: 0.7
createdAt: 2026-11-08T14:35:55Z
updatedAt: 2026-11-08T14:35:55Z
```

# ADR: repo margin is called on the pair's Net Exposure and settled by title transfer through the MarginCall contract and the VM path

For [[task-repo-margin-maintenance]] (section C, row 3 of the workflow map), within [[wp-adr-repo-gmra-scope]] and
under the GMRA of [[wp-adr-repo-gmra-terms]], following the project owner's choices of 2026-11-08 (source
`ae0dea272a7d57577b0c8d0625863feb6ded3a8c`: "Reuse VM path", "Title transfer only", "Compute and pay", "Per election,
no haircut"):

- **Exposure.** `cdm-ext` computes each repo's Transaction Exposure as the Repurchase Price accrued to the business
  date times the Margin Ratio, less the market value of the securities at the oracle price. Net Exposure sums the
  Transaction Exposures across the pair's repos that have been purchased and not repurchased, in both directions, less
  the Net Margin already held. The formula is stated from model memory of the GMRA and has not been checked against
  agreement text.
- **Margin Ratio.** Read per repo according to the `marginRatioBasis` election of the GMRA terms.
- **Call control.** The calling party's service computes the amount at its business date and rejects the call unless
  it exceeds that party's `minimumTransferAmount`. The called party's service recomputes from its own `TradeState`s
  before agreeing.
- **Settlement.** A GMRA call is a `CallKind.VM` call through `MarginCall` and `CollateralControl.settleByTransfer`.
  No contract changes and no redeployment. `settleByTransfer` does not check that the assets cover the agreed amount,
  so the services check it. Title transfer is the only settlement method built here; the call records its method, and
  [[task-repo-reprice]] and [[task-repo-adjustment]] add the others.
- **Reversal.** When the exposure reverses, the other party issues a new call. `CallKind.Return` is not used.
- **Assets.** tUSD, tUST and tMMF as the `marginTransfer` election allows, each valued at the oracle price with no
  haircut.
- **Net Margin interest.** `cdm-ext` computes interest on Cash Margin for a period at the hand-entered rate plus the
  election's spread, and the holder pays it through the existing interest statement path on-chain.
- **Defect D2.** A `cdm-ext` function computes Purchase Price as market value divided by Margin Ratio, with tests.
- **Prototype.** A live spec settles one call in cash and one in securities.

**Consequences.**
- The services distinguish GMRA calls from CSA VM calls off-chain; the contract records both as `CallKind.VM`.
- The coverage check of a GMRA call is off-chain only.
