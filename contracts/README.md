# Collateral contracts

Solidity contracts for the CDM collateral prototype, built with **Hardhat 3** (viem). They are the on-chain layer of
the prototype architecture (`../architecture/prototype.architecture.json`): the margin call contract, the collateral
control contract, the tokenized collateral tokens and the oracle feed. Part of `task-e2e-wiring`.

## Contracts

| Contract | Role |
|---|---|
| `OracleFeed.sol` | Price (scaled 1e8) and default feed. Only the publisher (the market operator's key) may write; every service reads valuations and default status here. |
| `TokenizedCollateral.sol` | ERC-20 collateral token, 0 decimals (whole units), carrying ISIN / CUSIP / DTI identifiers (`concept-asr-onchain-asset-identity`). Dev-only unrestricted `mint`. |
| `MarginCall.sol` | Margin call lifecycle: issue, respond (agree / partial / dispute), propose collateral, decide (`wp-adr-margin-call-state-onchain`). Each state change is made by exactly one party's key. Every lifecycle step anchors its CDM document by a keccak-256 `cdmHash` on its event — `CallIssued`, `CallAnswered`, `CollateralProposed`, `ProposalDecided`, `CallSettled`, `CallWithdrawn`, `CancellationRequested`, `CancellationDecided` (`concept-asr-onchain-call-state`, ADR `wp-adr-cdm-payload-carrier`); cancellation (`flow-call-cancellation`): `withdrawCall` by the caller while the call is issued, `requestCancellation` by either party once it is answered and not settled, `decideCancellation` by the other party; a pending request blocks proposals, decisions and settlement, and acceptance sets the call `Cancelled` and its live proposal `Cancelled`; replacement (`flow-call-replacement`): `issueReplacementCall` issues a call that replaces a cancelled one with the same caller, called party and kind, records `replaces` and `replacementOf` (one replacement per cancelled call) and emits `CallReplaced`; the document itself lives in the off-chain payload store (`../store`). Settlement is marked by the control contract (`markSettled`, called from `pledge`, `settleByTransfer`, `returnCollateral` and `returnByTransfer` with the settle step's `cdmHash`). |
| `CollateralControl.sol` | Settlement against the margin call state and oracle feed. Initial margin is escrowed here and leaves only by return, enforcement, close-out or substitution (`wp-adr-im-segregation`); variation margin passes title directly. `closeOut` (after the pledgor's default on the feed, secured party key) applies whole units of the escrow, in the order first pledged, to the Early Termination Amount owed and returns the surplus (G15). `requestSubstitution` / `decideSubstitution` / `settleSubstitution` substitute escrowed items under ISDA CSA Paragraph 4(d): the originals must be in escrow, the substitute eligible and worth at least as much after haircuts (checked again at settlement), and the secured party's consent is always required (G16). `stateInterest` (secured party) records the Interest Amount on the pledgor's cash collateral for one period with the CDM statement's hash and pays a positive amount to the pledgor in the same transaction; the cash token must be eligible with no haircut; a negative amount is paid by the pledgor with `payInterest` (G17). `proposeAmendment` / `decideAmendment` amend a pair's terms (`flow-agreement-amendment`): either party proposes haircut terms with the CDM amendment hash, chained from the pair's `agreementHash`, one pending at a time; on the other party's consent the global schedule is copied for the pair on its first amendment, the terms apply, and `agreementHash` becomes the amendment hash. Election changes (MTA, rounding) travel in the CDM document and are applied by the services. Pledge checks value-after-haircut ≥ agreed, using the oracle price and the pair's eligibility (`eligibilityFor`: the global schedule until the pair's first amendment). Settlement netting (`flow-settlement-netting`): `settleNetted` settles agreed VM calls (accepted proposal of the cash token alone), agreed return calls (agreed amount in the cash token at the feed price) and Interest Amounts held by `stateInterestForNetting` between two parties in one transaction, by one transfer of the net from the calling key, which must owe it; `nettedIn` records the netting per call and statement and `SettlementNetted` the net. |
| `PortfolioReconciliation.sol` | Portfolio reconciliation between two parties (`flow-reconciliation`, `wp-adr-reconciliation-scope`). `commitSnapshot` records the hash of a party's trade snapshot; the snapshots themselves go service to service. `commitResult` records, once per party and run, the hash of the reconciliation result and its break count; the run (`reconciliationIdOf` the two snapshot ids) becomes `Agreed` when both result hashes match and `Disagreed` otherwise. No trade data is on-chain. Kept separate from `CollateralControl.sol`, which is close to the EIP-170 size limit. |
| `CollateralTypes.sol` | Shared enums and structs, mirroring the CDM lifecycle in `../cdm-ext`. |

## EVM target

The Besu genesis activates **Berlin + London only** (no Shanghai), so the EVM has no `PUSH0`. `hardhat.config.ts` pins
`evmVersion: "london"`; the solc default (`cancun`) would emit `PUSH0`/`MCOPY`, which revert as invalid opcodes on this
chain.

The contracts compile with `viaIR: true` (optimizer, 200 runs). With `settleNetted` (`flow-settlement-netting`) the
legacy pipeline put `CollateralControl` over the 24,576-byte contract size limit (EIP-170): 24,906 bytes at 200 runs,
24,614 at 1 run. Through the IR pipeline it is 20,063 bytes.

## Build, test, deploy

```bash
npm ci
npm run build          # hardhat compile (solc 0.8.28, london target)
npm test               # 16 unit + property tests on the in-memory EDR network
npm run deploy:besu    # deploy to the running Besu network, write deployments/besu.json
```

`deploy:besu` runs `scripts/deploy-besu.mjs`, which reads the market operator's node key (`../besu/mkt/data/key`) and
signs as the mkt account — the deployer and the oracle publisher. The chain is zero-base-fee (`gasPrice 0`), so no
account needs funding. Opening balances, prices and haircuts mirror `../console/src/domain/reference.ts` and
`scenarios.ts`, so the live stack starts where the mocked console did.

### `deployments/besu.json`

The address registry the gateway, services and console read: chain id, RPC URLs per node, party addresses, the oracle
publisher, the three contract addresses, the price scale, and per-token address / decimals / haircut / identifiers.
Written on every deploy; not committed (it is environment state).
