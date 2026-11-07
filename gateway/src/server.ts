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
adapter.watchLedgerEvents((e) => broadcast(e));

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

// `replaces` names a cancelled call the new call replaces (task-csa-call-replacement).
route("POST", "/ledger/v1/calls", async (_p, b) =>
  J(b.replaces
    ? await adapter.issueReplacementCall(b.callId as Hex, b.replaces as Hex, b.kind, getAddress(b.to), BigInt(b.amount), BigInt(b.deadline), b.cdmHash as Hex)
    : await adapter.issueCall(b.callId as Hex, b.kind, getAddress(b.to), BigInt(b.amount), BigInt(b.deadline), b.cdmHash as Hex)),
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

// Cancellation (task-csa-call-cancellation): withdraw an unanswered call (caller), request (either party) and decide
// (the other party).
route("POST", "/ledger/v1/calls/:id/withdraw", async (p, b) => J(await adapter.withdrawCall(p.id as Hex, b.cdmHash as Hex)));

route("POST", "/ledger/v1/calls/:id/cancellation", async (p, b) => J(await adapter.requestCancellation(p.id as Hex, b.cdmHash as Hex)));

route("POST", "/ledger/v1/calls/:id/cancellation/decision", async (p, b) =>
  J(await adapter.decideCancellation(p.id as Hex, Boolean(b.accept), b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/calls/:id/pledge", async (p, b) => {
  // The pledgor's gateway approves the control contract for every asset in the accepted proposal, then pledges. The
  // control contract transfers each asset into escrow, so each needs its own allowance (multi-asset collateral).
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const assets = await adapter.getProposalAssets(p.id as Hex, BigInt(b.proposalId));
  const approvals = [];
  for (const a of assets) approvals.push(await adapter.approve(a.token, control, a.qty));
  const pledge = await adapter.pledge(p.id as Hex, BigInt(b.proposalId), b.cdmHash as Hex);
  return J({ approvals, pledge });
});

route("POST", "/ledger/v1/calls/:id/transfer", async (p, b) => {
  // VM settlement: the deliverer's gateway approves the control contract for every asset in the accepted proposal,
  // then settles by moving title directly to the receiver (no escrow).
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const assets = await adapter.getProposalAssets(p.id as Hex, BigInt(b.proposalId));
  const approvals = [];
  for (const a of assets) approvals.push(await adapter.approve(a.token, control, a.qty));
  const transfer = await adapter.settleByTransfer(p.id as Hex, BigInt(b.proposalId), b.cdmHash as Hex);
  return J({ approvals, transfer });
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

route("POST", "/ledger/v1/calls/:id/enforce", async (p) =>
  // Default enforcement: the secured party's gateway seizes the escrowed initial margin once the oracle feed records
  // the pledgor's default (flow-default-enforcement transition 5).
  J(await adapter.enforce(p.id as Hex)),
);

// --- close-out netting on default (flow-close-out-netting, G15) ---

route("POST", "/ledger/v1/close-outs", async (_p, b) =>
  // The secured party's gateway submits the close-out: the control contract applies the pledged collateral to the
  // amount owed and returns the surplus to the pledgor (transitions 6-7).
  J(await adapter.closeOut(b.closeOutId as Hex, getAddress(b.pledgor), BigInt(b.owed), b.cdmHash as Hex)),
);

route("GET", "/ledger/v1/close-outs", async (_p, _b, url) => J(await adapter.listCloseOuts(getAddress(url.searchParams.get("party")!))));

// --- substitution of pledged initial margin (flow-substitution, G16) ---

const assetsOf = (xs: { token: string; qty: string }[]) => xs.map((a) => ({ token: getAddress(a.token), qty: BigInt(a.qty) }));

route("POST", "/ledger/v1/substitutions", async (_p, b) =>
  J(await adapter.requestSubstitution(b.substitutionId as Hex, getAddress(b.securedParty), assetsOf(b.original), assetsOf(b.substitute), b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/substitutions/:id/decision", async (p, b) =>
  J(await adapter.decideSubstitution(p.id as Hex, Boolean(b.consent), b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/substitutions/:id/settle", async (p, b) => {
  // The pledgor's gateway approves the control contract for each substitute asset, then settles: the substitute moves
  // into escrow and the original items come back in the same transaction.
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const { substitute } = await adapter.getSubstitutionAssets(p.id as Hex);
  const approvals = [];
  for (const a of substitute) approvals.push(await adapter.approve(a.token, control, a.qty));
  const settle = await adapter.settleSubstitution(p.id as Hex, b.cdmHash as Hex);
  return J({ approvals, settle });
});

route("GET", "/ledger/v1/substitutions", async (_p, _b, url) => J(await adapter.listSubstitutions(getAddress(url.searchParams.get("party")!))));

route("GET", "/ledger/v1/substitutions/:id", async (p) => {
  const id = p.id as Hex;
  return J({ substitution: await adapter.getSubstitution(id), ...(await adapter.getSubstitutionAssets(id)) });
});

route("GET", "/ledger/v1/substitutions/:id/steps", async (p) => J(await adapter.substitutionSteps(p.id as Hex)));

// --- amendment of agreement terms (flow-agreement-amendment) ---

const termsOf = (xs: { token: string; eligible: boolean; haircutBps: number }[]) =>
  xs.map((t) => ({ token: getAddress(t.token), eligible: Boolean(t.eligible), haircutBps: Number(t.haircutBps) }));

route("POST", "/ledger/v1/amendments", async (_p, b) =>
  J(await adapter.proposeAmendment(b.amendmentId as Hex, getAddress(b.pledgor), getAddress(b.securedParty), termsOf(b.terms ?? []), b.beforeHash as Hex, b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/amendments/:id/decision", async (p, b) =>
  J(await adapter.decideAmendment(p.id as Hex, Boolean(b.consent), b.cdmHash as Hex)),
);

route("GET", "/ledger/v1/amendments", async (_p, _b, url) => J(await adapter.listAmendments(getAddress(url.searchParams.get("party")!))));

route("GET", "/ledger/v1/amendments/:id", async (p) => J(await adapter.getAmendment(p.id as Hex)));

// The terms between a pledgor and a secured party: agreement hash, pending amendment, eligibility per registry token.
route("GET", "/ledger/v1/pair-terms", async (_p, _b, url) =>
  J(await adapter.pairTerms(getAddress(url.searchParams.get("pledgor")!), getAddress(url.searchParams.get("securedParty")!))),
);

// --- interest on cash collateral (flow-interest-on-cash, G17) ---

route("POST", "/ledger/v1/interest", async (_p, b) => {
  // The secured party's gateway states the Interest Amount; for a positive amount it first approves the control
  // contract for the cash token, which pays the pledgor in the same transaction.
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  // With hold (flow-settlement-netting) the amount is stated and held for settlement netting; nothing moves now.
  const amount = BigInt(b.amount);
  const cashToken = getAddress(b.cashToken);
  if (b.hold) return J({ stated: await adapter.stateInterestForNetting(b.interestId as Hex, getAddress(b.pledgor), cashToken, amount, b.cdmHash as Hex) });
  const approval = amount > 0n ? await adapter.approve(cashToken, control, amount) : undefined;
  const stated = await adapter.stateInterest(b.interestId as Hex, getAddress(b.pledgor), cashToken, amount, b.cdmHash as Hex);
  return J({ approval, stated });
});

route("POST", "/ledger/v1/interest/:id/pay", async (p) => {
  // The paying party's gateway pays a stated Interest Amount (the pledgor a negative one, the secured party a positive
  // one held for netting): approve the control contract, then pay.
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const s = await adapter.getInterest(p.id as Hex);
  const approval = await adapter.approve(s.cashToken, control, s.amount < 0n ? -s.amount : s.amount);
  const paid = await adapter.payInterest(p.id as Hex);
  return J({ approval, paid });
});

route("GET", "/ledger/v1/interest", async (_p, _b, url) => J(await adapter.listInterest(getAddress(url.searchParams.get("party")!))));

route("GET", "/ledger/v1/interest/:id", async (p) => J(await adapter.getInterest(p.id as Hex)));

// --- settlement netting (flow-settlement-netting) ---

route("POST", "/ledger/v1/nettings", async (_p, b) => {
  // The gateway of the party owing the net approves the control contract for the net amount (units of the cash
  // token), then settles the calls and held Interest Amounts together.
  const control = (await import("./registry.ts")).loadRegistry().contracts.collateralControl;
  const cashToken = getAddress(b.cashToken);
  const amount = BigInt(b.amount ?? 0);
  const approval = amount > 0n ? await adapter.approve(cashToken, control, amount) : undefined;
  const settled = await adapter.settleNetted(b.nettingId as Hex, b.callIds as Hex[], b.callCdmHashes as Hex[], (b.interestIds ?? []) as Hex[], cashToken, b.cdmHash as Hex);
  return J({ approval, settled });
});

route("GET", "/ledger/v1/nettings", async (_p, _b, url) => J(await adapter.listNettings(getAddress(url.searchParams.get("party")!))));

route("GET", "/ledger/v1/netted-in/:id", async (p) => J({ nettingId: await adapter.nettedIn(p.id as Hex) }));

// The escrow and feed prices between a pledgor and a secured party at the end of a block (flow-substitution).
route("GET", "/ledger/v1/escrow-at", async (_p, _b, url) =>
  J(await adapter.escrowAt(getAddress(url.searchParams.get("pledgor")!), getAddress(url.searchParams.get("securedParty")!), BigInt(url.searchParams.get("block")!))),
);

route("POST", "/ledger/v1/oracle/defaults", async (_p, b) =>
  // Oracle feed write (architecture relationship oracle-to-gateway). Only the operator's gateway holds the publisher
  // key, so only that instance can serve this; any other instance refuses before submitting.
  J(await adapter.setDefault(getAddress(b.party), b.inDefault === undefined ? true : Boolean(b.inDefault))),
);

route("GET", "/ledger/v1/defaults/:party", async (p) => {
  const party = getAddress(p.party);
  return { party, inDefault: await adapter.isDefaulted(party) };
});

route("POST", "/ledger/v1/oracle/prices", async (_p, b) =>
  // Oracle price write (flow-oracle-update transitions 2-3): {token: address, price: scaled by priceScale}. Served
  // only by the operator's gateway, which holds the publisher key.
  J(await adapter.publishPrice(getAddress(b.token), BigInt(b.price))),
);

// Prices on the oracle feed, read from this party's own node: every registry token, or one token by address.
route("GET", "/ledger/v1/prices", async () => {
  const reg = (await import("./registry.ts")).loadRegistry();
  const prices = [];
  for (const [symbol, t] of Object.entries(reg.tokens)) prices.push({ symbol, token: t.address, price: await adapter.priceOf(t.address) });
  return J({ priceScale: reg.priceScale, prices });
});

route("GET", "/ledger/v1/prices/:token", async (p) => {
  const token = getAddress(p.token);
  return J({ token, price: await adapter.priceOf(token) });
});

route("GET", "/ledger/v1/settlement-history", async (_p, _b, url) =>
  J(await adapter.settlementHistory(getAddress(url.searchParams.get("pledgor")!), getAddress(url.searchParams.get("securedParty")!))),
);

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
