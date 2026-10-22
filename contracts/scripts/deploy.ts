// Deploy the four contracts to the running Besu network and write an address registry the services and console read.
// Run through scripts/deploy-besu.mjs, which sets DEPLOYER_KEY to the market operator's node key so the deployer and
// the oracle publisher are the mkt account (besu/mkt/data/key). Opening balances, prices and haircuts mirror the
// console reference data (console/src/domain/reference.ts, scenarios.ts) so the live stack starts where the mock did.
import { network } from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
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
];

// Opening balances (whole units) — union of the IM and VM starting positions in scenarios.ts.
const BALANCES: Record<string, Record<string, bigint>> = {
  "bank-a": { tUST: 400000n, tMMF: 20000000n, tUSD: 15000000n },
  "bank-b": { tUST: 0n, tMMF: 0n, tUSD: 7000000n },
};

async function main() {
  const parties = {
    mkt: partyAddress("mkt"),
    "bank-a": partyAddress("bank-a"),
    "bank-b": partyAddress("bank-b"),
    "bank-c": partyAddress("bank-c"),
  };

  const { viem } = await network.connect("besuMkt");
  const [deployer] = await viem.getWalletClients();
  const deployerAddr = getAddress(deployer.account.address);
  if (deployerAddr !== parties.mkt) {
    throw new Error(`deployer ${deployerAddr} is not the mkt node key ${parties.mkt}; run via scripts/deploy-besu.mjs`);
  }
  console.log("deployer / publisher (mkt):", deployerAddr);

  const marginCall = await viem.deployContract("MarginCall", []);
  console.log("MarginCall           ", marginCall.address);
  const oracle = await viem.deployContract("OracleFeed", [parties.mkt]);
  console.log("OracleFeed           ", oracle.address);
  const control = await viem.deployContract("CollateralControl", [marginCall.address, oracle.address]);
  console.log("CollateralControl    ", control.address);
  await marginCall.write.setControl([control.address]);

  const tokenRegistry: Record<string, { address: string; decimals: number; haircutBps: number; isin: string; cusip: string; dti: string }> = {};
  for (const t of TOKENS) {
    const token = await viem.deployContract("TokenizedCollateral", [t.name, t.sym, t.isin, t.cusip, t.dti]);
    console.log(`  ${t.sym.padEnd(6)}           `, token.address);
    for (const [node, bals] of Object.entries(BALANCES)) {
      const amount = bals[t.sym] ?? 0n;
      if (amount > 0n) await token.write.mint([parties[node as keyof typeof parties], amount]);
    }
    await control.write.setEligibility([token.address, true, t.haircutBps]);
    await oracle.write.publishPrice([token.address, t.price], { account: deployer.account });
    tokenRegistry[t.sym] = { address: token.address, decimals: 0, haircutBps: t.haircutBps, isin: t.isin, cusip: t.cusip, dti: t.dti };
  }

  const registry = {
    chainId: 1337,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    publisher: parties.mkt,
    rpc: RPC,
    parties,
    contracts: { marginCall: marginCall.address, collateralControl: control.address, oracleFeed: oracle.address },
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
