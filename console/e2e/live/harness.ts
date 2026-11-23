// Shared harness of the live end-to-end specs (console/e2e/live/*.spec.ts): constants, service and gateway helpers and
// view types, moved out of the former console/e2e/live.spec.ts unchanged (task-live-suite-modules). One spec file per
// module imports what it uses; e2e-live-stack.yml runs each module on its own stack.

import { expect, test } from "@playwright/test";

// Live end-to-end tests for every CALM flow, driven through the party consoles (#/live/A, #/live/B) and the market
// operator console (#/live/operator) against the running stack: collateral services (8001/8002), oracle service
// (8100) -> ledger gateways (8201/8202/8200) -> Besu. Unlike the mock scenario specs, these need the backend stack up
// (scripts/live-e2e.sh up). A unique call amount per run identifies this cycle's call among any left on the
// persistent chain by earlier runs.
//
// The stack is not started by Playwright's webServer, so these tests are skipped when the collateral service is
// unreachable (console.yml, which runs only the mock scenario specs). e2e-live-stack.yml brings the stack up and runs
// them through scripts/live-e2e.sh check with E2E_REQUIRE_STACK=1 (wp-adr-ci-runs-live-specs).
export const PRICE_TUST = 98.4;

export const HAIRCUT = 0.98;

// Live flow timing. Each lifecycle step is an on-chain write (a 2 s QBFT block) followed by SSE propagation
// (Besu ws -> gateway -> service -> console), and a full flow chains about six of them. The Playwright config
// default (timeout: 30_000) is below that total, so the live specs set their own per-test and per-step budgets.
export const TEST_TIMEOUT = 180_000;

 // whole live flow
export const STEP_TIMEOUT = 30_000;

 // one step's UI window

// The service state at /api/v1/state is the authoritative settlement record (folded from on-chain call state via the
// gateway). Wait on it before the console "settled on-chain ✓" assertion, so SSE propagation lag to an already-open
// page does not fail the test after the backend has settled. Checks both parties' services (8001 pledgor, 8002
// secured party); the call is matched by kind and amount, which identify this run's call on the persistent chain.
export async function waitForSettledOnChain(kind: "IM" | "VM" | "Return", amountUsd: number) {
  for (const port of [8001, 8002]) {
    await expect
      .poll(
        async () => {
          const res = await fetch(`http://localhost:${port}/api/v1/state`).catch(() => null);
          if (!res || !res.ok) return null;
          const body = (await res.json()) as { calls?: Array<{ kind: string; amountUsd: string; state: string }> };
          const call = (body.calls ?? []).find((c) => c.kind === kind && c.amountUsd === String(amountUsd));
          return call?.state ?? null;
        },
        { timeout: 120_000, intervals: [1_000, 1_000, 2_000] },
      )
      .toBe("settled");
  }
}

// --- helpers for the flow-return and flow-default-enforcement specs ---

export const SERVICE = { A: "http://localhost:8001/api/v1", B: "http://localhost:8002/api/v1" } as const;

export const GATEWAY = { A: "http://localhost:8201/ledger/v1", B: "http://localhost:8202/ledger/v1" } as const;

export const ZERO_HASH = "0x" + "0".repeat(64);

// tUST value after haircut per unit in USD (98.4 at a 2% haircut), the on-chain check in CollateralControl.
export const TUST_VALUE = PRICE_TUST * HAIRCUT;

export async function call<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

// The console shows a call by its shortened id; this locates exactly one call's row.
export const shortId = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

/**
 * Waits until A's gateway reads a call B just issued. B's gateway returns once B's node has the issuing block; A's node
 * may import it later, and A's response then reads a call A's node does not hold yet (MarginCall NoSuchCall; CI runs
 * 42515444660, 42929679573 and 43061438276).
 */
export async function seenByA(callId: string) {
  await expect
    .poll(async () => (await fetch(`${GATEWAY.A}/calls/${callId}`).catch(() => null))?.ok ?? false, { timeout: 30_000 })
    .toBe(true);
}

/**
 * Setup for the return and enforcement specs: an IM call settled into escrow, driven through the same service API the
 * consoles call (the UI path of this flow is covered by the flow-im-margin-call-pledge spec). Returns the callId.
 */
export async function pledgeThroughServices(amountUsd: number, qty: number, token = "tUST"): Promise<string> {
  const { callId } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await seenByA(callId);
  await call(`${SERVICE.A}/calls/${callId}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token, qty }] });
  await call(`${SERVICE.B}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
  await call(`${SERVICE.A}/calls/${callId}/pledge`, "POST", { proposalId });
  return callId;
}

export interface Parties {
  a: string;
  b: string;
  tokens: Record<string, string>; // symbol -> token address
}

export async function parties(): Promise<Parties> {
  const ctx = await call<{ address: string; counterpartyAddress: string; tokens: { symbol: string; address: string }[] }>(`${SERVICE.A}/context`);
  return { a: ctx.address, b: ctx.counterpartyAddress, tokens: Object.fromEntries(ctx.tokens.map((t) => [t.symbol, t.address])) };
}

// On-chain reads through a party's own gateway (relationship harness-to-gateway). Amounts are decimal strings.
export const balanceOf = async (gw: string, token: string, owner: string) => BigInt(await call<string>(`${gw}/balance?token=${token}&owner=${owner}`));

export const pledgedOf = async (gw: string, token: string, p: Parties) =>
  BigInt(await call<string>(`${gw}/pledged?token=${token}&pledgor=${p.a}&securedParty=${p.b}`));

// The CDM MarginCallState each party folds from the chain and the payload store; both must converge on the same hash.
// "converged" is per party: every step its own node shows has been folded. A node a block behind can report converged
// on fewer steps, so poll until both parties fold the same number of steps to the same hash.
export async function expectConvergedCdmState(callId: string) {
  // G25: each folded step also has a ledger anchor built from the chain events; both parties build the same anchors
  // (anchorHash) and every step's anchor is Complete (nw-ledger-anchor-redesign).
  type Fold = {
    converged: boolean; totalSteps: number; stateHash: string;
    anchored?: boolean; anchorHash?: string; anchors?: { identifier: string; status: string }[]; anchorError?: string;
  };
  let a: Fold | undefined, b: Fold | undefined;
  await expect
    .poll(async () => {
      a = await call<Fold>(`${SERVICE.A}/calls/${callId}/cdm-state`);
      b = await call<Fold>(`${SERVICE.B}/calls/${callId}/cdm-state`);
      return a.converged && b.converged && a.totalSteps === b.totalSteps && a.stateHash === b.stateHash
        && !!a.anchored && !!b.anchored && a.anchorHash === b.anchorHash;
    }, { timeout: 60_000 })
    .toBe(true);
  expect(a!.stateHash).toMatch(/^0x[0-9a-f]{64}$/i);
  expect(a!.anchorError).toBeUndefined();
  expect(a!.anchors!.length).toBe(a!.totalSteps);
  expect(a!.anchors!.every((s) => s.status === "Complete")).toBe(true);
}

// --- flow-oracle-update ---
// The oracle service (8100) holds mock market data and publishes prices to the oracle feed through the market
// operator's gateway (8200), the only one holding the publisher key. Each party reads the feed from its own node.
export const ORACLE = "http://localhost:8100/oracle/v1";

export const GATEWAY_MKT = "http://localhost:8200/ledger/v1";

// No other CSA spec values tMMF at its feed price after this spec runs (flow-registered-collateral pledges it, and
// enforcement empties that escrow), so changing its price cannot move another spec's valuation; the test restores the
// original price at the end either way.
export const ORACLE_TOKEN = "tMMF";

// --- flow-revaluation-top-up ---
// The operator lowers the tUST price in the operator console (#/live/operator); the oracle publishes it to the feed. The
// secured party's console revalues the pledged IM at the feed prices after haircuts and offers a top-up IM call for the
// shortfall (minimum transfer amount USD 500,000, rounded up to USD 10,000). The top-up is settled like any IM call and
// does not add to the requirement (wp-adr-revaluation-outstanding-im-from-calls). The tUST price is restored at the
// end because the other specs value tUST at 98.4.
export type Revaluation = { requiredUsd: string; valueUsd: string; shortfallUsd: string; topUpUsd: string; topUpCalls: number };

// --- flow-registered-collateral (task-authoritative-record-settlement-enforcement) ---
// tMMF mirrors the fund's register, kept by its transfer agent (the oracle service, mkt key). Interim rules REG-1 to
// REG-5 (project owner, 2026-11-21, task-sme-registered-asset-completion): a pledge or an enforcement of tMMF is
// complete only once the transfer agent confirms that its register shows it, and until then the register and the
// ledger show a break. The spec pauses the transfer agent to see the step wait, then lets it confirm. At each wait it
// also checks the party consoles show it (task-console-record-keeper-completion): the call row names the transfer
// agent's confirmation, and the register card shows the break.
export type RecordKeeperFold = {
  settlementComplete?: boolean; recordKeeperError?: string; anchorHash?: string;
  recordKeeper?: { identifier: string; complete: boolean; tokens: { symbol: string; confirmed?: boolean; complete: boolean }[] }[];
};

export type EnforcementView = { enforced: boolean; documentVerified?: boolean; anchorStatus?: string; anchorHash?: string; complete: boolean; eventQualifier?: string };

export type RegisterBreaksView = { reconciled: boolean; tokens: { symbol: string; reconciled: boolean; breaks: { record: string; breakType: string }[] }[] };

export const setTransferAgentPaused = (paused: boolean) => call(`${ORACLE}/register/paused`, "PUT", { paused });

// --- flow-registered-collateral in a GMSLA loan (task-authoritative-record-other-flows) ---
// The same interim rules in the securities lending flows: a delivery or a return of tMMF, the loaned security, is complete
// only once the transfer agent confirms its register shows it. The loans view reports it as the CSA cdm-state does
// (recordKeeper, settlementComplete), from the SecuritiesLoan transactions that moved tMMF. Each movement's anchor status
// is its SecuritiesLoan LedgerAnchor's, which both parties build the same (task-substitution-ledger-anchors).
export type LoanCompletion = {
  loanId: string; state: string; quantity: string; settlementComplete?: boolean; recordKeeperError?: string;
  recordKeeper?: {
    identifier: string; complete: boolean; anchorStatus?: string; documentVerified?: boolean; anchorHash?: string;
    tokens: { symbol: string; confirmed?: boolean; complete: boolean }[];
  }[];
};

// --- flow-registered-collateral in triparty (task-authoritative-record-other-flows) ---
// The giver may add tMMF to the triparty profile (at the CSA baseline 4% haircut) when tMMF is eligible under a control
// agreement; the receiver and the agent accept that profile under the same condition. In TripartySettlement only the
// deposit and the withdrawal move securities (the agent allocates inside its book), so each of those movements of tMMF
// is complete only once the transfer agent confirms it.
export type TripartyCompletion = TripartyTermsView & {
  settlementComplete?: boolean; recordKeeperError?: string;
  recordKeeper?: { identifier: string; complete: boolean; tokens: { symbol: string; confirmed?: boolean; complete: boolean }[] }[];
};

// --- flow-close-out-netting ---
// After the pledgor's default the secured party closes out (ISDA 2002 MA Section 6(e), cdm-ext CloseOutNetting, G15):
// its service builds the CDM CloseOutStatement from the Close-out Amount entered in the console, and the control
// contract applies the pledged collateral to the Early Termination Amount and returns the surplus to the pledgor. Both
// services fetch the statement by its on-chain hash and check it. Like enforcement, this empties A's escrow with B.
export type CloseOut = {
  closeOutId: string; owedUsd: string; appliedUsd: string; cdmHash: string; verified?: boolean; error?: string;
  closeOutAmountUsd?: string; earlyTerminationAmountUsd?: string; collateralHeldUsd?: string; collateralAppliedUsd?: string; amountPayableUsd?: string;
};

// --- flow-substitution ---
// The pledgor asks to substitute part of its pledged tUST with tUSD (ISDA CSA Paragraph 4(d), cdm-ext
// Create_CollateralSubstitution, G16); the secured party consents (the agreement elects consent, Paragraph 13 (f)(ii));
// the pledgor settles and the control contract moves the substitute into escrow and the tUST back in one transaction.
// Each service folds the three CDM steps with the same portfolio and reaches the same state, and builds the same
// Substitution ledger anchor of each step from the chain events (task-substitution-ledger-anchors).
export type Substitution = {
  substitutionId: string; state: string;
  cdm: {
    status: string; qualifiers?: string[]; stateHash?: string; converged: boolean; totalSteps: number; error?: string;
    anchors?: { identifier: string; status: string; transactions: number }[]; anchorHash?: string; anchored?: boolean; anchorError?: string;
  };
};

// --- flow-interest-on-cash ---
// The secured party states the interest it owes on the pledgor's cash collateral for one Interest Period (cdm-ext
// Create_CollateralInterestStatement, G17): every day of the period has the tUSD now in escrow and the one observed rate
// entered in the console (interim reduction, task-sme-interest-daily-balances). The control contract pays a positive
// amount from B to A in the same transaction; both services fetch the statement by its on-chain hash and recompute it.
export type Interest = {
  interestId: string; amountUsd: string; state: string; cdmHash: string; verified?: boolean; error?: string;
  days?: number; balanceUsd?: string; ratePct?: string; interestAmountUsd?: string; transferAmountUsd?: string;
};

export interface Agreement {
  mtaUsd: string;
  roundingUsd: string;
  haircuts: { token: string; eligible: boolean; haircutBps: number; onChainHaircutBps: number | null; matches: boolean }[];
  agreementHash: string;
  onChainAgreementHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; mine: boolean; state: string; mtaUsd: string | null }[];
}

export type GmraTerms = {
  elections: { mtaUsd: { A: string; B: string }; defaultMarginRatio: string };
  termsHash: string;
  onChainTermsHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; state: string; changed?: string[] }[];
};

export type GmslaTerms = {
  elections: { notificationTime: string; mtaUsd: { A: string; B: string }; defaultMargin: string; aggregation: string };
  termsHash: string;
  onChainTermsHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; state: string; changed?: string[] }[];
};

export type Repo = {
  repoId: string; role: "seller" | "buyer"; state: string; security: string; quantity: string; purchasePrice: string;
  repurchasePrice: string; tradeHash: string; verified: boolean; problem: string | null; instructedByMe: boolean;
  purchaseDate?: string; repurchaseDate?: string; tradeStateHash?: string;
};

export type RepoTrade = { tradeHash: string; tradeStateHash: string; closedTradeStateHash?: string; closedState?: string };

// --- flow-repo-margin-maintenance ---
// Margin on the pair's Net Exposure under the GMRA (wp-adr-repo-margin-maintenance): B, the buyer of a repo, calls margin
// when the securities fall; A settles one call in cash and one in securities by title transfer. B pays interest on the
// Cash Margin. After the repurchase the exposure reverses and A calls the margin back, so the spec leaves no margin held.
export type RepoMargin = {
  exposures: { repoId: string; role: string; exposureUsd: string }[]; netMarginHeldUsd: string; cashMarginHeldUsd: string;
  netExposureUsd: string; minimumTransferAmountUsd: string; callableUsd: string; callOpen: boolean;
  interest: { interestId: string; amountUsd: string; verified: boolean; payer?: string; error?: string }[];
};

// --- flow-repo-adjustment ---
// An adjustment instead of a margin call (wp-adr-repo-adjustment): two days into the repo the securities fall, B offers an
// adjustment in its console and A agrees in its console. A delivers more securities and pays the accrued Price Differential.
export const repoAdjustFixture = async () => {
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA");
  type MarginView = RepoMargin & { adjustOffered: number; adjustToAgree: number };
  type RepoRow = { repoId: string; state: string; purchasePrice: string; repurchasePrice: string; quantity: string; verified: boolean };
  const margin = (svc: string) => call<MarginView>(`${svc}/repo-margin`);
  const repo = async (svc: string, id: string) => (await call<{ repos: RepoRow[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);
  const setDate = async (d: string) => { for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: d }); };
  const setPrice = async (price: number) => {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(price) });
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const open = async (seller: string, buyer: string, purchasePrice: number, ratePercent = "4.5", buySellBack = false) => {
    const { repoId } = await call<{ repoId: string }>(`${seller}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent, termDays: 7, marginRatio: null, buySellBack });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("booked");
    await call(`${buyer}/repos/${repoId}/affirm`, "POST", {});
    await expect.poll(async () => (await repo(seller, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
    await call(`${buyer}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await call(`${seller}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("purchased");
    return { repoId, seller, buyer, purchasePrice, qty: Math.ceil((purchasePrice * 1.02) / PRICE_TUST) };
  };
  const close = async (repos: { repoId: string; seller: string; buyer: string }[]) => {
    await setPrice(PRICE_TUST);
    await setDate(inDays(7));
    let done = 0;
    // The repos B sold come back first: on a fresh deployment B holds only the tUST it bought and has delivered part of it.
    for (const r of [...repos].reverse()) {
      await call(`${r.seller}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await call(`${r.buyer}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await expect.poll(async () => (await repo(r.seller, r.repoId))?.state, { timeout: 30_000 }).toBe("repurchased");
      done++;
    }
    await setDate(today);
    return done;
  };
  return { p, tUST, tUSD, today, inDays, margin, repo, setDate, setPrice, open, close };
};

// --- flow-repo-substitution ---
// The Seller replaces the securities of one purchased repo (wp-adr-repo-substitution): A asks to substitute tMMF for tUST in
// its console and B agrees in its console. Both securities move in one transaction and no cash moves.
export const scaledPrice = async (token: string) => BigInt((await call<{ price: string }>(`${GATEWAY.A}/prices/${token}`)).price);

export const substituteQuantity = (qty: number, price: bigint, substitutePrice: bigint) => {
  const value = BigInt(qty) * price;
  return Number(value / substitutePrice + (value % substitutePrice === 0n ? 0n : 1n));
};

// --- flow-repo-income ---
// Interim interest and manufactured income (wp-adr-repo-income). The Seller pays accrued interest and the Repurchase Price
// falls; the Buyer enters income on the securities and the Seller agrees.
export type PaymentRow = { interimPending?: string; incomePending?: string; repurchasePrice: string; quantity: string; verified: boolean };

// --- flow-repo-roll ---
// A roll on the Repurchase Date (wp-adr-repo-roll). The proposer enters the new Repurchase Date and rate, the other party
// agrees, the Seller pays the Price Differential and the securities stay with the Buyer.
export type RollRow = { rollPending?: string; repurchasePrice: string; repurchaseDate: string; state: string; verified: boolean };

// --- flow-repo-pair-off ---
// Two offsetting repos between A and B pair off on their common Repurchase Date (wp-adr-repo-pair-off): either party
// proposes, the other agrees, both repos are repurchased, no securities move and only the net cash is paid.
export type PairOffRow = { pairOffPending?: string; pairOffWith?: string; pairOffNet?: string; state: string; verified: boolean; repurchaseHash: string | null };

// --- flow-repo-buy-sell-back ---
// A buy/sell-back is a repo with CDM's trade type BuySellBack (wp-adr-repo-buy-sell-back): agreed income moves no cash and
// lowers the Sell Back Price by the income plus interest to the Repurchase Date, there is no interim interest, and only
// two buy/sell-backs pair off.
export type BsbRow = { repoId: string; state: string; verified: boolean; buySellBack?: boolean; incomeDeduction?: string; sellBackPrice?: string;
  repurchasePrice: string; incomePending?: string; pairOffPending?: string; pairOffNet?: string };

// --- flow-repo-default-close-out ---
// A GMRA default close-out (wp-adr-repo-default-close-out, GMRA paragraph 10). B is the non-defaulting party: earlier specs
// leave A in default on the persistent chain, and none ever puts B in default. A repo A sells and a buy/sell-back B sells
// offset in quantity, so the close-out, which moves no securities, leaves both parties' tUST where it was and only the
// small net balance moves. The spec restores A's default status as it found it.
export type CloseOutStatementView = { earlyTerminationDate: string; nonDefaultingParty: string; transactions: { repoId: string; buySellBack: boolean;
  repurchasePrice: string; defaultMarketValue: string }[]; heldMargin: { holder: string; value: string }[]; netAmount: string; balance: string; payer: string | null };

export type RepoDefaultView = { counterpartyInDefault: boolean; inDefault: boolean; automaticEarlyTermination: boolean; openTransactions: number;
  preview?: CloseOutStatementView; closeOuts: { closeOutId: string; amount: string; paid: boolean; payer: string | null; toPay: boolean;
  noticeServed: boolean; verified: boolean; problem?: string; statement?: CloseOutStatementView }[] };

/** The net contribution, from the non-defaulting party's side, of Transactions in a statement other than `ids` (repos
 *  left open between the pair by an earlier, interrupted run are closed out too). */
export function otherTransactions(s: CloseOutStatementView, ids: string[]): number {
  const nd = s.nonDefaultingParty;
  return s.transactions.filter((t) => !ids.includes(t.repoId))
    .reduce((sum, t) => sum + ((t as unknown as { buyer: string }).buyer === nd ? Number(t.repurchasePrice) - Number(t.defaultMarketValue) : Number(t.defaultMarketValue) - Number(t.repurchasePrice)), 0);
}

// Securities loan delivery and return under the GMSLA (task-gmsla-loan-delivery-return, wp-adr-gmsla-loan-delivery-return).
// The rules are assumptions awaiting task-sme-gmsla-loan-delivery-return-rules.
export type Loan = {
  loanId: string; role: string; state: string; quantity: string; collateral: string; collateralAmount: string; price?: string;
  marginPercent?: string; verified: boolean; problem?: string | null;
  lastReturn?: { qualification?: string; quantity: string; collateralAmount: string; cdmQualifications?: string[] };
};

// --- flow-gmsla-marking ---
// The pair's loans are marked together at the feed prices (wp-adr-gmsla-marking). The tMMF price rises, so the lender A
// is short of collateral and calls B in its console; B rebuilds the mark statement before agreeing and delivers tUSD by
// title transfer. The price is restored, so B now holds too little and calls the excess back. The loan is returned and
// every balance ends where it started.
export type GmslaMarking = {
  party: string; businessDate: string; netMarginHeldUsd: string; netExposureUsd: string; callableUsd: string; callOpen: boolean;
  statementHash: string; settledCalls: string[]; loans: { loanId: string; role: string; requirementUsd: string; collateralValueUsd: string; exposureUsd: string }[];
};

// --- flow-gmsla-default-close-out ---
// A GMSLA default close-out (wp-adr-gmsla-default-close-out, GMSLA 2010 paragraph 11). B is the non-defaulting party, as
// in flow-repo-default-close-out. A lends 100,000 tMMF to B against tUST at a 0.5% fee, then B lends the same 100,000
// tMMF to A against tUST at 0.8%: the loans offset in tMMF and in tUST, so the close-out, which moves no securities or
// collateral, leaves both parties' holdings where they were, and the net balance is the difference of the fees accrued.
// The spec restores A's default status as it found it.
export type LoanCloseOutView = { earlyTerminationDate: string; nonDefaultingParty: string; loans: { loanId: string; lender: string; borrower: string;
  quantity: string; defaultMarketValue: string; collateralValue: string; rateType: string | null; accruedAmount: string }[];
  heldMargin: { holder: string; value: string }[]; netAmount: string; balance: string; payer: string | null };

export type LoanDefaultView = { counterpartyInDefault: boolean; inDefault: boolean; automaticEarlyTermination: boolean; openLoans: number;
  preview?: LoanCloseOutView; closeOuts: { closeOutId: string; amount: string; paid: boolean; payer: string | null; toPay: boolean;
  noticeServed: boolean; verified: boolean; problem?: string; statement?: LoanCloseOutView }[] };

// --- flow-triparty-terms (task-triparty-terms-profile, wp-adr-triparty-terms-profile) ---

export const SERVICE_T = "http://localhost:8003/api/v1";

export type TripartyTermsView = {
  termsId: string; state: string; giver: string; receiver: string; agent: string; termsHash: string;
  receiverAffirmed: boolean; agentAffirmed: boolean; verified: boolean; problem: string | null;
  terms?: { giver: string; receiver: string; agent: string; gmraTermsHash: string; baseCurrency: string; effectiveDate: string;
    profile: { isin: string; token?: string; eligible: boolean; haircutBps: number | null; concentrationLimit: string | null }[] };
  canAffirm: boolean; canRefuse: boolean; canTerminate: boolean;
};

export type TripartyView = { party: string; agent: boolean; canPropose: boolean; terms: TripartyTermsView[] };

// --- flow-triparty-trade-start (task-triparty-trade-start, wp-adr-triparty-trade-start) ---

export type TripartyAllocationView = {
  covers: boolean; requiredValue: string; allocatedValue: string; cdmRepo: boolean;
  positions: { isin: string; token?: string; units: number; unitPrice: string; haircutBps: number; valueAfterHaircuts: string; share: string }[];
};

export type TripartyRepoView = {
  repoId: string; state: string; purchasePrice: number; requestHash: string; tradeId?: string; requestVerified: boolean; requestProblem: string | null;
  allocationHash?: string; allocation?: TripartyAllocationView; allocationVerified?: boolean; allocationProblem?: string | null;
  canAffirm: boolean; canAllocate: boolean; canRefuseAllocation: boolean; canSettle: boolean; canCancel: boolean;
};

export type TripartyTradeTermsView = TripartyTermsView & {
  canDeposit?: boolean; canRequest?: boolean; free?: { token: string; amount: number; rank: number }[]; repos?: TripartyRepoView[];
};

export const tripartyTermsOf = async (svc: string, id: string) =>
  (await call<{ terms: TripartyTradeTermsView[] }>(`${svc}/triparty`)).terms.find((x) => x.termsId === id);

export const tripartyRepoOf = async (svc: string, id: string, repoId: string) => (await tripartyTermsOf(svc, id))?.repos?.find((r) => r.repoId === repoId);

// --- flow-triparty-revaluation (task-triparty-revaluation, wp-adr-triparty-revaluation) ---
// The agent revalues a settled triparty repo at the feed prices against the Repurchase Price accrued to its business
// date, and moves the difference between the giver's free account and the repo on TripartySettlement in one
// transaction. The giver and the receiver recompute each revaluation from the chain at the block before it. The tUST
// and tAGY prices and the agent's business date are restored at the end either way.

export type TripartyRevaluationView = {
  revaluationHash: string; block: string; verified: boolean; problem: string | null;
  revaluation?: { outcome: string; requiredValue: string; valueBefore: string; valueAfter: string; movements: { token?: string; units: number; direction: string }[] };
};

// --- flow-triparty-substitution (task-triparty-substitution, wp-adr-triparty-substitution) ---
// The giver recalls units of an asset from a settled triparty repo; the agent returns them to the giver's free account
// and replaces them from it, without the returned asset, until the repo is covered again, or declines. The giver and the
// receiver recompute each substitution from the chain at the block before it. The agent's business date is set to the
// Purchase Date (required value 500,000) and restored at the end.

export type TripartySubstitutionView = {
  substitutionHash: string; block: string; verified: boolean; problem: string | null;
  substitution?: { outcome: string; units: number; valueAfter: string; movements: { token?: string; units: number; direction: string }[]; workflowSteps: number };
};

// --- flow-triparty-reporting (task-triparty-reporting, wp-adr-triparty-reporting) ---
// The agent reports every settled repo under the terms and the giver's free collateral on its business date; the giver
// and the receiver rebuild the report from the chain at the block before it. Placed before flow-triparty-trade-end,
// which ends the repo this spec leaves open. The agent's business date is restored at the end.

export type TripartyReportTerms = {
  report?: { reportHash: string; count: number; verified: boolean; problem: string | null;
    report?: { repos: { repoId: string; exposure: string; valueAfterHaircuts: string; covered: boolean }[]; free: { token?: string; units: number }[] } };
};

// --- flow-triparty-trade-end (task-triparty-trade-end, wp-adr-triparty-trade-end) ---
// On the Repurchase Date the agent prepares the trade end and the giver pays the Repurchase Price to the receiver against
// the release of the whole holding to its free account, in one transaction. The spec then ends every other settled repo
// under the B-giver terms the same way, each at its own Repurchase Date, and B terminates the terms, so the runs do not
// accumulate open repos. The agent's business date is restored at the end.

export type TripartyTradeEndRepo = {
  repoId: string; state: string; repurchaseDate?: string; canPrepareTradeEnd?: boolean; canSettleRepurchase?: boolean;
  tradeEnd?: { tradeEndHash: string; repurchasePrice: number; verified: boolean; problem: string | null };
  pendingSubstitution?: { mine: boolean; requestedBy?: string };
};

// --- flow-ccp-membership (task-ccp-membership, wp-adr-ccp-membership) ---

export const SERVICE_C = "http://localhost:8004/api/v1";

export type CcpView = {
  party: string; ccp: boolean; canPublish: boolean;
  rulebook: null | {
    rulebookHash: string; state: string; capital: number; fund: number; verified: boolean; problem: string | null;
    members: { party: string; bank: string; share: number; paid: boolean; admitted?: boolean }[];
    rulebook?: { ccp: string; role: string; initialMarginRate: string; variationMarginPeriodDays: number; defaultFund: number; ccpCapital: number; baseCurrency: string };
    canJoin: boolean; canLeave: boolean;
  };
};

export const ccpOf = async (svc: string) => call<CcpView>(`${svc}/ccp`);

export const paidOf = async (party: "A" | "B") => (await ccpOf(SERVICE_C)).rulebook?.members.find((m) => m.party === party)?.paid ?? false;

// --- flow-ccp-clearing (task-ccp-clearing, wp-adr-ccp-clearing) ---

export type ClearingView = {
  repoId: string; state: string; role: string; verified: boolean; problem: string | null; novationHash: string;
  legs?: { tradeId: string; seller: string; buyer: string }[]; cleared?: boolean; repurchaseDate?: string;
  canAffirm: boolean; canAccept: boolean; canInstruct: boolean; sellerInstructed: boolean; buyerInstructed: boolean;
};

export const clearingOf = async (svc: string, id: string) =>
  (await call<{ clearings: ClearingView[] }>(`${svc}/ccp/clearings`)).clearings.find((c) => c.repoId === id);

// --- flow-ccp-margin, flow-ccp-default, flow-ccp-porting (task-ccp-margin, task-ccp-default, task-ccp-porting) ---

export type CcpRoundView = {
  roundId: string; businessDate: string; state: string; canCancel: boolean;
  members: { party: string; vm: number; im: number; net: number; paid: boolean }[];
  repos: { repoId: string; vm: number }[];
  mine?: { vm: number; im: number; net: number; calls?: string[]; verified: boolean; problem: string | null; paid: boolean; canPay: boolean };
};

export type CcpMarginView = {
  businessDate: string; canIssue: boolean; rounds: CcpRoundView[];
  preview?: { party: string; vm: number; im: number; net: number; lines: { repoId: string; price: string }[] }[]; previewProblem?: string;
};

export type CcpDefaultView = {
  closeOutHash: string; defaulter: string; loss: number; fromInitialMargin: number; fromDefaulterFund: number; fromCapital: number;
  fromMembersFund: number; returned: number; dueOutstanding: number; due: { party: string; amount: number }[]; mineDue: number;
  transactions?: { repoId: string; survivor: string; residual: number; survivorAmount: number }[]; verified: boolean; problem: string | null;
};

export type CcpClearingFull = ClearingView & {
  seller: string; buyer: string; vmBalance?: number;
  porting?: { from: string; to: string; payment: number; state: string; verified: boolean; problem: string | null } | null;
};

export type CcpMember = { party: string; paid: boolean; contributed?: number; imHeld?: number; admitted?: boolean };

export const CCP_SERVICE = { A: SERVICE.A, B: SERVICE.B, T: SERVICE_T, C: SERVICE_C } as const;

export const marginOf = (svc: string) => call<CcpMarginView>(`${svc}/ccp/margin`);

export const defaultsOf = async (svc: string) => (await call<{ defaults: CcpDefaultView[] }>(`${svc}/ccp/defaults`)).defaults;

export const fullClearingOf = async (svc: string, id: string) =>
  (await call<{ clearings: CcpClearingFull[] }>(`${svc}/ccp/clearings`)).clearings.find((c) => c.repoId === id);

export const ccpMemberOf = async (party: string) =>
  ((await ccpOf(SERVICE_C)).rulebook?.members as CcpMember[] | undefined)?.find((m) => m.party === party);

export const setCcpDates = async (businessDate: string) => {
  for (const svc of Object.values(CCP_SERVICE)) await call(`${svc}/business-date`, "POST", { businessDate });
};

/** The tUST price on the feed, read by the members' gateways and by the CCP's margin build. */
export async function setTustFeed(price: number) {
  const p = await parties();
  await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(price) });
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${p.tokens.tUST}`)).price, { timeout: 30_000 })
      .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
  }
}

/** The rulebook in effect with A and B paid (flow-ccp-membership shows these steps in the consoles). */
export async function ccpReady() {
  if ((await ccpOf(SERVICE_C)).canPublish) await call(`${SERVICE_C}/ccp/rulebook`, "POST", {});
  await expect.poll(async () => (await ccpOf(SERVICE.A)).rulebook?.verified ?? false, { timeout: 60_000 }).toBe(true);
  for (const party of ["A", "B"] as const) {
    if (!(await paidOf(party))) {
      await call(`${SERVICE[party]}/ccp/join`, "POST", {});
      await expect.poll(() => paidOf(party), { timeout: 60_000 }).toBe(true);
    }
  }
  await expect.poll(async () => (await ccpOf(SERVICE_C)).rulebook?.state, { timeout: 60_000 }).toBe("Effective");
}

/** A's repo of tUST to B for 100,000 tUSD, cleared by BANK-C and purchased (flow-ccp-clearing shows it in the consoles). */
export async function ccpPurchased() {
  const { repoId: id } = await call<{ repoId: string }>(`${SERVICE.A}/repos`, "POST", { security: "tUST", purchasePrice: 100000, ratePercent: "4", termDays: 7 });
  await expect.poll(async () => {
    const r = (await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.find((x) => x.repoId === id);
    return r ? (r.verified ? r.state : r.problem) : null;
  }, { timeout: 60_000 }).toBe("booked");
  await call(`${SERVICE.B}/repos/${id}/affirm`, "POST", {});
  await expect.poll(async () => (await call<{ repos: Repo[] }>(`${SERVICE.A}/repos`)).repos.find((x) => x.repoId === id)?.state, { timeout: 60_000 }).toBe("affirmed");
  const repo = (await call<{ repos: Repo[] }>(`${SERVICE.A}/repos`)).repos.find((x) => x.repoId === id)!;
  await call(`${SERVICE.A}/ccp/clearings`, "POST", { repoId: id });
  await expect.poll(async () => (await clearingOf(SERVICE.B, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.B}/ccp/clearings/${id}/affirm`, "POST", {});
  await expect.poll(async () => (await clearingOf(SERVICE_C, id))?.canAccept ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE_C}/ccp/clearings/${id}/accept`, "POST", {});
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect.poll(async () => (await clearingOf(svc, id))?.canInstruct ?? false, { timeout: 60_000 }).toBe(true);
    await call(`${svc}/ccp/clearings/${id}/instruct`, "POST", {});
  }
  await expect.poll(async () => (await clearingOf(SERVICE_C, id))?.state ?? null, { timeout: 60_000 }).toBe("purchased");
  const c = (await clearingOf(SERVICE_C, id))!;
  return { id, qty: BigInt(repo.quantity), pp: BigInt(repo.purchasePrice), rp: BigInt(repo.repurchasePrice), due: c.repurchaseDate! };
}

/** BANK-C issues the round of its business date; each member that owes checks its statement and pays. */
export async function ccpRound(): Promise<CcpRoundView> {
  const before = (await marginOf(SERVICE_C)).rounds.length;
  await call(`${SERVICE_C}/ccp/margin`, "POST", {});
  await expect.poll(async () => (await marginOf(SERVICE_C)).rounds.length, { timeout: 60_000 }).toBe(before + 1);
  const issued = (await marginOf(SERVICE_C)).rounds[0];
  for (const m of issued.members) {
    if (m.net <= 0) continue;
    const svc = CCP_SERVICE[m.party as keyof typeof CCP_SERVICE];
    await expect.poll(async () => {
      const r = (await marginOf(svc)).rounds.find((x) => x.roundId === issued.roundId);
      return r?.mine?.canPay ? true : (r?.mine?.problem ?? r?.state ?? null);
    }, { timeout: 60_000 }).toBe(true);
    await call(`${svc}/ccp/margin/${issued.roundId}/pay`, "POST", {});
  }
  await expect.poll(async () => (await marginOf(SERVICE_C)).rounds.find((x) => x.roundId === issued.roundId)?.state, { timeout: 60_000 }).toBe("settled");
  return issued;
}

/** Setup for each CCP spec: undo what an earlier run left when it failed or was stopped before its own cleanup ran.
 *  An open porting is refused, an issued round cancelled, a submission refused, any cleared repo purchased and then
 *  repurchased on its Repurchase Date, T leaves, a round returns the margin still held, and the dates and the tUST
 *  feed go back to today's. On a clean stack it changes nothing. */
export async function ccpClearLeftovers() {
  const today = new Date().toLocaleDateString("en-CA");
  const all = async () => (await call<{ clearings: any[] }>(`${SERVICE_C}/ccp/clearings`)).clearings;
  for (const c of await all()) {
    if (c.porting && ["requested", "accepted"].includes(c.porting.state)) {
      await call(`${SERVICE_C}/ccp/clearings/${c.repoId}/porting/refuse`, "POST", {});
      await expect.poll(async () => (await fullClearingOf(SERVICE_C, c.repoId))?.porting?.state, { timeout: 60_000 }).toBe("refused");
    }
  }
  for (const r of (await marginOf(SERVICE_C)).rounds.filter((x) => x.state === "issued")) {
    await call(`${SERVICE_C}/ccp/margin/${r.roundId}/cancel`, "POST", {});
    await expect.poll(async () => (await marginOf(SERVICE_C)).rounds.find((x) => x.roundId === r.roundId)?.state, { timeout: 60_000 }).toBe("cancelled");
  }
  for (const c of (await all()).filter((x) => x.state === "submitted" || x.state === "affirmed")) {
    await call(`${SERVICE_C}/ccp/clearings/${c.repoId}/refuse`, "POST", { reason: "e2e setup: left by an earlier run" });
    await expect.poll(async () => (await clearingOf(SERVICE_C, c.repoId))?.state, { timeout: 60_000 }).not.toMatch(/^(submitted|affirmed)$/);
  }
  // A cleared repo is purchased first, then repurchased on its Repurchase Date; each member instructs its own leg.
  for (const c of (await all()).filter((x) => x.state === "cleared" || x.state === "purchased")) {
    for (const target of ["purchased", "repurchased"]) {
      if (target === "repurchased") await setCcpDates(c.repurchaseDate);
      await expect.poll(async () => {
        const state = (await clearingOf(SERVICE_C, c.repoId))?.state;
        if (state === target || state === "repurchased") return true;
        for (const svc of [SERVICE.A, SERVICE.B, SERVICE_T]) {
          if ((await clearingOf(svc, c.repoId))?.canInstruct) await call(`${svc}/ccp/clearings/${c.repoId}/instruct`, "POST", {});
        }
        return state;
      }, { timeout: 120_000, intervals: [2_000] }).toBe(true);
    }
  }
  await setCcpDates(today);
  if ((await ccpMemberOf("T"))?.paid) {
    await call(`${SERVICE_T}/ccp/leave`, "POST", {});
    await expect.poll(async () => (await ccpMemberOf("T"))?.paid, { timeout: 60_000 }).toBe(false);
  }
  const members = ((await ccpOf(SERVICE_C)).rulebook?.members ?? []) as CcpMember[];
  if (members.some((m) => (m.imHeld ?? 0) !== 0)) await ccpRound();
  await setTustFeed(PRICE_TUST);
}

/**
 * Registers the live-stack gate in the calling spec file: each live test fails when E2E_REQUIRE_STACK is set and the
 * collateral service is unreachable, and is skipped otherwise. Hooks register per spec file, so every live spec file
 * calls this once at the top level.
 */
export function liveStackGate() {
  let stackUp = false;
  test.beforeAll(async () => {
    stackUp = await fetch("http://localhost:8001/api/v1/context")
      .then((r) => r.ok)
      .catch(() => false);
  });
  test.beforeEach(() => {
    // In CI (e2e-live-stack.yml) the stack is brought up before this runs, so a down stack is a bring-up failure, not
    // a reason to skip. E2E_REQUIRE_STACK turns the skip into a hard failure so the job cannot pass silently without
    // running the live flow (task-ci-live-e2e-stack).
    if (!stackUp && process.env.E2E_REQUIRE_STACK) {
      throw new Error(
        "E2E_REQUIRE_STACK is set but the collateral service is unreachable at http://localhost:8001 — the backend stack did not come up",
      );
    }
    test.skip(!stackUp, "backend stack not running — start it with orchestrate.mjs to run the live e2e flows");
  });
}
