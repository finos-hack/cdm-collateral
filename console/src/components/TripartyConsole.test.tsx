// Unit tests for the triparty terms card and the agent's console (task-triparty-terms-profile). The workflow service is
// replaced by a fetch stub that serves /health and /triparty and records every POST.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentConsole, TripartyTermsCard } from "./TripartyConsole";
import type { LiveTriparty, LiveTripartyTerms } from "../domain/liveApi";

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
