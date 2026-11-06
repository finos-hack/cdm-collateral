# Collateral contracts

Solidity contracts for the CDM collateral prototype, built with **Hardhat 3** (viem). They are the on-chain layer of
the prototype architecture (`../architecture/prototype.architecture.json`): the margin call contract, the collateral
control contract, the tokenized collateral tokens and the oracle feed. Part of `task-e2e-wiring`.

## Contracts

| Contract | Role |
|---|---|
| `OracleFeed.sol` | Price (scaled 1e8) and default feed. Only the publisher (the market operator's key) may write; every service reads valuations and default status here. |
| `TokenizedCollateral.sol` | ERC-20 collateral token, 0 decimals (whole units), carrying ISIN / CUSIP / DTI identifiers (`concept-asr-onchain-asset-identity`). Dev-only unrestricted `mint`. |
| `MarginCall.sol` | Margin call lifecycle: issue, respond (agree / partial / dispute), propose collateral, decide (`wp-adr-margin-call-state-onchain`). Each state change is made by exactly one party's key. Every lifecycle step anchors its CDM document by a keccak-256 `cdmHash` on its event — `CallIssued`, `CallAnswered`, `CollateralProposed`, `ProposalDecided`, `CallSettled` (`concept-asr-onchain-call-state`, ADR `wp-adr-cdm-payload-carrier`); the document itself lives in the off-chain payload store (`../store`). Settlement is marked by the control contract (`markSettled`, called from `pledge`, `settleByTransfer`, `returnCollateral` and `returnByTransfer` with the settle step's `cdmHash`). |
| `CollateralControl.sol` | Settlement against the margin call state and oracle feed. Initial margin is escrowed here and leaves only by return, enforcement, close-out or substitution (`wp-adr-im-segregation`); variation margin passes title directly. `closeOut` (after the pledgor's default on the feed, secured party key) applies whole units of the escrow, in the order first pledged, to the Early Termination Amount owed and returns the surplus (G15). `requestSubstitution` / `decideSubstitution` / `settleSubstitution` substitute escrowed items under ISDA CSA Paragraph 4(d): the originals must be in escrow, the substitute eligible and worth at least as much after haircuts (checked again at settlement), and the secured party's consent is always required (G16). `stateInterest` (secured party) records the Interest Amount on the pledgor's cash collateral for one period with the CDM statement's hash and pays a positive amount to the pledgor in the same transaction; the cash token must be eligible with no haircut; a negative amount is paid by the pledgor with `payInterest` (G17). Pledge checks value-after-haircut ≥ agreed, using the oracle price and the configured eligibility schedule. |
| `CollateralTypes.sol` | Shared enums and structs, mirroring the CDM lifecycle in `../cdm-ext`. |

## EVM target

The Besu genesis activates **Berlin + London only** (no Shanghai), so the EVM has no `PUSH0`. `hardhat.config.ts` pins
`evmVersion: "london"`; the solc default (`cancun`) would emit `PUSH0`/`MCOPY`, which revert as invalid opcodes on this
chain.

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
