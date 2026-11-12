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
  /** Both legs of the initial margin (wp-adr-two-way-im): this party pledges on the first, secures the second. */
  legs?: { pledgor: LiveParty; securedParty: LiveParty }[];
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
  /** The cancelled call this call replaces, and the call that replaces this one (task-csa-call-replacement). */
  replaces?: string | null;
  replacedBy?: string | null;
  /** The settlement netting the call settled in (flow-settlement-netting). */
  nettedIn?: string | null;
  proposals: LiveProposal[];
  messages: { msgType: string; direction: string; cdmHash: string; cdmJson: string; createdAt: string }[];
  /** Settlement and feed events this party's service recorded for the call (Returned, Enforced). */
  events?: string[];
  /** The secured party enforced against the pledged initial margin under this call (flow-default-enforcement). */
  enforced?: boolean;
  /** The leg of an IM or return call, by its pledgor (wp-adr-two-way-im); none for VM. */
  leg?: LiveParty | null;
}

export interface LiveState {
  party: LiveParty;
  role: string;
  calls: LiveCall[];
  /** pledged: the default leg's escrow (A pledges); pledgedByLeg: each leg's, keyed by its pledgor (wp-adr-two-way-im). */
  balances: { token: string; free: string; pledged: string; pledgedByLeg?: Partial<Record<LiveParty, string>> }[];
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

/** A suggested basket (flow-allocation): whole units in ranking order; empty when the inventory cannot cover the call. */
export interface LiveAllocation {
  callId: string;
  covers: boolean;
  assets: { token: string; qty: number }[];
  valueUsd: string;
  agreedUsd: string;
  ranking: string[];
}

/** One trade that does not reconcile (flow-reconciliation, cdm-ext ReconciliationBreak). */
export interface LiveReconciliationBreak {
  uti: string;
  type: "MissingFromSecond" | "MissingFromFirst" | "EconomicTermsDiffer" | "ValuationDiffers";
  terms: string[];
  firstValuationUsd: string | null;
  secondValuationUsd: string | null;
  differenceUsd: string | null;
}

/** A portfolio reconciliation run: the CDM PortfolioReconciliation and its on-chain state. */
export interface LivePortfolioReconciliation {
  reconciliationId: string;
  firstSnapshotId: string;
  secondSnapshotId: string;
  resultHash: string;
  firstParty: string;
  secondParty: string;
  reconciled: boolean;
  matchedTrades: number;
  breaks: LiveReconciliationBreak[];
  firstExposureUsd: string;
  secondExposureUsd: string;
  exposureDifferenceUsd: string;
  toleranceUsd: string;
  onChain: { state: "none" | "one result" | "agreed" | "disagreed"; firstPartyResult: string; secondPartyResult: string };
}

/** The party's CDM records against the chain (flow-reconciliation, cdm-ext LedgerReconciliation). */
export interface LiveLedgerReconciliation {
  party: string;
  counterparty: string;
  reconciled: boolean;
  checkedFacts: number;
  calls: number;
  breaks: { record: string; attribute: string; type: string; recorded: string | null; ledger: string | null }[];
  /** The pledgor's escrow by token: as the party's CDM records build it and as the control contract holds it. */
  escrow?: { record: string; recorded: Record<string, number>; ledger: Record<string, number> };
}

export const api = {
  context: (p: LiveParty) => req<LiveContext>(p, "GET", "/context"),
  state: (p: LiveParty) => req<LiveState>(p, "GET", "/state"),
  issueCall: (p: LiveParty, toParty: LiveParty, amountUsd: number, kind = "IM", purpose?: "top-up") =>
    req<{ callId: string }>(p, "POST", "/calls", { kind, toParty, amountUsd, deadlineDays: 1, purpose }),
  /** Calling party: issue a call that replaces a cancelled one; kind and called party are the cancelled call's. */
  replaceCall: (p: LiveParty, callId: string, amountUsd: number) =>
    req<{ callId: string }>(p, "POST", "/calls", { replacesCallId: callId, amountUsd, deadlineDays: 1 }),
  /** reconciliationId: a dispute or partial agreement that cites a portfolio reconciliation run (flow-reconciliation). */
  respond: (p: LiveParty, callId: string, response: string, agreedUsd?: number, reconciliationId?: string) =>
    req<{ ok: boolean; dispute?: { disputeIdentifier: string; reason: string; cdmHash: string } }>(p, "POST", `/calls/${callId}/response`, { response, agreedUsd, reconciliationId }),
  propose: (p: LiveParty, callId: string, assets: { token: string; qty: number }[]) =>
    req<{ proposalId: number }>(p, "POST", `/calls/${callId}/proposal`, { assets }),
  /** Called party: a suggested basket for an agreed IM or VM call (flow-allocation); nothing is recorded. */
  allocate: (p: LiveParty, callId: string, ranking?: string[]) =>
    req<LiveAllocation>(p, "POST", `/calls/${callId}/allocation`, ranking ? { ranking } : {}),
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
  revaluation: (p: LiveParty, legPledgor: LiveParty = "A") => req<LiveRevaluation>(p, "GET", `/revaluation?pledgor=${legPledgor}`),
  /** Pledgor: take back its whole escrow on its leg once the feed records the secured party's default (wp-adr-two-way-im). */
  reclaim: (p: LiveParty) =>
    req<{ reclaimId: string; cdmHash: string; reclaimedUsd: string; eventQualifier: string; reclaimTx: string }>(p, "POST", "/reclaims", {}),
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
  /** This party's repos and the service's business date (wp-adr-repo-purchase-repurchase). */
  repos: (p: LiveParty) => req<LiveRepos>(p, "GET", "/repos"),
  /** The seller books a term repo with the counterparty; the quantity follows from the feed price. */
  /** buySellBack books a buy/sell-back (wp-adr-repo-buy-sell-back): the same terms, CDM's trade type BuySellBack. */
  bookRepo: (p: LiveParty, terms: { security: string; purchasePrice: number; ratePercent: string; termDays: number; marginRatio?: string | null; buySellBack?: boolean }) =>
    req<{ repoId: string; tradeHash: string; quantity: number; repurchasePrice: number; bookTx: string }>(p, "POST", "/repos", terms),
  affirmRepo: (p: LiveParty, repoId: string) => req<{ repoId: string; tradeHash: string; affirmTx: string }>(p, "POST", `/repos/${repoId}/affirm`, {}),
  /** Approve this party's leg and instruct the purchase or the repurchase; the second instruction settles both legs. */
  settleRepo: (p: LiveParty, repoId: string, phase: "purchase" | "repurchase") =>
    req<{ repoId: string; phase: string; cdmHash: string; instructTx: string }>(p, "POST", `/repos/${repoId}/settle`, { phase }),
  repoTrade: (p: LiveParty, repoId: string) => req<LiveRepoTrade>(p, "GET", `/repos/${repoId}/trade`),
  /** Net Exposure across the pair's repos and the Net Margin held (wp-adr-repo-margin-maintenance). */
  repoMargin: (p: LiveParty) => req<LiveRepoMargin>(p, "GET", "/repo-margin"),
  /** GMRA default close-out (wp-adr-repo-default-close-out): the default status, a preview and the recorded close-outs. */
  repoDefault: (p: LiveParty) => req<LiveRepoDefault>(p, "GET", "/repo-default"),
  /** The non-defaulting party closes out every purchased repo with the counterparty; notifies the default first if needed. */
  closeOutRepoDefault: (p: LiveParty) =>
    req<{ closeOutId: string; cdmHash: string; statement: LiveGmraCloseOutStatement; closeOutTx: string }>(p, "POST", "/repo-default/close-out", {}),
  /** The party that owes a close-out balance pays it. */
  payRepoCloseOut: (p: LiveParty, id: string) => req<{ closeOutId: string; amount: string; payTx: string }>(p, "POST", `/repo-default/close-outs/${id}/pay`, {}),
  /** GMSLA default close-out (wp-adr-gmsla-default-close-out): the default status, a preview and the recorded close-outs. */
  loanDefault: (p: LiveParty) => req<LiveLoanDefault>(p, "GET", "/loan-default"),
  /** The non-defaulting party closes out every open loan with the counterparty; notifies the default first if needed. */
  closeOutLoanDefault: (p: LiveParty) =>
    req<{ closeOutId: string; cdmHash: string; statement: LiveGmslaCloseOutStatement; closeOutTx: string }>(p, "POST", "/loan-default/close-out", {}),
  /** The party that owes a loan close-out balance pays it. */
  payLoanCloseOut: (p: LiveParty, id: string) => req<{ closeOutId: string; amount: string; payTx: string }>(p, "POST", `/loan-default/close-outs/${id}/pay`, {}),
  /** The party with the Net Exposure calls it; the service computes the amount. */
  callRepoMargin: (p: LiveParty) => req<{ callId: string; cdmHash: string; amountUsd: number }>(p, "POST", "/repo-margin/calls", {}),
  /** Reprice every purchased repo instead of calling margin (wp-adr-repo-reprice); the other party agrees. */
  proposeRepoReprice: (p: LiveParty) => req<{ repos: unknown[] }>(p, "POST", "/repo-margin/reprice", {}),
  agreeRepoReprice: (p: LiveParty) => req<{ repos: unknown[] }>(p, "POST", "/repo-margin/reprice/agree", {}),
  /** Adjust the securities of every purchased repo instead of calling margin (wp-adr-repo-adjustment). */
  proposeRepoAdjustment: (p: LiveParty) => req<{ repos: unknown[] }>(p, "POST", "/repo-margin/adjust", {}),
  agreeRepoAdjustment: (p: LiveParty) => req<{ repos: unknown[] }>(p, "POST", "/repo-margin/adjust/agree", {}),
  /** The Seller of a purchased repo requests a substitution of its securities (wp-adr-repo-substitution); the Buyer agrees or refuses. */
  requestRepoSubstitution: (p: LiveParty, id: string, security: string) => req<{ repoId: string; newQuantity: string }>(p, "POST", `/repos/${id}/substitute`, { security }),
  agreeRepoSubstitution: (p: LiveParty, id: string) => req<{ repoId: string }>(p, "POST", `/repos/${id}/substitute/agree`, {}),
  refuseRepoSubstitution: (p: LiveParty, id: string) => req<{ refuseTx: string }>(p, "POST", `/repos/${id}/substitute/refuse`, {}),
  /** Interim interest on a purchased repo: the Seller pays, the Buyer agrees or refuses (wp-adr-repo-income). */
  payRepoInterimInterest: (p: LiveParty, id: string) => req<{ repoId: string; amount: string }>(p, "POST", `/repos/${id}/interim-interest`, {}),
  agreeRepoInterimInterest: (p: LiveParty, id: string) => req<{ repoId: string }>(p, "POST", `/repos/${id}/interim-interest/agree`, {}),
  refuseRepoInterimInterest: (p: LiveParty, id: string) => req<{ refuseTx: string }>(p, "POST", `/repos/${id}/interim-interest/refuse`, {}),
  /** Manufactured income on a purchased repo: the Buyer pays, the Seller agrees or refuses (wp-adr-repo-income). */
  payRepoIncome: (p: LiveParty, id: string, income: { incomePerUnit: string; incomeDate: string }) => req<{ repoId: string; amount: string }>(p, "POST", `/repos/${id}/income`, income),
  agreeRepoIncome: (p: LiveParty, id: string) => req<{ repoId: string }>(p, "POST", `/repos/${id}/income/agree`, {}),
  refuseRepoIncome: (p: LiveParty, id: string) => req<{ refuseTx: string }>(p, "POST", `/repos/${id}/income/refuse`, {}),
  /** A roll on the Repurchase Date: either party proposes, the other agrees or refuses (wp-adr-repo-roll). */
  proposeRepoRoll: (p: LiveParty, id: string, roll: { newRepurchaseDate: string; ratePercent: string }) => req<{ repoId: string }>(p, "POST", `/repos/${id}/roll`, roll),
  agreeRepoRoll: (p: LiveParty, id: string) => req<{ repoId: string }>(p, "POST", `/repos/${id}/roll/agree`, {}),
  refuseRepoRoll: (p: LiveParty, id: string) => req<{ refuseTx: string }>(p, "POST", `/repos/${id}/roll/refuse`, {}),
  /** A pair-off of two offsetting repos on their common Repurchase Date: either party proposes, the other agrees or refuses (wp-adr-repo-pair-off). */
  proposeRepoPairOff: (p: LiveParty, id: string, otherRepoId: string) => req<{ repoId: string; cdmHash: string }>(p, "POST", `/repos/${id}/pair-off`, { otherRepoId }),
  agreeRepoPairOff: (p: LiveParty, id: string) => req<{ repoId: string; cdmHash: string }>(p, "POST", `/repos/${id}/pair-off/agree`, {}),
  refuseRepoPairOff: (p: LiveParty, id: string) => req<{ refuseTx: string }>(p, "POST", `/repos/${id}/pair-off/refuse`, {}),
  /** The holder of Cash Margin states and pays the interest on it for one period, at the rate entered by hand. */
  payRepoMarginInterest: (p: LiveParty, period: { periodStart: string; periodEnd: string; observedRatePct: string }) =>
    req<{ interestId: string; cdmHash: string; amountUsd: number }>(p, "POST", "/repo-margin/interest", period),
  businessDate: (p: LiveParty) => req<{ businessDate: string }>(p, "GET", "/business-date"),
  setBusinessDate: (p: LiveParty, businessDate: string) => req<{ businessDate: string }>(p, "POST", "/business-date", { businessDate }),
  /** The GMRA terms in force and the pair's GMRA amendments (wp-adr-repo-gmra-terms). */
  gmraTerms: (p: LiveParty) => req<LiveGmraTerms>(p, "GET", "/gmra/terms"),
  /** Either party: propose a GMRA amendment, one party's MTA and/or the default Margin Ratio. */
  proposeGmraAmendment: (p: LiveParty, change: { party?: LiveParty; mtaUsd?: number | null; defaultMarginRatio?: string | null }) =>
    req<{ amendmentId: string; cdmHash: string; changed: string[]; proposeTx: string }>(p, "POST", "/gmra/amendments", change),
  /** The counterparty: consent to or refuse a proposed GMRA amendment. */
  decideGmraAmendment: (p: LiveParty, amendmentId: string, consent: boolean) =>
    req<{ amendmentId: string; consent: boolean; decisionHash: string; decisionTx: string }>(p, "POST", `/gmra/amendments/${amendmentId}/decision`, { consent }),
  /** The GMSLA terms in force and the pair's GMSLA amendments (wp-adr-gmsla-terms). */
  gmslaTerms: (p: LiveParty) => req<LiveGmslaTerms>(p, "GET", "/gmsla/terms"),
  /** The aggregated mark of the pair's securities loans, stated for this party (wp-adr-gmsla-marking). */
  gmslaMarking: (p: LiveParty) => req<LiveGmslaMarking>(p, "GET", "/gmsla-marking"),
  /** Call the net figure as a GMSLA VM call by title transfer; its IssueCall step carries the mark statement's hash. */
  callGmslaMargin: (p: LiveParty) =>
    req<{ callId: string; cdmHash: string; statementHash: string; amountUsd: number }>(p, "POST", "/gmsla-marking/calls", {}),
  /** The lender recalls all or part of an open loan; the borrower returns it by the intended settlement date. */
  recallLoan: (p: LiveParty, loanId: string, quantity?: number) =>
    req<{ loanId: string; noticeHash: string; quantity: number; intendedSettlementDate: string; recallTx: string }>(p, "POST", `/loans/${loanId}/recall`, quantity === undefined ? {} : { quantity }),
  withdrawLoanRecall: (p: LiveParty, loanId: string) =>
    req<{ loanId: string; withdrawalHash: string; withdrawTx: string }>(p, "POST", `/loans/${loanId}/recall/withdraw`, {}),
  /** The borrower asks to substitute all the loan's non-cash collateral with another security (wp-adr-gmsla-substitution). */
  substituteLoanCollateral: (p: LiveParty, loanId: string, collateral: string) =>
    req<{ loanId: string; cdmHash: string; quantity: string; requestTx: string }>(p, "POST", `/loans/${loanId}/substitute`, { collateral }),
  /** The lender agrees to the pending substitution, or refuses it. */
  agreeLoanSubstitution: (p: LiveParty, loanId: string) =>
    req<{ loanId: string; cdmHash: string; agreeTx: string }>(p, "POST", `/loans/${loanId}/substitute/agree`, {}),
  refuseLoanSubstitution: (p: LiveParty, loanId: string) =>
    req<{ loanId: string; refuseTx: string }>(p, "POST", `/loans/${loanId}/substitute/refuse`, {}),
  /** The party receiving the loan's rate bills it to its business date: the borrower the rebate of a cash loan
   *  (wp-adr-gmsla-rebate), the lender the fee of a loan against securities (wp-adr-gmsla-lending-fee); the other pays or refuses. */
  billLoan: (p: LiveParty, loanId: string) =>
    req<{ loanId: string; invoiceHash: string; amount: string; periodStart: string; periodEnd: string; billTx: string }>(p, "POST", `/loans/${loanId}/bill`, {}),
  payLoanBill: (p: LiveParty, loanId: string) =>
    req<{ loanId: string; invoiceHash: string; payTx: string }>(p, "POST", `/loans/${loanId}/bill/pay`, {}),
  refuseLoanBill: (p: LiveParty, loanId: string) =>
    req<{ loanId: string; refuseTx: string }>(p, "POST", `/loans/${loanId}/bill/refuse`, {}),
  /** This party's securities loans (wp-adr-gmsla-loan-delivery-return). */
  loans: (p: LiveParty) => req<LiveLoans>(p, "GET", "/loans"),
  /** The lender books a loan; the collateral follows from the feed prices and the margin (default: the GMSLA default margin). */
  bookLoan: (p: LiveParty, terms: { security: string; quantity: number; collateral: string; ratePercent: string; margin?: string | null; termDays?: number | null }) =>
    req<{ loanId: string; tradeHash: string; collateralAmount: number; bookTx: string }>(p, "POST", "/loans", terms),
  affirmLoan: (p: LiveParty, loanId: string) => req<{ loanId: string; tradeHash: string; affirmTx: string }>(p, "POST", `/loans/${loanId}/affirm`, {}),
  deliverLoan: (p: LiveParty, loanId: string) => req<{ loanId: string; cdmHash: string; instructTx: string }>(p, "POST", `/loans/${loanId}/deliver`, {}),
  /** Instruct a return: the quantity, or the counterparty's pending return when quantity is omitted. */
  returnLoan: (p: LiveParty, loanId: string, quantity?: number) =>
    req<LiveLoanReturn & { loanId: string; cdmHash: string; instructTx: string }>(p, "POST", `/loans/${loanId}/return`, quantity === undefined ? {} : { quantity }),
  /** Propose a change of the GMSLA elections: the notification time (HH:mm), one party's MTA and/or the default margin. */
  proposeGmslaAmendment: (p: LiveParty, change: { notificationTime?: string | null; party?: LiveParty; mtaUsd?: number | null; defaultMargin?: string | null }) =>
    req<{ amendmentId: string; cdmHash: string; changed: string[]; proposeTx: string }>(p, "POST", "/gmsla/amendments", change),
  /** The counterparty consents to or refuses a pending GMSLA amendment. */
  decideGmslaAmendment: (p: LiveParty, amendmentId: string, consent: boolean) =>
    req<{ amendmentId: string; consent: boolean; decisionHash: string; decisionTx: string }>(p, "POST", `/gmsla/amendments/${amendmentId}/decision`, { consent }),
  /** The other party: consent to or refuse a proposed amendment. */
  decideAmendment: (p: LiveParty, amendmentId: string, consent: boolean) =>
    req<{ amendmentId: string; consent: boolean; decisionHash: string; decisionTx: string }>(p, "POST", `/amendments/${amendmentId}/decision`, { consent }),
  /** Interest statements on cash collateral (flow-interest-on-cash). */
  interest: (p: LiveParty) => req<LiveInterest[]>(p, "GET", "/interest"),
  /** Secured party: state the Interest Amount on the pledgor's tUSD for one period at one observed rate (percent). */
  stateInterest: (p: LiveParty, periodStart: string, periodEnd: string, observedRatePct: number, holdForNetting = false) =>
    req<LiveInterest & { stateTx: string }>(p, "POST", "/interest", { periodStart, periodEnd, observedRatePct, holdForNetting }),
  /** The paying party: the pledgor pays a negative Interest Amount, the secured party a positive one held for netting. */
  payInterest: (p: LiveParty, interestId: string) => req<{ payTx: string }>(p, "POST", `/interest/${interestId}/pay`, {}),
  /** Settlement netting (flow-settlement-netting): the movements that can net now, and the nettings settled. */
  nettingCandidates: (p: LiveParty) => req<LiveNettingCandidates>(p, "GET", "/netting/candidates"),
  nettings: (p: LiveParty) => req<LiveNetting[]>(p, "GET", "/nettings"),
  /** The party owing the net settles every movement that can net now by one transfer of tUSD. */
  settleNetting: (p: LiveParty) => req<LiveNetting & { settleTx: string }>(p, "POST", "/nettings", {}),
  /** Substitutions of pledged collateral with their CDM fold (flow-substitution). */
  reconciliations: (p: LiveParty) => req<LivePortfolioReconciliation[]>(p, "GET", "/reconciliation/portfolio"),
  /** Exchange trade snapshots with the counterparty's service, commit the hashes and the result (flow-reconciliation). */
  reconcilePortfolio: (p: LiveParty) => req<LivePortfolioReconciliation>(p, "POST", "/reconciliation/portfolio", {}),
  reconcileWithLedger: (p: LiveParty) => req<LiveLedgerReconciliation>(p, "POST", "/reconciliation/ledger", {}),
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

/** A term repo as the service shows it: the on-chain record and the CDM trade this service rebuilt and checked. */
export interface LiveRepo {
  repoId: string;
  role: "seller" | "buyer";
  counterparty: LiveParty;
  state: "booked" | "affirmed" | "purchased" | "repurchased" | "closedOut";
  security: string;
  quantity: string;
  purchasePrice: string;
  repurchasePrice: string;
  /** A buy/sell-back (wp-adr-repo-buy-sell-back): its agreed income deductions and the Sell Back Price the Seller pays
   *  (the Repurchase Price less the deductions; the Repurchase Price for a repo). */
  buySellBack?: boolean;
  incomeDeduction?: string;
  sellBackPrice?: string;
  tradeHash: string;
  purchaseHash: string | null;
  repurchaseHash: string | null;
  instructedByMe: boolean;
  instructedByCounterparty: boolean;
  verified: boolean;
  problem: string | null;
  price?: string;
  ratePercent?: string;
  marginRatio?: string;
  purchaseDate?: string;
  repurchaseDate?: string;
  tradeStateHash?: string;
  /** The business date is on or after the Repurchase Date. */
  repurchaseDue?: boolean;
  /** A pending substitution: requested by this party (the Seller), or for this party (the Buyer) to decide. */
  substitutionPending?: "requested" | "toDecide";
  substituteSecurity?: string;
  substituteQuantity?: string;
  /** A pending interim interest or income payment: requested by this party, or for this party to decide. */
  interimPending?: "requested" | "toDecide";
  interimAmount?: string;
  incomePending?: "requested" | "toDecide";
  incomeAmount?: string;
  incomePerUnit?: string;
  incomeDate?: string;
  /** A buy/sell-back's pending income: the amount the Sell Back Price falls by, the income plus interest. */
  incomeSellBackDeduction?: string;
  /** A pending roll: proposed by this party, or for this party to decide. */
  rollPending?: "requested" | "toDecide";
  rollToDate?: string;
  rollRatePercent?: string;
  rollInterest?: string;
  /** A pending pair-off: proposed by this party, or for this party to decide; the other repo; the net cash for this party
   *  (positive: received, negative: paid); what is wrong with it, if anything. */
  pairOffPending?: "requested" | "toDecide";
  pairOffWith?: string;
  pairOffNet?: string;
  pairOffProblem?: string;
}

export interface LiveGmraCloseOutStatement {
  earlyTerminationDate: string;
  automaticEarlyTermination: boolean;
  nonDefaultingParty: string;
  defaultingParty: string;
  transactions: { repoId: string; seller: string; buyer: string; buySellBack: boolean; repurchasePrice: string; price: string; quantity: string; defaultMarketValue: string }[];
  heldMargin: { holder: string; asset: string; quantity: string; value: string }[];
  netAmount: string;
  balance: string;
  payer: string | null;
  receiver: string | null;
}

export interface LiveRepoCloseOut {
  closeOutId: string;
  cdmHash: string;
  nonDefaulting: LiveParty;
  defaulting: LiveParty;
  amount: string;
  paid: boolean;
  payer: LiveParty | null;
  toPay: boolean;
  noticeServed: boolean;
  verified: boolean;
  problem?: string | null;
  statement?: LiveGmraCloseOutStatement;
}

export interface LiveRepoDefault {
  businessDate: string;
  counterparty: LiveParty;
  counterpartyInDefault: boolean;
  inDefault: boolean;
  automaticEarlyTermination: boolean;
  baseCurrency: string;
  openTransactions: number;
  preview?: LiveGmraCloseOutStatement;
  previewProblem?: string;
  closeOuts: LiveRepoCloseOut[];
}

/** A GMSLA close-out statement (cdm-ext GmslaCloseOutStatement, wp-adr-gmsla-default-close-out). */
export interface LiveGmslaCloseOutStatement {
  earlyTerminationDate: string;
  automaticEarlyTermination: boolean;
  nonDefaultingParty: string;
  defaultingParty: string;
  loans: {
    loanId: string; lender: string; borrower: string; quantity: string; price: string; defaultMarketValue: string;
    collateral: string; collateralQuantity: string; collateralPrice: string; collateralValue: string;
    rateType: string | null; accruedFrom: string | null; accruedAmount: string;
  }[];
  heldMargin: { holder: string; asset: string; quantity: string; value: string }[];
  netAmount: string;
  balance: string;
  payer: string | null;
  receiver: string | null;
}

export type LiveLoanCloseOut = Omit<LiveRepoCloseOut, "statement"> & { statement?: LiveGmslaCloseOutStatement };

export interface LiveLoanDefault {
  businessDate: string;
  counterparty: LiveParty;
  counterpartyInDefault: boolean;
  inDefault: boolean;
  automaticEarlyTermination: boolean;
  baseCurrency: string;
  openLoans: number;
  preview?: LiveGmslaCloseOutStatement;
  previewProblem?: string;
  closeOuts: LiveLoanCloseOut[];
}

export interface LiveRepos {
  businessDate: string;
  repos: LiveRepo[];
}

/** A return's settlement (wp-adr-gmsla-loan-delivery-return): the quantity returned, the collateral redelivered, the
 *  cdm-ext qualification and CDM's own qualifications of the return event (defect D4). */
export interface LiveLoanReturn {
  phase: string;
  quantity: string;
  collateralAmount: string;
  qualification?: string;
  cdmQualifications?: string[];
}

/** A securities loan under the GMSLA as this party's service sees it (wp-adr-gmsla-loan-delivery-return). */
export interface LiveLoan {
  loanId: string;
  role: "lender" | "borrower";
  counterparty: string;
  state: "booked" | "affirmed" | "open" | "returned" | "closedOut" | string;
  /** The GMSLA default close-out that closed the loan (wp-adr-gmsla-default-close-out). */
  closeOutId?: string;
  security: string;
  quantity: string;
  collateral: string;
  collateralAmount: string;
  tradeHash: string;
  price?: string;
  marginPercent?: string;
  rebateRatePercent?: string;
  feeRatePercent?: string;
  termDate?: string | null;
  deliveryInstructedByMe: boolean;
  deliveryInstructedByCounterparty: boolean;
  pendingReturn?: { quantity: string; collateralAmount: string; instructedByMe: boolean; instructedByCounterparty: boolean };
  /** The pending recall (wp-adr-gmsla-recall): the quantity still recalled, the due date, and the checked notice. */
  recall?: { quantity: string; intendedSettlementDate: string; overdue: boolean; noticeHash: string; recalledQuantity?: string; noticeDate?: string; verified: boolean; problem?: string };
  lastReturn?: LiveLoanReturn;
  /** The pending substitution (wp-adr-gmsla-substitution): the substitute and its quantity, and the checked document. */
  substitution?: { collateral: string; collateralAmount: string; requestedByMe: boolean; returned?: string; date?: string; verified: boolean; problem?: string };
  /** The substitution the trade in force comes from, if any. */
  lastSubstitution?: { isin: string; quantity: string; returned: string; date: string; qualification: string; cdmQualifySubstitution: boolean };
  /** The billing of the loan's rate (wp-adr-gmsla-rebate): the billed-through date, the pending invoice, or the period billable now. */
  billing?: LiveLoanBilling;
  verified: boolean;
  problem?: string | null;
}

export interface LiveLoanBilling {
  billedThrough?: string | null;
  rateType?: "Rebate" | "Fee";
  billedByMe?: boolean;
  pending?: {
    rateType?: "Rebate" | "Fee"; price?: string;
    amount: string; periodEnd: string; billedByMe: boolean; verified: boolean; problem?: string;
    periodStart?: string; periods?: { startDate: string; endDate: string; notional: string; accrual: string; quantity?: string }[];
  };
  billable?: { periodStart: string; periodEnd: string };
  verified: boolean;
  problem?: string;
}

export interface LiveLoans {
  businessDate: string;
  loans: LiveLoan[];
}

export interface LiveGmslaMarking {
  party: string;
  businessDate: string;
  loans: { loanId: string; role: string; quantity: string; price: string; marketValueUsd: string; marginPercent: string; requirementUsd: string; collateralValueUsd: string; exposureUsd: string }[];
  netMarginHeldUsd: string;
  netExposureUsd: string;
  minimumTransferAmountUsd: string;
  callableUsd: string;
  statementHash: string;
  callOpen: boolean;
  settledCalls: string[];
}

export interface LiveRepoMargin {
  businessDate: string;
  exposures: { repoId: string; role: string; price: string; exposureUsd: string }[];
  netMarginHeldUsd: string;
  cashMarginHeldUsd: string;
  netExposureUsd: string;
  minimumTransferAmountUsd: string;
  callableUsd: string;
  callOpen: boolean;
  /** Purchased repos with a reprice this party has offered, and with one the counterparty has offered. */
  repriceOffered: number;
  repriceToAgree: number;
  /** The same for an adjustment. */
  adjustOffered: number;
  adjustToAgree: number;
  /** Pending substitutions of the pair's repos. */
  substitutionsPending: number;
  /** Pending interim interest, income payments and rolls of the pair's repos. */
  paymentsPending: number;
  interest: { interestId: string; cdmHash: string; amountUsd: string; verified: boolean; payer?: string; receiver?: string; days?: number; error?: string }[];
}

export interface LiveRepoTrade {
  repoId: string;
  state: string;
  tradeHash: string;
  tradeStateHash: string;
  closedTradeStateHash?: string;
  closedState?: string;
}

/** The GMRA elections as the service shows them (cdm-ext GmraElections). */
export interface LiveGmraElections {
  baseCurrency: string;
  marginRatioBasis: string;
  defaultMarginRatio: string;
  mtaUsd: Record<LiveParty, string>;
  marginTransfer: string;
  netMarginInterest: string;
  incomePayment: string;
  defaultValuation: string;
}

/** The GMSLA elections as the service shows them (CDM's GMSLA elections and the cdm-ext GmslaPrototypeElections). */
export interface LiveGmslaElections {
  baseCurrency: string;
  marketValue: string;
  aggregation: string;
  nettingOfDeliveries: string;
  failureToRedeliverIndemnity: string;
  notificationTime: string;
  automaticEarlyTermination: Record<LiveParty, string>;
  mtaUsd: Record<LiveParty, string>;
  defaultMargin: string;
}

export interface LiveGmslaAmendment {
  amendmentId: string;
  block: string;
  proposer: LiveParty;
  mine: boolean;
  state: "none" | "proposed" | "agreed" | "refused";
  cdmHash: string;
  changed?: string[];
  after?: LiveGmslaElections;
  effectiveDate?: string;
}

export interface LiveGmslaTerms {
  agreement: string;
  party1: string;
  party2: string;
  elections: LiveGmslaElections;
  termsHash: string;
  onChainTermsHash: string;
  agreedAmendments: number;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: LiveGmslaAmendment[];
}

export interface LiveGmraAmendment {
  amendmentId: string;
  block: string;
  proposer: LiveParty;
  mine: boolean;
  state: "none" | "proposed" | "agreed" | "refused";
  cdmHash: string;
  changed?: string[];
  after?: LiveGmraElections;
  effectiveDate?: string;
}

export interface LiveGmraTerms {
  agreement: string;
  party1: string;
  party2: string;
  elections: LiveGmraElections;
  /** Hash of the last agreed amendment as this service folded it, and as the contract records it. */
  termsHash: string;
  onChainTermsHash: string;
  agreedAmendments: number;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: LiveGmraAmendment[];
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

export interface LiveNettingMovement {
  /** The call or interest statement. */
  id: string;
  kind?: "VM" | "Return" | "Interest";
  type: "DeliveryAmount" | "ReturnAmount" | "InterestAmount";
  payer: LiveParty;
  receiver: LiveParty;
  amountUsd: string;
}

export interface LiveNettingCandidates {
  movements: LiveNettingMovement[];
  netUsd: string;
  /** The party that owes the net; null when the movements offset. */
  payer: LiveParty | null;
}

export interface LiveNetting {
  nettingId: string;
  settledBy?: LiveParty;
  counterparty?: LiveParty;
  amountUsd?: string;
  cdmHash: string;
  block?: string;
  settlementDate?: string;
  netUsd?: string;
  payer?: LiveParty | null;
  receiver?: LiveParty | null;
  movements?: LiveNettingMovement[];
  /** The statement was read from the payload store, matches the on-chain hash, recomputes from its movements, and its net and movements match the chain. */
  verified?: boolean;
  error?: string;
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
