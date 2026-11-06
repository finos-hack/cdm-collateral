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
  state: "none" | "issued" | "agreed" | "partially agreed" | "disputed" | "settled" | "settled (agreed part)" | "cancelled";
  cdmHash: string;
  /** The party whose cancellation request is pending, if any (task-csa-call-cancellation). */
  cancellationRequestedBy?: LiveParty | null;
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
  /** Calling party: withdraw an unanswered call (task-csa-call-cancellation). */
  withdrawCall: (p: LiveParty, callId: string, reason: string) =>
    req<{ cdmHash: string; withdrawTx: string }>(p, "POST", `/calls/${callId}/withdraw`, { reason }),
  /** Either party: ask to cancel an answered call that is not settled (colr.005). */
  requestCancellation: (p: LiveParty, callId: string, reason: string) =>
    req<{ cdmHash: string; requestTx: string }>(p, "POST", `/calls/${callId}/cancellation`, { reason }),
  /** The other party: accept or refuse the pending cancellation request (colr.006). */
  decideCancellation: (p: LiveParty, callId: string, accept: boolean, reason: string) =>
    req<{ cdmHash: string; decisionTx: string }>(p, "POST", `/calls/${callId}/cancellation/decision`, { accept, reason }),
  enforce: (p: LiveParty, callId: string) =>
    req<{ ok: boolean; pledgor: string; defaultTx: string; enforceTx: string }>(p, "POST", `/calls/${callId}/enforce`, {}),
  /** Revaluation of the pledged IM at the oracle feed prices after haircuts (flow-revaluation-top-up). */
  revaluation: (p: LiveParty) => req<LiveRevaluation>(p, "GET", "/revaluation"),
  /** Close-outs on default with their checked CDM CloseOutStatement (flow-close-out-netting). */
  closeOuts: (p: LiveParty) => req<LiveCloseOut[]>(p, "GET", "/close-outs"),
  /** Secured party: declare the pledgor's default if the feed does not show it, then close out against the escrow. */
  closeOut: (p: LiveParty, closeOutAmountUsd: number) =>
    req<LiveCloseOut & { closeOutTx: string; defaultTx?: string }>(p, "POST", "/close-outs", { closeOutAmountUsd }),
  /** The agreement terms in force and the pair's amendments (flow-agreement-amendment). */
  agreement: (p: LiveParty) => req<LiveAgreement>(p, "GET", "/agreement"),
  /** Either party: propose an amendment (a new pledgor MTA, haircut changes) to the counterparty. */
  proposeAmendment: (p: LiveParty, mtaUsd: number | null, haircuts: LiveHaircutTerm[]) =>
    req<{ amendmentId: string; cdmHash: string; proposeTx: string }>(p, "POST", "/amendments", { mtaUsd, haircuts }),
  /** The other party: consent to or refuse a proposed amendment. */
  decideAmendment: (p: LiveParty, amendmentId: string, consent: boolean) =>
    req<{ amendmentId: string; consent: boolean; decisionHash: string; decisionTx: string }>(p, "POST", `/amendments/${amendmentId}/decision`, { consent }),
  /** Interest statements on cash collateral (flow-interest-on-cash). */
  interest: (p: LiveParty) => req<LiveInterest[]>(p, "GET", "/interest"),
  /** Secured party: state the Interest Amount on the pledgor's tUSD for one period at one observed rate (percent). */
  stateInterest: (p: LiveParty, periodStart: string, periodEnd: string, observedRatePct: number) =>
    req<LiveInterest & { stateTx: string }>(p, "POST", "/interest", { periodStart, periodEnd, observedRatePct }),
  /** Pledgor: pay a negative Interest Amount. */
  payInterest: (p: LiveParty, interestId: string) => req<{ payTx: string }>(p, "POST", `/interest/${interestId}/pay`, {}),
  /** Substitutions of pledged collateral with their CDM fold (flow-substitution). */
  substitutions: (p: LiveParty) => req<LiveSubstitution[]>(p, "GET", "/substitutions"),
  requestSubstitution: (p: LiveParty, original: { token: string; qty: number }[], substitute: { token: string; qty: number }[]) =>
    req<{ substitutionId: string; originalUsd: string; substituteUsd: string }>(p, "POST", "/substitutions", { original, substitute }),
  decideSubstitution: (p: LiveParty, substitutionId: string, consent: boolean, reason?: string) =>
    req<{ ok: boolean }>(p, "POST", `/substitutions/${substitutionId}/decision`, { consent, reason }),
  settleSubstitution: (p: LiveParty, substitutionId: string) => req<{ ok: boolean }>(p, "POST", `/substitutions/${substitutionId}/settle`, {}),
};

export interface LiveCloseOut {
  closeOutId: string;
  securedParty: LiveParty;
  pledgor: LiveParty;
  /** The Early Termination Amount owed by the pledgor (0 when not positive), as the contract recorded it. */
  owedUsd: string;
  /** Value after haircuts of the collateral the contract applied, in whole token units. */
  appliedUsd: string;
  cdmHash: string;
  block?: string;
  /** The statement was read from the payload store, matches the on-chain hash, and CloseOutNetting over its inputs gives it. */
  verified?: boolean;
  error?: string;
  closeOutAmountUsd?: string;
  earlyTerminationAmountUsd?: string;
  collateralHeldUsd?: string;
  collateralAppliedUsd?: string;
  amountPayableUsd?: string;
}

export interface LiveHaircutTerm {
  token: string;
  eligible: boolean;
  haircutBps: number;
}

export interface LiveAmendment {
  amendmentId: string;
  block: string;
  proposer: LiveParty;
  mine: boolean;
  state: "none" | "proposed" | "agreed" | "refused";
  cdmHash: string;
  haircuts: LiveHaircutTerm[];
  /** The pledgor's new Minimum Transfer Amount, when the amendment changes the elections. */
  mtaUsd: string | null;
  effectiveDate?: string;
}

export interface LiveAgreement {
  agreement: string;
  securedParty: string;
  pledgor: string;
  mtaUsd: string;
  roundingUsd: string;
  haircuts: (LiveHaircutTerm & { isin: string; onChainHaircutBps: number | null; matches: boolean })[];
  /** Hash of the last agreed amendment as this service folded it, and as the contract records it. */
  agreementHash: string;
  onChainAgreementHash: string;
  agreedAmendments: number;
  /** Every agreed amendment verified, and the folded hash and haircuts match the chain. */
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: LiveAmendment[];
}

export interface LiveInterest {
  interestId: string;
  securedParty: LiveParty;
  pledgor: LiveParty;
  /** On-chain amount in tUSD: positive from the secured party to the pledgor, negative the other way. */
  amountUsd: string;
  state: "none" | "stated" | "settled";
  cdmHash: string;
  block?: string;
  /** The statement was read from the payload store, matches the on-chain hash and amount, and recomputes from its days. */
  verified?: boolean;
  error?: string;
  periodStart?: string;
  periodEnd?: string;
  days?: number;
  balanceUsd?: string;
  ratePct?: string;
  interestAmountUsd?: string;
  transferAmountUsd?: string;
}

export interface LiveSubstitution {
  substitutionId: string;
  pledgor: LiveParty;
  securedParty: LiveParty;
  state: "none" | "requested" | "consented" | "refused" | "settled";
  original: { token: string; qty: string }[];
  substitute: { token: string; qty: string }[];
  cdm: { status: string; qualifiers?: string[]; stateHash?: string; converged: boolean; totalSteps: number; foldedSteps: number; error?: string };
}

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
