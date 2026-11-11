// Unit tests for the live console's flow-return and flow-default-enforcement actions. The workflow service is replaced
// by a fetch stub that serves /context and /state and records every POST, so each test checks which actions a party
// is offered for a given on-chain call state and what the console sends to its own service.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveConsole } from "./LiveConsole";
import type { LiveCall, LiveParty, LiveRevaluation, LiveState } from "../domain/liveApi";

class StubEventSource {
  static listeners: (() => void)[] = [];
  addEventListener(_type: string, fn: () => void) { StubEventSource.listeners.push(fn); }
  removeEventListener() {}
  close() {}
}

const CONTEXT = {
  A: { party: "A", role: "Pledgor", node: "bank-a", address: "0xA", counterparty: "B", counterpartyAddress: "0xB" },
  B: { party: "B", role: "Secured Party", node: "bank-b", address: "0xB", counterparty: "A", counterpartyAddress: "0xA" },
};

function call(over: Partial<LiveCall>): LiveCall {
  return {
    callId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    kind: "IM",
    from: "B",
    to: "A",
    amountUsd: "2000000",
    agreedUsd: "2000000",
    disputedUsd: "0",
    state: "issued",
    cdmHash: "0x00",
    proposals: [],
    messages: [],
    ...over,
  };
}

let posts: { path: string; body: unknown }[] = [];

const NO_SHORTFALL: LiveRevaluation = {
  requiredUsd: "0", valueUsd: "0", shortfallUsd: "0", topUpUsd: "0", mtaUsd: "500000", roundingUsd: "10000", tokens: [],
};

function serve(party: LiveParty, state: Omit<LiveState, "party" | "role">, reval: LiveRevaluation = NO_SHORTFALL, extra: Record<string, unknown> = {}) {
  posts = [];
  vi.stubGlobal("EventSource", StubEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, "");
      if (init?.method === "POST") {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        const reply = extra[`POST ${path}`] ?? { ok: true };
        return new Response(JSON.stringify(reply), { status: 200 });
      }
      if (path.split("?")[0] === "/revaluation") return new Response(JSON.stringify(reval), { status: 200 });
      if (path in extra) return new Response(JSON.stringify(extra[path]), { status: 200 });
      const body = path === "/context" ?{ ...CONTEXT[party], priceScale: "100000000", tokens: [], agreement: "IM CSA" } : { party, role: CONTEXT[party].role, ...state };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  render(<LiveConsole party={party} />);
}

const balances = (pledged: string) => [{ token: "tUST", free: "1000", pledged }];

afterEach(() => vi.unstubAllGlobals());

describe("flow-return", () => {
  it("the pledgor calls for a return of initial margin from its console", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("50000") });
    const card = (await screen.findByRole("heading", { name: "Call for a return" })).closest(".card") as HTMLElement;
    await user.clear(within(card).getByRole("spinbutton"));
    await user.type(within(card).getByRole("spinbutton"), "750000");
    await user.click(within(card).getByRole("button", { name: "Call return → B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/calls", body: { kind: "Return", toParty: "B", amountUsd: 750000, deadlineDays: 1 } }]));
  });

  it("the secured party is offered only full agreement on an issued return call", async () => {
    serve("B", { calls: [call({ kind: "Return", from: "A", to: "B", state: "issued" })], balances: balances("50000") });
    const row = (await screen.findByText(/Return · A → B/)).closest(".subcard") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Agree in full" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Dispute" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Agree part" })).toBeNull();
  });

  it("the secured party releases escrowed collateral on an agreed return call", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ kind: "Return", from: "A", to: "B", state: "agreed" })], balances: balances("50000") });
    const row = (await screen.findByText(/Return · A → B/)).closest(".subcard") as HTMLElement;
    await user.clear(within(row).getByRole("spinbutton"));
    await user.type(within(row).getByRole("spinbutton"), "7000");
    await user.click(within(row).getByRole("button", { name: "Release escrow" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { path: `/calls/${call({}).callId}/return`, body: { via: "release", assets: [{ token: "tUST", qty: 7000 }] } },
      ]),
    );
  });

  it("the pledgor is not offered the release on its own return call", async () => {
    serve("A", { calls: [call({ kind: "Return", from: "A", to: "B", state: "agreed" })], balances: balances("50000") });
    const row = (await screen.findByText(/Return · A → B/)).closest(".subcard") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Release escrow" })).toBeNull();
  });
});

describe("flow-default-enforcement", () => {
  it("the secured party declares the default and enforces on a settled IM call with collateral in escrow", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ state: "settled" })], balances: balances("50000"), defaults: { A: false, B: false } });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Declare default & enforce" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/enforce`, body: {} }]));
  });

  it("enforcement is not offered when nothing is pledged", async () => {
    serve("B", { calls: [call({ state: "settled" })], balances: balances("0") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("enforcement is not offered before the call is settled", async () => {
    serve("B", { calls: [call({ state: "agreed" })], balances: balances("50000") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("the pledgor is never offered enforcement", async () => {
    serve("A", { calls: [call({ state: "settled" })], balances: balances("50000") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).getByText("settled on-chain ✓")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("an enforced call shows the enforcement and no further action", async () => {
    serve("B", { calls: [call({ state: "settled", enforced: true, events: ["Enforced"] })], balances: balances("50000") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).getByText("enforced ✓")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("each console shows the default recorded on the oracle feed", async () => {
    serve("A", { calls: [], balances: balances("0"), defaults: { A: true, B: false } });
    expect(await screen.findByRole("status")).toHaveTextContent("This party (A) in default on the oracle feed");
  });

  it("the secured party sees the counterparty's default", async () => {
    serve("B", { calls: [], balances: balances("0"), defaults: { A: true, B: false } });
    expect(await screen.findByRole("status")).toHaveTextContent("Counterparty A in default on the oracle feed");
  });
});

describe("flow-revaluation-top-up", () => {
  const SHORTFALL: LiveRevaluation = {
    requiredUsd: "8000000", valueUsd: "7216000", shortfallUsd: "784000", topUpUsd: "790000", mtaUsd: "500000", roundingUsd: "10000",
    tokens: [{ token: "tUST", pledged: "83000", price: "8900000000", haircutBps: 200, valueUsd: "7216000" }],
  };

  it("the secured party sees the shortfall and issues a top-up IM call for the rounded amount", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("83000") }, SHORTFALL);
    const card = await screen.findByTestId("revaluation");
    expect(within(card).getByTestId("shortfall")).toHaveTextContent("USD 784,000");
    expect(within(card).getByTestId("top-up")).toHaveTextContent("USD 790,000");
    await user.click(within(card).getByRole("button", { name: "Issue top-up IM call → A" }));
    await waitFor(() =>
      expect(posts).toEqual([{ path: "/calls", body: { kind: "IM", toParty: "A", amountUsd: 790000, deadlineDays: 1, purpose: "top-up" } }]),
    );
  });

  it("no top-up is offered below the minimum transfer amount", async () => {
    serve("B", { calls: [], balances: balances("83000") }, { ...SHORTFALL, shortfallUsd: "120000", topUpUsd: "0" });
    const card = await screen.findByTestId("revaluation");
    expect(within(card).getByTestId("shortfall")).toHaveTextContent("USD 120,000");
    expect(within(card).queryByRole("button", { name: /Issue top-up/ })).toBeNull();
  });

  it("the pledgor is not shown the revaluation", async () => {
    serve("A", { calls: [], balances: balances("83000") }, SHORTFALL);
    await screen.findByRole("heading", { name: "Call for a return" });
    expect(screen.queryByTestId("revaluation")).toBeNull();
  });
});

describe("two-way initial margin (wp-adr-two-way-im)", () => {
  // B pledges 40,000 tUSD to A on its own leg; A's leg is empty.
  const twoWay = (pledgedB: string) => [{ token: "tUSD", free: "1000", pledged: "0", pledgedByLeg: { A: "0", B: pledgedB } }];

  it("selecting the leg the party pledges on gives it the pledgor's panels", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: twoWay("40000") });
    await screen.findByRole("heading", { name: "Issue margin call" });
    await user.click(screen.getByRole("button", { name: /B pledges to A/ }));
    expect(await screen.findByRole("heading", { name: "Call for a return" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Issue margin call" })).toBeNull();
    expect(screen.getByTestId("escrow-b-to-a-tUSD")).toHaveTextContent("40,000");
  });

  it("the pledgor reclaims its leg once its secured party is in default on the feed", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: twoWay("40000"), defaults: { A: true, B: false } });
    await screen.findByRole("heading", { name: "Issue margin call" });
    expect(screen.queryByTestId("reclaim")).toBeNull(); // not on the leg B secures
    await user.click(screen.getByRole("button", { name: /B pledges to A/ }));
    const card = await screen.findByTestId("reclaim");
    await user.click(within(card).getByRole("button", { name: "Reclaim my IM from A" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/reclaims", body: {} }]));
  });

  it("no reclaim is offered while the secured party is not in default", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: twoWay("40000"), defaults: { A: false, B: false } });
    await user.click(await screen.findByRole("button", { name: /B pledges to A/ }));
    await screen.findByRole("heading", { name: "Call for a return" });
    expect(screen.queryByTestId("reclaim")).toBeNull();
  });
});

describe("flow-call-cancellation", () => {
  const rowOf = async () => (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;

  it("the calling party withdraws an unanswered call; the called party is not offered the withdrawal", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ state: "issued" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).queryByRole("button", { name: "Request cancellation" })).toBeNull();
    await user.type(within(row).getByLabelText("Cancellation reason"), "booked in error");
    await user.click(within(row).getByRole("button", { name: "Withdraw call" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/withdraw`, body: { reason: "booked in error" } }]));
  });

  it("the called party sees no withdrawal on an issued call", async () => {
    serve("A", { calls: [call({ state: "issued" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).queryByRole("button", { name: "Withdraw call" })).toBeNull();
  });

  it("either party requests cancellation of an answered call, wholly disputed ones included", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [call({ state: "disputed", agreedUsd: "0", disputedUsd: "2000000" })], balances: balances("0") });
    const row = await rowOf();
    await user.click(within(row).getByRole("button", { name: "Request cancellation" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/cancellation`, body: { reason: "" } }]));
  });

  it("while a request is pending the requester waits and the other party accepts or refuses; no other step is offered", async () => {
    const user = userEvent.setup();
    const pendingCall = call({ state: "agreed", cancellationRequestedBy: "A", proposals: [{ proposalId: 0, state: "accepted", assets: [{ token: "tUST", qty: "100" }] }] });
    serve("B", { calls: [pendingCall], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).getByText("cancellation requested by A")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Request cancellation" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Refuse cancellation" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/cancellation/decision`, body: { accept: false, reason: "" } }]));
  });

  it("the requester is not offered the decision or the pledge while its request is pending", async () => {
    serve("A", { calls: [call({ state: "agreed", cancellationRequestedBy: "A", proposals: [{ proposalId: 0, state: "accepted", assets: [{ token: "tUST", qty: "100" }] }] })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).queryByRole("button", { name: "Accept cancellation" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Pledge accepted collateral" })).toBeNull();
  });

  it("the calling party replaces a cancelled call with a corrected amount (task-csa-call-replacement)", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ state: "cancelled" })], balances: balances("0") });
    const row = await rowOf();
    const amount = within(row).getByLabelText("Replacement amount (USD)");
    await user.clear(amount);
    await user.type(amount, "1800000");
    await user.click(within(row).getByRole("button", { name: "Issue replacement call" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/calls", body: { replacesCallId: call({}).callId, amountUsd: 1800000, deadlineDays: 1 } }]));
  });

  it("a replaced call shows its replacement and offers no second one; the replacement names the call it replaces", async () => {
    serve("B", { calls: [call({ state: "cancelled", replacedBy: "0xbeef000000000000000000000000000000000000000000000000000000000001" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).getByText(/replaced by/)).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Issue replacement call" })).toBeNull();
  });

  it("a cancelled call shows the cancellation and no further action", async () => {
    serve("A", { calls: [call({ state: "cancelled" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).getByText("cancelled on-chain ✓")).toBeInTheDocument();
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("flow-settlement-netting", () => {
  const BAL = [{ token: "tUSD", free: "1000000", pledged: "0" }];
  const DEFAULTS = { A: false, B: false };
  const candidates = (payer: LiveParty | null) => ({
    "/netting/candidates": {
      movements: [
        { id: "0xaaaa000000000000000000000000000000000000000000000000000000000001", type: "DeliveryAmount", payer: "A", receiver: "B", amountUsd: "100000" },
        { id: "0xbbbb000000000000000000000000000000000000000000000000000000000002", type: "ReturnAmount", payer: "B", receiver: "A", amountUsd: "30000" },
        { id: "0xcccc000000000000000000000000000000000000000000000000000000000003", type: "InterestAmount", payer: "B", receiver: "A", amountUsd: "412" },
      ],
      netUsd: "69588",
      payer,
    },
    "/nettings": [],
  });

  it("the party owing the net sees the movements and the net, and settles them by one transfer", async () => {
    serve("A", { calls: [], balances: BAL, defaults: DEFAULTS }, NO_SHORTFALL, candidates("A"));
    const card = await screen.findByTestId("settlement-netting");
    expect(within(card).getByText("VM delivery")).toBeInTheDocument();
    expect(within(card).getByText("VM return")).toBeInTheDocument();
    expect(within(card).getByText("Interest Amount")).toBeInTheDocument();
    expect(within(card).getByTestId("netting-net")).toHaveTextContent("Net: A pays USD 69,588 in tUSD");
    await userEvent.click(within(card).getByRole("button", { name: "Settle netted" }));
    await waitFor(() => expect(posts).toContainEqual({ path: "/nettings", body: {} }));
  });

  it("the party owed the net is not offered the settlement", async () => {
    serve("B", { calls: [], balances: BAL, defaults: DEFAULTS }, NO_SHORTFALL, candidates("A"));
    const card = await screen.findByTestId("settlement-netting");
    expect(within(card).queryByRole("button", { name: "Settle netted" })).toBeNull();
    expect(within(card).getByText("A owes the net and settles.")).toBeInTheDocument();
  });

  it("the secured party may hold an Interest Amount for netting", async () => {
    serve("B", { calls: [], balances: [{ token: "tUSD", free: "0", pledged: "500000" }], defaults: DEFAULTS });
    const card = await screen.findByTestId("interest");
    await userEvent.click(within(card).getByRole("checkbox", { name: /Hold for settlement netting/ }));
    await userEvent.click(within(card).getByRole("button", { name: /State interest/ }));
    await waitFor(() => expect(posts.find((p) => p.path === "/interest")?.body).toMatchObject({ holdForNetting: true }));
  });

  it("a call settled in a netting names it", async () => {
    serve("A", { calls: [call({ kind: "VM", state: "settled", nettedIn: "0xdddd00000000000000000000000000000000000000000000000000000000eeee" })], balances: BAL, defaults: DEFAULTS });
    expect(await screen.findByText(/settled in netting/)).toBeInTheDocument();
  });
});

describe("flow-allocation", () => {
  const rowOf = async (label = /IM · B → A/) => (await screen.findByText(label)).closest(".subcard") as HTMLElement;
  const ID = call({}).callId;
  const SUGGESTED = {
    callId: ID, covers: true, valueUsd: "2000038", agreedUsd: "2000000", ranking: ["tUST", "tMMF", "tUSD"],
    assets: [{ token: "tUST", qty: 15_000 }, { token: "tMMF", qty: 526_356 }],
  };

  it("the called party fills the basket from the suggestion and proposes it", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [call({ state: "agreed" })], balances: balances("0") }, NO_SHORTFALL, { [`POST /calls/${ID}/allocation`]: SUGGESTED });
    const row = await rowOf();
    await user.click(within(row).getByRole("button", { name: "Suggest allocation" }));
    expect(await within(row).findByText(/suggested: USD 2,000,038 after haircuts/)).toBeInTheDocument();
    expect(within(row).getByText(/basket: tUST 15,000 \+ tMMF 526,356/)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Propose collateral (2)" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { path: `/calls/${ID}/allocation`, body: {} },
        { path: `/calls/${ID}/proposal`, body: { assets: SUGGESTED.assets } },
      ]),
    );
  });

  it("says so when the holdings do not cover the agreed amount, and leaves the basket empty", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [call({ state: "agreed" })], balances: balances("0") }, NO_SHORTFALL, {
      [`POST /calls/${ID}/allocation`]: { ...SUGGESTED, covers: false, assets: [], valueUsd: "0" },
    });
    const row = await rowOf();
    await user.click(within(row).getByRole("button", { name: "Suggest allocation" }));
    expect(await within(row).findByText("holdings do not cover the agreed amount")).toBeInTheDocument();
    expect(within(row).queryByText(/basket:/)).toBeNull();
  });

  it("is offered to the called party on an agreed VM call, and not on a return call or to the calling party", async () => {
    serve("A", { calls: [call({ kind: "VM", state: "agreed" })], balances: balances("0") });
    expect(within(await rowOf(/VM · B → A/)).getByRole("button", { name: "Suggest allocation" })).toBeInTheDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve("A", { calls: [call({ kind: "Return", from: "A", to: "B", state: "agreed" })], balances: balances("0") });
    expect(within(await rowOf(/Return · A → B/)).queryByRole("button", { name: "Suggest allocation" })).toBeNull();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve("B", { calls: [call({ state: "agreed" })], balances: balances("0") });
    expect(within(await rowOf()).queryByRole("button", { name: "Suggest allocation" })).toBeNull();
  });
});

describe("flow-reconciliation", () => {
  const RUN = {
    reconciliationId: "0x9999999999999999999999999999999999999999999999999999999999999999",
    firstSnapshotId: "0x01", secondSnapshotId: "0x02", resultHash: "0x03",
    firstParty: "BANK-A", secondParty: "BANK-B", reconciled: false, matchedTrades: 1,
    breaks: [
      { uti: "56323", type: "MissingFromSecond", terms: [], firstValuationUsd: "75000", secondValuationUsd: null, differenceUsd: null },
      { uti: "DRTY123456", type: "ValuationDiffers", terms: [], firstValuationUsd: "300000", secondValuationUsd: "-260000", differenceUsd: "40000" },
    ],
    firstExposureUsd: "1625000", secondExposureUsd: "-1510000", exposureDifferenceUsd: "115000", toleranceUsd: "10000",
    onChain: { state: "agreed", firstPartyResult: "0x03", secondPartyResult: "0x03" },
  };
  const card = async () => (await screen.findByRole("heading", { name: "Reconciliation" })).closest(".card") as HTMLElement;

  it("either party reconciles the trade portfolios and sees the breaks and the on-chain agreement", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "POST /reconciliation/portfolio": RUN, "/reconciliation/portfolio": [RUN] });
    await user.click(within(await card()).getByRole("button", { name: "Reconcile portfolios → B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/reconciliation/portfolio", body: {} }]));
    const c = await card();
    expect(await within(c).findByTestId("reconciliation-status")).toHaveTextContent("2 breaks");
    expect(within(c).getByTestId("reconciliation-onchain")).toHaveTextContent("both results agree on-chain ✓");
    expect(within(c).getByTestId("break-DRTY123456")).toHaveTextContent("valuations differ");
    expect(within(c).getByTestId("break-DRTY123456")).toHaveTextContent("USD 40,000");
    expect(within(c).getByTestId("break-56323")).toHaveTextContent("missing at the second party");
    expect(within(c).getByTestId("exposure-difference")).toHaveTextContent("USD 115,000");
  });

  it("reconciles the party's records with the ledger", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, {
      "POST /reconciliation/ledger": { party: "BANK-B", counterparty: "BANK-A", reconciled: true, checkedFacts: 9, calls: 3, breaks: [], escrow: { record: "escrow BANK-A to BANK-B", recorded: { tUST: 1200 }, ledger: { tUST: 1200 } } },
    });
    await user.click(within(await card()).getByRole("button", { name: "Reconcile with ledger" }));
    expect(await within(await card()).findByTestId("ledger-reconciliation")).toHaveTextContent("records match the ledger ✓");
    expect(within(await card()).getByTestId("ledger-reconciliation")).toHaveTextContent("3 calls, 9 facts checked");
    expect(within(await card()).getByTestId("ledger-escrow")).toHaveTextContent("escrow (BANK-A to BANK-B): tUST 1,200");
  });

  it("the called party disputes an issued call citing the latest reconciliation, offered only when it has breaks", async () => {
    const user = userEvent.setup();
    const ID = call({}).callId;
    serve("A", { calls: [call({ state: "issued" })], balances: balances("0") }, NO_SHORTFALL, { "/reconciliation/portfolio": [RUN] });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    await user.click(await within(row).findByRole("button", { name: "Dispute citing reconciliation" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${ID}/response`, body: { response: "dispute", reconciliationId: RUN.reconciliationId } }]));
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve("A", { calls: [call({ state: "issued" })], balances: balances("0") }, NO_SHORTFALL, { "/reconciliation/portfolio": [{ ...RUN, reconciled: true, breaks: [] }] });
    const row2 = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    await within(row2).findByRole("button", { name: "Dispute" });
    expect(within(row2).queryByRole("button", { name: "Dispute citing reconciliation" })).toBeNull();
  });
});

describe("task-live-read-latency", () => {
  it("merges a burst of step events into one more refresh, and the pledgor skips the revaluation panel", async () => {
    StubEventSource.listeners = [];
    serve("A", { calls: [], balances: balances("0") });
    await screen.findByRole("heading", { name: "Call for a return" });
    await vi.waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    const gets = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]).replace(/^https?:\/\/[^/]+\/api\/v1/, ""));
    await vi.waitFor(() => expect(gets().filter((g) => g === "/agreement").length).toBe(1)); // the first refresh is done
    const before = gets().length;
    for (let i = 0; i < 5; i++) for (const fn of StubEventSource.listeners) fn();
    await vi.waitFor(() => expect(gets().filter((g) => g === "/agreement").length).toBe(3));
    await new Promise((r) => setTimeout(r, 50));
    const burst = gets().slice(before);
    expect(burst.filter((g) => g === "/state").length).toBe(2); // one pass in flight plus one merged pass, not five
    expect(burst).not.toContain("/revaluation");
  });
});

describe("flow-repo-purchase-repurchase", () => {
  const repo = (over: Record<string, unknown>) => ({
    repoId: "0xr1", role: "seller", counterparty: "B", state: "booked", security: "tUST", quantity: "10366", purchasePrice: "1000000",
    repurchasePrice: "1000875", tradeHash: "0x01", purchaseHash: null, repurchaseHash: null, instructedByMe: false,
    instructedByCounterparty: false, verified: true, problem: null, price: "98.4", ratePercent: "4.5", marginRatio: "1.02",
    purchaseDate: "2026-11-09", repurchaseDate: "2026-11-16", tradeStateHash: "0x02", repurchaseDue: false, ...over,
  });

  it("the seller books a repo with the Purchase Price, rate and term", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).getByTestId("business-date").textContent).toContain("2026-11-09");
    await user.clear(within(card).getByLabelText("Term (days)"));
    await user.type(within(card).getByLabelText("Term (days)"), "14");
    await user.click(within(card).getByRole("button", { name: "Book repo: sell to B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos", body: { security: "tUST", purchasePrice: 1000000, ratePercent: "4.5", termDays: 14, marginRatio: null, buySellBack: false } }]));
  });

  it("the buyer affirms, and the repurchase waits for the Repurchase Date", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [
      repo({ repoId: "0xr1", role: "buyer", counterparty: "A" }),
      repo({ repoId: "0xr2", role: "buyer", counterparty: "A", state: "purchased" }),
    ] } });
    const booked = await screen.findByTestId("repo-0xr1");
    expect(booked.textContent).toContain("10,366 tUST at 98.4");
    expect(booked.textContent).toContain("USD 1,000,875 (4.5%)");
    expect(within(await screen.findByTestId("repo-0xr2")).queryByRole("button", { name: "Settle repurchase" })).toBeNull();
    expect((await screen.findByTestId("repo-0xr2")).textContent).toContain("repurchase from 2026-11-16");
    await user.click(within(booked).getByRole("button", { name: "Affirm repo" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/affirm", body: {} }]));
  });

  it("each party settles the purchase; a repo that does not verify offers no action", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      repo({ repoId: "0xr1", state: "affirmed" }),
      repo({ repoId: "0xr3", state: "affirmed", verified: false, problem: "the on-chain quantity is not the trade's" }),
    ] } });
    const bad = await screen.findByTestId("repo-0xr3");
    expect(bad.textContent).toContain("the on-chain quantity is not the trade's");
    expect(within(bad).queryByRole("button")).toBeNull();
    await user.click(within(await screen.findByTestId("repo-0xr1")).getByRole("button", { name: "Settle purchase" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/settle", body: { phase: "purchase" } }]));
  });
});

describe("flow-repo-margin-maintenance", () => {
  const margin = (over: Record<string, unknown>) => ({
    businessDate: "2026-11-09", exposures: [{ repoId: "0xr1", role: "buyer", price: "88.4", exposureUsd: "310936.80" }],
    netMarginHeldUsd: "0.00", cashMarginHeldUsd: "0", netExposureUsd: "310936.80", minimumTransferAmountUsd: "250000",
    callableUsd: "310936", callOpen: false, repriceOffered: 0, repriceToAgree: 0, adjustOffered: 0, adjustToAgree: 0, substitutionsPending: 0, paymentsPending: 0, interest: [], ...over,
  });

  it("the party with the Net Exposure calls the amount the service computes", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({}) });
    const card = await screen.findByTestId("repo-margin");
    expect(card.textContent).toContain("Net Exposure USD 310936.80");
    await user.click(within(card).getByRole("button", { name: "Call margin from A: USD 310936" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-margin/calls", body: {} }]));
  });

  it("the party with the Net Exposure offers a reprice instead of a call", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({}) });
    const card = await screen.findByTestId("repo-margin");
    await user.click(within(card).getByRole("button", { name: "Reprice open repos with A" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-margin/reprice", body: {} }]));
  });

  it("the other party agrees an offered reprice, and neither can call margin while it is pending", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({ repriceToAgree: 2 }) });
    const card = await screen.findByTestId("repo-margin");
    expect((within(card).getByRole("button", { name: "Call margin from B: USD 310936" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(card).getByRole("button", { name: "Agree reprice with B: 2 repo(s)" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-margin/reprice/agree", body: {} }]));
  });

  it("the party with the Net Exposure offers an adjustment instead of a call", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({}) });
    const card = await screen.findByTestId("repo-margin");
    await user.click(within(card).getByRole("button", { name: "Adjust open repos with A" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-margin/adjust", body: {} }]));
  });

  const substitutionRepo = (over: Record<string, unknown>) => ({
    repoId: "0xr1", role: "seller", counterparty: "B", state: "purchased", security: "tUST", quantity: "10366", purchasePrice: "1000000",
    repurchasePrice: "1000875", tradeHash: "0x01", purchaseHash: "0x03", repurchaseHash: null, instructedByMe: false,
    instructedByCounterparty: false, verified: true, problem: null, price: "98.4", ratePercent: "4.5", marginRatio: "1.02",
    purchaseDate: "2026-11-09", repurchaseDate: "2026-11-16", tradeStateHash: "0x02", repurchaseDue: false, ...over,
  });

  it("the Seller requests a substitution from the repo row", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [substitutionRepo({})] } });
    const card = await screen.findByTestId("repos");
    await user.click(within(card).getByRole("button", { name: "Substitute tMMF" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/substitute", body: { security: "tMMF" } }]));
  });

  it("the Buyer agrees or refuses a requested substitution", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [
      substitutionRepo({ role: "buyer", counterparty: "A", substitutionPending: "toDecide", substituteSecurity: "tMMF", substituteQuantity: "12000" }),
    ] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).queryByRole("button", { name: "Substitute tMMF" })).toBeNull();
    await user.click(within(card).getByRole("button", { name: "Agree substitution by 12,000 tMMF" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/substitute/agree", body: {} }]));
    await user.click(within(card).getByRole("button", { name: "Refuse substitution" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/substitute/agree", body: {} }, { path: "/repos/0xr1/substitute/refuse", body: {} }]));
  });

  it("the Seller pays accrued interest and the Buyer enters income from the repo row", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [substitutionRepo({})] } });
    await user.click(within(await screen.findByTestId("repos")).getByRole("button", { name: "Pay accrued interest" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/interim-interest", body: {} }]));
  });

  it("the Buyer enters income by hand", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [substitutionRepo({ role: "buyer", counterparty: "A" })] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).queryByRole("button", { name: "Pay accrued interest" })).toBeNull();
    expect((within(card).getByRole("button", { name: "Pay income" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(card).getByLabelText("Income per unit"), "1.25");
    await user.type(within(card).getByLabelText("Income date"), "2026-11-10");
    await user.click(within(card).getByRole("button", { name: "Pay income" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/income", body: { incomePerUnit: "1.25", incomeDate: "2026-11-10" } }]));
  });

  it("the receiver agrees or refuses a pending payment", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [
      substitutionRepo({ incomePending: "toDecide", incomeAmount: "12751" }),
    ] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).queryByRole("button", { name: "Substitute tMMF" })).toBeNull();
    await user.click(within(card).getByRole("button", { name: "Agree income USD 12751" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/income/agree", body: {} }]));
    await user.click(within(card).getByRole("button", { name: "Refuse income" }));
    await waitFor(() => expect(posts[1]).toEqual({ path: "/repos/0xr1/income/refuse", body: {} }));
  });

  it("the Buyer agrees interim interest", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [
      substitutionRepo({ role: "buyer", counterparty: "A", interimPending: "toDecide", interimAmount: "250" }),
    ] } });
    await user.click(within(await screen.findByTestId("repos")).getByRole("button", { name: "Agree interim interest USD 250" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/interim-interest/agree", body: {} }]));
  });

  it("a party proposes a roll only on the Repurchase Date, at the current rate unless changed", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      substitutionRepo({ repoId: "0xr1", role: "buyer", counterparty: "A", repurchaseDue: true }),
      substitutionRepo({ repoId: "0xr2", repurchaseDate: "2026-11-20" }),
    ] } });
    const row = await screen.findByTestId("repo-0xr1");
    expect(within(await screen.findByTestId("repo-0xr2")).queryByRole("button", { name: "Roll repo" })).toBeNull();
    expect((within(row).getByRole("button", { name: "Roll repo" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(row).getByLabelText("New Repurchase Date"), "2026-11-23");
    await user.click(within(row).getByRole("button", { name: "Roll repo" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/roll", body: { newRepurchaseDate: "2026-11-23", ratePercent: "4.5" } }]));
  });

  it("the other party agrees or refuses a proposed roll", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      substitutionRepo({ repurchaseDue: true, rollPending: "toDecide", rollToDate: "2026-11-23", rollRatePercent: "5", rollInterest: "875" }),
    ] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).queryByRole("button", { name: "Roll repo" })).toBeNull();
    await user.click(within(card).getByRole("button", { name: "Agree roll to 2026-11-23 at 5%" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/roll/agree", body: {} }]));
    await user.click(within(card).getByRole("button", { name: "Refuse roll" }));
    await waitFor(() => expect(posts[1]).toEqual({ path: "/repos/0xr1/roll/refuse", body: {} }));
  });

  it("a party proposes a pair-off only with an offsetting repo on their common Repurchase Date", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      substitutionRepo({ repurchaseDue: true }),
      substitutionRepo({ repoId: "0xr2", role: "buyer", repurchasePrice: "1000778", ratePercent: "4", repurchaseDue: true }),
      substitutionRepo({ repoId: "0xr3", repurchaseDue: true }), // the same direction as 0xr1
      substitutionRepo({ repoId: "0xr4", role: "buyer", quantity: "5000", repurchaseDue: true }), // another quantity
    ] } });
    const row = await screen.findByTestId("repo-0xr1");
    expect(within(row).queryByRole("button", { name: "Pair off with 0xr3" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Pair off with 0xr4" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Pair off with 0xr2" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/pair-off", body: { otherRepoId: "0xr2" } }]));
  });

  it("no pair-off is offered before the Repurchase Date", async () => {
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-15", repos: [
      substitutionRepo({}),
      substitutionRepo({ repoId: "0xr2", role: "buyer" }),
    ] } });
    const row = await screen.findByTestId("repo-0xr1");
    expect(within(row).queryByRole("button", { name: "Pair off with 0xr2" })).toBeNull();
  });

  it("the other party agrees to or refuses a proposed pair-off, and sees what it pays", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      substitutionRepo({ role: "buyer", counterparty: "A", repurchaseDue: true, pairOffPending: "toDecide", pairOffWith: "0xr2", pairOffNet: "97" }),
    ] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).queryByRole("button", { name: "Roll repo" })).toBeNull();
    await user.click(within(card).getByRole("button", { name: /^Agree pair-off with 0xr2, receive/ }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/pair-off/agree", body: {} }]));
    await user.click(within(card).getByRole("button", { name: "Refuse pair-off" }));
    await waitFor(() => expect(posts[1]).toEqual({ path: "/repos/0xr1/pair-off/refuse", body: {} }));
  });

  it("a pair-off this service cannot rebuild shows the problem instead of an agree button", async () => {
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      substitutionRepo({ role: "buyer", counterparty: "A", repurchaseDue: true, pairOffPending: "toDecide", pairOffWith: "0xr2", pairOffProblem: "repos 0xr1 and 0xr2 do not offset" }),
    ] } });
    const card = await screen.findByTestId("repos");
    expect(within(card).queryByRole("button", { name: /^Agree pair-off/ })).toBeNull();
    expect((await screen.findByTestId("repo-pairoff-0xr1")).textContent).toContain("do not offset");
  });

  it("the seller books a buy/sell-back by choosing its type", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [] } });
    const card = await screen.findByTestId("repos");
    await user.selectOptions(within(card).getByLabelText("Repo type"), "bsb");
    await user.click(within(card).getByRole("button", { name: "Book buy/sell-back: sell to B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos", body: { security: "tUST", purchasePrice: 1000000, ratePercent: "4.5", termDays: 7, marginRatio: null, buySellBack: true } }]));
  });

  it("a buy/sell-back shows its Sell Back Price, offers no interim interest, and its Buyer enters income", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-09", repos: [
      substitutionRepo({ buySellBack: true, incomeDeduction: "5186", sellBackPrice: "995689" }),
      substitutionRepo({ repoId: "0xr2", role: "buyer", counterparty: "B", buySellBack: true, incomeDeduction: "0", sellBackPrice: "1000875" }),
    ] } });
    const seller = await screen.findByTestId("repo-0xr1");
    expect(seller.textContent).toContain("buy/sell-back · seller");
    expect((await screen.findByTestId("repo-price-0xr1")).textContent).toContain("sell back USD 995,689");
    expect((await screen.findByTestId("repo-price-0xr2")).textContent).not.toContain("sell back");
    expect(within(seller).queryByRole("button", { name: "Pay accrued interest" })).toBeNull();
    const buyer = await screen.findByTestId("repo-0xr2");
    await user.type(within(buyer).getByLabelText("Income per unit"), "0.5");
    await user.type(within(buyer).getByLabelText("Income date"), "2026-11-12");
    await user.click(within(buyer).getByRole("button", { name: "Enter income" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr2/income", body: { incomePerUnit: "0.5", incomeDate: "2026-11-12" } }]));
  });

  it("the Seller of a buy/sell-back sees how far its Sell Back Price falls before agreeing income", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-12", repos: [
      substitutionRepo({ buySellBack: true, incomePending: "toDecide", incomeAmount: "5183", incomeSellBackDeduction: "5186" }),
    ] } });
    await user.click(within(await screen.findByTestId("repos")).getByRole("button", { name: "Agree income USD 5183, sell-back price lower by USD 5,186" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repos/0xr1/income/agree", body: {} }]));
  });

  it("a buy/sell-back pairs off only with a buy/sell-back", async () => {
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repos": { businessDate: "2026-11-16", repos: [
      substitutionRepo({ buySellBack: true, repurchaseDue: true }),
      substitutionRepo({ repoId: "0xr2", role: "buyer", repurchaseDue: true }), // a repo
      substitutionRepo({ repoId: "0xr3", role: "buyer", buySellBack: true, repurchaseDue: true }),
    ] } });
    const row = await screen.findByTestId("repo-0xr1");
    expect(within(row).queryByRole("button", { name: "Pair off with 0xr2" })).toBeNull();
    expect(within(row).getByRole("button", { name: "Pair off with 0xr3" })).toBeTruthy();
  });

  it("no margin action is available while a substitution is pending", async () => {
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({ substitutionsPending: 1 }) });
    const card = await screen.findByTestId("repo-margin");
    expect(within(card).queryByRole("button", { name: "Adjust open repos with B" })).toBeNull();
  });

  it("the other party agrees an offered adjustment, and no new offer is available while it is pending", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({ adjustToAgree: 1 }) });
    const card = await screen.findByTestId("repo-margin");
    expect(within(card).queryByRole("button", { name: "Adjust open repos with B" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Reprice open repos with B" })).toBeNull();
    await user.click(within(card).getByRole("button", { name: "Agree adjustment with B: 1 repo(s)" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-margin/adjust/agree", body: {} }]));
  });

  it("shows an offered reprice to the party that offered it", async () => {
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({ repriceOffered: 1 }) });
    const card = await screen.findByTestId("repo-margin");
    expect(within(card).getByTestId("repo-reprice-offered").textContent).toContain("reprice offered to A");
  });

  it("offers no call below the minimum or while a call is open", async () => {
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({ callOpen: true }) });
    const card = await screen.findByTestId("repo-margin");
    expect(card.textContent).toContain("a margin call is open");
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("the holder of Cash Margin pays the interest at the rate entered", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/repo-margin": margin({ cashMarginHeldUsd: "310936", callableUsd: "0" }) });
    const card = await screen.findByTestId("repo-margin");
    fireEvent.change(within(card).getByLabelText("Net Margin period start"), { target: { value: "2026-11-09" } });
    fireEvent.change(within(card).getByLabelText("Net Margin period end"), { target: { value: "2026-11-16" } });
    await user.type(within(card).getByLabelText("Net Margin rate"), "4.4");
    await user.click(within(card).getByRole("button", { name: "Pay Net Margin interest to A" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-margin/interest", body: { periodStart: "2026-11-09", periodEnd: "2026-11-16", observedRatePct: "4.4" } }]));
  });
});

describe("flow-repo-gmra-terms", () => {
  const elections = (mtaB: string) => ({
    baseCurrency: "USD", marginRatioBasis: "PerTransaction", defaultMarginRatio: "1.02", mtaUsd: { A: "250000", B: mtaB },
    marginTransfer: "cash or securities by title transfer, due 1 business day(s) after the call", netMarginInterest: "USD-SOFR",
    incomePayment: "PaidToSeller", defaultValuation: "by the non-defaulting party at 17:00 GBLO; automatic early termination off",
  });
  const terms = (amendments: unknown[], pending: string | null = null) => ({
    agreement: "ICMA GMRA 2011 (English law), cdm-ext GmraTerms", party1: "BANK-A", party2: "BANK-B", elections: elections("250000"),
    termsHash: "0x" + "0".repeat(64), onChainTermsHash: "0x" + "0".repeat(64), agreedAmendments: 0, verified: true, problem: null,
    pendingAmendment: pending, amendments,
  });

  it("either party proposes a new minimum transfer amount for one party", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmra/terms": terms([]) });
    const card = await screen.findByTestId("gmra-terms");
    expect(within(card).getByTestId("gmra-mta").textContent).toContain("250,000");
    expect(within(card).getByText("GMRA terms verified against the chain ✓")).toBeTruthy();
    await user.type(within(card).getByLabelText("New GMRA MTA (USD)"), "400000");
    await user.click(within(card).getByRole("button", { name: "Propose GMRA amendment → B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/gmra/amendments", body: { party: "B", mtaUsd: 400000, defaultMarginRatio: null } }]));
  });

  it("the counterparty consents to a pending amendment; the proposer cannot", async () => {
    const user = userEvent.setup();
    const pending = { amendmentId: "0xabc", block: "9", proposer: "A", mine: false, state: "proposed", cdmHash: "0x01",
      changed: ["MinimumTransferAmount"], after: elections("400000") };
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmra/terms": terms([pending], "0xabc") });
    const row = await screen.findByTestId("gmra-amendment-0xabc");
    expect(row.textContent).toContain("MinimumTransferAmount");
    expect(within(await screen.findByTestId("gmra-terms")).getByRole("button", { name: "Propose GMRA amendment → A" })).toHaveProperty("disabled", true);
    await user.click(within(row).getByRole("button", { name: "Consent to GMRA amendment" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/gmra/amendments/0xabc/decision", body: { consent: true } }]));
  });
});

describe("flow-gmsla-terms", () => {
  const elections = (time: string) => ({
    baseCurrency: "USD", marketValue: "standard definition", aggregation: "Aggregated", nettingOfDeliveries: "applies",
    failureToRedeliverIndemnity: "applies", notificationTime: `${time} GBLO`,
    automaticEarlyTermination: { A: "does not apply", B: "does not apply" }, mtaUsd: { A: "250000", B: "250000" }, defaultMargin: "1.02",
  });
  const terms = (amendments: unknown[], pending: string | null = null) => ({
    agreement: "ISLA GMSLA 2010 (English law), CDM LegalAgreement in cdm-ext GmslaTerms", party1: "BANK-A", party2: "BANK-B",
    elections: elections("10:00"), termsHash: "0x" + "0".repeat(64), onChainTermsHash: "0x" + "0".repeat(64), agreedAmendments: 0,
    verified: true, problem: null, pendingAmendment: pending, amendments,
  });

  it("either party proposes a new notification time", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmsla/terms": terms([]) });
    const card = await screen.findByTestId("gmsla-terms");
    expect(within(card).getByTestId("gmsla-notification-time").textContent).toContain("10:00 GBLO");
    expect(within(card).getByText("GMSLA terms verified against the chain ✓")).toBeTruthy();
    await user.type(within(card).getByLabelText("New GMSLA notification time"), "11:00");
    await user.click(within(card).getByRole("button", { name: "Propose GMSLA amendment → B" }));
    await waitFor(() =>
      expect(posts).toEqual([{ path: "/gmsla/amendments", body: { notificationTime: "11:00", party: "B", mtaUsd: null, defaultMargin: null } }]),
    );
  });

  it("the counterparty consents to a pending amendment; the proposer cannot propose another", async () => {
    const user = userEvent.setup();
    const pending = { amendmentId: "0xdef", block: "9", proposer: "A", mine: false, state: "proposed", cdmHash: "0x01",
      changed: ["NotificationTime"], after: elections("11:00") };
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmsla/terms": terms([pending], "0xdef") });
    const row = await screen.findByTestId("gmsla-amendment-0xdef");
    expect(row.textContent).toContain("11:00 GBLO");
    expect(within(await screen.findByTestId("gmsla-terms")).getByRole("button", { name: "Propose GMSLA amendment → A" })).toHaveProperty("disabled", true);
    await user.click(within(row).getByRole("button", { name: "Consent to GMSLA amendment" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/gmsla/amendments/0xdef/decision", body: { consent: true } }]));
  });
});

describe("flow-gmsla-loan-delivery-return", () => {
  const loan = (over: Record<string, unknown>) => ({
    loanId: "0xl1", role: "lender", counterparty: "B", state: "open", security: "tMMF", quantity: "100000", collateral: "tUSD",
    collateralAmount: "102000", tradeHash: "0x01", price: "1", marginPercent: "102", rebateRatePercent: "4", termDate: null,
    deliveryInstructedByMe: false, deliveryInstructedByCounterparty: false, verified: true, problem: null, ...over,
  });

  it("the lender books a loan against cash at the GMSLA default margin", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/loans": { businessDate: "2026-11-11", loans: [] } });
    const card = await screen.findByTestId("loans");
    await user.clear(within(card).getByLabelText("Loan quantity"));
    await user.type(within(card).getByLabelText("Loan quantity"), "40000");
    await user.click(within(card).getByRole("button", { name: "Book loan: lend to B" }));
    await waitFor(() =>
      expect(posts).toEqual([{ path: "/loans", body: { security: "tMMF", quantity: 40000, collateral: "tUSD", ratePercent: "4", margin: null } }]),
    );
  });

  it("the borrower returns part; the lender agrees the pending return and sees the last return qualified", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, {
      "/loans": { businessDate: "2026-11-11", loans: [
        loan({ pendingReturn: { quantity: "40000", collateralAmount: "40800", instructedByMe: false, instructedByCounterparty: true } }),
        loan({ loanId: "0xl2", quantity: "60000", collateralAmount: "61200",
          lastReturn: { phase: "Return", quantity: "40000", collateralAmount: "40800", qualification: "PartialReturn", cdmQualifications: ["PartialTermination"] } }),
      ] },
    });
    expect((await screen.findByTestId("loan-last-return-0xl2")).textContent).toBe("PartialReturn of 40,000, collateral back 40,800 (CDM: PartialTermination)");
    const row = await screen.findByTestId("loan-0xl1");
    await user.click(within(row).getByRole("button", { name: "Agree return of 40,000 tMMF (collateral back 40,800 tUSD)" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/loans/0xl1/return", body: {} }]));
  });
});

describe("flow-gmsla-recall", () => {
  const loan = (over: Record<string, unknown>) => ({
    loanId: "0xl1", role: "lender", counterparty: "B", state: "open", security: "tMMF", quantity: "100000", collateral: "tUSD",
    collateralAmount: "102000", tradeHash: "0x01", price: "1", marginPercent: "102", rebateRatePercent: "4", termDate: null,
    deliveryInstructedByMe: false, deliveryInstructedByCounterparty: false, verified: true, problem: null, ...over,
  });
  const recall = (over: Record<string, unknown>) => ({
    quantity: "40000", intendedSettlementDate: "2026-11-16", overdue: false, noticeHash: "0xab", recalledQuantity: "40000", noticeDate: "2026-11-12", verified: true, ...over,
  });

  it("the lender recalls part of an open loan", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/loans": { businessDate: "2026-11-12", loans: [loan({})] } });
    const row = await screen.findByTestId("loan-0xl1");
    await user.clear(within(row).getByLabelText("Recall quantity"));
    await user.type(within(row).getByLabelText("Recall quantity"), "40000");
    await user.click(within(row).getByRole("button", { name: "Recall part" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/loans/0xl1/recall", body: { quantity: 40000 } }]));
  });

  it("the borrower sees an overdue recall and returns the quantity recalled; the lender can withdraw it", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, {
      "/loans": { businessDate: "2026-11-17", loans: [loan({ role: "borrower", counterparty: "A", recall: recall({ overdue: true }) })] },
    });
    expect((await screen.findByTestId("loan-recall-0xl1")).textContent).toBe("recall of 40,000 due 2026-11-16 (overdue)");
    const row = screen.getByTestId("loan-0xl1");
    expect(within(row).queryByRole("button", { name: "Withdraw recall" })).toBeNull();
    expect(within(row).queryByLabelText("Recall quantity")).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Return part" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/loans/0xl1/return", body: { quantity: 40000 } }]));
    cleanup();
    posts.length = 0;
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/loans": { businessDate: "2026-11-12", loans: [loan({ recall: recall({}) })] } });
    await user.click(await screen.findByRole("button", { name: "Withdraw recall" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/loans/0xl1/recall/withdraw", body: {} }]));
  });
});

describe("flow-gmsla-marking", () => {
  const mark = (over: Record<string, unknown>) => ({
    party: "BANK-A", businessDate: "2026-11-11",
    loans: [{ loanId: "0xl1", role: "lender", quantity: "5000000", price: "1.1", marketValueUsd: "5500000.00", marginPercent: "102",
      requirementUsd: "5610000.00", collateralValueUsd: "5100000.00", exposureUsd: "510000.00" }],
    netMarginHeldUsd: "0.00", netExposureUsd: "510000.00", minimumTransferAmountUsd: "250000.00", callableUsd: "510000",
    statementHash: "0x" + "ab".repeat(32), callOpen: false, settledCalls: [], ...over,
  });

  it("the lender short of collateral calls the net figure", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmsla-marking": mark({}) });
    const card = await screen.findByTestId("gmsla-marking");
    expect(screen.getByTestId("gmsla-net-exposure").textContent).toBe("net figure USD 510,000");
    expect(within(screen.getByTestId("gmsla-mark-0xl1")).getAllByRole("cell").map((c) => c.textContent)).toEqual(
      ["0xl1", "lender", "5,000,000", "1.1", "5,610,000 (102%)", "5,100,000", "510,000"]);
    await user.click(within(card).getByRole("button", { name: "Call GMSLA margin from B: USD 510,000" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/gmsla-marking/calls", body: {} }]));
  });

  it("no call is offered below the minimum transfer amount or while a GMSLA call is open", async () => {
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmsla-marking": mark({ callableUsd: "0", netExposureUsd: "-510000.00" }) });
    const card = await screen.findByTestId("gmsla-marking");
    expect((within(card).getByRole("button", { name: "Nothing to call" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "/gmsla-marking": mark({ callOpen: true }) });
    expect((await screen.findByTestId("gmsla-call-open")).textContent).toBe("a GMSLA margin call is open");
  });
});

describe("flow-repo-default-close-out", () => {
  const statement = {
    earlyTerminationDate: "2026-11-12", automaticEarlyTermination: true, nonDefaultingParty: "BANK-A", defaultingParty: "BANK-B",
    transactions: [{ repoId: "0xr1", seller: "BANK-A", buyer: "BANK-B", buySellBack: false, repurchasePrice: "1000375", price: "98.4", quantity: "10366", defaultMarketValue: "1020014" }],
    heldMargin: [], netAmount: "19639", balance: "19639", payer: "BANK-B", receiver: "BANK-A",
  };
  const view = (over: Record<string, unknown>) => ({
    businessDate: "2026-11-12", counterparty: "B", counterpartyInDefault: false, inDefault: false, automaticEarlyTermination: true,
    baseCurrency: "USD", openTransactions: 1, preview: statement, closeOuts: [], ...over,
  });

  it("the non-defaulting party declares the default and closes out with the balance shown", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: [] }, NO_SHORTFALL, { "/repo-default": view({}) });
    const button = await screen.findByTestId("repo-default-close-out");
    expect(button.textContent).toBe("Declare B's default and close out: BANK-B pays USD 19639");
    await user.click(button);
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-default/close-out", body: {} }]));
  });

  it("the defaulting party is offered no close-out and pays a verified balance", async () => {
    const user = userEvent.setup();
    const closeOut = { closeOutId: "0xc0ffee0000", cdmHash: "0x01", nonDefaulting: "A", defaulting: "B", amount: "19639", paid: false, payer: "B",
      toPay: true, noticeServed: false, verified: true, statement };
    serve("B", { calls: [], balances: [] }, NO_SHORTFALL, { "/repo-default": view({ counterparty: "A", inDefault: true, openTransactions: 0, preview: undefined, closeOuts: [closeOut] }) });
    expect((await screen.findByTestId("repo-default-status")).textContent).toBe("this party is in default");
    expect(screen.queryByTestId("repo-default-close-out")).toBeNull();
    expect(screen.getByTestId("repo-closeout-balance").textContent).toBe("B pays USD 19639");
    await user.click(screen.getByRole("button", { name: "Pay USD 19639" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/repo-default/close-outs/0xc0ffee0000/pay", body: {} }]));
  });
});
