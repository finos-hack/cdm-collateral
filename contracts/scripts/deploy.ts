// Deploy the contracts to the running Besu network and write an address registry the services and console read.
// Run through scripts/deploy-besu.mjs, which sets DEPLOYER_KEY to the market operator's node key so the deployer and
// the oracle publisher are the mkt account (besu/mkt/data/key). Opening balances, prices and haircuts mirror the
// console reference data (console/src/domain/reference.ts, scenarios.ts) so the live stack starts where the mock did.
//
// Every transaction goes through send(): the script assigns nonces itself and waits for each receipt with a timeout. On
// a timeout it prints the transaction's nonce, the account's latest and pending nonces, what the node returns for the
// hash and the node's transaction pool, and sends the transaction once more with the same nonce if the node no longer
// knows it (task-ci-deploy-dropped-tx: a CI run once waited on a mint the node never mined, cause unknown).
import hre, { network } from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, getContractAddress, WaitForTransactionReceiptTimeoutError, type Hash } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCALE = 100000000n; // OracleFeed.PRICE_SCALE = 1e8
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const besu = (node: string) => path.join(repoRoot, "besu", node, "data", "key");

function partyAddress(node: string): `0x${string}` {
  const key = fs.readFileSync(besu(node), "utf8").trim() as `0x${string}`;
  return getAddress(privateKeyToAccount(key).address);
}

// 30 blocks at the 2 s QBFT block period; DEPLOY_RECEIPT_TIMEOUT_MS shortens it to exercise the timeout path.
const RECEIPT_TIMEOUT_MS = Number(process.env.DEPLOY_RECEIPT_TIMEOUT_MS ?? 60_000);

const RPC: Record<string, string> = {
  mkt: "http://localhost:8545",
  "bank-a": "http://localhost:8547",
  "bank-b": "http://localhost:8549",
  "bank-c": "http://localhost:8551",
};

// price in USD, haircut in basis points; mirrors reference.ts.
const TOKENS = [
  { sym: "tUST", name: "Tokenized US Treasury 4.25% 2034", isin: "US912810TM60", cusip: "912810TM6", dti: "QX4V2W9N3", price: 984n * SCALE / 10n, haircutBps: 200 },
  { sym: "tMMF", name: "Tokenized USD government MMF", isin: "US9128100000", cusip: "912810000", dti: "QZ0000000", price: 1n * SCALE, haircutBps: 400 },
  { sym: "tUSD", name: "USD deposit token", isin: "US0000000USD", cusip: "000000USD", dti: "QUSD00000", price: 1n * SCALE, haircutBps: 0 },
  // Loan collateral only (wp-adr-gmsla-substitution): the substitute for tUST under the GMSLA; not CSA-eligible.
  { sym: "tAGY", name: "Tokenized US agency bond 4.50% 2031", isin: "US3137EAGY10", cusip: "3137EAGY1", dti: "QAGY00000", price: 992n * SCALE / 10n, haircutBps: 300, csa: false },
];

// Opening balances (whole units) — union of the IM and VM starting positions in scenarios.ts.
// Free test balances minted at deploy; scripts/top-up-test-balances.mjs restores them before each live suite run
// (task-live-test-balances).
const BALANCES: Record<string, Record<string, bigint>> = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "test-balances.json"), "utf8")) as Record<string, Record<string, number>>)
    .map(([node, bals]) => [node, Object.fromEntries(Object.entries(bals).map(([sym, n]) => [sym, BigInt(n)]))]),
);

async function main() {
  const parties = {
    mkt: partyAddress("mkt"),
    "bank-a": partyAddress("bank-a"),
    "bank-b": partyAddress("bank-b"),
    "bank-c": partyAddress("bank-c"),
  };

  const { viem } = await network.connect("besuMkt");
  const publicClient = await viem.getPublicClient();
  const deployBlock = Number(await publicClient.getBlockNumber()); // first block to scan for this deployment's events
  const [deployer] = await viem.getWalletClients();
  const deployerAddr = getAddress(deployer.account.address);
  if (deployerAddr !== parties.mkt) {
    throw new Error(`deployer ${deployerAddr} is not the mkt node key ${parties.mkt}; run via scripts/deploy-besu.mjs`);
  }
  console.log("deployer / publisher (mkt):", deployerAddr);

  let nextNonce = await publicClient.getTransactionCount({ address: deployerAddr, blockTag: "pending" });

  // Send one transaction with the next nonce and wait for its receipt; see the header comment for the timeout path.
  async function send(label: string, submit: (nonce: number) => Promise<Hash>) {
    const nonce = nextNonce++;
    let hash = await submit(nonce);
    for (let attempt = 1; ; attempt++) {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
        if (receipt.status !== "success") throw new Error(`${label}: transaction ${hash} reverted in block ${receipt.blockNumber}`);
        return receipt;
      } catch (e) {
        if (!(e instanceof WaitForTransactionReceiptTimeoutError)) throw e;
        const [latest, pending, block, known, pool] = await Promise.all([
          publicClient.getTransactionCount({ address: deployerAddr, blockTag: "latest" }),
          publicClient.getTransactionCount({ address: deployerAddr, blockTag: "pending" }),
          publicClient.getBlockNumber(),
          publicClient.request({ method: "eth_getTransactionByHash", params: [hash] }) as Promise<{ blockNumber: string | null; nonce: string; to: string | null } | null>,
          publicClient.request({ method: "txpool_besuTransactions" } as never).catch((err: Error) => `unavailable: ${err.message}`),
        ]);
        console.error(`${label}: no receipt for ${hash} after ${RECEIPT_TIMEOUT_MS / 1000} s (attempt ${attempt})`);
        console.error(`  tx nonce ${nonce}; account nonce latest ${latest}, pending ${pending}; block ${block}`);
        const seen = known && { blockNumber: known.blockNumber, nonce: known.nonce, to: known.to }; // input omitted
        console.error("  eth_getTransactionByHash:", JSON.stringify(seen));
        console.error("  txpool_besuTransactions:", JSON.stringify(pool));
        if (known?.blockNumber) {
          console.error("  the transaction is mined; reading its receipt");
          const receipt = await publicClient.getTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`${label}: transaction ${hash} reverted in block ${receipt.blockNumber}`);
          return receipt;
        }
        if (attempt > 1) throw e;
        if (known === null) {
          console.error(`  the node does not know the transaction; sending it again with nonce ${nonce}`);
          hash = await submit(nonce);
        } else {
          console.error("  the node knows the transaction; waiting once more");
        }
      }
    }
  }

  // Deploy with an explicit nonce; the address follows from the deployer and the nonce, so no lookup of the transaction
  // is needed before the receipt.
  async function deploy<N extends "MarginCall" | "OracleFeed" | "CollateralControl" | "TokenizedCollateral" | "PortfolioReconciliation" | "RepoSettlement" | "SecuritiesLoan" | "TripartySettlement">(name: N, args: readonly unknown[]) {
    const { abi, bytecode } = await hre.artifacts.readArtifact(name);
    let address: `0x${string}` | undefined;
    await send(`deploy ${name}`, (nonce) => {
      address = getContractAddress({ from: deployerAddr, nonce: BigInt(nonce) });
      return deployer.deployContract({ abi, bytecode: bytecode as `0x${string}`, args: args as never, nonce });
    });
    return viem.getContractAt(name, address!);
  }

  const marginCall = await deploy("MarginCall", []);
  console.log("MarginCall           ", marginCall.address);
  const oracle = await deploy("OracleFeed", [parties.mkt]);
  console.log("OracleFeed           ", oracle.address);
  const control = await deploy("CollateralControl", [marginCall.address, oracle.address]);
  console.log("CollateralControl    ", control.address);
  await send("MarginCall.setControl", (nonce) => marginCall.write.setControl([control.address], { nonce }));
  const reconciliation = await deploy("PortfolioReconciliation", []);
  console.log("PortfolioReconciliation", reconciliation.address);
  const repoSettlement = await deploy("RepoSettlement", [oracle.address]);
  console.log("RepoSettlement       ", repoSettlement.address);
  const securitiesLoan = await deploy("SecuritiesLoan", [oracle.address]);
  console.log("SecuritiesLoan       ", securitiesLoan.address);
  // The triparty agent's books (task-triparty-terms-profile); the agent is BANK-T on the bank-c node.
  const tripartySettlement = await deploy("TripartySettlement", []);
  console.log("TripartySettlement   ", tripartySettlement.address);

  const tokenRegistry: Record<string, { address: string; decimals: number; haircutBps: number; isin: string; cusip: string; dti: string; csa: boolean }> = {};
  for (const t of TOKENS) {
    const token = await deploy("TokenizedCollateral", [t.name, t.sym, t.isin, t.cusip, t.dti]);
    console.log(`  ${t.sym.padEnd(6)}           `, token.address);
    for (const [node, bals] of Object.entries(BALANCES)) {
      const amount = bals[t.sym] ?? 0n;
      const to = parties[node as keyof typeof parties];
      if (amount > 0n) await send(`${t.sym}.mint ${node}`, (nonce) => token.write.mint([to, amount], { nonce }));
    }
    if (t.csa !== false) await send(`setEligibility ${t.sym}`, (nonce) => control.write.setEligibility([token.address, true, t.haircutBps], { nonce }));
    await send(`publishPrice ${t.sym}`, (nonce) => oracle.write.publishPrice([token.address, t.price], { account: deployer.account, nonce }));
    tokenRegistry[t.sym] = { address: token.address, decimals: 0, haircutBps: t.haircutBps, isin: t.isin, cusip: t.cusip, dti: t.dti, csa: t.csa !== false };
  }

  const registry = {
    chainId: 1337,
    deployBlock,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    publisher: parties.mkt,
    rpc: RPC,
    parties,
    contracts: {
      marginCall: marginCall.address,
      collateralControl: control.address,
      oracleFeed: oracle.address,
      portfolioReconciliation: reconciliation.address,
      repoSettlement: repoSettlement.address,
      securitiesLoan: securitiesLoan.address,
      tripartySettlement: tripartySettlement.address,
    },
    priceScale: SCALE.toString(),
    tokens: tokenRegistry,
  };

  const outDir = path.join(repoRoot, "contracts", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "besu.json");
  fs.writeFileSync(outFile, JSON.stringify(registry, null, 2) + "\n");
  console.log("\nwrote", path.relative(repoRoot, outFile));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
