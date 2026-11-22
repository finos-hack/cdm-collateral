// HTTP server for one participant's ledger gateway (concept-asr-ledger-neutrality). Configured by env NODE
// (bank-a | bank-b | mkt | bank-c) and PORT; loads only that participant's key and signs every write with it.
// The collateral workflow service submits ledger instructions here (architecture relationship service-to-gateway);
// the console reads balances and pledge state here (console-to-gateway). Amounts cross the wire as decimal strings
// because they exceed the JSON safe-integer range.
import http from "node:http";
import { getAddress } from "viem";
import type { Address, Hex } from "viem";
import { BesuAdapter, RepoPhase } from "./besu.ts";

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

route("POST", "/ledger/v1/calls/:id/enforce", async (p, b) =>
  // Default enforcement: the secured party's gateway seizes the escrowed initial margin once the oracle feed records
  // the pledgor's default (flow-default-enforcement transition 5).
  J(await adapter.enforce(p.id as Hex, ((b as { cdmHash?: Hex } | undefined)?.cdmHash ?? ("0x" + "00".repeat(32))) as Hex)),
);

route("GET", "/ledger/v1/calls/:id/enforcement", async (p) => J(await adapter.enforcement(p.id as Hex)));

// --- record keeper register (task-authoritative-record-settlement-enforcement, interim rules REG-1 to REG-5) ---

route("GET", "/ledger/v1/register/transfers", async (_p, _b, url) =>
  J(await adapter.registerTransfers(getAddress(url.searchParams.get("token")!) as Address)),
);

route("GET", "/ledger/v1/register/confirmations", async () => J(await adapter.registerConfirmations()));

// The repo, securities loan or triparty transactions that moved a Registered or Claim token, by record
// (task-authoritative-record-other-flows): ?flow=repo|loan|triparty.
route("GET", "/ledger/v1/register/movements", async (_p, _b, url) => {
  const flow = url.searchParams.get("flow");
  if (flow !== "repo" && flow !== "loan" && flow !== "triparty") throw new Error("flow is repo, loan or triparty");
  const reg = (await import("./registry.ts")).loadRegistry();
  const tokens = Object.values(reg.tokens).filter((t) => (t.authoritativeRecord ?? "Bearer") !== "Bearer").map((t) => getAddress(t.address) as Address);
  return J(await adapter.registerMovements(flow, tokens));
});

// The tokens whose authoritative record is kept off the ledger (Registered or Claim), with their record keeper.
route("GET", "/ledger/v1/register/tokens", async () => {
  const reg = (await import("./registry.ts")).loadRegistry();
  return J(Object.entries(reg.tokens)
    .filter(([, t]) => (t.authoritativeRecord ?? "Bearer") !== "Bearer")
    .map(([symbol, t]) => ({ symbol, token: t.address, authoritativeRecord: t.authoritativeRecord, recordKeeper: t.recordKeeper ?? null })));
});

route("POST", "/ledger/v1/register/confirmations", async (_p, b) => {
  // Only the record keeper's gateway can write: the contract reverts NotRecordKeeper for any other key.
  const body = b as { txHash: Hex; token: Address; ref?: string };
  return J(await adapter.confirmRegister(body.txHash, getAddress(body.token) as Address, body.ref ?? ""));
});

// --- close-out netting on default (flow-close-out-netting, G15) ---

route("POST", "/ledger/v1/close-outs", async (_p, b) =>
  // The secured party's gateway submits the close-out: the control contract applies the pledged collateral to the
  // amount owed and returns the surplus to the pledgor (transitions 6-7).
  J(await adapter.closeOut(b.closeOutId as Hex, getAddress(b.pledgor), BigInt(b.owed), b.cdmHash as Hex)),
);

// --- reclaim after the secured party's default (two-way initial margin, wp-adr-two-way-im) ---

route("POST", "/ledger/v1/reclaims", async (_p, b) =>
  // The pledgor's gateway submits the reclaim: the control contract returns the pledgor's escrow on the leg.
  J(await adapter.reclaim(b.reclaimId as Hex, getAddress(b.securedParty), b.cdmHash as Hex)),
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

// --- master agreement terms (wp-adr-repo-gmra-terms): kind is the agreement's name, "GMRA" ---

route("POST", "/ledger/v1/terms-amendments", async (_p, b) =>
  J(await adapter.proposeTermsAmendment(b.amendmentId as Hex, String(b.kind), getAddress(b.counterparty), b.beforeHash as Hex, b.cdmHash as Hex)),
);

route("POST", "/ledger/v1/terms-amendments/:id/decision", async (p, b) =>
  J(await adapter.decideTermsAmendment(p.id as Hex, Boolean(b.consent), b.cdmHash as Hex)),
);

route("GET", "/ledger/v1/terms-amendments", async (_p, _b, url) =>
  J(await adapter.listTermsAmendments(url.searchParams.get("kind")!, getAddress(url.searchParams.get("party")!))),
);

// The terms hash in force between two parties for a kind, and the pending amendment.
route("GET", "/ledger/v1/master-terms", async (_p, _b, url) =>
  J(await adapter.masterTerms(url.searchParams.get("kind")!, getAddress(url.searchParams.get("a")!), getAddress(url.searchParams.get("b")!))),
);

// --- repo purchase and repurchase (flow-repo-purchase-repurchase, wp-adr-repo-purchase-repurchase) ---
// The seller books, the buyer affirms with the same trade hash. For each phase a party's gateway approves the repo
// contract for that party's leg (the token and amount the service names), then instructs; the second instruction
// moves both legs.
route("POST", "/ledger/v1/repos", async (_p, b) =>
  J(await adapter.bookRepo(b.repoId as Hex, getAddress(b.buyer), getAddress(b.security), BigInt(b.quantity), getAddress(b.cash),
    BigInt(b.purchasePrice), BigInt(b.repurchasePrice), b.tradeHash as Hex, b.buySellBack === true)),
);

route("POST", "/ledger/v1/repos/:id/affirm", async (p, b) => J(await adapter.affirmRepo(p.id as Hex, b.tradeHash as Hex)));

route("POST", "/ledger/v1/repos/:id/instruct", async (p, b) => {
  const approval = await adapter.approve(getAddress(b.token), adapter.repoContract(), BigInt(b.amount));
  const tx = await adapter.instructRepo(p.id as Hex, b.phase, b.cdmHash as Hex);
  return J({ approvalTx: approval.txHash, ...tx });
});

// A reprice or adjustment (wp-adr-repo-reprice, wp-adr-repo-adjustment): the party approves the allowances it needs, by
// token; a party that delivers nothing sends none.
const approveAll = async (approvals: { token: string; amount: string }[]) => {
  for (const a of approvals) await adapter.approve(getAddress(a.token), adapter.repoContract(), BigInt(a.amount));
};
route("POST", "/ledger/v1/repos/:id/reprice", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoReprice(p.id as Hex, b.cdmHash as Hex, BigInt(b.newPurchasePrice), BigInt(b.newRepurchasePrice), BigInt(b.cashFromSeller)));
});
route("POST", "/ledger/v1/repos/:id/adjust", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoAdjustment(p.id as Hex, b.cdmHash as Hex, BigInt(b.newQuantity), BigInt(b.newRepurchasePrice), BigInt(b.accruedFromSeller)));
});

// A substitution (wp-adr-repo-substitution): the seller's instruction is the request, the buyer's the agreement.
route("POST", "/ledger/v1/repos/:id/substitute", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoSubstitution(p.id as Hex, b.cdmHash as Hex, getAddress(b.newSecurity), BigInt(b.newQuantity)));
});
route("POST", "/ledger/v1/repos/:id/substitute/refuse", async (p) => J(await adapter.refuseRepoSubstitution(p.id as Hex)));

// Interim interest and manufactured income (wp-adr-repo-income): the payer instructs, the receiver's matching instruction agrees.
route("POST", "/ledger/v1/repos/:id/interim-interest", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoInterimInterest(p.id as Hex, b.cdmHash as Hex, BigInt(b.amount), BigInt(b.newRepurchasePrice)));
});
route("POST", "/ledger/v1/repos/:id/income", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoIncome(p.id as Hex, b.cdmHash as Hex, BigInt(b.amount)));
});
route("POST", "/ledger/v1/repos/:id/refuse-payment", async (p, b) => J(await adapter.refuseRepoPayment(p.id as Hex, RepoPhase[b.phase])));

// A roll on the Repurchase Date (wp-adr-repo-roll): either party instructs, the other's matching instruction agrees.
route("POST", "/ledger/v1/repos/:id/roll", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoRoll(p.id as Hex, b.cdmHash as Hex, BigInt(b.newRepurchasePrice)));
});
route("POST", "/ledger/v1/repos/:id/roll/refuse", async (p) => J(await adapter.refuseRepoRoll(p.id as Hex)));

// A pair-off of two offsetting repos on their common Repurchase Date (wp-adr-repo-pair-off): either party instructs with
// the other repo, the other party's matching instruction agrees; only the party paying the net cash approves an amount.
route("POST", "/ledger/v1/repos/:id/pair-off", async (p, b) => {
  await approveAll(b.approvals);
  return J(await adapter.instructRepoPairOff(p.id as Hex, b.otherRepoId as Hex, b.cdmHash as Hex));
});
route("POST", "/ledger/v1/repos/:id/pair-off/refuse", async (p) => J(await adapter.refuseRepoPairOff(p.id as Hex)));

route("GET", "/ledger/v1/repos/:id", async (p) => J(await adapter.getRepo(p.id as Hex)));

// A GMRA default close-out (wp-adr-repo-default-close-out): the non-defaulting party serves a Default Notice (unless
// automatic early termination applies) and closes out every purchased repo of the pair; the party owing the balance pays.
route("POST", "/ledger/v1/repo-default/notice", async (_p, b) =>
  J(await adapter.serveRepoDefaultNotice(getAddress(b.defaulting), b.noticeHash as Hex)));
route("GET", "/ledger/v1/repo-default/notice", async (_p, _b, url) =>
  J({ noticeHash: await adapter.repoDefaultNotice(getAddress(url.searchParams.get("nonDefaulting")!), getAddress(url.searchParams.get("defaulting")!)) }));
route("POST", "/ledger/v1/repo-default/close-outs", async (_p, b) =>
  J(await adapter.closeOutRepoDefault(b.closeOutId as Hex, getAddress(b.defaulting), b.noticeHash as Hex, b.cdmHash as Hex,
    getAddress(b.cash), getAddress(b.payer), BigInt(b.amount))));
route("POST", "/ledger/v1/repo-default/close-outs/:id/pay", async (p, b) => {
  await adapter.approve(getAddress(b.token), adapter.repoContract(), BigInt(b.amount));
  return J(await adapter.payRepoCloseOut(p.id as Hex));
});
route("GET", "/ledger/v1/repo-default/close-outs", async (_p, _b, url) => J(await adapter.listRepoCloseOuts(getAddress(url.searchParams.get("party")!))));

// --- securities loans under the GMSLA (flow-gmsla-loan-delivery-return, wp-adr-gmsla-loan-delivery-return) ---
// The lender books, the borrower affirms with the same trade hash. For the delivery and each return a party's gateway
// approves the loan contract for what that party delivers (the token and amount the service names; none for a lender
// that redelivers no collateral), then instructs; the second instruction moves both.
route("POST", "/ledger/v1/loans", async (_p, b) =>
  J(await adapter.bookLoan(b.loanId as Hex, getAddress(b.borrower), getAddress(b.security), BigInt(b.quantity),
    getAddress(b.collateral), BigInt(b.collateralAmount), b.tradeHash as Hex)),
);
route("POST", "/ledger/v1/loans/:id/affirm", async (p, b) => J(await adapter.affirmLoan(p.id as Hex, b.tradeHash as Hex)));
route("POST", "/ledger/v1/loans/:id/deliver", async (p, b) => {
  const approval = await adapter.approve(getAddress(b.token), adapter.loanContract(), BigInt(b.amount));
  return J({ approvalTx: approval.txHash, ...(await adapter.instructLoanDelivery(p.id as Hex, b.cdmHash as Hex)) });
});
route("POST", "/ledger/v1/loans/:id/return", async (p, b) => {
  if (BigInt(b.amount) > 0n) await adapter.approve(getAddress(b.token), adapter.loanContract(), BigInt(b.amount));
  return J(await adapter.instructLoanReturn(p.id as Hex, BigInt(b.quantity), BigInt(b.collateralAmount), b.cdmHash as Hex));
});
route("POST", "/ledger/v1/loans/:id/recall", async (p, b) =>
  J(await adapter.recallLoan(p.id as Hex, BigInt(b.quantity), Number(b.settlementDate), b.noticeHash as Hex)));
route("POST", "/ledger/v1/loans/:id/recall/withdraw", async (p, b) => J(await adapter.withdrawLoanRecall(p.id as Hex, b.withdrawalHash as Hex)));
// The borrower requests a substitution (wp-adr-gmsla-substitution) and approves the substitute it will deliver; the
// lender agrees and approves the collateral it redelivers, or refuses.
route("POST", "/ledger/v1/loans/:id/substitute", async (p, b) => {
  await adapter.approve(getAddress(b.collateral), adapter.loanContract(), BigInt(b.collateralAmount));
  return J(await adapter.requestLoanSubstitution(p.id as Hex, getAddress(b.collateral), BigInt(b.collateralAmount), b.cdmHash as Hex));
});
route("POST", "/ledger/v1/loans/:id/substitute/agree", async (p, b) => {
  await adapter.approve(getAddress(b.token), adapter.loanContract(), BigInt(b.amount));
  return J(await adapter.agreeLoanSubstitution(p.id as Hex, b.cdmHash as Hex));
});
// The party receiving the loan's rate bills it (wp-adr-gmsla-rebate); the payer approves the cash token and pays, or refuses.
route("POST", "/ledger/v1/loans/:id/bill", async (p, b) =>
  J(await adapter.billLoan(p.id as Hex, getAddress(b.cashToken), Number(b.periodEnd), BigInt(b.amount), b.invoiceHash as Hex)));
route("POST", "/ledger/v1/loans/:id/bill/pay", async (p, b) => {
  await adapter.approve(getAddress(b.token), adapter.loanContract(), BigInt(b.amount));
  return J(await adapter.payLoanBill(p.id as Hex, b.invoiceHash as Hex));
});
route("POST", "/ledger/v1/loans/:id/bill/refuse", async (p) => J(await adapter.refuseLoanBill(p.id as Hex)));
route("POST", "/ledger/v1/loans/:id/substitute/refuse", async (p) => J(await adapter.refuseLoanSubstitution(p.id as Hex)));
route("GET", "/ledger/v1/loans/:id", async (p) => J(await adapter.getLoan(p.id as Hex)));
route("GET", "/ledger/v1/loans", async (_p, _b, url) => J(await adapter.listLoans(getAddress(url.searchParams.get("party")!))));

route("GET", "/ledger/v1/repos", async (_p, _b, url) => J(await adapter.listRepos(getAddress(url.searchParams.get("party")!))));

// A GMSLA default close-out (wp-adr-gmsla-default-close-out): the non-defaulting party serves a Default Notice (unless
// automatic early termination applies) and closes out every open loan of the pair; the party owing the balance pays.
route("POST", "/ledger/v1/loan-default/notice", async (_p, b) =>
  J(await adapter.serveLoanDefaultNotice(getAddress(b.defaulting), b.noticeHash as Hex)));
route("GET", "/ledger/v1/loan-default/notice", async (_p, _b, url) =>
  J({ noticeHash: await adapter.loanDefaultNotice(getAddress(url.searchParams.get("nonDefaulting")!), getAddress(url.searchParams.get("defaulting")!)) }));
route("POST", "/ledger/v1/loan-default/close-outs", async (_p, b) =>
  J(await adapter.closeOutLoanDefault(b.closeOutId as Hex, getAddress(b.defaulting), b.noticeHash as Hex, b.cdmHash as Hex,
    getAddress(b.cash), getAddress(b.payer), BigInt(b.amount))));
route("POST", "/ledger/v1/loan-default/close-outs/:id/pay", async (p, b) => {
  await adapter.approve(getAddress(b.token), adapter.loanContract(), BigInt(b.amount));
  return J(await adapter.payLoanCloseOut(p.id as Hex));
});
route("GET", "/ledger/v1/loan-default/close-outs", async (_p, _b, url) => J(await adapter.listLoanCloseOuts(getAddress(url.searchParams.get("party")!))));

// Triparty terms (wp-adr-triparty-terms-profile): the giver proposes, the receiver and the agent affirm or refuse, the
// giver or the receiver terminates terms in effect.
route("POST", "/ledger/v1/triparty/terms", async (_p, b) =>
  J(await adapter.proposeTripartyTerms(getAddress(b.receiver), getAddress(b.agent), b.termsHash as Hex)));
route("POST", "/ledger/v1/triparty/terms/:id/affirm", async (p, b) => J(await adapter.affirmTripartyTerms(p.id as Hex, b.termsHash as Hex)));
route("POST", "/ledger/v1/triparty/terms/:id/refuse", async (p) => J(await adapter.refuseTripartyTerms(p.id as Hex)));
route("POST", "/ledger/v1/triparty/terms/:id/terminate", async (p) => J(await adapter.terminateTripartyTerms(p.id as Hex)));
route("GET", "/ledger/v1/triparty/terms/:id", async (p) => J(await adapter.getTripartyTerms(p.id as Hex)));
route("GET", "/ledger/v1/triparty/terms", async (_p, _b, url) => J(await adapter.listTripartyTerms(getAddress(url.searchParams.get("party")!))));

// Triparty trade start (wp-adr-triparty-trade-start): the giver deposits and withdraws free collateral and requests a
// repo; the receiver affirms the request; the agent allocates; the receiver refuses the allocation or settles the
// purchase against it; any of the three cancels a repo before it settles.
route("POST", "/ledger/v1/triparty/terms/:id/deposit", async (p, b) =>
  J(await adapter.depositTriparty(p.id as Hex, getAddress(b.token), BigInt(b.amount), BigInt(b.rank))));
route("POST", "/ledger/v1/triparty/terms/:id/withdraw", async (p, b) =>
  J(await adapter.withdrawTriparty(p.id as Hex, getAddress(b.token), BigInt(b.amount))));
route("GET", "/ledger/v1/triparty/terms/:id/free", async (p) => J(await adapter.tripartyFree(p.id as Hex)));
route("POST", "/ledger/v1/triparty/terms/:id/repos", async (p, b) =>
  J(await adapter.requestTripartyRepo(p.id as Hex, b.requestHash as Hex, getAddress(b.cash), BigInt(b.purchasePrice))));
route("GET", "/ledger/v1/triparty/terms/:id/repos", async (p) => J(await adapter.listTripartyRepos(p.id as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/affirm", async (p, b) => J(await adapter.affirmTripartyRequest(p.id as Hex, b.requestHash as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/allocate", async (p, b) =>
  J(await adapter.allocateTriparty(p.id as Hex, b.allocationHash as Hex, (b.tokens as string[]).map((t) => getAddress(t)),
    (b.amounts as (string | number)[]).map((a) => BigInt(a)))));
route("POST", "/ledger/v1/triparty/repos/:id/refuse-allocation", async (p) => J(await adapter.refuseTripartyAllocation(p.id as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/settle", async (p, b) => J(await adapter.settleTripartyPurchase(p.id as Hex, b.allocationHash as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/cancel", async (p) => J(await adapter.cancelTripartyRepo(p.id as Hex)));
route("GET", "/ledger/v1/triparty/repos/:id", async (p) => J(await adapter.getTripartyRepo(p.id as Hex)));
// Triparty revaluation (wp-adr-triparty-revaluation): the agent replaces a settled repo's holding with the hash of its
// cdm-ext TripartyRevaluation; the giver and the receiver read the chain at the block before it to recompute it.
route("POST", "/ledger/v1/triparty/repos/:id/revalue", async (p, b) =>
  J(await adapter.revalueTriparty(p.id as Hex, b.revaluationHash as Hex, (b.tokens as string[]).map((t) => getAddress(t)),
    (b.amounts as (string | number)[]).map((a) => BigInt(a)))));
route("GET", "/ledger/v1/triparty/repos/:id/changes", async (p) => J(await adapter.tripartyChanges(p.id as Hex)));
// Triparty substitution (wp-adr-triparty-substitution): the giver's (or the agent's) request and the agent's answer.
route("GET", "/ledger/v1/triparty/repos/:id/substitution", async (p) => J({ pending: await adapter.tripartyPendingSubstitution(p.id as Hex) }));
route("POST", "/ledger/v1/triparty/repos/:id/substitution", async (p, b) => J(await adapter.requestTripartySubstitution(p.id as Hex, b.requestHash as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/substitution/withdraw", async (p) => J(await adapter.withdrawTripartySubstitution(p.id as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/substitute", async (p, b) =>
  J(await adapter.substituteTriparty(p.id as Hex, b.substitutionHash as Hex, (b.tokens as string[]).map((t) => getAddress(t)),
    (b.amounts as (string | number)[]).map((a) => BigInt(a)))));
// Triparty reporting (wp-adr-triparty-reporting): the agent records a report; the parties read the terms at a block.
route("POST", "/ledger/v1/triparty/terms/:id/report", async (p, b) => J(await adapter.recordTripartyReport(p.id as Hex, b.reportHash as Hex)));
route("GET", "/ledger/v1/triparty/terms/:id/reports", async (p) => J(await adapter.tripartyReports(p.id as Hex)));
route("GET", "/ledger/v1/triparty/terms/:id/at", async (p, _b, url) => J(await adapter.tripartyTermsAt(p.id as Hex, BigInt(url.searchParams.get("block")!))));
// Triparty trade end (wp-adr-triparty-trade-end): the agent prepares on the Repurchase Date; the giver settles.
route("GET", "/ledger/v1/triparty/repos/:id/trade-end", async (p) => J({ tradeEnd: await adapter.tripartyTradeEnd(p.id as Hex) }));
route("POST", "/ledger/v1/triparty/repos/:id/trade-end", async (p, b) =>
  J(await adapter.prepareTripartyTradeEnd(p.id as Hex, b.tradeEndHash as Hex, BigInt(b.repurchasePrice as string | number))));
route("POST", "/ledger/v1/triparty/repos/:id/repurchase", async (p, b) => J(await adapter.settleTripartyRepurchase(p.id as Hex, b.tradeEndHash as Hex)));
route("POST", "/ledger/v1/triparty/repos/:id/substitution/decline", async (p, b) => J(await adapter.declineTripartySubstitution(p.id as Hex, b.substitutionHash as Hex)));
route("GET", "/ledger/v1/triparty/repos/:id/at", async (p, _b, url) => J(await adapter.tripartyRepoAt(p.id as Hex, BigInt(url.searchParams.get("block")!))));

// CCP membership (wp-adr-ccp-membership): the CCP publishes its rulebook with its capital; each member affirms the
// hash and pays its share, and may leave when it clears nothing. GET without a hash reads the CCP's own rulebook;
// ?block= reads it as it was at the end of that block.
route("POST", "/ledger/v1/ccp/rulebook", async (_p, b) =>
  J(await adapter.publishCcpRulebook(b.rulebookHash as Hex, getAddress(b.token), (b.members as string[]).map((m) => getAddress(m)),
    (b.shares as (string | number)[]).map((x) => BigInt(x)), BigInt(b.capital))));
route("GET", "/ledger/v1/ccp/rulebook", async (_p, _b, url) => {
  const block = url.searchParams.get("block");
  return J({ rulebook: await adapter.getCcpRulebook(null, getAddress(url.searchParams.get("ccp")!), block ? BigInt(block) : undefined) });
});
route("GET", "/ledger/v1/ccp/rulebook/:hash", async (p, _b, url) => {
  const block = url.searchParams.get("block");
  return J({ rulebook: await adapter.getCcpRulebook(p.hash as Hex, undefined, block ? BigInt(block) : undefined) });
});
route("POST", "/ledger/v1/ccp/rulebook/:hash/join", async (p) => J(await adapter.joinCcp(p.hash as Hex)));
route("POST", "/ledger/v1/ccp/rulebook/:hash/leave", async (p) => J(await adapter.leaveCcp(p.hash as Hex)));

// CCP clearing (wp-adr-ccp-clearing): the seller submits an affirmed repo, the buyer affirms, the CCP accepts or refuses;
// each member then instructs its own leg's purchase and repurchase.
route("POST", "/ledger/v1/ccp/clearings", async (_p, b) =>
  J(await adapter.submitCcpClearing(b.repoId as Hex, getAddress(b.ccp), b.novationHash as Hex)));
route("GET", "/ledger/v1/ccp/clearings", async (_p, _b, url) => J(await adapter.listCcpClearings(getAddress(url.searchParams.get("party")!))));
route("GET", "/ledger/v1/ccp/clearings/:id", async (p) => J({ clearing: await adapter.getCcpClearing(p.id as Hex) }));
route("POST", "/ledger/v1/ccp/clearings/:id/affirm", async (p, b) => J(await adapter.affirmCcpClearing(p.id as Hex, b.novationHash as Hex)));
route("POST", "/ledger/v1/ccp/clearings/:id/accept", async (p) => J(await adapter.acceptCcpClearing(p.id as Hex)));
route("POST", "/ledger/v1/ccp/clearings/:id/refuse", async (p, b) => J(await adapter.refuseCcpClearing(p.id as Hex, b.reasonHash as Hex)));
route("POST", "/ledger/v1/ccp/clearings/:id/instruct", async (p, b) => J(await adapter.instructCcpCleared(p.id as Hex, b.legHash as Hex)));

// CCP margin (wp-adr-ccp-margin): the CCP issues a round of variation and initial margin, one hash per member's
// statement; each member that owes pays its net, the last payment settling the round. Amounts are decimal strings,
// positive when the member pays (a repo's from the seller's side).
route("POST", "/ledger/v1/ccp/margin", async (_p, b) =>
  J(await adapter.issueCcpMargin(BigInt(b.businessDate as string), b.repoIds as Hex[], (b.repoVm as string[]).map((x) => BigInt(x)),
    (b.members as string[]).map((m) => getAddress(m)), (b.im as string[]).map((x) => BigInt(x)), b.statementHashes as Hex[])));
route("GET", "/ledger/v1/ccp/margin", async (_p, _b, url) => J(await adapter.listCcpMarginRounds(getAddress(url.searchParams.get("ccp")!))));
route("GET", "/ledger/v1/ccp/margin/:id", async (p) => J({ round: await adapter.getCcpMarginRound(p.id as Hex) }));
route("POST", "/ledger/v1/ccp/margin/:id/pay", async (p) => J(await adapter.payCcpMargin(p.id as Hex)));
route("POST", "/ledger/v1/ccp/margin/:id/cancel", async (p) => J(await adapter.cancelCcpMargin(p.id as Hex)));

// CCP default (wp-adr-ccp-default): the CCP closes out a defaulted member's cleared repos and applies the waterfall; a
// survivor pays what it owes.
route("POST", "/ledger/v1/ccp/defaults", async (_p, b) =>
  J(await adapter.closeOutCcpDefault(getAddress(b.defaulter as string), b.closeOutHash as Hex, b.repoIds as Hex[], (b.residuals as string[]).map((x) => BigInt(x)))));
route("GET", "/ledger/v1/ccp/defaults", async (_p, _b, url) => J(await adapter.listCcpDefaults(getAddress(url.searchParams.get("ccp")!))));
route("POST", "/ledger/v1/ccp/defaults/:hash/pay", async (p) => J(await adapter.payCcpDefaultDue(p.hash as Hex)));

// CCP admission and porting (wp-adr-ccp-porting).
route("POST", "/ledger/v1/ccp/members", async (_p, b) =>
  J(await adapter.admitCcpMember(getAddress(b.member as string), BigInt(b.share as string), b.admissionHash as Hex)));
route("POST", "/ledger/v1/ccp/clearings/:id/porting", async (p, b) =>
  J(await adapter.requestCcpPorting(p.id as Hex, getAddress(b.to as string), b.portingHash as Hex, BigInt(b.payment as string))));
route("POST", "/ledger/v1/ccp/clearings/:id/porting/accept", async (p, b) => J(await adapter.acceptCcpPorting(p.id as Hex, b.portingHash as Hex)));
route("POST", "/ledger/v1/ccp/clearings/:id/porting/approve", async (p) => J(await adapter.approveCcpPorting(p.id as Hex)));
route("POST", "/ledger/v1/ccp/clearings/:id/porting/refuse", async (p) => J(await adapter.refuseCcpPorting(p.id as Hex)));

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

// flow-reconciliation (wp-adr-reconciliation-scope): only hashes go on-chain; the snapshots travel service to service.
route("POST", "/ledger/v1/reconciliation/snapshots", async (_p, b) =>
  J(await adapter.commitSnapshot(b.snapshotId as Hex, getAddress(b.counterparty as string), b.snapshotHash as Hex)),
);
route("POST", "/ledger/v1/reconciliation/results", async (_p, b) =>
  J(await adapter.commitResult(b.reconciliationId as Hex, b.firstSnapshotId as Hex, b.secondSnapshotId as Hex, b.resultHash as Hex, Number(b.breakCount))),
);
route("GET", "/ledger/v1/reconciliation/snapshots/:id", async (p) => J(await adapter.getSnapshot(p.id as Hex)));
route("GET", "/ledger/v1/reconciliation/runs/:id", async (p) => J(await adapter.getRun(p.id as Hex)));
route("GET", "/ledger/v1/reconciliation/id", async (_p, _b, url) =>
  J({ reconciliationId: await adapter.reconciliationIdOf(url.searchParams.get("first") as Hex, url.searchParams.get("second") as Hex) }),
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
      // Every request but the health check first waits for this node to reach the peers' head, so it sees a record
      // another party has just written on its own node (task-live-spec-node-read-after-write).
      if (url.pathname !== "/ledger/v1/health") await adapter.catchUpWithPeers();
      const out = await match.handler(params, body, url);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    } catch (e) {
      console.error(`${req.method} ${url.pathname} failed:`, (e as Error).message);
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (e as Error).message }));
    }
  });
});

adapter.catchUpWithPeers(0).catch(() => undefined); // start the head subscriptions before the first request
server.listen(PORT, () => console.log(`ledger gateway for ${NODE} (${adapter.account}) on http://localhost:${PORT}/ledger/v1`));
