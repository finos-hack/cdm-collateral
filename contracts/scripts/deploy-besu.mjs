// Cross-platform launcher for the Besu deploy. Reads the market operator's node key (besu/mkt/data/key), passes it as
// DEPLOYER_KEY so the hardhat besuMkt network signs as the mkt account, and runs scripts/deploy.ts. The key never
// leaves the machine; it is the same key the mkt Besu node already holds (decision: reuse node keys).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const contractsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = path.resolve(contractsDir, "..", "besu", "mkt", "data", "key");

if (!fs.existsSync(keyFile)) {
  console.error(`mkt node key not found at ${keyFile}. Start the Besu network first (besu/start-network.sh).`);
  process.exit(1);
}
const deployerKey = fs.readFileSync(keyFile, "utf8").trim();

const res = spawnSync("npx", ["hardhat", "run", "scripts/deploy.ts", "--network", "besuMkt"], {
  stdio: "inherit",
  shell: true,
  cwd: contractsDir,
  env: { ...process.env, DEPLOYER_KEY: deployerKey },
});
process.exit(res.status ?? 1);
