// Client for a participant's live collateral workflow service (/api/v1). In live mode the console drives the real
// stack (service -> gateway -> Besu) instead of the in-browser engine mock. One service per party: A on 8001, B on
// 8002 by default (override with VITE_SERVICE_A_URL / VITE_SERVICE_B_URL). This is the console-to-service connection
// in architecture/prototype.architecture.json.
export type LiveParty = "A" | "B";

const DEFAULT_URL: Record<LiveParty, string> = { A: "http://localhost:8001", B: "http://localhost:8002" };

// Precedence: an explicit VITE_SERVICE_<P>_URL, then the same-origin proxy path when VITE_SERVICE_PROXY=1 (set in the
// devcontainer; the dev/preview server forwards /svc/<P> to the service, vite.config.ts), then localhost.
export function serviceUrl(party: LiveParty, env: Record<string, string | undefined> = (import.meta as any).env ?? {}): string {
  const explicit = party === "A" ? env.VITE_SERVICE_A_URL : env.VITE_SERVICE_B_URL;
  if (explicit) return explicit;
  if (env.VITE_SERVICE_PROXY === "1") return `/svc/${party}`;
  return DEFAULT_URL[party];
}

export interface LiveContext {
  party: LiveParty;
  role: string;
  node: string;
  address: string;
  counterparty: LiveParty;
  counterpartyAddress: string;
  priceScale: string;
  tokens: { symbol: string; address: string; isin: string; cusip: string; dti: string; haircutBps: number }[];
  agreement: string;
}

export interface LiveProposal {
  proposalId: number;
  state: "none" | "proposed" | "accepted" | "rejected";
  assets: { token: string; qty: string }[];
}

export interface LiveCall {
  callId: string;
  kind: "IM" | "VM" | "Return";
  from: LiveParty;
  to: LiveParty;
  amountUsd: string;
  agreedUsd: string;
  disputedUsd: string;
  state: "none" | "issued" | "agreed" | "partially agreed" | "disputed" | "settled" | "settled (agreed part)";
  cdmHash: string;
  proposals: LiveProposal[];
  messages: { msgType: string; direction: string; cdmHash: string; cdmJson: string; createdAt: string }[];
  /** Settlement and feed events this party's service recorded for the call (Returned, Enforced). */
  events?: string[];
  /** The secured party enforced against the pledged initial margin under this call (flow-default-enforcement). */
  enforced?: boolean;
}

export interface LiveState {
  party: LiveParty;
  role: string;
  calls: LiveCall[];
  balances: { token: string; free: string; pledged: string }[];
  /** Default status of each counterparty on the oracle feed, read through this party's gateway. */
  defaults?: Partial<Record<LiveParty, boolean>>;
}

async function req<T>(party: LiveParty, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(serviceUrl(party) + "/api/v1" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error ?? `${method} ${path} -> ${res.status}`);
  return json as T;
}

export const api = {
  context: (p: LiveParty) => req<LiveContext>(p, "GET", "/context"),
  state: (p: LiveParty) => req<LiveState>(p, "GET", "/state"),
  issueCall: (p: LiveParty, toParty: LiveParty, amountUsd: number, kind = "IM", purpose?: "top-up") =>
    req<{ callId: string }>(p, "POST", "/calls", { kind, toParty, amountUsd, deadlineDays: 1, purpose }),
  respond: (p: LiveParty, callId: string, response: string, agreedUsd?: number) =>
    req<{ ok: boolean }>(p, "POST", `/calls/${callId}/response`, { response, agreedUsd }),
  propose: (p: LiveParty, callId: string, assets: { token: string; qty: number }[]) =>
    req<{ proposalId: number }>(p, "POST", `/calls/${callId}/proposal`, { assets }),
  decide: (p: LiveParty, callId: string, proposalId: number, accept: boolean) =>
    req<{ ok: boolean }>(p, "POST", `/calls/${callId}/decision`, { proposalId, accept }),
  pledge: (p: LiveParty, callId: string, proposalId: number) =>
    req<{ ok: boolean }>(p, "POST", `/calls/${callId}/pledge`, { proposalId }),
  transfer: (p: LiveParty, callId: string, proposalId: number) =>
    req<{ ok: boolean }>(p, "POST", `/calls/${callId}/transfer`, { proposalId }),
  returnSettle: (p: LiveParty, callId: string, via: "release" | "transfer", assets: { token: string; qty: number }[]) =>
    req<{ ok: boolean }>(p, "POST", `/calls/${callId}/return`, { via, assets }),
  /** Declare the pledgor's default (published to the oracle feed through the oracle service) and enforce. */
  enforce: (p: LiveParty, callId: string) =>
    req<{ ok: boolean; pledgor: string; defaultTx: string; enforceTx: string }>(p, "POST", `/calls/${callId}/enforce`, {}),
  /** Revaluation of the pledged IM at the oracle feed prices after haircuts (flow-revaluation-top-up). */
  revaluation: (p: LiveParty) => req<LiveRevaluation>(p, "GET", "/revaluation"),
};

export interface LiveRevaluation {
  requiredUsd: string;
  valueUsd: string;
  shortfallUsd: string;
  /** The top-up call amount: the shortfall rounded up to roundingUsd, or 0 below the minimum transfer amount. */
  topUpUsd: string;
  mtaUsd: string;
  roundingUsd: string;
  tokens: { token: string; pledged: string; price: string; haircutBps: number; valueUsd: string }[];
}

// The market operator's oracle service (architecture node oracle-service, relationship console-to-oracle). Same
// precedence as serviceUrl: VITE_ORACLE_URL, then the same-origin proxy path /svc/oracle, then localhost:8100.
export function oracleUrl(env: Record<string, string | undefined> = (import.meta as any).env ?? {}): string {
  if (env.VITE_ORACLE_URL) return env.VITE_ORACLE_URL;
  if (env.VITE_SERVICE_PROXY === "1") return "/svc/oracle";
  return "http://localhost:8100";
}

export interface MarketToken {
  symbol: string;
  token: string;
  price: string | null;
  priceUsd: string | null;
  rating: string | null;
}

async function oracleReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(oracleUrl() + "/oracle/v1" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error ?? `${method} ${path} -> ${res.status}`);
  return json as T;
}

export const oracleApi = {
  marketData: () => oracleReq<{ priceScale: string; tokens: MarketToken[] }>("GET", "/market-data"),
  /** Operator price edit; the oracle publishes it to the on-chain feed before keeping it. */
  editPrice: (symbol: string, priceUsd: string) => oracleReq<MarketToken & { tx: { txHash: string } }>("PUT", `/market-data/${symbol}`, { price: priceUsd }),
};
