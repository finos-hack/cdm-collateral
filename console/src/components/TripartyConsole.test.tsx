// Unit tests for the triparty terms card and the agent's console (task-triparty-terms-profile). The workflow service is
// replaced by a fetch stub that serves /health and /triparty and records every POST.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentConsole, TripartyTermsCard } from "./TripartyConsole";
import type { LiveTriparty, LiveTripartyRepo, LiveTripartyTerms } from "../domain/liveApi";

class StubEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

const TERMS: LiveTripartyTerms = {
  termsId: "0x" + "11".repeat(32),
  state: "proposed",
  giver: "A",
  receiver: "B",
  agent: "T",
  termsHash: "0x" + "22".repeat(32),
  receiverAffirmed: true,
  agentAffirmed: false,
  verified: true,
  problem: null,
  terms: {
    giver: "BANK-A", receiver: "BANK-B", agent: "BANK-T", gmraTermsHash: "0x" + "33".repeat(32), baseCurrency: "USD", effectiveDate: "2026-11-12",
    profile: [
      { isin: "US912810TM60", token: "tUST", eligible: true, haircutBps: 200, concentrationLimit: null },
      { isin: "US3137EAGY10", token: "tAGY", eligible: true, haircutBps: 300, concentrationLimit: "0.5" },
    ],
  },
  canAffirm: true,
  canRefuse: true,
  canTerminate: false,
};

let posts: string[] = [];

beforeEach(() => {
  posts = [];
  (globalThis as any).EventSource = StubEventSource;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api\/v1/, "");
    if (init?.method === "POST") {
      posts.push(path);
      return new Response("{}", { status: 200 });
    }
    if (path === "/health") return new Response(JSON.stringify({ party: "T", role: "Triparty Agent", address: "0xT", ok: true }), { status: 200 });
    if (path === "/triparty") return new Response(JSON.stringify({ party: "T", bank: "BANK-T", agent: true, canPropose: false, terms: [TERMS] }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
});
afterEach(cleanup);

it("shows the profile and lets the agent affirm the giver's terms", async () => {
  render(<AgentConsole />);
  await screen.findByText("Triparty (agent)");
  expect(screen.getByTestId("triparty-profile-tAGY").textContent).toContain("at most 50% of the Purchase Price");
  expect(screen.getByTestId("triparty-profile-tUST").textContent).toContain("2.00%");
  expect(screen.queryByText(/Propose triparty terms/)).toBeNull();
  await userEvent.click(screen.getByText("Affirm triparty terms"));
  await waitFor(() => expect(posts).toEqual([`/triparty/terms/${TERMS.termsId}/affirm`]));
});

it("offers the giver the proposal when no terms are open, and termination once in effect", async () => {
  const run = (fn: () => Promise<unknown>) => void fn();
  const none: LiveTriparty = { party: "A", bank: "BANK-A", agent: false, canPropose: true, terms: [{ ...TERMS, state: "terminated", canAffirm: false, canRefuse: false }] };
  const { unmount } = render(<TripartyTermsCard party="A" triparty={none} busy={false} run={run} />);
  expect(screen.getByTestId("triparty-none")).toBeTruthy();
  await userEvent.click(screen.getByText(/Propose triparty terms/));
  await waitFor(() => expect(posts).toEqual(["/triparty/terms"]));
  unmount();
  const effective: LiveTriparty = { ...none, canPropose: false, terms: [{ ...TERMS, state: "effective", agentAffirmed: true, canAffirm: false, canRefuse: false, canTerminate: true }] };
  render(<TripartyTermsCard party="A" triparty={effective} busy={false} run={run} />);
  expect((screen.getByText(/Propose triparty terms/) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId("triparty-state").textContent).toContain("in effect");
  await userEvent.click(screen.getByText("Terminate triparty terms"));
  await waitFor(() => expect(posts).toEqual(["/triparty/terms", `/triparty/terms/${TERMS.termsId}/terminate`]));
});

it("lets the giver deposit and request, shows the allocation, and lets the receiver settle (task-triparty-trade-start)", async () => {
  const run = (fn: () => Promise<unknown>) => void fn();
  const repo = {
    repoId: "0x" + "44".repeat(32), state: "allocated" as const, purchasePrice: 500000, requestHash: "0x" + "55".repeat(32), tradeId: "TP-B-1",
    ratePercent: "5", purchaseDate: "2026-11-12", repurchaseDate: "2026-11-19", requestVerified: true, requestProblem: null,
    allocationHash: "0x" + "66".repeat(32), allocationVerified: true, allocationProblem: null,
    allocation: { covers: true, requiredValue: "500000", allocatedValue: "500026.56", cdmRepo: true, positions: [
      { isin: "US912810TM60", token: "tUST", units: 3000, unitPrice: "98.4", haircutBps: 200, valueAfterHaircuts: "289296", share: "0.5786" },
      { isin: "US3137EAGY10", token: "tAGY", units: 2190, unitPrice: "99.2", haircutBps: 300, valueAfterHaircuts: "210730.56", share: "0.4215" },
    ] },
    canAffirm: false, canAllocate: false, canRefuseAllocation: true, canSettle: true, canCancel: true,
  };
  const terms = { ...TERMS, state: "effective" as const, giver: "B" as const, receiver: "A" as const, agentAffirmed: true, canAffirm: false, canRefuse: false,
    canDeposit: true, canRequest: true, free: [{ token: "tUST", amount: 3000, rank: 1 }, { token: "tAGY", amount: 4000, rank: 2 }], repos: [repo] };
  const tp: LiveTriparty = { party: "B", bank: "BANK-B", agent: false, canPropose: false, terms: [terms] };
  const { unmount } = render(<TripartyTermsCard party="B" triparty={tp} busy={false} run={run} />);
  expect(screen.getByTestId("triparty-free-tAGY").textContent).toContain("4000");
  await userEvent.click(screen.getByText("Deposit with BANK-T"));
  await userEvent.click(screen.getByText("Request triparty repo"));
  await userEvent.click(screen.getByText("Withdraw free tAGY"));
  await waitFor(() => expect(posts).toEqual([`/triparty/terms/${TERMS.termsId}/deposit`, `/triparty/terms/${TERMS.termsId}/repos`, `/triparty/terms/${TERMS.termsId}/withdraw`]));
  expect(screen.getByTestId("triparty-allocation-tAGY").textContent).toContain("42.15%");
  expect(screen.getByTestId("triparty-allocation-covers").textContent).toContain("covers the Purchase Price");
  unmount();
  posts = [];
  const asReceiver: LiveTriparty = { ...tp, party: "A", terms: [{ ...terms, canDeposit: false, canRequest: false }] };
  render(<TripartyTermsCard party="A" triparty={asReceiver} busy={false} run={run} />);
  expect(screen.queryByText("Deposit with BANK-T")).toBeNull();
  await userEvent.click(screen.getByText("Settle purchase against the allocation"));
  await waitFor(() => expect(posts).toEqual([`/triparty/repos/${repo.repoId}/settle`]));
});

it("lets the agent revalue a settled repo and shows each revaluation with its check (task-triparty-revaluation)", async () => {
  const run = (fn: () => Promise<unknown>) => void fn();
  const held = (agy: number, value: string) => [
    { isin: "US912810TM60", token: "tUST", units: 3000, unitPrice: "96", valueAfterHaircuts: "282240", share: "0.5642" },
    { isin: "US3137EAGY10", token: "tAGY", units: agy, unitPrice: "97", valueAfterHaircuts: value, share: "0.4358" },
  ];
  const repo = {
    repoId: "0x" + "44".repeat(32), state: "settled" as const, purchasePrice: 500000, requestHash: "0x" + "55".repeat(32), tradeId: "TP-B-1",
    requestVerified: true, requestProblem: null, allocationHash: "0x" + "66".repeat(32), allocationVerified: true, allocationProblem: null,
    canAffirm: false, canAllocate: false, canRefuseAllocation: false, canSettle: false, canCancel: false, canRevalue: true,
    revaluations: [
      { revaluationHash: "0x" + "77".repeat(32), block: "10", verified: true, problem: null, revaluation: {
        revaluationDate: "2026-11-15", outcome: "TopUp" as const, requiredValue: "500208.33", valueBefore: "488297.1", valueAfter: "500246.53",
        movements: [{ isin: "US3137EAGY10", token: "tAGY", units: 127, direction: "TopUp" as const }],
        heldBefore: held(2190, "206057.1"), heldAfter: held(2317, "218006.53"), breaches: [], cdmEvents: 2 } },
      { revaluationHash: "0x" + "88".repeat(32), block: "12", verified: false, problem: "the revaluation differs from the revaluation this party computes", revaluation: {
        revaluationDate: "2026-11-15", outcome: "Uncovered" as const, requiredValue: "500208.33", valueBefore: "490116", valueAfter: "490116",
        movements: [], heldBefore: held(2190, "254916"), heldAfter: held(2190, "254916"),
        breaches: [{ isin: "US3137EAGY10", token: "tAGY", limit: "0.5", percentage: "0.5096" }], cdmEvents: 1 } },
    ],
  };
  const terms = { ...TERMS, state: "effective" as const, giver: "B" as const, receiver: "A" as const, agentAffirmed: true, canAffirm: false, canRefuse: false, repos: [repo] };
  render(<TripartyTermsCard party="T" triparty={{ party: "T", bank: "BANK-T", agent: true, canPropose: false, terms: [terms] }} busy={false} run={run} />);
  const latest = screen.getByTestId("triparty-revaluation-latest");
  expect(latest.textContent).toContain("cannot cover it: nothing moved");
  expect(latest.textContent).toContain("tAGY at 50.96%, over its 50% limit");
  expect(latest.textContent).toContain("differs from the revaluation this party computes");
  const first = screen.getByTestId(`triparty-revaluation-0x${"77".repeat(32)}`);
  expect(first.textContent).toContain("topped up from the giver's free account");
  expect(screen.getByTestId("triparty-revaluation-move-tAGY").textContent).toContain("+127 tAGY");
  expect(first.textContent).toContain("recomputed from the chain ✓");
  await userEvent.click(screen.getByText("Revalue collateral"));
  await waitFor(() => expect(posts).toEqual([`/triparty/repos/${repo.repoId}/revalue`]));
});

it("lets the giver recall collateral and the agent substitute it, and shows each substitution with its check (task-triparty-substitution)", async () => {
  const run = (fn: () => Promise<unknown>) => void fn();
  const held = [{ isin: "US912810TM60", token: "tUST", units: 3998, unitPrice: "98.4", valueAfterHaircuts: "385535.136", share: "0.7711" }];
  const base = {
    repoId: "0x" + "44".repeat(32), state: "settled" as const, purchasePrice: 500000, requestHash: "0x" + "55".repeat(32), tradeId: "TP-B-1",
    requestVerified: true, requestProblem: null, allocationHash: "0x" + "66".repeat(32), allocationVerified: true, allocationProblem: null,
    canAffirm: false, canAllocate: false, canRefuseAllocation: false, canSettle: false, canCancel: false, canRevalue: true,
    substitutions: [
      { substitutionHash: "0x" + "77".repeat(32), block: "10", verified: true, problem: null, substitution: {
        substitutionDate: "2026-11-12", outcome: "Substituted" as const, isin: "US3137EAGY10", token: "tAGY", units: 1000, requiredValue: "500000",
        valueBefore: "500026.56", valueAfter: "500041.696", movements: [
          { isin: "US3137EAGY10", token: "tAGY", units: 1000, direction: "Release" as const },
          { isin: "US912810TM60", token: "tUST", units: 998, direction: "TopUp" as const }],
        heldBefore: held, heldAfter: held, breaches: [], workflowSteps: 2 } },
      { substitutionHash: "0x" + "88".repeat(32), block: "12", verified: true, problem: null, substitution: {
        substitutionDate: "2026-11-12", outcome: "Declined" as const, isin: "US3137EAGY10", token: "tAGY", units: 1190, requiredValue: "500000",
        valueBefore: "500041.696", valueAfter: "500041.696", movements: [], heldBefore: held, heldAfter: held, breaches: [], workflowSteps: 0 } },
    ],
  };
  const terms = (r: LiveTripartyRepo) => ({ ...TERMS, state: "effective" as const, giver: "B" as const, receiver: "A" as const, agentAffirmed: true, canAffirm: false, canRefuse: false, repos: [r] });
  const { unmount } = render(<TripartyTermsCard party="B" triparty={{ party: "B", bank: "BANK-B", agent: false, canPropose: true,
    terms: [terms({ ...base, canRevalue: false, canRequestSubstitution: true })] }} busy={false} run={run} />);
  expect(screen.getByTestId("triparty-substitution-latest").textContent).toContain("declined: the free account cannot replace them");
  const first = screen.getByTestId(`triparty-substitution-0x${"77".repeat(32)}`);
  expect(first.textContent).toContain("1000 tAGY asked back, returned to the giver's free account");
  expect(screen.getByTestId("triparty-substitution-in-tUST").textContent).toContain("+998 tUST in");
  expect(first.textContent).toContain("CDM workflow: request and execution");
  await userEvent.clear(screen.getByTestId("triparty-recall-units"));
  await userEvent.type(screen.getByTestId("triparty-recall-units"), "250");
  await userEvent.click(screen.getByText("Request substitution"));
  await waitFor(() => expect(posts).toEqual([`/triparty/repos/${base.repoId}/substitution`]));
  unmount();
  posts.length = 0;
  render(<TripartyTermsCard party="T" triparty={{ party: "T", bank: "BANK-T", agent: true, canPropose: false, terms: [terms({ ...base, canSubstitute: true,
    pendingSubstitution: { requestHash: "0x" + "99".repeat(32), token: "tAGY", units: 250, requestedBy: "Giver", mine: false }, excess: [] })] }} busy={false} run={run} />);
  expect(screen.getByTestId("triparty-substitution-pending").textContent).toContain("by the giver: 250 tAGY back, awaiting the agent");
  await userEvent.click(screen.getByText("Substitute collateral"));
  await waitFor(() => expect(posts).toEqual([`/triparty/repos/${base.repoId}/substitute`]));
});

it("lets the agent prepare the trade end and the giver settle the repurchase, and shows the repo repurchased (task-triparty-trade-end)", async () => {
  const run = (fn: () => Promise<unknown>) => void fn();
  const base: LiveTripartyRepo = {
    repoId: "0x" + "44".repeat(32), state: "settled", purchasePrice: 500000, requestHash: "0x" + "55".repeat(32), tradeId: "TP-B-1",
    requestVerified: true, requestProblem: null, allocationHash: "0x" + "66".repeat(32), allocationVerified: true, allocationProblem: null,
    canAffirm: false, canAllocate: false, canRefuseAllocation: false, canSettle: false, canCancel: false,
  };
  const terms = (r: LiveTripartyRepo) => ({ ...TERMS, state: "effective" as const, giver: "B" as const, receiver: "A" as const, agentAffirmed: true, canAffirm: false, canRefuse: false, repos: [r] });
  const tradeEnd = { tradeEndHash: "0x" + "99".repeat(32), repurchasePrice: 500486, repurchaseDate: "2026-11-19", verified: true, problem: null,
    releases: [{ isin: "US912810TM60", token: "tUST", units: 3000 }, { isin: "US3137EAGY10", token: "tAGY", units: 2190 }] };
  const first = render(<TripartyTermsCard party="T" triparty={{ party: "T", bank: "BANK-T", agent: true, canPropose: false, terms: [terms({ ...base, canPrepareTradeEnd: true })] }} busy={false} run={run} />);
  await userEvent.click(screen.getByText("Prepare trade end"));
  await waitFor(() => expect(posts).toEqual([`/triparty/repos/${base.repoId}/trade-end`]));
  first.unmount();
  posts.length = 0;
  const second = render(<TripartyTermsCard party="B" triparty={{ party: "B", bank: "BANK-B", agent: false, canPropose: true, terms: [terms({ ...base, tradeEnd, canSettleRepurchase: true })] }} busy={false} run={run} />);
  expect(screen.getByTestId("triparty-trade-end").textContent).toContain("against the release of 3000 tUST and 2190 tAGY to the giver's free account");
  expect(screen.getByTestId("triparty-trade-end-verified").textContent).toContain("rebuilt by this party ✓");
  await userEvent.click(screen.getByText(/Settle repurchase/));
  await waitFor(() => expect(posts).toEqual([`/triparty/repos/${base.repoId}/repurchase`]));
  second.unmount();
  render(<TripartyTermsCard party="A" triparty={{ party: "A", bank: "BANK-A", agent: false, canPropose: true, terms: [terms({ ...base, state: "repurchased", tradeEnd })] }} busy={false} run={run} />);
  expect(screen.getByTestId("triparty-repo-state").textContent).toContain("repurchased on-chain ✓");
});

it("lets the agent send a report and shows the latest report with this party's check (task-triparty-reporting)", async () => {
  const run = (fn: () => Promise<unknown>) => void fn();
  const report = { reportHash: "0x" + "99".repeat(32), block: "40", count: 1, verified: true, problem: null, report: {
    reportDate: "2026-11-12",
    repos: [{ repoId: "0x" + "44".repeat(32), tradeId: "TP-B-1", exposure: "500000", valueAfterHaircuts: "500026.56", covered: true, breaches: 0,
      held: [{ isin: "US912810TM60", token: "tUST", units: 3000, unitPrice: "98.4", valueAfterHaircuts: "289296" },
        { isin: "US3137EAGY10", token: "tAGY", units: 2190, unitPrice: "99.2", valueAfterHaircuts: "210730.56" }] }],
    free: [{ isin: "US3137EAGY10", token: "tAGY", units: 1810, valueAfterHaircuts: "174165.44" }] } };
  const terms = { ...TERMS, state: "effective" as const, giver: "B" as const, receiver: "A" as const, agentAffirmed: true, canAffirm: false, canRefuse: false,
    repos: [], report, canSendReport: true };
  render(<TripartyTermsCard party="T" triparty={{ party: "T", bank: "BANK-T", agent: true, canPropose: false, terms: [terms] }} busy={false} run={run} />);
  const row = screen.getByTestId(`triparty-report-repo-0x${"44".repeat(32)}`);
  expect(row.textContent).toContain("500,026.56");
  expect(row.textContent).toContain("3000 tUST, 2190 tAGY");
  expect(row.textContent).toContain("covered");
  expect(screen.getByTestId("triparty-report-free").textContent).toContain("1810 tAGY (174,165.44 after haircuts)");
  expect(screen.getByTestId("triparty-report-verified").textContent).toContain("rebuilt from the chain ✓");
  await userEvent.click(screen.getByText("Send report"));
  await waitFor(() => expect(posts).toEqual([`/triparty/terms/${TERMS.termsId}/report`]));
});
