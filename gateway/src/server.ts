// HTTP server for one participant's ledger gateway (concept-asr-ledger-neutrality). Configured by env NODE
// (bank-a | bank-b | mkt | bank-c) and PORT; loads only that participant's key and signs every write with it.
// The collateral workflow service submits ledger instructions here (architecture relationship service-to-gateway);
// the console reads balances and pledge state here (console-to-gateway). Amounts cross the wire as decimal strings
// because they exceed the JSON safe-integer range.
import http from "node:http";
import { getAddress } from "viem";
import type { Address, Hex } from "viem";
import { BesuAdapter } from "./besu.ts";

const NODE = process.env.NODE ?? "bank-a";
const PORT = Number(process.env.PORT ?? 8201);
const adapter = new BesuAdapter(NODE);

// Live event stream: one chain subscription (eth_subscribe over the Besu WebSocket) fanned out to every connected SSE
// client — the party console and the workflow service's relay. The event is a lightweight change signal carrying the
// callId and step; consumers fetch current state through the existing endpoints. Replaces console polling with push.
const sseClients = new Set<http.ServerResponse>();
function broadcast(e: unknown): void {
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(line);
    } catch {
      sseClients.delete(res);
    }
  }
}
adapter.watchSteps((e) => broadcast(e));

type Handler = (params: Record<string, string>, body: any, url: URL) => Promise<unknown>;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}
const routes: Route[] = [];
function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:([A-Za-z]+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, pattern, keys, handler });
}
const J = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

route("GET", "/ledger/v1/health", async () => ({ node: NODE, account: adapter.account, ok: true }));

route("POST", "/ledger/v1/calls", async (_p, b) =>
  J(await adapter.issueCall(b.callId as Hex, b.kind, getAddress(b.to), BigInt(b.amount), BigInt(b.deadline), b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/calls/:id/response", async (p, b) =>
  J(await adapter.respond(p.id as Hex, b.response, BigInt(b.agreed), b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/calls/:id/proposals", async (p, b) => {
  const assets = (b.assets as { token: string; qty: string }[]).map((a) => ({ token: getAddress(a.token), qty: BigInt(a.qty) }));
  return J(await adapter.propose(p.id as Hex, assets, b.cdmHash as Hex));
});

route("POST", "/ledger/v1/calls/:id/decision", async (p, b) =>
  J(await adapter.decide(p.id as Hex, BigInt(b.proposalId), Boolean(b.accept), b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/calls/:id/pledge", async (p, b) => {
  // The pledgor's gateway approves the control contract for the pledged quantity, then pledges.
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const approve = await adapter.approve(getAddress(b.token), control, BigInt(b.qty));
  const pledge = await adapter.pledge(p.id as Hex, BigInt(b.proposalId), b.cdmHash as Hex);
  return J({ approve, pledge });
});

route("POST", "/ledger/v1/calls/:id/transfer", async (p, b) => {
  // VM settlement: the deliverer's gateway approves the control contract for the transferred quantity, then settles
  // by moving title directly to the receiver (no escrow).
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const approve = await adapter.approve(getAddress(b.token), control, BigInt(b.qty));
  const transfer = await adapter.settleByTransfer(p.id as Hex, BigInt(b.proposalId), b.cdmHash as Hex);
  return J({ approve, transfer });
});

route("POST", "/ledger/v1/calls/:id/return", async (p, b) => {
  // IM return: the secured party releases escrowed collateral the control contract already holds (no approval needed).
  const release = (b.assets as { token: string; qty: string }[]).map((a) => ({ token: getAddress(a.token), qty: BigInt(a.qty) }));
  return J(await adapter.returnCollateral(p.id as Hex, release, b.cdmHash as Hex));
});

route("POST", "/ledger/v1/calls/:id/return-transfer", async (p, b) => {
  // VM return: the agreeing party approves the control contract and transfers equivalent credit support back.
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const assets = (b.assets as { token: string; qty: string }[]).map((a) => ({ token: getAddress(a.token), qty: BigInt(a.qty) }));
  const approvals = [];
  for (const a of assets) approvals.push(await adapter.approve(a.token, control, a.qty));
  const transfer = await adapter.returnByTransfer(p.id as Hex, assets, b.cdmHash as Hex);
  return J({ approvals, transfer });
});

route("GET", "/ledger/v1/party-calls", async (_p, _b, url) =>
  J(await adapter.listCalls(getAddress(url.searchParams.get("party")!))),
);

route("GET", "/ledger/v1/calls/:id", async (p) => J(await adapter.getCall(p.id as Hex)));

route("GET", "/ledger/v1/calls/:id/proposals/:pid/assets", async (p) =>
  J(await adapter.getProposalAssets(p.id as Hex, BigInt(p.pid))),
);

route("GET", "/ledger/v1/calls/:id/proposals/:pid/state", async (p) =>
  J(await adapter.getProposalState(p.id as Hex, BigInt(p.pid))),
);

route("GET", "/ledger/v1/pledged", async (_p, _b, url) =>
  J(
    await adapter.pledgedBalance(
      getAddress(url.searchParams.get("pledgor")!),
      getAddress(url.searchParams.get("securedParty")!),
      getAddress(url.searchParams.get("token")!),
    ),
  ),
);

route("GET", "/ledger/v1/calls/:id/steps", async (p) => J(await adapter.callSteps(p.id as Hex)));

route("GET", "/ledger/v1/balance", async (_p, _b, url) =>
  J(await adapter.tokenBalance(getAddress(url.searchParams.get("token")!) as Address, getAddress(url.searchParams.get("owner")!))),
);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Server-Sent Events stream (handled here because it must not be buffered or JSON-wrapped like the other routes).
  if (req.method === "GET" && url.pathname === "/ledger/v1/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    sseClients.add(res);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, 25000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }

  const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
  if (!match) return void res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
  const m = url.pathname.match(match.pattern)!;
  const params: Record<string, string> = {};
  match.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const out = await match.handler(params, body, url);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    } catch (e) {
      console.error(`${req.method} ${url.pathname} failed:`, (e as Error).message);
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (e as Error).message }));
    }
  });
});

server.listen(PORT, () => console.log(`ledger gateway for ${NODE} (${adapter.account}) on http://localhost:${PORT}/ledger/v1`));
