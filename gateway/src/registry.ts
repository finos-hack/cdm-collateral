// Loads the deployment registry (contracts/deployments/besu.json, written by contracts/scripts/deploy.ts) and a
// participant's Besu node signing key (besu/<node>/data/key). A gateway instance is configured for exactly one
// participant and loads that participant's key only (concept-asr-ledger-neutrality: one key per gateway).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface TokenInfo {
  address: `0x${string}`;
  decimals: number;
  haircutBps: number;
  isin: string;
  cusip: string;
  dti: string;
}

export interface Registry {
  chainId: number;
  deployBlock?: number;
  deployer: `0x${string}`;
  publisher: `0x${string}`;
  rpc: Record<string, string>;
  parties: Record<string, `0x${string}`>;
  contracts: {
    marginCall: `0x${string}`;
    collateralControl: `0x${string}`;
    oracleFeed: `0x${string}`;
    /** Absent in a deployment made before flow-reconciliation. */
    portfolioReconciliation?: `0x${string}`;
  };
  priceScale: string;
  tokens: Record<string, TokenInfo>;
}

export function loadRegistry(): Registry {
  const file = path.join(repoRoot, "contracts", "deployments", "besu.json");
  if (!fs.existsSync(file)) {
    throw new Error(`deployment registry not found at ${file}; run "npm run deploy:besu" in contracts/ first`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Registry;
}

/** Read a participant's Besu node private key from besu/<node>/data/key (reused as the signing key). */
export function loadNodeKey(node: string): `0x${string}` {
  const file = path.join(repoRoot, "besu", node, "data", "key");
  if (!fs.existsSync(file)) throw new Error(`node key not found at ${file}; start the Besu network first`);
  const key = fs.readFileSync(file, "utf8").trim();
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}
