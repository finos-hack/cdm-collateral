// Client for a participant's live collateral workflow service (/api/v1). In live mode the console drives the real
// stack (service -> gateway -> Besu) instead of the in-browser engine mock. One service per party: A on 8001, B on
// 8002 by default (override with VITE_SERVICE_A_URL / VITE_SERVICE_B_URL). This is the console-to-service connection
// in architecture/prototype.architecture.json.
export type LiveParty = "A" | "B";

const DEFAULT_URL: Record<LiveParty, string> = { A: "http://localhost:8001", B: "http://localhost:8002" };

export function serviceUrl(party: LiveParty): string {
  const env = (import.meta as any).env ?? {};
  return (party === "A" ? env.VITE_SERVICE_A_URL : env.VITE_SERVICE_B_URL) ?? DEFAULT_URL[party];
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
}

export interface LiveState {
  party: LiveParty;
  role: string;
  calls: LiveCall[];
  balances: { token: string; free: string; pledged: string }[];
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
  issueCall: (p: LiveParty, toParty: LiveParty, amountUsd: number, kind = "IM") =>
    req<{ callId: string }>(p, "POST", "/calls", { kind, toParty, amountUsd, deadlineDays: 1 }),
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
};
