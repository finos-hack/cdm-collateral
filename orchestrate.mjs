// Bring up the per-participant runtime stack for the end-to-end cycle (task-e2e-wiring): two ledger gateways
// (bank-a, bank-b) and two collateral workflow services (A pledgor, B secured party), plus the console dev server.
// Preconditions, checked below: the Besu network is running (besu/start-network.sh or `docker compose up` in besu/)
// and the contracts are deployed (contracts/deployments/besu.json exists; `npm run deploy:besu` in contracts/).
// The service jar must be built once: `mvn -DskipTests package` in services/collateral/.
//
// Usage: node orchestrate.mjs   (Ctrl-C stops every child process). Cross-platform (Windows/Linux/macOS).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const jar = path.join(root, "services", "collateral", "target", "collateral-service.jar");
const registry = path.join(root, "contracts", "deployments", "besu.json");

if (!fs.existsSync(registry)) {
  console.error(`missing ${path.relative(root, registry)} — run "npm run deploy:besu" in contracts/ first (and start Besu).`);
  process.exit(1);
}
if (!fs.existsSync(jar)) {
  console.error(`missing ${path.relative(root, jar)} — run "mvn -DskipTests package" in services/collateral/ first.`);
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

// Content-addressed CDM payload store (wp-adr-cdm-payload-carrier), shared by both participants.
run("store", "node", ["src/server.ts"], path.join(root, "store"), { PORT: "8300", DATA_DIR: path.join(root, "store", "data") });

const gw = path.join(root, "gateway");
run("gw-a", "node", ["src/server.ts"], gw, { NODE: "bank-a", PORT: "8201" });
run("gw-b", "node", ["src/server.ts"], gw, { NODE: "bank-b", PORT: "8202" });

// Give the gateways a moment before the services connect to them.
setTimeout(() => {
  run("svc-a", "java", ["-jar", jar], root, { PARTY_ID: "A", NODE: "bank-a", ROLE: "Pledgor", PORT: "8001", GATEWAY_URL: "http://localhost:8201" });
  run("svc-b", "java", ["-jar", jar], root, { PARTY_ID: "B", NODE: "bank-b", ROLE: "Secured Party", PORT: "8002", GATEWAY_URL: "http://localhost:8202" });
}, 2000);

run("console", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--port", "5173"], path.join(root, "console"), {});

console.log(`
stack starting:
  store             http://localhost:8300/store/v1
  gateway  bank-a   http://localhost:8201/ledger/v1
  gateway  bank-b   http://localhost:8202/ledger/v1
  service  A (pledgor)        http://localhost:8001/api/v1
  service  B (secured party)  http://localhost:8002/api/v1
  console  http://localhost:5173/#/live/B  (secured party)  and  /#/live/A  (pledgor)
Ctrl-C to stop.
`);

function shutdown() {
  console.log("\nstopping…");
  for (const c of children) c.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
