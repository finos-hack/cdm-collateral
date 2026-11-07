// Restore the live test parties' free token balances before a suite run (task-live-test-balances, option (a)). The
// specs run on a persistent chain and move value from the pledgor to the secured party (enforcement, close-out, VM),
// so after a few runs the pledgor cannot pay. For each party and token in test-balances.json this mints the shortfall
// of the free balance with the tokens' dev-only mint, signed by the market operator's node key. Escrowed collateral is
// left as it is. Prototype test chain only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const reg = JSON.parse(fs.readFileSync(path.join(root, "contracts", "deployments", "besu.json"), "utf8"));
const targets = JSON.parse(fs.readFileSync(path.join(here, "test-balances.json"), "utf8"));
const key = fs.readFileSync(path.join(root, "besu", "mkt", "data", "key"), "utf8").trim();

const chain = defineChain({ id: reg.chainId, name: "besu-mkt", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [reg.rpc.mkt] } } });
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain, transport: http(reg.rpc.mkt), pollingInterval: 250 });
const wallet = createWalletClient({ account, chain, transport: http(reg.rpc.mkt) });
const abi = parseAbi(["function balanceOf(address) view returns (uint256)", "function mint(address to, uint256 amount)"]);

let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
const sent = [];
for (const [node, bals] of Object.entries(targets)) {
  const owner = reg.parties[node];
  for (const [sym, target] of Object.entries(bals)) {
    const token = reg.tokens[sym]?.address;
    if (!owner || !token) continue;
    const free = await pub.readContract({ address: token, abi, functionName: "balanceOf", args: [owner] });
    const short = BigInt(target) - free;
    if (short <= 0n) continue;
    const hash = await wallet.writeContract({ address: token, abi, functionName: "mint", args: [owner, short], gasPrice: 0n, nonce: nonce++ });
    sent.push({ hash, line: `${node} ${sym} +${short} (to ${target})` });
  }
}
for (const s of sent) {
  const r = await pub.waitForTransactionReceipt({ hash: s.hash, timeout: 60_000 });
  if (r.status !== "success") throw new Error(`mint reverted: ${s.line}`);
  console.log(`topped up ${s.line}`);
}
if (sent.length === 0) console.log("test balances already at their targets");
