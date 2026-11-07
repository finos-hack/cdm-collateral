// Bring up the per-participant runtime stack for the end-to-end cycle (task-e2e-wiring): three ledger gateways
// (bank-a, bank-b and the market operator mkt, which holds the oracle publisher key), the oracle service, two
// collateral workflow services (A pledgor, B secured party), plus the console dev server.
// Preconditions, checked below: the Besu network is running (besu/start-network.sh or `docker compose up` in besu/)
// and the contracts are deployed (contracts/deployments/besu.json exists; `npm run deploy:besu` in contracts/).
// The service jars must be built once: `mvn -DskipTests package` in services/collateral/ and services/oracle/.
//
// Usage: node orchestrate.mjs   (Ctrl-C stops every child process). Cross-platform (Windows/Linux/macOS).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const jar = path.join(root, "services", "collateral", "target", "collateral-service.jar");
const oracleJar = path.join(root, "services", "oracle", "target", "oracle-service.jar");
const registry = path.join(root, "contracts", "deployments", "besu.json");

// --ci: omit the console dev server (5173). In CI the Playwright config serves its own console preview on 4173
// (console/playwright.config.ts webServer), so the dev server is redundant; the backend store, gateways and
// services are what the live e2e flow needs (.github/workflows/e2e-live-stack.yml, task-ci-live-e2e-stack).
const ci = process.argv.includes("--ci");

if (!fs.existsSync(registry)) {
  console.error(`missing ${path.relative(root, registry)} — run "npm run deploy:besu" in contracts/ first (and start Besu).`);
  process.exit(1);
}
if (!fs.existsSync(jar)) {
  console.error(`missing ${path.relative(root, jar)} — run "mvn -DskipTests package" in services/collateral/ first.`);
  process.exit(1);
}
if (!fs.existsSync(oracleJar)) {
  console.error(`missing ${path.relative(root, oracleJar)} — run "mvn -DskipTests package" in services/oracle/ first.`);
  process.exit(1);
}

const children = [];
function run(name, cmd, args, cwd, env) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: true, stdio: "pipe" });
  child.stdout.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  child.on("exit", (code) => console.log(`[${name}] exited with ${code}`));
  children.push(child);
  return child;
}

// Per-party bearer tokens for the payload store. Each participant authenticates to the store with its own secret; the
// store resolves the token to that party's address and enforces the document allowlist against it (store/src/server.ts).
// Tokens are minted per run (never persisted), so a party can read only its own documents.
const reg = JSON.parse(fs.readFileSync(registry, "utf8"));
const token = { "bank-a": crypto.randomBytes(24).toString("hex"), "bank-b": crypto.randomBytes(24).toString("hex") };
const partyTokens = JSON.stringify(Object.fromEntries(Object.entries(token).map(([node, t]) => [t, reg.parties[node]])));

// Content-addressed CDM payload store (wp-adr-cdm-payload-carrier), shared by both participants.
run("store", "node", ["src/server.ts"], path.join(root, "store"), { PORT: "8300", DATA_DIR: path.join(root, "store", "data"), PARTY_TOKENS: partyTokens });

const gw = path.join(root, "gateway");
run("gw-a", "node", ["src/server.ts"], gw, { NODE: "bank-a", PORT: "8201" });
run("gw-b", "node", ["src/server.ts"], gw, { NODE: "bank-b", PORT: "8202" });
// The market operator's gateway signs with the mkt key, the oracle publisher (contracts/scripts/deploy.ts); only the
// oracle service writes through it (architecture relationship oracle-to-gateway).
run("gw-mkt", "node", ["src/server.ts"], gw, { NODE: "mkt", PORT: "8200" });

// Give the gateways a moment before the services connect to them.
setTimeout(() => {
  run("oracle", "java", ["-jar", oracleJar], root, { PORT: "8100", GATEWAY_URL: "http://localhost:8200" });
  run("svc-a", "java", ["-jar", jar], root, { PARTY_ID: "A", NODE: "bank-a", ROLE: "Pledgor", PORT: "8001", GATEWAY_URL: "http://localhost:8201", ORACLE_URL: "http://localhost:8100", STORE_TOKEN: token["bank-a"], COUNTERPARTY_SERVICE_URL: "http://localhost:8002" });
  run("svc-b", "java", ["-jar", jar], root, { PARTY_ID: "B", NODE: "bank-b", ROLE: "Secured Party", PORT: "8002", GATEWAY_URL: "http://localhost:8202", ORACLE_URL: "http://localhost:8100", STORE_TOKEN: token["bank-b"], COUNTERPARTY_SERVICE_URL: "http://localhost:8001" });
}, 2000);

// CONSOLE_HOST: the interface the console dev server listens on. Unset, Vite listens on localhost only. The dev
// container sets it to 0.0.0.0 (.devcontainer/devcontainer.json containerEnv), because there the port is published by
// Docker (appPort), which reaches the container's network interface, not its loopback (task-devcontainer-stack-startup).
if (!ci) {
  const hostArgs = process.env.CONSOLE_HOST ? ["--host", process.env.CONSOLE_HOST] : [];
  run("console", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--port", "5173", ...hostArgs], path.join(root, "console"), {});
}

console.log(`
stack starting:
  store             http://localhost:8300/store/v1
  gateway  bank-a   http://localhost:8201/ledger/v1
  gateway  bank-b   http://localhost:8202/ledger/v1
  gateway  mkt      http://localhost:8200/ledger/v1   (oracle publisher)
  oracle            http://localhost:8100/oracle/v1
  service  A (pledgor)        http://localhost:8001/api/v1
  service  B (secured party)  http://localhost:8002/api/v1${ci ? "" : `
  console  http://localhost:5173/#/live/B  (secured party)  and  /#/live/A  (pledgor)`}
Ctrl-C to stop.
`);

function shutdown() {
  console.log("\nstopping…");
  for (const c of children) c.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
