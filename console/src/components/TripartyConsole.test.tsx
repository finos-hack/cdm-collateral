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
  expect(screen.getByTestId("triparty-profile-tAGY").textContent).toContain("at most 50% of the allocated value");
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
