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
const PRICE_TUST = 98.4;
const HAIRCUT = 0.98;

// Live flow timing. Each lifecycle step is an on-chain write (a 2 s QBFT block) followed by SSE propagation
// (Besu ws -> gateway -> service -> console), and a full flow chains about six of them. The Playwright config
// default (timeout: 30_000) is below that total, so the live specs set their own per-test and per-step budgets.
const TEST_TIMEOUT = 180_000; // whole live flow
const STEP_TIMEOUT = 30_000; // one step's UI window

// The service state at /api/v1/state is the authoritative settlement record (folded from on-chain call state via the
// gateway). Wait on it before the console "settled on-chain ✓" assertion, so SSE propagation lag to an already-open
// page does not fail the test after the backend has settled. Checks both parties' services (8001 pledgor, 8002
// secured party); the call is matched by kind and amount, which identify this run's call on the persistent chain.
async function waitForSettledOnChain(kind: "IM" | "VM" | "Return", amountUsd: number) {
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

const SERVICE = { A: "http://localhost:8001/api/v1", B: "http://localhost:8002/api/v1" } as const;
const GATEWAY = { A: "http://localhost:8201/ledger/v1", B: "http://localhost:8202/ledger/v1" } as const;
const ZERO_HASH = "0x" + "0".repeat(64);
// tUST value after haircut per unit in USD (98.4 at a 2% haircut), the on-chain check in CollateralControl.
const TUST_VALUE = PRICE_TUST * HAIRCUT;

async function call<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
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
const shortId = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

/**
 * Waits until A's gateway reads a call B just issued. B's gateway returns once B's node has the issuing block; A's node
 * may import it later, and A's response then reads a call A's node does not hold yet (MarginCall NoSuchCall; CI runs
 * 42515444660, 42929679573 and 43061438276).
 */
async function seenByA(callId: string) {
  await expect
    .poll(async () => (await fetch(`${GATEWAY.A}/calls/${callId}`).catch(() => null))?.ok ?? false, { timeout: 30_000 })
    .toBe(true);
}

/**
 * Setup for the return and enforcement specs: an IM call settled into escrow, driven through the same service API the
 * consoles call (the UI path of this flow is covered by the flow-im-margin-call-pledge spec). Returns the callId.
 */
async function pledgeThroughServices(amountUsd: number, qty: number, token = "tUST"): Promise<string> {
  const { callId } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await seenByA(callId);
  await call(`${SERVICE.A}/calls/${callId}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token, qty }] });
  await call(`${SERVICE.B}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
  await call(`${SERVICE.A}/calls/${callId}/pledge`, "POST", { proposalId });
  return callId;
}

interface Parties {
  a: string;
  b: string;
  tokens: Record<string, string>; // symbol -> token address
}

async function parties(): Promise<Parties> {
  const ctx = await call<{ address: string; counterpartyAddress: string; tokens: { symbol: string; address: string }[] }>(`${SERVICE.A}/context`);
  return { a: ctx.address, b: ctx.counterpartyAddress, tokens: Object.fromEntries(ctx.tokens.map((t) => [t.symbol, t.address])) };
}

// On-chain reads through a party's own gateway (relationship harness-to-gateway). Amounts are decimal strings.
const balanceOf = async (gw: string, token: string, owner: string) => BigInt(await call<string>(`${gw}/balance?token=${token}&owner=${owner}`));
const pledgedOf = async (gw: string, token: string, p: Parties) =>
  BigInt(await call<string>(`${gw}/pledged?token=${token}&pledgor=${p.a}&securedParty=${p.b}`));

// The CDM MarginCallState each party folds from the chain and the payload store; both must converge on the same hash.
// "converged" is per party: every step its own node shows has been folded. A node a block behind can report converged
// on fewer steps, so poll until both parties fold the same number of steps to the same hash.
async function expectConvergedCdmState(callId: string) {
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

test("flow-im-margin-call-pledge: issue -> agree -> propose -> accept -> pledge, settled on-chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const amountUsd = 1_000_000 + (Date.now() % 9000) * 1_000; // unique-ish per run (9000 buckets, multiple of 1k) so the label does not match a leftover call on the persistent chain; above the MTA
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const qty = Math.ceil(amountUsd / (PRICE_TUST * HAIRCUT) / 1000) * 1000 + 1000; // cover agreed amount after haircut

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Secured party (BANK-B) issues the IM call.
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue IM call/ }).click();

  // 2. Pledgor (BANK-A) agrees in full.
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Agree in full" }).click();

  // 3. Pledgor proposes tUST collateral.
  await expect(rowA.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("spinbutton").fill(String(qty));
  await rowA.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });

  // 4. Secured party accepts the proposal.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();

  // 5. Pledgor pledges the accepted collateral.
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA2.getByRole("button", { name: "Pledge accepted collateral" }).click();

  // The call is now settled on-chain. Wait on each party's service state before asserting the console SSE update.
  await waitForSettledOnChain("IM", amountUsd);
  await expect(rowA2.getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/B");
  await expect(page.locator(".subcard", { hasText: label }).getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

test("flow-vm-margin-call-transfer: issue VM -> agree -> propose -> accept -> transfer title, settled on-chain", async ({ page }) => {
  // tUSD is priced 1.00 with no haircut, so whole units map one-to-one to USD; VM settlement passes title directly.
  test.setTimeout(TEST_TIMEOUT);
  const amountUsd = 1_000_000 + (Date.now() % 9000) * 1_000; // unique-ish per run (9000 buckets, multiple of 1k); see the IM flow
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const qty = amountUsd; // tUSD at 1.00

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Secured party (BANK-B) issues a VM call (title transfer).
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await issueCard.getByRole("combobox").selectOption("VM");
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue VM call/ }).click();

  // 2. Pledgor (BANK-A) agrees and proposes tUSD.
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Agree in full" }).click();
  await expect(rowA.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("combobox").selectOption("tUSD");
  await rowA.getByRole("spinbutton").fill(String(qty));
  await rowA.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });

  // 3. Secured party accepts.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();

  // 4. Pledgor transfers title (VM settlement, no escrow).
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Transfer title" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA2.getByRole("button", { name: "Transfer title" }).click();

  // The call is now settled on-chain. Wait on each party's service state before asserting the console SSE update.
  await waitForSettledOnChain("VM", amountUsd);
  await expect(rowA2.getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/B");
  await expect(page.locator(".subcard", { hasText: label }).getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

test("flow-return: pledgor calls a return -> secured party agrees -> releases escrow, settled on-chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens["tUST"];
  // Return amount below the IM call range of the other specs (all >= USD 1,000,000), so the label does not collide, and
  // small, because each run leaves part of the pledged tUST in escrow on the persistent chain.
  const returnUsd = 50_000 + (Date.now() % 9000) * 10;
  const label = `USD ${returnUsd.toLocaleString("en-US")}`;
  const releaseQty = Math.floor(returnUsd / TUST_VALUE) - 1; // value after haircut must not exceed the agreed return
  const pledgeUsd = 2 * returnUsd;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: initial margin in escrow from A (pledgor) with B (secured party).
  await pledgeThroughServices(pledgeUsd, pledgeQty);
  const freeBefore = await balanceOf(GATEWAY.A, tUST, p.a);
  const pledgedBefore = await pledgedOf(GATEWAY.B, tUST, p);
  expect(pledgedBefore >= BigInt(releaseQty)).toBe(true);

  // 1-5. Pledgor (BANK-A) calls for the return in its console; the call is recorded on-chain with the pledgor key.
  await page.goto("/#/live/A");
  const returnCard = page.locator(".card", { hasText: "Call for a return" });
  await returnCard.getByRole("spinbutton").fill(String(returnUsd));
  await returnCard.getByRole("button", { name: "Call return → B" }).click();
  await expect(page.locator(".subcard", { hasText: label })).toBeVisible({ timeout: STEP_TIMEOUT });
  const stateA = await call<{ calls: { callId: string; kind: string; amountUsd: string; from: string; to: string }[] }>(`${SERVICE.A}/state`);
  const returnCall = stateA.calls.find((c) => c.kind === "Return" && c.amountUsd === String(returnUsd) && c.from === "A");
  expect(returnCall, "the return call is on-chain").toBeTruthy();
  const callId = returnCall!.callId;
  expect(returnCall!.to).toBe("B");

  // 6-8. Secured party (BANK-B) sees the return call and agrees it in full.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: shortId(callId) });
  await expect(rowB.getByRole("button", { name: "Agree in full" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Agree in full" }).click();

  // 9-13. Secured party releases the escrowed tUST; the control contract checks the agreed amount and transfers it back.
  await expect(rowB.getByRole("button", { name: "Release escrow" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("combobox").selectOption("tUST");
  await rowB.getByRole("spinbutton").fill(String(releaseQty));
  await rowB.getByRole("button", { name: "Release escrow" }).click();

  // 14. Both services see the call settled; both consoles show it.
  await waitForSettledOnChain("Return", returnUsd);
  await expect(rowB.getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await expect(page.locator(".subcard", { hasText: shortId(callId) }).getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // On-chain state through each party's gateway: the return call is settled with its settle cdmHash anchored, and the
  // released tUST moved from escrow back to the pledgor.
  const onChain = await call<{ kind: number; state: number; agreed: string; settleCdmHash: string }>(`${GATEWAY.A}/calls/${callId}`);
  expect(onChain.kind).toBe(2); // Return
  expect(onChain.state).toBe(5); // Settled
  expect(BigInt(onChain.agreed)).toBe(BigInt(returnUsd) * 100_000_000n);
  expect(onChain.settleCdmHash).not.toBe(ZERO_HASH);
  expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(freeBefore + BigInt(releaseQty));
  expect(await pledgedOf(GATEWAY.B, tUST, p)).toBe(pledgedBefore - BigInt(releaseQty));

  // Each service folded the issue, respond and settle steps into the same MarginCallState.
  await expectConvergedCdmState(callId);

  expect(errors).toEqual([]);
});

test("flow-default-enforcement: secured party declares default -> oracle feed -> enforce, escrow seized on-chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  // Small, because enforcement moves the pledged tUST to the secured party for good on the persistent chain. The row is
  // found by callId, so the amount needs no unique label.
  const pledgeUsd = 100_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: initial margin in escrow from A (pledgor) with B (secured party).
  const callId = await pledgeThroughServices(pledgeUsd, pledgeQty);
  await waitForSettledOnChain("IM", pledgeUsd);

  // Enforcement seizes everything A has in escrow with B, including collateral left by earlier runs.
  const symbols = Object.keys(p.tokens);
  const pledgedBefore: Record<string, bigint> = {};
  const securedFreeBefore: Record<string, bigint> = {};
  for (const sym of symbols) {
    pledgedBefore[sym] = await pledgedOf(GATEWAY.B, p.tokens[sym], p);
    securedFreeBefore[sym] = await balanceOf(GATEWAY.B, p.tokens[sym], p.b);
  }
  expect(pledgedBefore["tUST"] >= BigInt(pledgeQty)).toBe(true);

  // 1-7. Secured party (BANK-B) declares the default and enforces in its console: the service forwards the notice to
  // the oracle service, which publishes it through the operator's gateway; then B's gateway submits enforce().
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: shortId(callId) });
  await expect(rowB.getByRole("button", { name: "Declare default & enforce" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Declare default & enforce" }).click();

  // 8. Each service records the enforcement from its gateway's event stream; the pledgor's service sees the default.
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => (await call<{ calls: { callId: string; enforced?: boolean }[] }>(`${svc}/state`)).calls.find((c) => c.callId === callId)?.enforced, {
        timeout: 60_000,
      })
      .toBe(true);
  }
  await expect(rowB.getByText("enforced ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(page.getByRole("status")).toContainText("Counterparty A in default on the oracle feed", { timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await expect(page.locator(".subcard", { hasText: shortId(callId) }).getByText("enforced ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(page.getByRole("status")).toContainText("This party (A) in default on the oracle feed", { timeout: STEP_TIMEOUT });

  // On-chain state through each party's gateway: A is in default on the oracle feed, nothing is left in escrow, and the
  // secured party holds what was pledged.
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    expect((await call<{ inDefault: boolean }>(`${gw}/defaults/${p.a}`)).inDefault).toBe(true);
  }
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.b}`)).inDefault).toBe(false);
  for (const sym of symbols) {
    expect(await pledgedOf(GATEWAY.A, p.tokens[sym], p)).toBe(0n);
    expect(await balanceOf(GATEWAY.B, p.tokens[sym], p.b)).toBe(securedFreeBefore[sym] + pledgedBefore[sym]);
  }

  expect(errors).toEqual([]);
});

// --- flow-oracle-update ---
// The oracle service (8100) holds mock market data and publishes prices to the oracle feed through the market
// operator's gateway (8200), the only one holding the publisher key. Each party reads the feed from its own node.
const ORACLE = "http://localhost:8100/oracle/v1";
const GATEWAY_MKT = "http://localhost:8200/ledger/v1";
// No other CSA spec values tMMF at its feed price after this spec runs (flow-registered-collateral pledges it, and
// enforcement empties that escrow), so changing its price cannot move another spec's valuation; the test restores the
// original price at the end either way.
const ORACLE_TOKEN = "tMMF";

test("flow-oracle-update: operator edits a price -> oracle publishes via the mkt gateway -> both parties read it on-chain", async () => {
  test.setTimeout(TEST_TIMEOUT);
  type MarketToken = { symbol: string; token: string; price: string | null; priceUsd: string | null; rating: string | null };
  const market = await call<{ priceScale: string; tokens: MarketToken[] }>(`${ORACLE}/market-data`);
  const entry = market.tokens.find((t) => t.symbol === ORACLE_TOKEN);
  expect(entry, `${ORACLE_TOKEN} in the oracle's market data`).toBeTruthy();
  const token = entry!.token;
  const onChain = async (gw: string) => (await call<{ price: string | null }>(`${gw}/prices/${token}`)).price;

  // The mock data starts from the feed: the oracle's price and every party's on-chain read agree.
  const original = await onChain(GATEWAY.A);
  expect(original).not.toBeNull();
  expect(await onChain(GATEWAY.B)).toBe(original);
  expect(entry!.price).toBe(original);

  // A new price that differs from the current one on every run (0.95 or 0.96 USD).
  const scale = BigInt(market.priceScale);
  const newUsd = BigInt(original!) === (95n * scale) / 100n ? "0.96" : "0.95";
  const newScaled = ((BigInt(newUsd.replace(".", "")) * scale) / 100n).toString();

  try {
    // 1-3. The operator's edit is published through the mkt gateway with the publisher key and mined.
    const edit = await call<{ price: string; tx: { txHash: string; block: string } }>(`${ORACLE}/market-data/${ORACLE_TOKEN}`, "PUT", { price: newUsd });
    expect(edit.price).toBe(newScaled);
    expect(edit.tx.txHash).toMatch(/^0x[0-9a-f]{64}$/i);

    // Every party's gateway reads the new price from its own Besu node.
    for (const gw of [GATEWAY.A, GATEWAY.B, GATEWAY_MKT]) {
      await expect.poll(() => onChain(gw), { timeout: 30_000 }).toBe(newScaled);
    }

    // A party's gateway does not hold the publisher key, so it refuses a feed write.
    const refused = await fetch(`${GATEWAY.A}/oracle/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, price: original }),
    });
    expect(refused.ok).toBe(false);
    expect(await onChain(GATEWAY.A)).toBe(newScaled);

    // Republishing on request writes the oracle's current price again.
    const republished = await call<{ published: { symbol: string; price: string }[] }>(`${ORACLE}/prices/publish`, "POST", { symbol: ORACLE_TOKEN });
    expect(republished.published).toEqual([expect.objectContaining({ symbol: ORACLE_TOKEN, price: newScaled })]);
  } finally {
    const scaledToUsd = (s: string) => (Number(BigInt(s)) / Number(scale)).toString();
    await call(`${ORACLE}/market-data/${ORACLE_TOKEN}`, "PUT", { price: scaledToUsd(original!) });
  }
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    await expect.poll(() => onChain(gw), { timeout: 30_000 }).toBe(original);
  }
});

// --- flow-revaluation-top-up ---
// The operator lowers the tUST price in the operator console (#/live/operator); the oracle publishes it to the feed. The
// secured party's console revalues the pledged IM at the feed prices after haircuts and offers a top-up IM call for the
// shortfall (minimum transfer amount USD 500,000, rounded up to USD 10,000). The top-up is settled like any IM call and
// does not add to the requirement (wp-adr-revaluation-outstanding-im-from-calls). The tUST price is restored at the
// end because the other specs value tUST at 98.4.
type Revaluation = { requiredUsd: string; valueUsd: string; shortfallUsd: string; topUpUsd: string; topUpCalls: number };

// --- flow-registered-collateral (task-authoritative-record-settlement-enforcement) ---
// tMMF mirrors the fund's register, kept by its transfer agent (the oracle service, mkt key). Interim rules REG-1 to
// REG-5 (project owner, 2026-11-21, task-sme-registered-asset-completion): a pledge or an enforcement of tMMF is
// complete only once the transfer agent confirms that its register shows it, and until then the register and the
// ledger show a break. The spec pauses the transfer agent to see the step wait, then lets it confirm. At each wait it
// also checks the party consoles show it (task-console-record-keeper-completion): the call row names the transfer
// agent's confirmation, and the register card shows the break.
type RecordKeeperFold = {
  settlementComplete?: boolean; recordKeeperError?: string; anchorHash?: string;
  recordKeeper?: { identifier: string; complete: boolean; tokens: { symbol: string; confirmed?: boolean; complete: boolean }[] }[];
};
type EnforcementView = { enforced: boolean; documentVerified?: boolean; anchorStatus?: string; anchorHash?: string; complete: boolean; eventQualifier?: string };
type RegisterBreaksView = { reconciled: boolean; tokens: { symbol: string; reconciled: boolean; breaks: { record: string; breakType: string }[] }[] };

const setTransferAgentPaused = (paused: boolean) => call(`${ORACLE}/register/paused`, "PUT", { paused });

test("flow-registered-collateral: A pledges tMMF -> settled on-chain but not complete until the transfer agent confirms its register -> B enforces -> the enforcement completes only on the transfer agent's confirmation", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const KEEPER = "MMF Transfer Agent"; // contracts/scripts/deploy.ts
  const callRow = (callId: string) => page.locator(".subcard", { hasText: shortId(callId) });
  const consoleShows = async (party: "A" | "B", callId: string, text: string) => {
    await page.goto(`/#/live/${party}`);
    await expect(callRow(callId).getByText(text, { exact: true })).toBeVisible({ timeout: STEP_TIMEOUT });
  };
  const p = await parties();
  const aWasInDefault = (await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.a}`)).inDefault;
  // tMMF is priced at 1 USD; its haircut is 4% at deployment and up to 12% after flow-agreement-amendment.
  const pledgeUsd = 50_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / 0.88) + 100;
  try {
    if (aWasInDefault) await call(`${ORACLE}/defaults`, "POST", { party: p.a, inDefault: false, notifiedBy: "e2e setup" });
    await setTransferAgentPaused(true);

    // A pledges tMMF to B. The chain settles it; the transfer agent has not confirmed, so neither party treats the
    // pledge as complete, and the register and the ledger disagree.
    const callId = await pledgeThroughServices(pledgeUsd, pledgeQty, "tMMF");
    await waitForSettledOnChain("IM", pledgeUsd);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await call<RecordKeeperFold>(`${svc}/calls/${callId}/cdm-state`)).recordKeeper?.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
      const f = await call<RecordKeeperFold>(`${svc}/calls/${callId}/cdm-state`);
      expect(f.recordKeeperError).toBeUndefined();
      expect(f.settlementComplete).toBe(false);
      const settle = f.recordKeeper!.find((r) => r.tokens.some((t) => t.symbol === "tMMF"))!;
      expect(settle.tokens.find((t) => t.symbol === "tMMF")).toMatchObject({ confirmed: false, complete: false });
    }
    const open = await call<RegisterBreaksView>(`${SERVICE.B}/register/breaks`);
    expect(open.tokens.find((t) => t.symbol === "tMMF")!.reconciled).toBe(false);
    await consoleShows("A", callId, `tMMF awaiting ${KEEPER} confirmation, not complete`);
    await expect(page.getByTestId("register-tMMF").getByText(/^\d+ register breaks?$/)).toBeVisible({ timeout: STEP_TIMEOUT });

    // The transfer agent updates its register and confirms on chain: both parties now treat the pledge as complete,
    // and the register reconciles with the ledger.
    await setTransferAgentPaused(false);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await call<RecordKeeperFold>(`${svc}/calls/${callId}/cdm-state`)).settlementComplete, { timeout: 60_000 }).toBe(true);
    }
    await expectConvergedCdmState(callId);
    await expect.poll(async () => (await call<RegisterBreaksView>(`${SERVICE.B}/register/breaks`)).tokens.find((t) => t.symbol === "tMMF")!.reconciled, { timeout: 60_000 }).toBe(true);
    await consoleShows("B", callId, `tMMF confirmed by ${KEEPER} ✓`);
    await expect(page.getByTestId("register-tMMF").getByText("register matches the ledger ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

    // B declares A's default and enforces. The control contract records the hash of B's CDM CollateralEnforcement;
    // with the transfer agent paused the enforcement is anchored but not complete.
    await setTransferAgentPaused(true);
    await call(`${SERVICE.B}/calls/${callId}/enforce`, "POST", {});
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await call<EnforcementView>(`${svc}/calls/${callId}/enforcement`)).documentVerified ?? false, { timeout: 60_000 }).toBe(true);
      const e = await call<EnforcementView>(`${svc}/calls/${callId}/enforcement`);
      expect(e).toMatchObject({ enforced: true, anchorStatus: "Complete", complete: false, eventQualifier: "CollateralEnforced" });
    }
    await consoleShows("B", callId, `enforcement: tMMF awaiting ${KEEPER} confirmation, not complete`);

    // The transfer agent confirms the enforcement: complete on both sides, with the same anchor.
    await setTransferAgentPaused(false);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await call<EnforcementView>(`${svc}/calls/${callId}/enforcement`)).complete, { timeout: 60_000 }).toBe(true);
    }
    const ea = await call<EnforcementView>(`${SERVICE.A}/calls/${callId}/enforcement`);
    const eb = await call<EnforcementView>(`${SERVICE.B}/calls/${callId}/enforcement`);
    expect(ea.anchorHash).toBe(eb.anchorHash);
    await consoleShows("A", callId, `enforcement: tMMF confirmed by ${KEEPER} ✓`);
    expect(await pledgedOf(GATEWAY.A, p.tokens["tMMF"], p)).toBe(0n);
    await expect.poll(async () => (await call<RegisterBreaksView>(`${SERVICE.A}/register/breaks`)).reconciled, { timeout: 60_000 }).toBe(true);
  } finally {
    await setTransferAgentPaused(false);
    if (!aWasInDefault) await call(`${ORACLE}/defaults`, "POST", { party: p.a, inDefault: false, notifiedBy: "e2e restore" });
  }
});

// --- flow-registered-collateral in a GMSLA loan (task-authoritative-record-other-flows) ---
// The same interim rules in the securities lending flows: a delivery or a return of tMMF, the loaned security, is complete
// only once the transfer agent confirms its register shows it. The loans view reports it as the CSA cdm-state does
// (recordKeeper, settlementComplete), from the SecuritiesLoan transactions that moved tMMF.
type LoanCompletion = {
  loanId: string; state: string; quantity: string; settlementComplete?: boolean; recordKeeperError?: string;
  recordKeeper?: { identifier: string; complete: boolean; tokens: { symbol: string; confirmed?: boolean; complete: boolean }[] }[];
};

test("flow-registered-collateral-gmsla: A lends tMMF to B -> the delivery is open on-chain but not complete until the transfer agent confirms -> the return waits for it too", async () => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const loanOf = async (svc: string, id: string) => (await call<{ loans: LoanCompletion[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id);
  const quantity = 50_000 + (Date.now() % 9000);
  let loanId: string | undefined;
  let returned = false;
  try {
    await setTransferAgentPaused(true);
    ({ loanId } = await call<{ loanId: string }>(`${SERVICE.A}/loans`, "POST", { security: "tMMF", quantity, collateral: "tUSD", ratePercent: "4" }));
    await call(`${SERVICE.B}/loans/${loanId}/affirm`, "POST", {});
    await call(`${SERVICE.A}/loans/${loanId}/deliver`, "POST", {});
    await call(`${SERVICE.B}/loans/${loanId}/deliver`, "POST", {});

    // Delivered on chain; the transfer agent has not confirmed, so neither party treats the delivery as complete.
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await loanOf(svc, loanId!))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
      await expect.poll(async () => (await loanOf(svc, loanId!))?.recordKeeper?.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
      const l = (await loanOf(svc, loanId!))!;
      expect(l.recordKeeperError).toBeUndefined();
      expect(l.settlementComplete).toBe(false);
      expect(l.recordKeeper![0].identifier).toContain("LoanDelivered");
      expect(l.recordKeeper![0].tokens.find((t) => t.symbol === "tMMF")).toMatchObject({ confirmed: false, complete: false });
    }
    expect((await call<RegisterBreaksView>(`${SERVICE.B}/register/breaks`)).tokens.find((t) => t.symbol === "tMMF")!.reconciled).toBe(false);

    // The transfer agent confirms: the delivery is complete for both parties.
    await setTransferAgentPaused(false);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await loanOf(svc, loanId!))?.settlementComplete, { timeout: 60_000 }).toBe(true);
    }

    // The return of the tMMF waits for the transfer agent in the same way.
    await setTransferAgentPaused(true);
    await call(`${SERVICE.B}/loans/${loanId}/return`, "POST", { quantity });
    await call(`${SERVICE.A}/loans/${loanId}/return`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.A, loanId!))?.state, { timeout: STEP_TIMEOUT }).toBe("returned");
    returned = true;
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await loanOf(svc, loanId!))?.recordKeeper?.length ?? 0, { timeout: 60_000 }).toBe(2);
      const l = (await loanOf(svc, loanId!))!;
      expect(l.settlementComplete).toBe(false);
      expect(l.recordKeeper!.map((r) => r.complete)).toEqual([true, false]);
    }
    await setTransferAgentPaused(false);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await loanOf(svc, loanId!))?.settlementComplete, { timeout: 60_000 }).toBe(true);
    }
    await expect.poll(async () => (await call<RegisterBreaksView>(`${SERVICE.B}/register/breaks`)).tokens.find((t) => t.symbol === "tMMF")!.reconciled, { timeout: 60_000 }).toBe(true);
  } finally {
    await setTransferAgentPaused(false);
    if (loanId && !returned) {
      // Leave no open loan for the GMSLA specs: return it in full.
      const l = await loanOf(SERVICE.A, loanId).catch(() => undefined);
      if (l?.state === "open") {
        await call(`${SERVICE.B}/loans/${loanId}/return`, "POST", { quantity: Number(l.quantity) }).catch(() => undefined);
        await call(`${SERVICE.A}/loans/${loanId}/return`, "POST", {}).catch(() => undefined);
      }
    }
  }
});

test("flow-revaluation-top-up: operator lowers a price -> secured party revalues -> top-up IM call settled, shortfall closed", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const usd = (n: number | string) => `USD ${Number(n).toLocaleString("en-US")}`;
  const lowered = Math.round(PRICE_TUST * 0.9 * 100) / 100; // 88.56: a 10% drop
  const imUsd = 8_000_000 + (Date.now() % 9000) * 10; // after the drop the shortfall is about USD 0.8m, above the MTA
  const imQty = Math.ceil(imUsd / TUST_VALUE) + 100;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const before = await call<Revaluation>(`${SERVICE.B}/revaluation`);
  await pledgeThroughServices(imUsd, imQty);
  await waitForSettledOnChain("IM", imUsd);
  await expect.poll(async () => Number((await call<Revaluation>(`${SERVICE.B}/revaluation`)).requiredUsd), { timeout: 30_000 })
    .toBe(Number(before.requiredUsd) + imUsd);

  try {
    // 1-4. The market operator lowers the tUST price in the operator console; the oracle publishes it to the feed.
    await page.goto("/#/live/operator");
    await page.getByLabel("New price tUST").fill(String(lowered));
    await page.getByRole("button", { name: "Publish tUST" }).click();
    await expect(page.getByRole("status")).toContainText(`tUST published at USD ${lowered}`, { timeout: STEP_TIMEOUT });

    // 5. The secured party's service revalues at the new feed price and its console shows the shortfall and top-up.
    let reval = before;
    await expect
      .poll(async () => Number((reval = await call<Revaluation>(`${SERVICE.B}/revaluation`)).topUpUsd), { timeout: 30_000 })
      .toBeGreaterThan(0);
    const topUpUsd = Number(reval.topUpUsd);
    expect(topUpUsd % 10_000).toBe(0);
    expect(topUpUsd).toBeGreaterThanOrEqual(Number(reval.shortfallUsd));

    await page.goto("/#/live/B");
    const card = page.getByTestId("revaluation");
    await expect(card.getByTestId("top-up")).toHaveText(usd(topUpUsd), { timeout: STEP_TIMEOUT });

    // 6. The secured party issues the top-up IM call from the revaluation panel.
    await card.getByRole("button", { name: "Issue top-up IM call → A" }).click();
    let topUpCall: string | undefined;
    await expect
      .poll(async () => {
        const { calls } = await call<{ calls: { callId: string; kind: string; amountUsd: string; state: string }[] }>(`${SERVICE.A}/state`);
        topUpCall = calls.find((c) => c.kind === "IM" && c.amountUsd === String(topUpUsd) && c.state === "issued")?.callId;
        return topUpCall ?? null;
      }, { timeout: 30_000 })
      .not.toBeNull();

    // 7. The top-up settles like an IM call, with tUST valued at the lowered feed price (the on-chain pledge check).
    const topUpQty = Math.ceil(topUpUsd / (lowered * HAIRCUT)) + 100;
    await call(`${SERVICE.A}/calls/${topUpCall}/response`, "POST", { response: "full" });
    const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${topUpCall}/proposal`, "POST", { assets: [{ token: "tUST", qty: topUpQty }] });
    await call(`${SERVICE.B}/calls/${topUpCall}/decision`, "POST", { proposalId, accept: true });
    await call(`${SERVICE.A}/calls/${topUpCall}/pledge`, "POST", { proposalId });
    await waitForSettledOnChain("IM", topUpUsd);

    // The shortfall is closed and the requirement is unchanged: the top-up restored value, it was not new IM.
    await expect.poll(async () => (reval = await call<Revaluation>(`${SERVICE.B}/revaluation`)).shortfallUsd, { timeout: 30_000 }).toBe("0");
    expect(Number(reval.requiredUsd)).toBe(Number(before.requiredUsd) + imUsd);
    expect(reval.topUpCalls).toBe(before.topUpCalls + 1);
    await expect(card.getByTestId("shortfall")).toHaveText("USD 0", { timeout: STEP_TIMEOUT });
    await expect(card.getByRole("button", { name: /Issue top-up/ })).toHaveCount(0);
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
  }
  const p = await parties();
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${p.tokens["tUST"]}`)).price, { timeout: 30_000 })
      .toBe(String(BigInt(Math.round(PRICE_TUST * 100)) * 1_000_000n));
  }

  expect(errors).toEqual([]);
});

// --- flow-close-out-netting ---
// After the pledgor's default the secured party closes out (ISDA 2002 MA Section 6(e), cdm-ext CloseOutNetting, G15):
// its service builds the CDM CloseOutStatement from the Close-out Amount entered in the console, and the control
// contract applies the pledged collateral to the Early Termination Amount and returns the surplus to the pledgor. Both
// services fetch the statement by its on-chain hash and check it. Like enforcement, this empties A's escrow with B.
type CloseOut = {
  closeOutId: string; owedUsd: string; appliedUsd: string; cdmHash: string; verified?: boolean; error?: string;
  closeOutAmountUsd?: string; earlyTerminationAmountUsd?: string; collateralHeldUsd?: string; collateralAppliedUsd?: string; amountPayableUsd?: string;
};

test("flow-close-out-netting: secured party closes out -> collateral applied to the Early Termination Amount, surplus returned", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const pledgeUsd = 200_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;
  const closeOutUsd = Math.floor(pledgeUsd / 2); // below the collateral held, so a surplus goes back to A

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: initial margin in escrow from A (pledgor) with B (secured party).
  await pledgeThroughServices(pledgeUsd, pledgeQty);
  await waitForSettledOnChain("IM", pledgeUsd);
  const symbols = Object.keys(p.tokens);
  const pledgedBefore: Record<string, bigint> = {};
  const aFreeBefore: Record<string, bigint> = {};
  const bFreeBefore: Record<string, bigint> = {};
  for (const sym of symbols) {
    pledgedBefore[sym] = await pledgedOf(GATEWAY.B, p.tokens[sym], p);
    aFreeBefore[sym] = await balanceOf(GATEWAY.A, p.tokens[sym], p.a);
    bFreeBefore[sym] = await balanceOf(GATEWAY.B, p.tokens[sym], p.b);
  }
  const known = new Set((await call<CloseOut[]>(`${SERVICE.B}/close-outs`)).map((o) => o.closeOutId));

  // 1-7. Secured party (BANK-B) enters the Close-out Amount and closes out in its console.
  await page.goto("/#/live/B");
  const card = page.getByTestId("close-out");
  await card.getByLabel("Close-out Amount (USD)").fill(String(closeOutUsd));
  await card.getByRole("button", { name: "Declare default & close out A" }).click();

  // 8. Both services list the close-out with the same checked statement.
  let mine: CloseOut | undefined;
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => {
        mine = (await call<CloseOut[]>(`${svc}/close-outs`)).find((o) => !known.has(o.closeOutId));
        return mine?.verified ?? null;
      }, { timeout: 60_000 })
      .toBe(true);
  }
  const fromB = (await call<CloseOut[]>(`${SERVICE.B}/close-outs`)).find((o) => o.closeOutId === mine!.closeOutId)!;
  expect(mine!.cdmHash).toBe(fromB.cdmHash);
  expect(mine!.closeOutAmountUsd).toBe(String(closeOutUsd));
  expect(mine!.earlyTerminationAmountUsd).toBe(String(closeOutUsd));
  expect(mine!.collateralAppliedUsd).toBe(String(closeOutUsd)); // the collateral held exceeds the amount owed
  const held = Number(mine!.collateralHeldUsd);
  expect(held).toBeGreaterThanOrEqual(Math.floor(pledgeQty * TUST_VALUE) - 1);
  expect(Number(mine!.amountPayableUsd)).toBe(closeOutUsd - held); // negative: owed back to A
  // On-chain the contract applied whole units: at least the amount owed, less than one more unit of collateral.
  expect(mine!.owedUsd).toBe(String(closeOutUsd));
  expect(Number(mine!.appliedUsd)).toBeGreaterThanOrEqual(closeOutUsd);
  expect(Number(mine!.appliedUsd) - closeOutUsd).toBeLessThan(PRICE_TUST);

  // On-chain state: A is in default, nothing is left in escrow, and each pledged unit went to B (applied) or back to A.
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.B}/defaults/${p.a}`)).inDefault).toBe(true);
  for (const sym of symbols) {
    expect(await pledgedOf(GATEWAY.A, p.tokens[sym], p)).toBe(0n);
    const toB = (await balanceOf(GATEWAY.B, p.tokens[sym], p.b)) - bFreeBefore[sym];
    const toA = (await balanceOf(GATEWAY.A, p.tokens[sym], p.a)) - aFreeBefore[sym];
    expect(toB + toA).toBe(pledgedBefore[sym]);
  }

  // Both consoles show the verified statement.
  const row = page.getByTestId(`close-out-${mine!.closeOutId}`);
  await expect(row.getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await expect(page.getByTestId(`close-out-${mine!.closeOutId}`).getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

// --- flow-substitution ---
// The pledgor asks to substitute part of its pledged tUST with tUSD (ISDA CSA Paragraph 4(d), cdm-ext
// Create_CollateralSubstitution, G16); the secured party consents (the agreement elects consent, Paragraph 13 (f)(ii));
// the pledgor settles and the control contract moves the substitute into escrow and the tUST back in one transaction.
// Each service folds the three CDM steps with the same portfolio and reaches the same state.
type Substitution = {
  substitutionId: string; state: string;
  cdm: { status: string; qualifiers?: string[]; stateHash?: string; converged: boolean; totalSteps: number; error?: string };
};

test("flow-substitution: pledgor requests -> secured party consents -> pledgor settles, substitute in escrow and CDM folded", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens["tUST"];
  const tUSD = p.tokens["tUSD"];
  const pledgeUsd = 100_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;
  const originalQty = 500; // tUST back to A
  const substituteQty = Math.ceil(originalQty * TUST_VALUE) + 10; // tUSD at 1.00, no haircut: worth more than the tUST

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await pledgeThroughServices(pledgeUsd, pledgeQty);
  await waitForSettledOnChain("IM", pledgeUsd);
  const pledgedUstBefore = await pledgedOf(GATEWAY.A, tUST, p);
  const pledgedUsdBefore = await pledgedOf(GATEWAY.A, tUSD, p);
  const freeUstBefore = await balanceOf(GATEWAY.A, tUST, p.a);
  const freeUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
  const known = new Set((await call<Substitution[]>(`${SERVICE.A}/substitutions`)).map((s) => s.substitutionId));

  // 1-4. Pledgor (BANK-A) requests the substitution in its console.
  await page.goto("/#/live/A");
  const req = page.getByTestId("substitution-request");
  await req.getByLabel("Original token").selectOption("tUST");
  await req.getByLabel("Original quantity").fill(String(originalQty));
  await req.getByLabel("Substitute token").selectOption("tUSD");
  await req.getByLabel("Substitute quantity").fill(String(substituteQty));
  await req.getByRole("button", { name: "Request substitution → B" }).click();
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await call<Substitution[]>(`${SERVICE.A}/substitutions`)).find((s) => !known.has(s.substitutionId))?.substitutionId) ?? null, { timeout: 30_000 })
    .not.toBeNull();

  // 5-8. Secured party (BANK-B) consents.
  await page.goto("/#/live/B");
  const rowB = page.getByTestId(`substitution-${id}`);
  await expect(rowB.getByRole("button", { name: "Consent" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Consent" }).click();

  // 9-12. Pledgor settles: the substitute goes into escrow and the tUST comes back.
  await page.goto("/#/live/A");
  const rowA = page.getByTestId(`substitution-${id}`);
  await expect(rowA.getByRole("button", { name: "Settle substitution" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Settle substitution" }).click();
  await expect(rowA.getByText("substituted on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // 13. Both services fold the request, consent and settlement to the same CDM state.
  let a: Substitution | undefined, b: Substitution | undefined;
  await expect
    .poll(async () => {
      a = (await call<Substitution[]>(`${SERVICE.A}/substitutions`)).find((s) => s.substitutionId === id);
      b = (await call<Substitution[]>(`${SERVICE.B}/substitutions`)).find((s) => s.substitutionId === id);
      return !!a?.cdm.converged && !!b?.cdm.converged && a.cdm.totalSteps === 3 && a.cdm.stateHash === b.cdm.stateHash;
    }, { timeout: 60_000 })
    .toBe(true);
  expect(a!.state).toBe("settled");
  expect(a!.cdm.error).toBeUndefined();
  expect(a!.cdm.status.toLowerCase()).toBe("settled");
  expect(a!.cdm.qualifiers).toEqual(["SubstitutionRequested", "SubstitutionConsented", "CollateralSubstituted"]);
  expect(a!.cdm.stateHash).toMatch(/^0x[0-9a-f]{64}$/i);

  // On-chain state through each party's gateway.
  expect(await pledgedOf(GATEWAY.B, tUST, p)).toBe(pledgedUstBefore - BigInt(originalQty));
  expect(await pledgedOf(GATEWAY.B, tUSD, p)).toBe(pledgedUsdBefore + BigInt(substituteQty));
  expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(freeUstBefore + BigInt(originalQty));
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(freeUsdBefore - BigInt(substituteQty));

  await page.goto("/#/live/B");
  await expect(page.getByTestId(`substitution-${id}`).getByText("substituted on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

// --- flow-interest-on-cash ---
// The secured party states the interest it owes on the pledgor's cash collateral for one Interest Period (cdm-ext
// Create_CollateralInterestStatement, G17): every day of the period has the tUSD now in escrow and the one observed rate
// entered in the console (interim reduction, task-sme-interest-daily-balances). The control contract pays a positive
// amount from B to A in the same transaction; both services fetch the statement by its on-chain hash and recompute it.
type Interest = {
  interestId: string; amountUsd: string; state: string; cdmHash: string; verified?: boolean; error?: string;
  days?: number; balanceUsd?: string; ratePct?: string; interestAmountUsd?: string; transferAmountUsd?: string;
};

test("flow-interest-on-cash: secured party states interest on cash collateral -> paid to the pledgor on-chain, statement verified", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUSD = p.tokens["tUSD"];
  const cashUsd = 100_000 + (Date.now() % 9000) * 10;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: cash initial margin (tUSD, no haircut) in escrow from A (pledgor) with B (secured party).
  await pledgeThroughServices(cashUsd, cashUsd, "tUSD");
  await waitForSettledOnChain("IM", cashUsd);
  const cash = Number(await pledgedOf(GATEWAY.B, tUSD, p)); // all tUSD A has in escrow with B, earlier runs included
  const expected = Math.round((cash * 0.043 * 30) / 360); // 4.30%, 30 days, ACT/360, whole USD
  const aFreeBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
  const bFreeBefore = await balanceOf(GATEWAY.B, tUSD, p.b);
  const known = new Set((await call<Interest[]>(`${SERVICE.B}/interest`)).map((i) => i.interestId));

  // 1-7. Secured party (BANK-B) enters the period and the observed rate and states the interest in its console.
  await page.goto("/#/live/B");
  const card = page.getByTestId("interest");
  await card.getByLabel("Period start").fill("2026-11-01");
  await card.getByLabel("Period end").fill("2026-12-01");
  await card.getByLabel("Observed rate (%)").fill("4.3");
  await expect(card.getByRole("button", { name: "State interest → A" })).toBeEnabled({ timeout: STEP_TIMEOUT });
  await card.getByRole("button", { name: "State interest → A" }).click();

  // 8-9. Both services list the statement, paid, with the same checked document.
  let mine: Interest | undefined;
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => {
        mine = (await call<Interest[]>(`${svc}/interest`)).find((i) => !known.has(i.interestId));
        return mine?.verified && mine.state === "settled" ? true : (mine?.error ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
  }
  const fromB = (await call<Interest[]>(`${SERVICE.B}/interest`)).find((i) => i.interestId === mine!.interestId)!;
  expect(mine!.cdmHash).toBe(fromB.cdmHash);
  expect(mine!.days).toBe(30);
  expect(mine!.balanceUsd).toBe(String(cash));
  expect(mine!.ratePct).toBe("4.3");
  expect(mine!.interestAmountUsd).toBe(String(expected));
  expect(mine!.amountUsd).toBe(String(expected));

  // On-chain: the Interest Amount moved from B to A; the cash collateral in escrow is unchanged.
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aFreeBefore + BigInt(expected));
  expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bFreeBefore - BigInt(expected));
  expect(Number(await pledgedOf(GATEWAY.A, tUSD, p))).toBe(cash);

  // Both consoles show the statement as paid and verified.
  for (const who of ["B", "A"] as const) {
    await page.goto(`/#/live/${who}`);
    const row = page.getByTestId(`interest-${mine!.interestId}`);
    await expect(row.getByText("paid on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(row.getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  }
  expect(errors).toEqual([]);
});

// Settlement netting (task-csa-settlement-netting): the scope is the project owner's choice of 2026-11-06 (agreed VM
// calls, VM returns and held Interest Amounts between the two parties on one day); the rules are assumptions awaiting
// task-sme-settlement-netting-rules.
test("flow-settlement-netting: VM call, VM return and held interest due the same day -> the party owing the net settles them by one tUSD transfer, statement verified", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Movement = { id: string; type: string; payer: string; receiver: string; amountUsd: string };
  type Netting = { nettingId: string; settledBy: string; amountUsd: string; cdmHash: string; verified?: boolean; error?: string; movements?: Movement[] };
  type Fold = { status: string };
  const p = await parties();
  const tUSD = p.tokens["tUSD"];

  // Setup: cash collateral in escrow for the Interest Amount (the interest spec leaves some; a run of this spec alone
  // pledges it).
  if (Number(await pledgedOf(GATEWAY.B, tUSD, p)) === 0) {
    await pledgeThroughServices(100_000, 100_000, "tUSD");
    await waitForSettledOnChain("IM", 100_000);
  }
  const vmUsd = 200_000 + (Date.now() % 9000) * 10;
  const returnUsd = 50_000 + (Date.now() % 900) * 10;

  // 1. B calls VM from A; A agrees and proposes tUSD; B accepts. Not settled: it waits for the netting.
  const { callId: vm } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "VM", toParty: "A", amountUsd: vmUsd, deadlineDays: 1 });
  await seenByA(vm);
  await call(`${SERVICE.A}/calls/${vm}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${vm}/proposal`, "POST", { assets: [{ token: "tUSD", qty: vmUsd }] });
  await call(`${SERVICE.B}/calls/${vm}/decision`, "POST", { proposalId, accept: true });

  // 2. A calls a VM return from B; B agrees.
  const { callId: ret } = await call<{ callId: string }>(`${SERVICE.A}/calls`, "POST", { kind: "Return", toParty: "B", amountUsd: returnUsd, deadlineDays: 1 });
  await call(`${SERVICE.B}/calls/${ret}/response`, "POST", { response: "full" });

  // 3. B states the month's interest in its console and holds it for netting: stated on-chain, nothing paid.
  const known = new Set((await call<Interest[]>(`${SERVICE.B}/interest`)).map((i) => i.interestId));
  await page.goto("/#/live/B");
  const interestCard = page.getByTestId("interest");
  await interestCard.getByLabel("Period start").fill("2026-11-01");
  await interestCard.getByLabel("Period end").fill("2026-12-01");
  await interestCard.getByLabel("Observed rate (%)").fill("4.3");
  await interestCard.getByRole("checkbox", { name: /Hold for settlement netting/ }).check();
  await expect(interestCard.getByRole("button", { name: "State interest → A" })).toBeEnabled({ timeout: STEP_TIMEOUT });
  await interestCard.getByRole("button", { name: "State interest → A" }).click();
  let held: Interest | undefined;
  await expect
    .poll(async () => {
      held = (await call<Interest[]>(`${SERVICE.B}/interest`)).find((i) => !known.has(i.interestId));
      return held?.verified && held.state === "stated" ? true : (held?.error ?? held?.state ?? null);
    }, { timeout: 60_000 })
    .toBe(true);
  const interestUsd = Number(held!.amountUsd);
  expect(interestUsd).toBeGreaterThan(0);

  // 4. A's service lists the three movements and A owes the net.
  let cand: { movements: Movement[]; netUsd: string; payer: string | null } | undefined;
  await expect
    .poll(async () => {
      cand = await call(`${SERVICE.A}/netting/candidates`);
      return [vm, ret, held!.interestId].every((id) => cand!.movements.some((m) => m.id === id));
    }, { timeout: 60_000 })
    .toBe(true);
  const byId = (id: string) => cand!.movements.find((m) => m.id === id)!;
  expect(byId(vm)).toMatchObject({ type: "DeliveryAmount", payer: "A", receiver: "B", amountUsd: String(vmUsd) });
  expect(byId(ret)).toMatchObject({ type: "ReturnAmount", payer: "B", receiver: "A", amountUsd: String(returnUsd) });
  expect(byId(held!.interestId)).toMatchObject({ type: "InterestAmount", payer: "B", receiver: "A", amountUsd: String(interestUsd) });
  expect(cand!.payer).toBe("A");
  const net = Number(cand!.netUsd); // every movement that can net now, earlier runs' leftovers included
  const aFree = await balanceOf(GATEWAY.A, tUSD, p.a);
  const bFree = await balanceOf(GATEWAY.B, tUSD, p.b);
  const knownNettings = new Set((await call<Netting[]>(`${SERVICE.A}/nettings`)).map((n) => n.nettingId));

  // 5. A settles them in its console by one transfer of tUSD.
  await page.goto("/#/live/A");
  const card = page.getByTestId("settlement-netting");
  await expect(card.getByTestId("netting-net")).toHaveText(`Net: A pays USD ${net.toLocaleString("en-US")} in tUSD`, { timeout: STEP_TIMEOUT });
  await card.getByRole("button", { name: "Settle netted" }).click();

  // 6. Both services list the netting with the same verified CDM statement; the net moved once, A to B.
  let mine: Netting | undefined;
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        mine = (await call<Netting[]>(`${svc}/nettings`)).find((n) => !knownNettings.has(n.nettingId));
        return mine?.verified ? true : (mine?.error ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
  }
  const fromA = (await call<Netting[]>(`${SERVICE.A}/nettings`)).find((n) => n.nettingId === mine!.nettingId)!;
  expect(mine!.cdmHash).toBe(fromA.cdmHash);
  expect(mine!.settledBy).toBe("A");
  expect(mine!.amountUsd).toBe(String(net));
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aFree - BigInt(net));
  expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bFree + BigInt(net));

  // On-chain: both calls settled in the netting, the Interest Amount settled.
  for (const id of [vm, ret]) {
    const c = await call<{ state: number; nettedIn: string }>(`${GATEWAY.A}/calls/${id}`);
    expect(c.state).toBe(5);
    expect(c.nettedIn).toBe(mine!.nettingId);
  }
  expect((await call<Interest[]>(`${SERVICE.A}/interest`)).find((i) => i.interestId === held!.interestId)?.state).toBe("settled");

  // Both services fold each call's SettleCall step (naming the netting) to Settled.
  for (const id of [vm, ret]) {
    await expectConvergedCdmState(id);
    for (const svc of [SERVICE.A, SERVICE.B]) expect((await call<Fold>(`${svc}/calls/${id}/cdm-state`)).status).toMatch(/^settled$/i);
  }

  // Both consoles show the netting as verified and nothing left to net from it.
  for (const who of ["A", "B"] as const) {
    await page.goto(`/#/live/${who}`);
    await expect(page.getByTestId(`netting-${mine!.nettingId}`).getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  }
  expect(errors).toEqual([]);
});

// Margin call cancellation (task-csa-call-cancellation). The rules are the project owner's assumptions of 2026-11-06,
// to be confirmed in task-sme-call-cancellation-rules.
test("flow-call-cancellation: secured party withdraws an unanswered call; requests cancellation of an agreed call -> pledgor accepts, proposal void, nothing moved", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Fold = { status: string; converged: boolean };
  const folded = async (callId: string) => {
    await expectConvergedCdmState(callId);
    for (const svc of [SERVICE.A, SERVICE.B]) expect((await call<Fold>(`${svc}/calls/${callId}/cdm-state`)).status).toMatch(/^cancelled$/i);
  };

  // 1-4. Withdrawal: B issues an IM call and withdraws it in its console before A answers.
  const amountUsd = 300_000 + (Date.now() % 9000) * 10;
  const { callId: w } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await page.goto("/#/live/B");
  const rowW = page.locator(".subcard", { hasText: shortId(w) });
  await expect(rowW.getByRole("button", { name: "Withdraw call" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowW.getByLabel("Cancellation reason").fill("booked in error");
  await rowW.getByRole("button", { name: "Withdraw call" }).click();
  await expect(rowW.getByText("cancelled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  expect((await call<{ state: number }>(`${GATEWAY.A}/calls/${w}`)).state).toBe(7);
  await folded(w);

  // 5-10. Request and acceptance: an agreed IM call with an accepted proposal, set up through the services.
  const amount2 = amountUsd + 5;
  const qty = Math.ceil(amount2 / TUST_VALUE);
  const { callId: c } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd: amount2, deadlineDays: 1 });
  await seenByA(c);
  await call(`${SERVICE.A}/calls/${c}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${c}/proposal`, "POST", { assets: [{ token: "tUST", qty }] });
  await call(`${SERVICE.B}/calls/${c}/decision`, "POST", { proposalId, accept: true });
  const tUST = p.tokens["tUST"];
  const freeBefore = await balanceOf(GATEWAY.A, tUST, p.a);
  const pledgedBefore = await pledgedOf(GATEWAY.A, tUST, p);

  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: shortId(c) });
  await expect(rowB.getByRole("button", { name: "Request cancellation" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByLabel("Cancellation reason").fill("superseded by a corrected call");
  await rowB.getByRole("button", { name: "Request cancellation" }).click();
  await expect(rowB.getByText("cancellation requested by B")).toBeVisible({ timeout: STEP_TIMEOUT });

  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: shortId(c) });
  await expect(rowA.getByRole("button", { name: "Accept cancellation" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowA.getByRole("button", { name: "Pledge accepted collateral" })).toHaveCount(0);
  await rowA.getByRole("button", { name: "Accept cancellation" }).click();
  await expect(rowA.getByText("cancelled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // On-chain: the call is cancelled, its proposal void, and no collateral moved.
  const onChain = await call<{ state: number; cancellationRequestedBy: string }>(`${GATEWAY.B}/calls/${c}`);
  expect(onChain.state).toBe(7);
  expect(onChain.cancellationRequestedBy).toBe("0x0000000000000000000000000000000000000000");
  expect(await call<number>(`${GATEWAY.B}/calls/${c}/proposals/${proposalId}/state`)).toBe(4);
  expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(freeBefore);
  expect(await pledgedOf(GATEWAY.A, tUST, p)).toBe(pledgedBefore);
  await folded(c);
  expect(errors).toEqual([]);
});

// Replacement of a cancelled call (task-csa-call-replacement): the corrected call names the call it replaces, on-chain
// and in its CDM IssueCall step. The details are assumptions awaiting task-sme-call-cancellation-rules (question 5).
test("flow-call-replacement: secured party withdraws a call -> issues a corrected call that replaces it, linked on-chain and in CDM", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Fold = { status: string; converged: boolean };
  type Row = { callId: string; state: string; replaces: string | null; replacedBy: string | null };

  // 1-2. Setup through the services: B issues an IM call to A and withdraws it.
  const amountUsd = 400_000 + (Date.now() % 9000) * 10;
  const { callId: old } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await call(`${SERVICE.B}/calls/${old}/withdraw`, "POST", { reason: "amount booked in error" });

  // 3-4. B issues the corrected call from the cancelled call's row in its console.
  const corrected = amountUsd - 50_000;
  await page.goto("/#/live/B");
  const rowOld = page.locator(".subcard", { hasText: shortId(old) });
  await expect(rowOld.getByRole("button", { name: "Issue replacement call" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowOld.getByLabel("Replacement amount (USD)").fill(String(corrected));
  await rowOld.getByRole("button", { name: "Issue replacement call" }).click();
  await expect(rowOld.getByText(/replaced by/)).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowOld.getByRole("button", { name: "Issue replacement call" })).toHaveCount(0);

  // 5. On-chain: the link both ways, the new call issued for the corrected amount to the same party.
  const linked = await call<{ replacementOf: string }>(`${GATEWAY.A}/calls/${old}`);
  const repl = linked.replacementOf;
  expect(repl).not.toBe("0x" + "0".repeat(64));
  const onChain = await call<{ state: number; replaces: string; kind: number; amount: string }>(`${GATEWAY.A}/calls/${repl}`);
  expect(onChain.state).toBe(1);
  expect(onChain.replaces).toBe(old);
  expect(onChain.kind).toBe(0);

  // 6. Both consoles' services show the link, and A sees the corrected call to answer.
  for (const svc of [SERVICE.A, SERVICE.B]) {
    const link = async () => {
      const rows = (await call<{ calls: Row[] }>(`${svc}/state`)).calls;
      return [rows.find((r) => r.callId === repl)?.replaces, rows.find((r) => r.callId === old)?.replacedBy];
    };
    await expect.poll(link, { timeout: 60_000 }).toEqual([old, repl]);
  }
  await page.goto("/#/live/A");
  const rowNew = page.locator(".subcard", { hasText: shortId(repl) });
  await expect(rowNew.getByText(/replaces/)).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowNew.getByRole("button", { name: "Agree in full" })).toBeVisible({ timeout: STEP_TIMEOUT });

  // 7. Both services fold the replacement's CDM IssueCall step, which names the cancelled call (ReplacementAllowed held).
  await expectConvergedCdmState(repl);
  for (const svc of [SERVICE.A, SERVICE.B]) expect((await call<Fold>(`${svc}/calls/${repl}/cdm-state`)).status).toMatch(/^issued$/i);

  // 8. A second replacement of the same call is refused.
  await expect(call(`${SERVICE.B}/calls`, "POST", { replacesCallId: old, amountUsd: corrected, deadlineDays: 1 })).rejects.toThrow(/replacement/);

  // Cleanup: withdraw the replacement so later specs see no open call from this one.
  await call(`${SERVICE.B}/calls/${repl}/withdraw`, "POST", { reason: "spec cleanup" });
  expect(errors).toEqual([]);
});

interface Agreement {
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

// Last: the amendment changes the pair's terms, and the spec restores them (MTA 500,000, tMMF 4%) so a rerun of the
// other specs sees the baseline terms.
test("flow-agreement-amendment: secured party proposes new MTA and tMMF haircut -> pledgor consents -> terms applied on-chain and in both services", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: refuse an amendment a failed earlier run left pending.
  const start = await call<Agreement>(`${SERVICE.B}/agreement`);
  const left = start.amendments.find((m) => m.state === "proposed");
  if (left) await call(`${left.proposer === "B" ? SERVICE.A : SERVICE.B}/amendments/${left.amendmentId}/decision`, "POST", { consent: false });
  const known = new Set(start.amendments.map((m) => m.amendmentId));
  const mta = start.mtaUsd === "400000" ? 450_000 : 400_000;
  const bps = start.haircuts.find((h) => h.token === "tMMF")!.haircutBps === 1000 ? 1200 : 1000;

  // 1-4. Secured party (BANK-B) proposes a new MTA and a tMMF haircut in its console.
  await page.goto("/#/live/B");
  const card = page.getByTestId("agreement");
  await expect(card.getByText("terms verified against the chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await card.getByLabel("New MTA (USD)").fill(String(mta));
  await card.getByLabel("Amended token").selectOption("tMMF");
  await card.getByLabel("Haircut (bps)").fill(String(bps));
  await expect(card.getByRole("button", { name: "Propose amendment → A" })).toBeEnabled({ timeout: STEP_TIMEOUT });
  await card.getByRole("button", { name: "Propose amendment → A" }).click();

  let id = "";
  await expect
    .poll(async () => {
      const m = (await call<Agreement>(`${SERVICE.A}/agreement`)).amendments.find((x) => !known.has(x.amendmentId));
      id = m?.amendmentId ?? "";
      return m?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("proposed");

  // 5-7. Pledgor (BANK-A) checks the CDM amendment and consents in its console.
  await page.goto("/#/live/A");
  const row = page.getByTestId(`amendment-${id}`);
  await expect(row.getByRole("button", { name: "Consent" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await row.getByRole("button", { name: "Consent" }).click();
  await expect(row.getByText("agreed on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // 8. Both services fold the amendment to the same terms, matching the chain.
  const folded: Agreement[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const a = await call<Agreement>(`${svc}/agreement`);
        return a.verified && a.mtaUsd === String(mta) ? true : (a.problem ?? a.mtaUsd);
      }, { timeout: 60_000 })
      .toBe(true);
    folded.push(await call<Agreement>(`${svc}/agreement`));
  }
  expect(folded[0].agreementHash).toBe(folded[1].agreementHash);
  expect(folded[0].agreementHash).not.toBe(start.agreementHash);
  for (const a of folded) expect(a.haircuts.find((h) => h.token === "tMMF")).toMatchObject({ haircutBps: bps, onChainHaircutBps: bps, matches: true });
  const onChain = await call<{ agreementHash: string; pendingAmendment: string; eligibility: { token: string; eligible: boolean; haircutBps: number }[] }>(
    `${GATEWAY.A}/pair-terms?pledgor=${p.a}&securedParty=${p.b}`);
  expect(onChain.agreementHash).toBe(folded[0].agreementHash);
  expect(onChain.pendingAmendment).toBe(ZERO_HASH);
  expect(onChain.eligibility.find((e) => e.token.toLowerCase() === p.tokens["tMMF"].toLowerCase())).toMatchObject({ eligible: true, haircutBps: bps });
  const reval = await call<{ mtaUsd: string }>(`${SERVICE.B}/revaluation`);
  expect(reval.mtaUsd).toBe(String(mta));

  // Restore the baseline terms through the services: A proposes, B consents (either party may propose).
  const { amendmentId } = await call<{ amendmentId: string }>(`${SERVICE.A}/amendments`, "POST", {
    mtaUsd: 500_000, haircuts: [{ token: "tMMF", eligible: true, haircutBps: 400 }] });
  await expect
    .poll(async () => (await call<Agreement>(`${SERVICE.B}/agreement`)).amendments.find((m) => m.amendmentId === amendmentId)?.state ?? null, { timeout: 60_000 })
    .toBe("proposed");
  await call(`${SERVICE.B}/amendments/${amendmentId}/decision`, "POST", { consent: true });
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const a = await call<Agreement>(`${svc}/agreement`);
        return a.verified && a.mtaUsd === "500000" && a.haircuts.find((h) => h.token === "tMMF")!.onChainHaircutBps === 400;
      }, { timeout: 60_000 })
      .toBe(true);
  }
  expect(errors).toEqual([]);
});

test("flow-allocation: pledgor asks for a suggested basket on an agreed IM call -> proposes it -> secured party accepts -> pledged as suggested", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  // wp-adr-allocation-scope: eligible tokens in ranking order (registry order by default), the last one rounded up to
  // whole units; nothing is recorded until the pledgor proposes.
  type Allocation = {
    covers: boolean; assets: { token: string; qty: number }[]; valueUsd: string; agreedUsd: string; ranking: string[];
    inventory: { token: string; rank: number; held: string; eligible: boolean; haircutBps: number; price: string }[];
  };
  // Small enough that part of the pledgor's tUST covers it: the chain is persistent and the other flows need the
  // pledgor's tUSD and tUST, so this flow must not drain them (multi-asset fills are covered by AllocationTest).
  const amountUsd = 1_000_000 + (Date.now() % 9000) * 100;
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1-2. Secured party issues the IM call; the pledgor agrees in full.
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue IM call/ }).click();
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Agree in full" }).click();

  // 3. The pledgor asks for a suggestion; the console fills the basket.
  await expect(rowA.getByRole("button", { name: "Suggest allocation" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Suggest allocation" }).click();
  await expect(rowA.getByText(/suggested: USD [\d,.]+ after haircuts/)).toBeVisible({ timeout: STEP_TIMEOUT });

  // The same suggestion through the service API: it covers the agreed amount, in ranking order, every asset but the
  // last at its full holding, and overshoots by less than one unit of the last asset after its haircut.
  const st = await call<{ calls: { callId: string; amountUsd: string }[] }>(`${SERVICE.A}/state`);
  const callId = st.calls.find((c) => c.amountUsd === String(amountUsd))!.callId;
  const alloc = await call<Allocation>(`${SERVICE.A}/calls/${callId}/allocation`, "POST", {});
  expect(alloc.covers).toBe(true);
  expect(alloc.ranking).toEqual(Object.keys(p.tokens));
  await expect(rowA.getByText(`basket: ${alloc.assets.map((a) => `${a.token} ${a.qty.toLocaleString("en-US")}`).join(" + ")}`)).toBeVisible();
  const inv = Object.fromEntries(alloc.inventory.map((i) => [i.token, i]));
  const ranks = alloc.assets.map((a) => inv[a.token].rank);
  expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
  alloc.assets.forEach((a, i) => {
    expect(inv[a.token].eligible).toBe(true);
    if (i < alloc.assets.length - 1) expect(String(a.qty)).toBe(inv[a.token].held);
    else expect(a.qty).toBeLessThanOrEqual(Number(inv[a.token].held));
  });
  const last = inv[alloc.assets[alloc.assets.length - 1].token];
  const lastUnitValue = (Number(last.price) / 1e8) * (1 - last.haircutBps / 10_000);
  expect(alloc.assets).toEqual([{ token: "tUST", qty: Math.ceil(amountUsd / lastUnitValue) }]);
  expect(Number(alloc.valueUsd)).toBeGreaterThanOrEqual(amountUsd);
  expect(Number(alloc.valueUsd) - amountUsd).toBeLessThan(lastUnitValue);
  // A ranking from the body goes first; the calling party is not offered an allocation.
  const reranked = await call<Allocation>(`${SERVICE.A}/calls/${callId}/allocation`, "POST", { ranking: ["tMMF"] });
  expect(reranked.ranking[0]).toBe("tMMF");
  if (inv.tMMF.eligible && Number(inv.tMMF.held) > 0) expect(reranked.assets[0].token).toBe("tMMF");
  await expect(call(`${SERVICE.B}/calls/${callId}/allocation`, "POST", {})).rejects.toThrow(/only the called party/);

  // 4-6. The pledgor proposes the suggested basket; the secured party accepts; the pledgor pledges it.
  const before = Object.fromEntries(await Promise.all(alloc.assets.map(async (a) => [a.token, await pledgedOf(GATEWAY.A, p.tokens[a.token], p)] as const)));
  await rowA.getByRole("button", { name: `Propose collateral (${alloc.assets.length})` }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA2.getByRole("button", { name: "Pledge accepted collateral" }).click();
  await waitForSettledOnChain("IM", amountUsd);
  for (const a of alloc.assets) {
    expect(await pledgedOf(GATEWAY.A, p.tokens[a.token], p) - before[a.token]).toBe(BigInt(a.qty));
  }
  await expectConvergedCdmState(callId);
  expect(errors).toEqual([]);
});


test("flow-reconciliation: pledgor reconciles trade portfolios with the secured party -> hashes agree on-chain -> disputes a call citing the breaks; both parties' records match the ledger", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Run = {
    reconciliationId: string; firstSnapshotId: string; secondSnapshotId: string; resultHash: string;
    firstParty: string; secondParty: string; reconciled: boolean; matchedTrades: number;
    breaks: { uti: string; type: string; differenceUsd: string | null }[];
    firstExposureUsd: string; secondExposureUsd: string; exposureDifferenceUsd: string;
    onChain: { state: string; firstPartyResult: string; secondPartyResult: string };
  };
  const p = await parties();
  const before = (await call<Run[]>(`${SERVICE.A}/reconciliation/portfolio`))[0]?.reconciliationId;

  // 1. The pledgor (BANK-A) reconciles its trades with BANK-B's from its console: the snapshots go service to service,
  //    each party commits its snapshot hash and its result hash on-chain.
  await page.goto("/#/live/A");
  const card = page.getByTestId("reconciliation");
  await card.getByRole("button", { name: "Reconcile portfolios → B" }).click();
  let a: Run | undefined;
  await expect
    .poll(async () => {
      a = (await call<Run[]>(`${SERVICE.A}/reconciliation/portfolio`))[0];
      return a?.reconciliationId;
    }, { timeout: 60_000 })
    .not.toBe(before);
  const shown = card.getByTestId(`reconciliation-${a!.reconciliationId}`);
  await expect(shown.getByTestId("reconciliation-status")).toHaveText("2 breaks", { timeout: STEP_TIMEOUT });
  await expect(shown.getByTestId("reconciliation-onchain")).toHaveText("both results agree on-chain ✓");
  await expect(shown.getByTestId("break-DRTY123456")).toContainText("valuations differ");
  await expect(shown.getByTestId("break-DRTY123456")).toContainText("USD 40,000");
  await expect(shown.getByTestId("break-56323")).toContainText("missing at the second party");
  await expect(shown.getByTestId("exposure-difference")).toHaveText("USD 115,000");

  // 2. Both services hold the same CDM result for the run; the chain holds both snapshots and the matching result hashes.
  a = (await call<Run[]>(`${SERVICE.A}/reconciliation/portfolio`))[0];
  const b = (await call<Run[]>(`${SERVICE.B}/reconciliation/portfolio`))[0];
  expect(b.reconciliationId).toBe(a.reconciliationId);
  expect(b.resultHash).toBe(a.resultHash);
  expect([a.firstParty, a.secondParty, a.matchedTrades, a.reconciled]).toEqual(["BANK-A", "BANK-B", 1, false]);
  expect(a.breaks.map((x) => `${x.uti}:${x.type}:${x.differenceUsd}`)).toEqual(["56323:MissingFromSecond:null", "DRTY123456:ValuationDiffers:40000"]);
  expect([a.firstExposureUsd, a.secondExposureUsd, a.exposureDifferenceUsd]).toEqual(["1625000", "-1510000", "115000"]);
  const run = await call<{ state: string; firstPartyResult: string; secondPartyResult: string; breakCount: number }>(`${GATEWAY.B}/reconciliation/runs/${a.reconciliationId}`);
  expect(run).toMatchObject({ state: "agreed", firstPartyResult: a.resultHash, secondPartyResult: a.resultHash, breakCount: 2 });
  const first = await call<{ party: string; counterparty: string; snapshotHash: string }>(`${GATEWAY.A}/reconciliation/snapshots/${a.firstSnapshotId}`);
  const second = await call<{ party: string; counterparty: string; snapshotHash: string }>(`${GATEWAY.A}/reconciliation/snapshots/${a.secondSnapshotId}`);
  expect([first.party.toLowerCase(), first.counterparty.toLowerCase()]).toEqual([p.a.toLowerCase(), p.b.toLowerCase()]);
  expect([second.party.toLowerCase(), second.counterparty.toLowerCase()]).toEqual([p.b.toLowerCase(), p.a.toLowerCase()]);
  expect(first.snapshotHash).not.toBe(ZERO_HASH);
  await page.goto("/#/live/B");
  await expect(page.getByTestId(`reconciliation-${a.reconciliationId}`)).toBeVisible({ timeout: STEP_TIMEOUT });

  // 3. BANK-B issues an IM call; BANK-A disputes it from its console citing the reconciliation, and records a CDM Dispute
  //    whose reason names the run and its breaks. Nothing is delivered.
  const amountUsd = 600_000 + (Date.now() % 9000) * 10;
  const { callId } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await page.goto("/#/live/A");
  const row = page.locator(".subcard", { hasText: shortId(callId) });
  await row.getByRole("button", { name: "Dispute citing reconciliation" }).click({ timeout: STEP_TIMEOUT });
  await expect(row.getByText("disputed", { exact: true })).toBeVisible({ timeout: STEP_TIMEOUT });
  // The console shows "disputed" once the response is mined; the service records the Dispute right after.
  type Row = { callId: string; state: string; disputedUsd: string; messages: { msgType: string; cdmJson: string }[] };
  let disputed: Row | undefined;
  await expect
    .poll(async () => {
      disputed = (await call<{ calls: Row[] }>(`${SERVICE.A}/state`)).calls.find((c) => c.callId === callId);
      return disputed?.messages.map((m) => m.msgType) ?? [];
    }, { timeout: STEP_TIMEOUT })
    .toContain("Dispute");
  expect([disputed!.state, disputed!.disputedUsd]).toEqual(["disputed", String(amountUsd)]);
  const dispute = JSON.parse(disputed!.messages.find((m) => m.msgType === "Dispute")!.cdmJson);
  expect(dispute.reason).toBe(`Portfolio reconciliation ${a.reconciliationId}: 2 breaks; 56323 MissingFromSecond; DRTY123456 ValuationDiffers; exposure difference USD 115000`);

  // 4. Each party's stored CDM records of the pair's calls match the contract (status, called and agreed amounts), and
  //    the escrow its settled records build matches the control contract's, token by token.
  type Escrow = { record: string; recorded: Record<string, number>; ledger: Record<string, number> };
  const escrows: Escrow[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    let last: { breaks: unknown[]; escrow: Escrow } | undefined;
    await expect
      .poll(async () => {
        const r = await call<{ reconciled: boolean; calls: number; checkedFacts: number; breaks: unknown[]; escrow: Escrow }>(`${svc}/reconciliation/ledger`, "POST", {});
        last = r;
        return r.reconciled && r.calls > 0 && r.checkedFacts >= 2 * r.calls;
      }, { timeout: 60_000, message: `ledger reconciliation at ${svc}` })
      .toBe(true);
    expect(last!.breaks).toEqual([]);
    expect(last!.escrow.recorded).toEqual(last!.escrow.ledger);
    escrows.push(last!.escrow);
  }
  expect(escrows[0]).toEqual(escrows[1]); // both parties' records give the same escrow
  expect(escrows[0].record).toBe("escrow BANK-A to BANK-B");
  await page.getByTestId("reconciliation").getByRole("button", { name: "Reconcile with ledger" }).click();
  await expect(page.getByTestId("ledger-reconciliation")).toContainText("records match the ledger ✓", { timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

// --- two-way initial margin (task-two-way-initial-margin, wp-adr-two-way-im) ---
// Each party pledges initial margin to the other on the same day, in different amounts; the legs are not netted. A
// defaults: B enforces against A's leg and takes its own leg back from the control contract (the pledgor's reclaim on
// the secured party's default). B posts tUSD cash, the asset it holds from the test-balance top-up.
test("flow-two-way-im-default: A and B each post IM to the other -> A defaults -> B enforces A's leg and reclaims its own", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const symbols = Object.keys(p.tokens);
  const legOf = async (token: string, pledgor: string, securedParty: string) =>
    BigInt(await call<string>(`${GATEWAY.B}/pledged?token=${token}&pledgor=${pledgor}&securedParty=${securedParty}`));
  // Small and unique per run: enforcement and reclaim empty both legs for good on the persistent chain.
  const aLegUsd = 100_000 + (Date.now() % 9000) * 10;
  const bLegUsd = 60_000 + (Date.now() % 9000) * 10; // a different amount on the other leg
  const aQty = Math.ceil(aLegUsd / TUST_VALUE) + 100;
  const bQty = bLegUsd + 1_000; // tUSD at 1.00, no haircut
  const bLabel = `USD ${bLegUsd.toLocaleString("en-US")}`;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // A's leg: B calls, A pledges tUST (through the services; the UI path is the flow-im-margin-call-pledge spec).
  const aCallId = await pledgeThroughServices(aLegUsd, aQty);
  await waitForSettledOnChain("IM", aLegUsd);

  // B's leg, through the consoles: A selects the leg B pledges on, where A is the secured party, and calls B.
  await page.goto("/#/live/A");
  await page.getByRole("button", { name: /B pledges to A/ }).click();
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await expect(issueCard).toBeVisible({ timeout: STEP_TIMEOUT }); // shown to the secured party of the selected leg
  await issueCard.getByRole("spinbutton").fill(String(bLegUsd));
  await issueCard.getByRole("button", { name: "Issue IM call → B" }).click();

  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: bLabel }).filter({ hasText: "A → B" });
  await expect(rowB.getByRole("button", { name: "Agree in full" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Agree in full" }).click();
  await expect(rowB.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("combobox").selectOption("tUSD");
  await rowB.getByRole("spinbutton").fill(String(bQty));
  await rowB.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowB.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });

  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: bLabel }).filter({ hasText: "A → B" });
  await expect(rowA.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Accept proposal" }).click();

  await page.goto("/#/live/B");
  await expect(rowB.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Pledge accepted collateral" }).click();
  await waitForSettledOnChain("IM", bLegUsd);

  // Both legs are in escrow, apart: each service shows the other leg too.
  expect(await legOf(p.tokens["tUST"], p.a, p.b) >= BigInt(aQty)).toBe(true);
  expect(await legOf(p.tokens["tUSD"], p.b, p.a) >= BigInt(bQty)).toBe(true);
  const st = await call<{ balances: { token: string; pledgedByLeg: Record<string, string> }[] }>(`${SERVICE.A}/state`);
  expect(BigInt(st.balances.find((b) => b.token === "tUSD")!.pledgedByLeg.B) >= BigInt(bQty)).toBe(true);
  // The CDM call headers name the leg's pledgor: B on the call A issued.
  const issued = await call<{ calls: { callId: string; amountUsd: string; leg: string; from: string }[] }>(`${SERVICE.B}/state`);
  expect(issued.calls.find((c) => c.amountUsd === String(bLegUsd) && c.from === "A")?.leg).toBe("B");

  const freeBefore: Record<string, bigint> = {};
  const legsBefore: Record<string, bigint> = {};
  for (const sym of symbols) {
    freeBefore[sym] = await balanceOf(GATEWAY.B, p.tokens[sym], p.b);
    legsBefore[sym] = (await legOf(p.tokens[sym], p.a, p.b)) + (await legOf(p.tokens[sym], p.b, p.a));
  }

  // A defaults. B, the secured party on A's leg, declares the default and enforces against A's leg.
  await page.goto("/#/live/B");
  const enforceRow = page.locator(".subcard", { hasText: shortId(aCallId) });
  await expect(enforceRow.getByRole("button", { name: "Declare default & enforce" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await enforceRow.getByRole("button", { name: "Declare default & enforce" }).click();
  await expect(enforceRow.getByText("enforced ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // B, the pledgor on its own leg, takes its IM back: the feed records its secured party (A) in default.
  await page.getByRole("button", { name: /B pledges to A/ }).click();
  const reclaimCard = page.getByTestId("reclaim");
  await expect(reclaimCard).toBeVisible({ timeout: STEP_TIMEOUT });
  await reclaimCard.getByRole("button", { name: "Reclaim my IM from A" }).click();
  await expect(reclaimCard).toBeHidden({ timeout: STEP_TIMEOUT });

  // On-chain: both legs are empty, and B holds what was in either leg (A's leg seized, B's own returned).
  for (const sym of symbols) {
    expect(await legOf(p.tokens[sym], p.a, p.b)).toBe(0n);
    expect(await legOf(p.tokens[sym], p.b, p.a)).toBe(0n);
    expect(await balanceOf(GATEWAY.B, p.tokens[sym], p.b)).toBe(freeBefore[sym] + legsBefore[sym]);
  }

  // Each party's records match the chain on both legs: two escrow records, nothing left in either.
  type Escrow = { record: string; pledgor: string; recorded: Record<string, number>; ledger: Record<string, number> };
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => {
        const r = await call<{ reconciled: boolean; breaks: unknown[]; escrows: Escrow[] }>(`${svc}/reconciliation/ledger`, "POST", {});
        return r.escrows.map((e) => [e.pledgor, Object.keys(e.recorded).length, Object.keys(e.ledger).length]).sort();
      }, { timeout: 60_000 })
      .toEqual([["A", 0, 0], ["B", 0, 0]]);
  }

  expect(errors).toEqual([]);
});

type GmraTerms = {
  elections: { mtaUsd: { A: string; B: string }; defaultMarginRatio: string };
  termsHash: string;
  onChainTermsHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; state: string; changed?: string[] }[];
};

test("flow-repo-gmra-terms: both parties hold the same GMRA terms -> A proposes a new MTA for B -> B consents -> terms hash moves on-chain, both services fold it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();

  // Setup: refuse a GMRA amendment a failed earlier run left pending; both parties start on the same terms.
  const start = await call<GmraTerms>(`${SERVICE.B}/gmra/terms`);
  const left = start.amendments.find((m) => m.state === "proposed");
  if (left) await call(`${left.proposer === "A" ? SERVICE.B : SERVICE.A}/gmra/amendments/${left.amendmentId}/decision`, "POST", { consent: false });
  const before = [await call<GmraTerms>(`${SERVICE.A}/gmra/terms`), await call<GmraTerms>(`${SERVICE.B}/gmra/terms`)];
  for (const t of before) expect(t.verified, t.problem ?? "").toBe(true);
  expect(before[0].termsHash).toBe(before[1].termsHash);
  expect(before[0].elections).toEqual(before[1].elections);
  const baselineMta = before[0].elections.mtaUsd.B;
  const known = new Set(before[0].amendments.map((m) => m.amendmentId));
  const mta = baselineMta === "400000" ? 450_000 : 400_000;

  // A proposes a new minimum transfer amount for B in its console.
  await page.goto("/#/live/A");
  const card = page.getByTestId("gmra-terms");
  await expect(card.getByText("GMRA terms verified against the chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await card.getByLabel("GMRA MTA party").selectOption("B");
  await card.getByLabel("New GMRA MTA (USD)").fill(String(mta));
  await card.getByRole("button", { name: "Propose GMRA amendment → B" }).click();

  let id = "";
  await expect
    .poll(async () => {
      const m = (await call<GmraTerms>(`${SERVICE.B}/gmra/terms`)).amendments.find((x) => !known.has(x.amendmentId));
      id = m?.amendmentId ?? "";
      return m?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("proposed");

  // B checks the CDM GmraTermsAmendment and consents in its console.
  await page.goto("/#/live/B");
  const row = page.getByTestId(`gmra-amendment-${id}`);
  await expect(row.getByText("MinimumTransferAmount")).toBeVisible({ timeout: STEP_TIMEOUT });
  await row.getByRole("button", { name: "Consent to GMRA amendment" }).click();
  await expect(row.getByText("agreed on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // Both services fold the amendment to the same terms, matching the on-chain terms hash.
  const folded: GmraTerms[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const t = await call<GmraTerms>(`${svc}/gmra/terms`);
        return t.verified && t.elections.mtaUsd.B === String(mta) ? true : (t.problem ?? t.elections.mtaUsd.B);
      }, { timeout: 60_000 })
      .toBe(true);
    folded.push(await call<GmraTerms>(`${svc}/gmra/terms`));
  }
  expect(folded[0].termsHash).toBe(folded[1].termsHash);
  expect(folded[0].termsHash).not.toBe(before[0].termsHash);
  const onChain = await call<{ termsHash: string; pendingAmendment: string }>(`${GATEWAY.A}/master-terms?kind=GMRA&a=${p.a}&b=${p.b}`);
  expect(onChain).toEqual({ termsHash: folded[0].termsHash, pendingAmendment: ZERO_HASH });
  // The CSA chain between the parties did not move.
  const csa = await call<{ agreementHash: string }>(`${GATEWAY.A}/pair-terms?pledgor=${p.a}&securedParty=${p.b}`);
  expect(csa.agreementHash).toBe((await call<{ agreementHash: string }>(`${SERVICE.A}/agreement`)).agreementHash);

  // Restore the baseline MTA through the services: B proposes, A consents.
  const { amendmentId } = await call<{ amendmentId: string }>(`${SERVICE.B}/gmra/amendments`, "POST", { party: "B", mtaUsd: Number(baselineMta) });
  await expect
    .poll(async () => (await call<GmraTerms>(`${SERVICE.A}/gmra/terms`)).amendments.find((m) => m.amendmentId === amendmentId)?.state ?? null, { timeout: 60_000 })
    .toBe("proposed");
  await call(`${SERVICE.A}/gmra/amendments/${amendmentId}/decision`, "POST", { consent: true });
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const t = await call<GmraTerms>(`${svc}/gmra/terms`);
        return t.verified && t.elections.mtaUsd.B === baselineMta;
      }, { timeout: 60_000 })
      .toBe(true);
  }
});

type GmslaTerms = {
  elections: { notificationTime: string; mtaUsd: { A: string; B: string }; defaultMargin: string; aggregation: string };
  termsHash: string;
  onChainTermsHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; state: string; changed?: string[] }[];
};

test("flow-gmsla-terms: both parties hold the same GMSLA terms -> A proposes a new notification time -> B consents -> terms hash moves on-chain under kind GMSLA, both services fold it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();

  // Setup: refuse a GMSLA amendment a failed earlier run left pending; both parties start on the same terms.
  const start = await call<GmslaTerms>(`${SERVICE.B}/gmsla/terms`);
  const left = start.amendments.find((m) => m.state === "proposed");
  if (left) await call(`${left.proposer === "A" ? SERVICE.B : SERVICE.A}/gmsla/amendments/${left.amendmentId}/decision`, "POST", { consent: false });
  const before = [await call<GmslaTerms>(`${SERVICE.A}/gmsla/terms`), await call<GmslaTerms>(`${SERVICE.B}/gmsla/terms`)];
  for (const t of before) expect(t.verified, t.problem ?? "").toBe(true);
  expect(before[0].termsHash).toBe(before[1].termsHash);
  expect(before[0].elections).toEqual(before[1].elections);
  expect(before[0].elections.aggregation).toBe("Aggregated");
  const baselineTime = before[0].elections.notificationTime.slice(0, 5);
  const known = new Set(before[0].amendments.map((m) => m.amendmentId));
  const time = baselineTime === "11:00" ? "11:30" : "11:00";
  const gmraBefore = await call<{ termsHash: string }>(`${GATEWAY.A}/master-terms?kind=GMRA&a=${p.a}&b=${p.b}`);

  // A proposes a new notification time in its console.
  await page.goto("/#/live/A");
  const card = page.getByTestId("gmsla-terms");
  await expect(card.getByText("GMSLA terms verified against the chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await card.getByLabel("New GMSLA notification time").fill(time);
  await card.getByRole("button", { name: "Propose GMSLA amendment → B" }).click();

  let id = "";
  await expect
    .poll(async () => {
      const m = (await call<GmslaTerms>(`${SERVICE.B}/gmsla/terms`)).amendments.find((x) => !known.has(x.amendmentId));
      id = m?.amendmentId ?? "";
      return m?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("proposed");

  // B checks the cdm-ext GmslaTermsAmendment and consents in its console.
  await page.goto("/#/live/B");
  const row = page.getByTestId(`gmsla-amendment-${id}`);
  await expect(row.getByText("NotificationTime")).toBeVisible({ timeout: STEP_TIMEOUT });
  await row.getByRole("button", { name: "Consent to GMSLA amendment" }).click();
  await expect(row.getByText("agreed on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // Both services fold the amendment to the same terms, matching the on-chain terms hash under kind GMSLA.
  const folded: GmslaTerms[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const t = await call<GmslaTerms>(`${svc}/gmsla/terms`);
        return t.verified && t.elections.notificationTime.startsWith(time) ? true : (t.problem ?? t.elections.notificationTime);
      }, { timeout: 60_000 })
      .toBe(true);
    folded.push(await call<GmslaTerms>(`${svc}/gmsla/terms`));
  }
  expect(folded[0].termsHash).toBe(folded[1].termsHash);
  expect(folded[0].termsHash).not.toBe(before[0].termsHash);
  const onChain = await call<{ termsHash: string; pendingAmendment: string }>(`${GATEWAY.A}/master-terms?kind=GMSLA&a=${p.a}&b=${p.b}`);
  expect(onChain).toEqual({ termsHash: folded[0].termsHash, pendingAmendment: ZERO_HASH });
  // The GMRA chain between the parties did not move.
  expect((await call<{ termsHash: string }>(`${GATEWAY.A}/master-terms?kind=GMRA&a=${p.a}&b=${p.b}`)).termsHash).toBe(gmraBefore.termsHash);

  // Restore the baseline notification time through the services: B proposes, A consents.
  const { amendmentId } = await call<{ amendmentId: string }>(`${SERVICE.B}/gmsla/amendments`, "POST", { notificationTime: baselineTime });
  await expect
    .poll(async () => (await call<GmslaTerms>(`${SERVICE.A}/gmsla/terms`)).amendments.find((m) => m.amendmentId === amendmentId)?.state ?? null, { timeout: 60_000 })
    .toBe("proposed");
  await call(`${SERVICE.A}/gmsla/amendments/${amendmentId}/decision`, "POST", { consent: true });
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const t = await call<GmslaTerms>(`${svc}/gmsla/terms`);
        return t.verified && t.elections.notificationTime.startsWith(baselineTime);
      }, { timeout: 60_000 })
      .toBe(true);
  }
});

type Repo = {
  repoId: string; role: "seller" | "buyer"; state: string; security: string; quantity: string; purchasePrice: string;
  repurchasePrice: string; tradeHash: string; verified: boolean; problem: string | null; instructedByMe: boolean;
  purchaseDate?: string; repurchaseDate?: string; tradeStateHash?: string;
};
type RepoTrade = { tradeHash: string; tradeStateHash: string; closedTradeStateHash?: string; closedState?: string };

test("flow-repo-purchase-repurchase: A books a repo selling tUST to B -> B affirms -> purchase settles DvP -> business date to the Repurchase Date -> repurchase settles DvP", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  // Setup: both business dates on today (a failed earlier run may have moved them).
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const known = new Set((await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.map((r) => r.repoId));
  const bal = async () => ({
    aUST: await balanceOf(GATEWAY.A, tUST, p.a), bUST: await balanceOf(GATEWAY.A, tUST, p.b),
    aUSD: await balanceOf(GATEWAY.A, tUSD, p.a), bUSD: await balanceOf(GATEWAY.A, tUSD, p.b),
  });
  const before = await bal();
  const repoOf = async (svc: string, id: string) => (await call<{ repos: Repo[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);

  try {
    // A books the repo in its console: 1,000,000 tUSD at 4.5% for 7 days, the GMRA's default Margin Ratio.
    await page.goto("/#/live/A");
    const cardA = page.getByTestId("repos");
    await expect(cardA.getByTestId("business-date")).toContainText(today, { timeout: STEP_TIMEOUT });
    await cardA.getByLabel("Repo security").selectOption("tUST");
    await cardA.getByLabel("Purchase Price (tUSD)").fill("1000000");
    await cardA.getByLabel("Repo rate (% p.a.)").fill("4.5");
    await cardA.getByLabel("Term (days)").fill("7");
    await cardA.getByRole("button", { name: "Book repo: sell to B" }).click();

    // B's service finds the booked trade in the payload store, rebuilds it with CDM and checks the on-chain amounts.
    let repo: Repo | undefined;
    await expect
      .poll(async () => {
        repo = (await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.find((r) => !known.has(r.repoId));
        return repo ? (repo.verified ? repo.state : repo.problem) : null;
      }, { timeout: 60_000 })
      .toBe("booked");
    const id = repo!.repoId;
    const qty = BigInt(repo!.quantity), pp = BigInt(repo!.purchasePrice), rp = BigInt(repo!.repurchasePrice);
    // 1,000,000 x 1.02 / 98.4 rounded up; 1,000,000 x 4.5% x 7 / 360 = 875.
    expect(qty).toBe(BigInt(Math.ceil((1_000_000 * 1.02) / PRICE_TUST)));
    expect(pp).toBe(1_000_000n);
    expect(rp - pp).toBe(875n);

    // B affirms in its console.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${id}`);
    await rowB.getByRole("button", { name: "Affirm repo" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`repo-state-${id}`)).toContainText("affirmed ✓", { timeout: STEP_TIMEOUT });

    // The purchase: B instructs first; nothing moves until A's instruction, which moves both legs.
    await rowB.getByRole("button", { name: "Settle purchase" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowB).toContainText("purchase instructed, awaiting A", { timeout: STEP_TIMEOUT });
    expect(await bal()).toEqual(before);
    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${id}`);
    await rowA.getByRole("button", { name: "Settle purchase" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`repo-state-${id}`)).toContainText("purchased ✓", { timeout: STEP_TIMEOUT });
    expect(await bal()).toEqual({ aUST: before.aUST - qty, bUST: before.bUST + qty, aUSD: before.aUSD + pp, bUSD: before.bUSD - pp });

    // Before the Repurchase Date the console offers no repurchase; the operator moves both business dates to it.
    const due = (await repoOf(SERVICE.A, id))!.repurchaseDate!;
    await expect(rowA).toContainText(`repurchase from ${due}`);
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });

    // The repurchase: A instructs, then B; the second instruction reverses both legs at the Repurchase Price.
    await page.reload();
    await page.getByTestId(`repo-${id}`).getByRole("button", { name: "Settle repurchase" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repoOf(SERVICE.A, id))?.instructedByMe, { timeout: 60_000 }).toBe(true);
    await page.goto("/#/live/B");
    await page.getByTestId(`repo-${id}`).getByRole("button", { name: "Settle repurchase" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`repo-state-${id}`)).toContainText("repurchased ✓", { timeout: STEP_TIMEOUT });
    expect(await bal()).toEqual({ aUST: before.aUST, bUST: before.bUST, aUSD: before.aUSD - (rp - pp), bUSD: before.bUSD + (rp - pp) });

    // Both services hold the same TradeState, booked under the on-chain trade hash, and the same closed trade from
    // CDM's Repurchase event, anchored on-chain.
    const trades = [await call<RepoTrade>(`${SERVICE.A}/repos/${id}/trade`), await call<RepoTrade>(`${SERVICE.B}/repos/${id}/trade`)];
    const onChain = await call<{ tradeHash: string; purchaseHash: string; repurchaseHash: string; state: string }>(`${GATEWAY.B}/repos/${id}`);
    expect(onChain.state).toBe("repurchased");
    expect(trades[0].tradeHash).toBe(onChain.tradeHash);
    expect(trades[1].tradeHash).toBe(onChain.tradeHash);
    expect(trades[0].tradeStateHash).toBe(trades[1].tradeStateHash);
    expect(trades[0].closedTradeStateHash).toBe(trades[1].closedTradeStateHash);
    expect(trades[0].closedState).toBe("Terminated");
    expect(onChain.purchaseHash).not.toBe(ZERO_HASH);
    expect(onChain.repurchaseHash).not.toBe(ZERO_HASH);
  } finally {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  }
});

// --- flow-repo-margin-maintenance ---
// Margin on the pair's Net Exposure under the GMRA (wp-adr-repo-margin-maintenance): B, the buyer of a repo, calls margin
// when the securities fall; A settles one call in cash and one in securities by title transfer. B pays interest on the
// Cash Margin. After the repurchase the exposure reverses and A calls the margin back, so the spec leaves no margin held.
type RepoMargin = {
  exposures: { repoId: string; role: string; exposureUsd: string }[]; netMarginHeldUsd: string; cashMarginHeldUsd: string;
  netExposureUsd: string; minimumTransferAmountUsd: string; callableUsd: string; callOpen: boolean;
  interest: { interestId: string; amountUsd: string; verified: boolean; payer?: string; error?: string }[];
};

test("flow-repo-margin-maintenance: the securities fall -> the buyer calls Net Exposure -> settled in cash, then in securities -> interest on Cash Margin -> repurchase -> the seller calls the margin back", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  const margin = (svc: string) => call<RepoMargin>(`${svc}/repo-margin`);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const setPrice = async (price: number) => {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(price) });
    await feedIs(price);
  };
  // The called party responds and delivers by title transfer; the caller accepts the proposal.
  const settle = async (caller: string, called: string, callId: string, assets: { token: string; qty: number }[]) => {
    await call(`${called}/calls/${callId}/response`, "POST", { response: "full" });
    const { proposalId } = await call<{ proposalId: number }>(`${called}/calls/${callId}/proposal`, "POST", { assets });
    await call(`${caller}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
    await call(`${called}/calls/${callId}/transfer`, "POST", { proposalId });
  };
  const settled = async (svc: string, callId: string) =>
    expect.poll(async () => (await call<{ calls: { callId: string; state: string }[] }>(`${svc}/state`)).calls.find((c) => c.callId === callId)?.state, { timeout: 60_000 }).toBe("settled");
  const noCallOpen = async () => {
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await margin(svc)).callOpen, { timeout: 30_000 }).toBe(false);
  };

  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const start = await margin(SERVICE.B);
  expect(start.exposures).toEqual([]);
  expect(Number(start.netMarginHeldUsd)).toBe(0);

  // Setup through the services (the UI path is flow-repo-purchase-repurchase): A sells tUST to B for 3,000,000 tUSD.
  const purchasePrice = 3_000_000;
  const qty = Math.ceil((purchasePrice * 1.02) / PRICE_TUST);
  const { repoId } = await call<{ repoId: string }>(`${SERVICE.A}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
  await call(`${SERVICE.B}/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await call<{ repos: { repoId: string; state: string }[] }>(`${SERVICE.A}/repos`)).repos.find((r) => r.repoId === repoId)?.state, { timeout: 30_000 }).toBe("affirmed");
  await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await expect.poll(async () => (await call<{ repos: { repoId: string; state: string }[] }>(`${SERVICE.B}/repos`)).repos.find((r) => r.repoId === repoId)?.state, { timeout: 30_000 }).toBe("purchased");

  let repurchased = false;
  try {
    // At the booking price the securities cover the Margin Ratio, so the buyer has nothing to call.
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe("0");

    // The price falls 10: B's Transaction Exposure is 3,060,000 - qty x 88.4, A's the opposite.
    const firstPrice = 88.4;
    await setPrice(firstPrice);
    const firstExposure = 3_060_000 - qty * firstPrice;
    const firstCall = Math.floor(firstExposure);
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(firstCall));
    expect(Number((await margin(SERVICE.B)).exposures[0].exposureUsd)).toBeCloseTo(firstExposure, 2);
    expect(Number((await margin(SERVICE.A)).exposures[0].exposureUsd)).toBeCloseTo(-firstExposure, 2);
    expect((await margin(SERVICE.A)).callableUsd).toBe("0");

    // B calls in its console; a second call is refused while the first is open.
    await page.goto("/#/live/B");
    const card = page.getByTestId("repo-margin");
    await card.getByRole("button", { name: `Call margin from A: USD ${firstCall}` }).click({ timeout: STEP_TIMEOUT });
    let callId: string | undefined;
    await expect.poll(async () => {
      callId = (await call<{ calls: { callId: string; kind: string; amountUsd: string; state: string }[] }>(`${SERVICE.A}/state`)).calls
        .find((c) => c.kind === "VM" && c.amountUsd === String(firstCall) && c.state === "issued")?.callId;
      return callId ?? null;
    }, { timeout: 30_000 }).not.toBeNull();
    await expect(call(`${SERVICE.B}/repo-margin/calls`, "POST", {})).rejects.toThrow("still open");

    // An under-covering proposal is refused off-chain, then A delivers the amount in cash.
    await call(`${SERVICE.A}/calls/${callId}/response`, "POST", { response: "full" });
    await expect(call(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: firstCall - 1 }] })).rejects.toThrow("does not cover");
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: firstCall }] });
    await call(`${SERVICE.B}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
    await call(`${SERVICE.A}/calls/${callId}/transfer`, "POST", { proposalId });
    await settled(SERVICE.B, callId!);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsdBefore - BigInt(firstCall));
    await noCallOpen();
    expect((await margin(SERVICE.B)).cashMarginHeldUsd).toBe(String(firstCall));
    expect((await margin(SERVICE.A)).cashMarginHeldUsd).toBe(String(-firstCall));

    // The price falls again: the second call is the exposure less the margin held, delivered in tUST at the feed price.
    const secondPrice = 78.4;
    await setPrice(secondPrice);
    const secondCall = Math.floor(3_060_000 - qty * secondPrice - firstCall);
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(secondCall));
    const second = await call<{ callId: string; amountUsd: number }>(`${SERVICE.B}/repo-margin/calls`, "POST", {});
    expect(second.amountUsd).toBe(secondCall);
    const marginQty = Math.ceil(secondCall / secondPrice);
    await settle(SERVICE.B, SERVICE.A, second.callId, [{ token: "tUST", qty: marginQty }]);
    await settled(SERVICE.B, second.callId);
    await noCallOpen();
    expect((await margin(SERVICE.B)).callableUsd).toBe("0");

    // B holds the Cash Margin and pays interest on it for 7 days at a rate entered by hand; the on-chain amount verifies.
    const aBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    const interest = Math.round((firstCall * 0.044 * 7) / 360);
    const paid = await call<{ interestId: string; amountUsd: number }>(`${SERVICE.B}/repo-margin/interest`, "POST", { periodStart: today, periodEnd: new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA"), observedRatePct: "4.4" });
    expect(paid.amountUsd).toBe(interest);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aBefore + BigInt(interest));
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await margin(svc)).interest.find((i) => i.interestId === paid.interestId)?.verified, { timeout: 60_000 }).toBe(true);
    }
    expect((await call<{ interestId: string }[]>(`${SERVICE.A}/interest`)).some((i) => i.interestId === paid.interestId)).toBe(false);

    // The repurchase ends the exposure; B then holds margin it no longer needs, so A calls it back.
    await setPrice(PRICE_TUST);
    const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await margin(SERVICE.A)).exposures.length, { timeout: 30_000 }).toBe(0);
    repurchased = true;
    const heldValue = firstCall + marginQty * PRICE_TUST;
    await expect.poll(async () => (await margin(SERVICE.A)).callableUsd, { timeout: 30_000 }).toBe(String(Math.floor(heldValue)));
    const back = await call<{ callId: string }>(`${SERVICE.A}/repo-margin/calls`, "POST", {});
    await settle(SERVICE.A, SERVICE.B, back.callId, [{ token: "tUSD", qty: firstCall }, { token: "tUST", qty: marginQty }]);
    await settled(SERVICE.A, back.callId);
    await noCallOpen();
    expect(Number((await margin(SERVICE.A)).netMarginHeldUsd)).toBe(0);
    expect((await margin(SERVICE.A)).cashMarginHeldUsd).toBe("0");
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
    expect(repurchased).toBe(true);
  }
});

// --- flow-repo-reprice ---
// A reprice instead of a margin call (wp-adr-repo-reprice): the securities fall, B offers to reprice in its console, A
// agrees in its console. A pays B the difference, the securities stay with B, the exposure is gone, and the repurchase uses
// the new amounts.
test("flow-repo-reprice: the securities fall -> the buyer offers a reprice -> the seller agrees and pays the difference -> no exposure remains -> repurchase at the new price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  type MarginView = RepoMargin & { repriceOffered: number; repriceToAgree: number };
  type RepoRow = { repoId: string; state: string; purchasePrice: string; repurchasePrice: string; quantity: string; verified: boolean; problem: string | null; purchaseDate: string; tradeHash: string };
  const margin = (svc: string) => call<MarginView>(`${svc}/repo-margin`);
  const repo = async (svc: string, id: string) => (await call<{ repos: RepoRow[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };

  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const purchasePrice = 3_000_000;
  const qty = Math.ceil((purchasePrice * 1.02) / PRICE_TUST);
  const { repoId, tradeHash } = await call<{ repoId: string; tradeHash: string }>(`${SERVICE.A}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
  await call(`${SERVICE.B}/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await repo(SERVICE.A, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
  await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await expect.poll(async () => (await repo(SERVICE.B, repoId))?.state, { timeout: 30_000 }).toBe("purchased");

  let repurchased = false;
  try {
    const fallen = 88.4;
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(fallen) });
    await feedIs(fallen);
    const firstCall = Math.floor(3_060_000 - qty * fallen);
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(firstCall));
    // The market value over the Margin Ratio; nothing has accrued on the Purchase Date, so A pays the whole difference.
    const newPurchasePrice = Math.round((qty * fallen) / 1.02);
    const difference = purchasePrice - newPurchasePrice;
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b), bUst = await balanceOf(GATEWAY.B, tUST, p.b);

    await page.goto("/#/live/B");
    const cardB = page.getByTestId("repo-margin");
    await cardB.getByRole("button", { name: "Reprice open repos with A" }).click({ timeout: STEP_TIMEOUT });
    await expect(cardB.getByTestId("repo-reprice-offered")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await margin(SERVICE.A)).repriceToAgree, { timeout: 30_000 }).toBe(1);
    // A margin call and a second offer are refused while the reprice is pending; nothing has moved yet.
    await expect(call(`${SERVICE.B}/repo-margin/calls`, "POST", {})).rejects.toThrow("still pending");
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    await page.goto("/#/live/A");
    const cardA = page.getByTestId("repo-margin");
    await cardA.getByRole("button", { name: "Agree reprice with B: 1 repo(s)" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, repoId))?.purchasePrice, { timeout: 30_000 }).toBe(String(newPurchasePrice));

    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - BigInt(difference));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + BigInt(difference));
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst);
    // 4.5% on the new Purchase Price for the 7 days from the reprice date to the Repurchase Date.
    const newRepurchasePrice = Math.round(newPurchasePrice + (newPurchasePrice * 0.045 * 7) / 360);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await repo(svc, repoId))?.verified, { timeout: 30_000 }).toBe(true);
      const r = (await repo(svc, repoId))!;
      expect(r.repurchasePrice).toBe(String(newRepurchasePrice));
      expect(r.quantity).toBe(String(qty));
      expect(r.tradeHash).not.toBe(tradeHash);
      const m = await margin(svc);
      expect(m.repriceOffered + m.repriceToAgree).toBe(0);
      expect(m.callableUsd).toBe("0");
      expect(Math.abs(Number(m.netExposureUsd))).toBeLessThan(2);
    }

    // The repurchase moves the securities back for the new Repurchase Price.
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
    const aBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await repo(SERVICE.A, repoId))?.state, { timeout: 30_000 }).toBe("repurchased");
    repurchased = true;
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aBefore - BigInt(newRepurchasePrice));
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
    expect(repurchased).toBe(true);
  }
});

// Every open repo in both directions: A sells to B once and B sells to A twice. When the securities fall each seller pays
// its buyer, so B, the proposer, pays twice: its one allowance must cover both payments, which settle only when A agrees.
test("flow-repo-reprice: every open repo in both directions is repriced -> the proposer's two payments and the agreeing party's one settle -> the Net Exposure is gone", async () => {
  test.setTimeout(TEST_TIMEOUT * 3);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  type RepoRow = { repoId: string; state: string; purchasePrice: string; verified: boolean };
  type MarginView = RepoMargin & { repriceOffered: number; repriceToAgree: number };
  const margin = (svc: string) => call<MarginView>(`${svc}/repo-margin`);
  const repo = async (svc: string, id: string) => (await call<{ repos: RepoRow[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const open = async (seller: string, buyer: string, purchasePrice: number) => {
    const { repoId } = await call<{ repoId: string }>(`${seller}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("booked");
    await call(`${buyer}/repos/${repoId}/affirm`, "POST", {});
    await expect.poll(async () => (await repo(seller, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
    await call(`${buyer}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await call(`${seller}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("purchased");
    return { repoId, seller, buyer, purchasePrice, qty: Math.ceil((purchasePrice * 1.02) / PRICE_TUST) };
  };

  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const repos = [await open(SERVICE.A, SERVICE.B, 5_000_000), await open(SERVICE.B, SERVICE.A, 1_000_000), await open(SERVICE.B, SERVICE.A, 500_000)];

  let repurchased = 0;
  try {
    const fallen = 88.4;
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(fallen) });
    await feedIs(fallen);
    await expect.poll(async () => Number((await margin(SERVICE.B)).callableUsd), { timeout: 30_000 }).toBeGreaterThan(0);
    const next = repos.map((r) => Math.round((r.qty * fallen) / 1.02));
    const differences = repos.map((r, i) => r.purchasePrice - next[i]);
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    await call(`${SERVICE.B}/repo-margin/reprice`, "POST", {});
    await expect.poll(async () => (await margin(SERVICE.A)).repriceToAgree, { timeout: 30_000 }).toBe(3);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd);
    const { repos: agreed } = await call<{ repos: unknown[] }>(`${SERVICE.A}/repo-margin/reprice/agree`, "POST", {});
    expect(agreed.length).toBe(3);

    for (const [i, r] of repos.entries()) {
      for (const svc of [SERVICE.A, SERVICE.B]) {
        await expect.poll(async () => (await repo(svc, r.repoId))?.purchasePrice, { timeout: 30_000 }).toBe(String(next[i]));
        await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      }
    }
    const net = BigInt(differences[1] + differences[2] - differences[0]);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + net);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - net);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await margin(svc)).repriceOffered + (await margin(svc)).repriceToAgree, { timeout: 30_000 }).toBe(0);
      const m = await margin(svc);
      expect(m.callableUsd).toBe("0");
      expect(Math.abs(Number(m.netExposureUsd))).toBeLessThan(4);
    }
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
    // The repos B sold come back first: on a fresh deployment B holds only the tUST it bought and has delivered part of it.
    for (const r of [...repos].reverse()) {
      await call(`${r.seller}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await call(`${r.buyer}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await expect.poll(async () => (await repo(r.seller, r.repoId))?.state, { timeout: 30_000 }).toBe("repurchased");
      repurchased++;
    }
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
    expect(repurchased).toBe(3);
  }
});

// --- flow-repo-adjustment ---
// An adjustment instead of a margin call (wp-adr-repo-adjustment): two days into the repo the securities fall, B offers an
// adjustment in its console and A agrees in its console. A delivers more securities and pays the accrued Price Differential.
const repoAdjustFixture = async () => {
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

test("flow-repo-adjustment: the securities fall -> the buyer offers an adjustment -> the seller agrees, delivers more securities and pays the accrued amount -> no exposure remains -> repurchase of the new quantity", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, margin, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const r = await open(SERVICE.A, SERVICE.B, 3_000_000);
  let done = 0;
  try {
    await setDate(inDays(2));
    const fallen = 88.4;
    await setPrice(fallen);
    await expect.poll(async () => Number((await margin(SERVICE.B)).callableUsd), { timeout: 30_000 }).toBeGreaterThan(0);
    const newQty = Math.ceil(3_060_000 / fallen);
    const accrued = Math.round((3_000_000 * 0.045 * 2) / 360);
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b), bUst = await balanceOf(GATEWAY.B, tUST, p.b), aUst = await balanceOf(GATEWAY.A, tUST, p.a);

    await page.goto("/#/live/B");
    const cardB = page.getByTestId("repo-margin");
    await cardB.getByRole("button", { name: "Adjust open repos with A" }).click({ timeout: STEP_TIMEOUT });
    await expect(cardB.getByTestId("repo-adjust-offered")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await margin(SERVICE.A)).adjustToAgree, { timeout: 30_000 }).toBe(1);
    await expect(call(`${SERVICE.B}/repo-margin/calls`, "POST", {})).rejects.toThrow("still pending");
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst);

    await page.goto("/#/live/A");
    const cardA = page.getByTestId("repo-margin");
    await cardA.getByRole("button", { name: "Agree adjustment with B: 1 repo(s)" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, r.repoId))?.quantity, { timeout: 30_000 }).toBe(String(newQty));

    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst + BigInt(newQty - r.qty));
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst - BigInt(newQty - r.qty));
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - BigInt(accrued));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + BigInt(accrued));
    // 4.5% on the unchanged Purchase Price for the 5 days from the adjustment date to the Repurchase Date.
    const newRepurchasePrice = Math.round(3_000_000 + (3_000_000 * 0.045 * 5) / 360);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      const row = (await repo(svc, r.repoId))!;
      expect(row.purchasePrice).toBe("3000000");
      expect(row.repurchasePrice).toBe(String(newRepurchasePrice));
      const m = await margin(svc);
      expect(m.adjustOffered + m.adjustToAgree).toBe(0);
      expect(m.callableUsd).toBe("0");
      expect(Math.abs(Number(m.netExposureUsd))).toBeLessThan(fallen);
    }
  } finally {
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    done = await close([r]);
    const paid = aUsdBefore - await balanceOf(GATEWAY.A, tUSD, p.a);
    expect(paid).toBe(BigInt(Math.round(3_000_000 + (3_000_000 * 0.045 * 5) / 360)));
    expect(done).toBe(1);
  }
});

// Every open repo in both directions: B, the proposer, delivers securities on two repos, so its one allowance must cover both.
test("flow-repo-adjustment: every open repo in both directions is adjusted -> the proposer's two deliveries and the agreeing party's one settle -> the Net Exposure is gone", async () => {
  test.setTimeout(TEST_TIMEOUT * 3);
  const { p, tUST, tUSD, today, inDays, margin, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const repos = [await open(SERVICE.A, SERVICE.B, 5_000_000), await open(SERVICE.B, SERVICE.A, 1_000_000), await open(SERVICE.B, SERVICE.A, 500_000)];
  let done = 0;
  try {
    await setDate(inDays(2));
    const fallen = 88.4;
    await setPrice(fallen);
    await expect.poll(async () => Number((await margin(SERVICE.B)).callableUsd), { timeout: 30_000 }).toBeGreaterThan(0);
    const next = repos.map((r) => Math.ceil((r.purchasePrice * 1.02) / fallen));
    const delta = repos.map((r, i) => next[i] - r.qty);
    const accrued = repos.map((r) => Math.round((r.purchasePrice * 0.045 * 2) / 360));
    const aUst = await balanceOf(GATEWAY.A, tUST, p.a), aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repo-margin/adjust`, "POST", {});
    await expect.poll(async () => (await margin(SERVICE.A)).adjustToAgree, { timeout: 30_000 }).toBe(3);
    const { repos: settled } = await call<{ repos: unknown[] }>(`${SERVICE.A}/repo-margin/adjust/agree`, "POST", {});
    expect(settled.length).toBe(3);
    for (const [i, r] of repos.entries()) {
      for (const svc of [SERVICE.A, SERVICE.B]) {
        await expect.poll(async () => (await repo(svc, r.repoId))?.quantity, { timeout: 30_000 }).toBe(String(next[i]));
        await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      }
    }
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst + BigInt(delta[1] + delta[2] - delta[0]));
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + BigInt(accrued[1] + accrued[2] - accrued[0]));
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => { const m = await margin(svc); return m.adjustOffered + m.adjustToAgree; }, { timeout: 30_000 }).toBe(0);
      expect((await margin(svc)).callableUsd).toBe("0");
    }
  } finally {
    done = await close(repos);
    expect(done).toBe(3);
  }
});

// --- flow-repo-substitution ---
// The Seller replaces the securities of one purchased repo (wp-adr-repo-substitution): A asks to substitute tMMF for tUST in
// its console and B agrees in its console. Both securities move in one transaction and no cash moves.
const scaledPrice = async (token: string) => BigInt((await call<{ price: string }>(`${GATEWAY.A}/prices/${token}`)).price);
const substituteQuantity = (qty: number, price: bigint, substitutePrice: bigint) => {
  const value = BigInt(qty) * price;
  return Number(value / substitutePrice + (value % substitutePrice === 0n ? 0n : 1n));
};

test("flow-repo-substitution: the seller requests tMMF for tUST -> the buyer agrees -> both securities move and no cash -> the seller repurchases the tMMF at the original price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  const tMMF = p.tokens.tMMF;
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const expectedRepurchase = (await repo(SERVICE.A, r.repoId))!.repurchasePrice;
  let done = 0;
  try {
    await setDate(inDays(2));
    const newQty = substituteQuantity(r.qty, await scaledPrice(tUST), await scaledPrice(tMMF));
    const aUst = await balanceOf(GATEWAY.A, tUST, p.a), bUst = await balanceOf(GATEWAY.B, tUST, p.b), aMmf = await balanceOf(GATEWAY.A, tMMF, p.a), bMmf = await balanceOf(GATEWAY.B, tMMF, p.b), aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByRole("button", { name: "Substitute tMMF" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-substitution-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(call(`${SERVICE.A}/repo-margin/calls`, "POST", {})).rejects.toThrow();
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByRole("button", { name: `Agree substitution by ${newQty.toLocaleString("en-US")} tMMF` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, r.repoId))?.quantity, { timeout: 30_000 }).toBe(String(newQty));

    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst + BigInt(r.qty));
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst - BigInt(r.qty));
    expect(await balanceOf(GATEWAY.A, tMMF, p.a)).toBe(aMmf - BigInt(newQty));
    expect(await balanceOf(GATEWAY.B, tMMF, p.b)).toBe(bMmf + BigInt(newQty));
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      const row = (await repo(svc, r.repoId))! as unknown as { security: string; purchasePrice: string; repurchasePrice: string };
      expect(row.security).toBe("tMMF");
      expect(row.purchasePrice).toBe("1000000");
      expect(row.repurchasePrice).toBe(expectedRepurchase);
    }
  } finally {
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a), aMmfBefore = await balanceOf(GATEWAY.A, tMMF, p.a);
    done = await close([r]);
    expect(aUsdBefore - await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(BigInt(expectedRepurchase));
    expect(await balanceOf(GATEWAY.A, tMMF, p.a)).toBeGreaterThan(aMmfBefore);
    expect(done).toBe(1);
  }
});

test("flow-repo-substitution: the buyer refuses -> nothing moves and the repo is unchanged -> a request at other feed prices is not agreed", async () => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 500_000);
  let done = 0;
  try {
    await setDate(inDays(1));
    const aUst = await balanceOf(GATEWAY.A, tUST, p.a), bUst = await balanceOf(GATEWAY.B, tUST, p.b);
    await call(`${SERVICE.A}/repos/${r.repoId}/substitute`, "POST", { security: "tMMF" });
    await expect.poll(async () => ((await repo(SERVICE.B, r.repoId)) as unknown as { substitutionPending?: string }).substitutionPending, { timeout: 30_000 }).toBe("toDecide");
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/substitute`, "POST", { security: "tMMF" })).rejects.toThrow("only the Seller");
    await call(`${SERVICE.B}/repos/${r.repoId}/substitute/refuse`, "POST", {});
    await expect.poll(async () => ((await repo(SERVICE.A, r.repoId)) as unknown as { substitutionPending?: string }).substitutionPending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst);
    expect((await repo(SERVICE.A, r.repoId))!.quantity).toBe(String(r.qty));

    // The Buyer's service rebuilds the event from the feed: after the price moves, the earlier request is not the one it builds.
    await call(`${SERVICE.A}/repos/${r.repoId}/substitute`, "POST", { security: "tMMF" });
    await expect.poll(async () => ((await repo(SERVICE.B, r.repoId)) as unknown as { substitutionPending?: string }).substitutionPending, { timeout: 30_000 }).toBe("toDecide");
    await setPrice(PRICE_TUST - 3);
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/substitute/agree`, "POST", {})).rejects.toThrow("is not the one this service builds");
    await call(`${SERVICE.B}/repos/${r.repoId}/substitute/refuse`, "POST", {});
  } finally {
    done = await close([r]);
    expect(done).toBe(1);
  }
});

// --- flow-repo-income ---
// Interim interest and manufactured income (wp-adr-repo-income). The Seller pays accrued interest and the Repurchase Price
// falls; the Buyer enters income on the securities and the Seller agrees.
type PaymentRow = { interimPending?: string; incomePending?: string; repurchasePrice: string; quantity: string; verified: boolean };

test("flow-repo-income: the seller pays accrued interest -> the buyer agrees -> the Repurchase Price falls by it -> the seller repurchases at the lower price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const fullRepurchase = Number((await repo(SERVICE.A, r.repoId))!.repurchasePrice);
  const accrued = Math.round((1_000_000 * 0.045 * 2) / 360);
  let done = 0;
  try {
    await setDate(inDays(2));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByRole("button", { name: "Pay accrued interest" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-payment-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByRole("button", { name: `Agree interim interest USD ${accrued}` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, r.repoId))?.repurchasePrice, { timeout: 30_000 }).toBe(String(fullRepurchase - accrued));

    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - BigInt(accrued));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + BigInt(accrued));
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
    // Nothing further has accrued on the same day.
    await expect(call(`${SERVICE.A}/repos/${r.repoId}/interim-interest`, "POST", {})).rejects.toThrow("no Price Differential");
  } finally {
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    done = await close([r]);
    expect(aUsdBefore - await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(BigInt(fullRepurchase - accrued));
    expect(done).toBe(1);
  }
});

test("flow-repo-income: the buyer enters income -> the seller agrees and is paid -> a second payment of the same document fails -> a refused payment moves nothing", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const pending = async (svc: string) => (await repo(svc, r.repoId)) as unknown as PaymentRow;
  const repurchase = (await repo(SERVICE.A, r.repoId))!.repurchasePrice;
  const amount = Math.round(r.qty * 1.25);
  let done = 0;
  try {
    await setDate(inDays(2));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByLabel("Income per unit").fill("1.25");
    await rowB.getByLabel("Income date").fill(inDays(2));
    await rowB.getByRole("button", { name: "Pay income" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowB.getByTestId(`repo-payment-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByRole("button", { name: `Agree income USD ${amount}` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => balanceOf(GATEWAY.A, tUSD, p.a), { timeout: 30_000 }).toBe(aUsd + BigInt(amount));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - BigInt(amount));
    expect((await repo(SERVICE.A, r.repoId))!.repurchasePrice).toBe(repurchase);
    await expect.poll(async () => (await pending(SERVICE.A)).incomePending, { timeout: 30_000 }).toBeUndefined();

    // The same document cannot be paid twice.
    const income = { incomePerUnit: "1.25", incomeDate: inDays(2) };
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/income`, "POST", income)).rejects.toThrow();

    // The income date must be within the term.
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/income`, "POST", { incomePerUnit: "1", incomeDate: inDays(30) })).rejects.toThrow("outside");

    // A refusal moves nothing and clears the request.
    const aAfter = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repos/${r.repoId}/income`, "POST", { incomePerUnit: "2", incomeDate: inDays(3) });
    await expect.poll(async () => (await pending(SERVICE.A)).incomePending, { timeout: 30_000 }).toBe("toDecide");
    await expect(call(`${SERVICE.A}/repo-margin/calls`, "POST", {})).rejects.toThrow();
    await call(`${SERVICE.A}/repos/${r.repoId}/income/refuse`, "POST", {});
    await expect.poll(async () => (await pending(SERVICE.B)).incomePending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aAfter);
  } finally {
    done = await close([r]);
    expect(done).toBe(1);
  }
});

// --- flow-repo-roll ---
// A roll on the Repurchase Date (wp-adr-repo-roll). The proposer enters the new Repurchase Date and rate, the other party
// agrees, the Seller pays the Price Differential and the securities stay with the Buyer.
type RollRow = { rollPending?: string; repurchasePrice: string; repurchaseDate: string; state: string; verified: boolean };

test("flow-repo-roll: the seller proposes a roll on the Repurchase Date -> the buyer agrees -> the seller pays the interest, the securities stay -> the repo repurchases on the new date at the new rate", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const row = async (svc: string) => (await repo(svc, r.repoId)) as unknown as RollRow;
  const settleRepurchase = async () => {
    const cur = await row(SERVICE.A);
    if (cur.state === "repurchased") return;
    await setDate(cur.repurchaseDate);
    await call(`${SERVICE.A}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await row(SERVICE.A)).state, { timeout: 30_000 }).toBe("repurchased");
  };
  try {
    await setDate(inDays(7));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    const aSec = await balanceOf(GATEWAY.A, tUST, p.a), bSec = await balanceOf(GATEWAY.B, tUST, p.b);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByLabel("New Repurchase Date").fill(inDays(14));
    await rowA.getByLabel("Roll rate (%)").fill("5");
    await rowA.getByRole("button", { name: "Roll repo" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-roll-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByRole("button", { name: `Agree roll to ${inDays(14)} at 5%` }).click({ timeout: STEP_TIMEOUT });
    // 1,000,000 x 5% x 7 / 360 = 972.22
    await expect.poll(async () => (await row(SERVICE.A)).repurchasePrice, { timeout: 30_000 }).toBe("1000972");

    // 1,000,000 x 4.5% x 7 / 360 = 875
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - 875n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + 875n);
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aSec);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bSec);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await row(svc)).verified, { timeout: 30_000 }).toBe(true);
      expect((await row(svc)).repurchaseDate).toBe(inDays(14));
      expect((await row(svc)).rollPending).toBeUndefined();
    }

    const before = await balanceOf(GATEWAY.A, tUSD, p.a);
    await settleRepurchase();
    expect(before - await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(1_000_972n);
  } finally {
    await settleRepurchase();
    await setDate(today);
  }
});

test("flow-repo-roll: a roll needs the Repurchase Date -> the buyer proposes -> the seller refuses and nothing moves -> the repo repurchases at the original price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const row = async (svc: string) => (await repo(svc, r.repoId)) as unknown as RollRow;
  const roll = { newRepurchaseDate: inDays(14), ratePercent: "4.5" };
  let done = 0;
  try {
    await setDate(inDays(2));
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/roll`, "POST", roll)).rejects.toThrow("only on its Repurchase Date");

    await setDate(inDays(7));
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/roll`, "POST", { ...roll, newRepurchaseDate: inDays(7) })).rejects.toThrow("not after");
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repos/${r.repoId}/roll`, "POST", roll);
    await expect.poll(async () => (await row(SERVICE.A)).rollPending, { timeout: 30_000 }).toBe("toDecide");
    await expect(call(`${SERVICE.A}/repos/${r.repoId}/roll`, "POST", roll)).rejects.toThrow("agree or refuse");

    await page.goto("/#/live/A");
    await page.getByTestId(`repo-${r.repoId}`).getByRole("button", { name: "Refuse roll" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await row(SERVICE.B)).rollPending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    expect((await row(SERVICE.A)).repurchasePrice).toBe("1000875");
  } finally {
    done = await close([r]);
    expect(done).toBe(1);
  }
});

// --- flow-repo-pair-off ---
// Two offsetting repos between A and B pair off on their common Repurchase Date (wp-adr-repo-pair-off): either party
// proposes, the other agrees, both repos are repurchased, no securities move and only the net cash is paid.
type PairOffRow = { pairOffPending?: string; pairOffWith?: string; pairOffNet?: string; state: string; verified: boolean; repurchaseHash: string | null };

test("flow-repo-pair-off: A sells to B and B sells the same securities back -> on the Repurchase Date A proposes the pair-off -> B agrees -> both repos close, no securities move, A pays only the net", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000); // 4.5%: Repurchase Price 1,000,875
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4"); // 4%: Repurchase Price 1,000,778
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as PairOffRow;
  let paired = false;
  try {
    await setDate(inDays(7));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    const aSec = await balanceOf(GATEWAY.A, tUST, p.a), bSec = await balanceOf(GATEWAY.B, tUST, p.b);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r1.repoId}`);
    await rowA.getByRole("button", { name: `Pair off with ${shortId(r2.repoId)}` }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-pairoff-${r1.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    await expect.poll(async () => (await row(SERVICE.B, r2.repoId)).pairOffPending, { timeout: 30_000 }).toBe("toDecide");
    expect((await row(SERVICE.B, r2.repoId)).pairOffNet).toBe("97");

    await page.goto("/#/live/B");
    await page.getByTestId(`repo-${r2.repoId}`).getByRole("button", { name: /^Agree pair-off with .*, receive/ }).click({ timeout: STEP_TIMEOUT });
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await row(SERVICE.A, id)).state, { timeout: 30_000 }).toBe("repurchased");
    paired = true;

    // 1,000,875 - 1,000,778 = 97 from A (the Seller of the repo with the higher Repurchase Price) to B.
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - 97n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + 97n);
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aSec);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bSec);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      const one = await row(svc, r1.repoId), two = await row(svc, r2.repoId);
      expect(one.verified && two.verified).toBe(true);
      expect(one.repurchaseHash).toBe(two.repurchaseHash);
      expect(one.pairOffPending).toBeUndefined();
      // Each service rebuilds the anchored pair-off from the trades it holds and reports the closed trade.
      for (const id of [r1.repoId, r2.repoId])
        expect((await call<{ closedState: string }>(`${svc}/repos/${id}/trade`)).closedState).toBe("Terminated");
    }
  } finally {
    if (!paired) await close([r1, r2]);
    await setDate(today);
  }
});

test("flow-repo-pair-off: only on the common Repurchase Date -> B proposes -> A refuses and nothing moves -> both repos repurchase normally", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setPrice(PRICE_TUST);
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4");
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as PairOffRow;
  let done = 0;
  try {
    await setDate(inDays(2));
    await expect(call(`${SERVICE.B}/repos/${r2.repoId}/pair-off`, "POST", { otherRepoId: r1.repoId })).rejects.toThrow("common Repurchase Date");

    await setDate(inDays(7));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repos/${r2.repoId}/pair-off`, "POST", { otherRepoId: r1.repoId });
    await expect.poll(async () => (await row(SERVICE.A, r1.repoId)).pairOffPending, { timeout: 30_000 }).toBe("toDecide");
    expect((await row(SERVICE.A, r1.repoId)).pairOffNet).toBe("-97");
    await expect(call(`${SERVICE.A}/repos/${r1.repoId}/pair-off`, "POST", { otherRepoId: r2.repoId })).rejects.toThrow("agree or refuse");

    await page.goto("/#/live/A");
    await page.getByTestId(`repo-${r1.repoId}`).getByRole("button", { name: "Refuse pair-off" }).click({ timeout: STEP_TIMEOUT });
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await row(SERVICE.B, id)).pairOffPending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    expect((await row(SERVICE.A, r1.repoId)).state).toBe("purchased");
  } finally {
    done = await close([r1, r2]);
    expect(done).toBe(2);
  }
});

// --- flow-repo-buy-sell-back ---
// A buy/sell-back is a repo with CDM's trade type BuySellBack (wp-adr-repo-buy-sell-back): agreed income moves no cash and
// lowers the Sell Back Price by the income plus interest to the Repurchase Date, there is no interim interest, and only
// two buy/sell-backs pair off.
type BsbRow = { repoId: string; state: string; verified: boolean; buySellBack?: boolean; incomeDeduction?: string; sellBackPrice?: string;
  repurchasePrice: string; incomePending?: string; pairOffPending?: string; pairOffNet?: string };

test("flow-repo-buy-sell-back: A books a buy/sell-back in the console -> B affirms -> purchase -> B enters income -> A agrees, no cash moves and the Sell Back Price falls -> sell-back at the lower price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as BsbRow;
  const before = new Set((await call<{ repos: { repoId: string }[] }>(`${SERVICE.A}/repos`)).repos.map((r) => r.repoId));

  await page.goto("/#/live/A");
  const card = page.getByTestId("repos");
  await card.getByLabel("Repo type").selectOption("bsb");
  await card.getByRole("button", { name: "Book buy/sell-back: sell to B" }).click({ timeout: STEP_TIMEOUT });
  let repoId = "";
  await expect.poll(async () => {
    const fresh = (await call<{ repos: BsbRow[] }>(`${SERVICE.A}/repos`)).repos.find((r) => !before.has(r.repoId) && r.buySellBack);
    repoId = fresh?.repoId ?? "";
    return repoId;
  }, { timeout: 30_000 }).not.toBe("");
  const r = { repoId, seller: SERVICE.A, buyer: SERVICE.B };
  let done = false;
  try {
    await expect.poll(async () => (await row(SERVICE.B, repoId))?.state, { timeout: 30_000 }).toBe("booked");
    expect((await row(SERVICE.B, repoId)).buySellBack).toBe(true);
    await call(`${SERVICE.B}/repos/${repoId}/affirm`, "POST", {});
    await expect.poll(async () => (await row(SERVICE.A, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await expect.poll(async () => (await row(SERVICE.B, repoId))?.state, { timeout: 30_000 }).toBe("purchased");
    await expect(page.getByTestId(`repo-${repoId}`)).toContainText("buy/sell-back · seller", { timeout: STEP_TIMEOUT });
    // No interim interest on a buy/sell-back: the forward price is fixed at trade.
    await expect(page.getByTestId(`repo-${repoId}`).getByRole("button", { name: "Pay accrued interest" })).toHaveCount(0);
    await expect(call(`${SERVICE.A}/repos/${repoId}/interim-interest`, "POST", {})).rejects.toThrow("no interim interest");

    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    // B, the Buyer, enters income of 0.5 per unit three days in: 10,366 x 0.5 = 5,183, plus 5,183 x 4.5% x 4 / 360 = 2.59.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${repoId}`);
    await rowB.getByLabel("Income per unit").fill("0.5");
    await rowB.getByLabel("Income date").fill(inDays(3));
    await rowB.getByRole("button", { name: "Enter income" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await row(SERVICE.A, repoId)).incomePending, { timeout: 30_000 }).toBe("toDecide");

    await page.goto("/#/live/A");
    await page.getByTestId(`repo-${repoId}`).getByRole("button", { name: "Agree income USD 5183, sell-back price lower by USD 5,186" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await row(SERVICE.B, repoId)).incomeDeduction, { timeout: 30_000 }).toBe("5186");
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd);
    const agreed = await row(SERVICE.A, repoId);
    expect(agreed.repurchasePrice).toBe("1000875");
    expect(agreed.sellBackPrice).toBe("995689");
    await expect(page.getByTestId(`repo-price-${repoId}`)).toContainText("sell back USD 995,689", { timeout: STEP_TIMEOUT });

    // The sell-back on the Repurchase Date: the Seller pays 1,000,875 - 5,186.
    await setDate(inDays(7));
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await row(SERVICE.A, repoId)).state, { timeout: 30_000 }).toBe("repurchased");
    done = true;
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - 995_689n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + 995_689n);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      expect((await row(svc, repoId)).verified).toBe(true);
      expect((await call<{ closedState: string }>(`${svc}/repos/${repoId}/trade`)).closedState).toBe("Terminated");
    }
  } finally {
    if (!done) await close([r]);
    await setDate(today);
  }
});

test("flow-repo-buy-sell-back: two offsetting buy/sell-backs pair off on the Repurchase Date, netting the Sell Back Prices -> a buy/sell-back does not pair off with a repo", async () => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as BsbRow;
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000, "4.5", true); // Repurchase Price 1,000,875
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4", true); // Repurchase Price 1,000,778
  const r3 = await open(SERVICE.A, SERVICE.B, 1_000_000, "4.5"); // a repo, A sells again
  let paired = false;
  try {
    // Income on r1 lowers its Sell Back Price by 5,186 to 995,689.
    await call(`${SERVICE.B}/repos/${r1.repoId}/income`, "POST", { incomePerUnit: "0.5", incomeDate: inDays(3) });
    await expect.poll(async () => (await row(SERVICE.A, r1.repoId)).incomePending, { timeout: 30_000 }).toBe("toDecide");
    await call(`${SERVICE.A}/repos/${r1.repoId}/income/agree`, "POST", {});
    await expect.poll(async () => (await row(SERVICE.B, r1.repoId)).incomeDeduction, { timeout: 30_000 }).toBe("5186");

    await setDate(inDays(7));
    // r2 (a buy/sell-back B sells) and r3 (a repo A sells) offset in all but type.
    await expect(call(`${SERVICE.B}/repos/${r2.repoId}/pair-off`, "POST", { otherRepoId: r3.repoId })).rejects.toThrow("do not offset");

    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    await call(`${SERVICE.A}/repos/${r1.repoId}/pair-off`, "POST", { otherRepoId: r2.repoId });
    // 995,689 against 1,000,778: B, the Seller of r2, pays A 5,089.
    await expect.poll(async () => (await row(SERVICE.B, r2.repoId)).pairOffPending, { timeout: 30_000 }).toBe("toDecide");
    expect((await row(SERVICE.B, r2.repoId)).pairOffNet).toBe("-5089");
    await call(`${SERVICE.B}/repos/${r2.repoId}/pair-off/agree`, "POST", {});
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await row(SERVICE.A, id)).state, { timeout: 30_000 }).toBe("repurchased");
    paired = true;
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + 5_089n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - 5_089n);
    for (const svc of [SERVICE.A, SERVICE.B])
      for (const id of [r1.repoId, r2.repoId])
        expect((await call<{ closedState: string }>(`${svc}/repos/${id}/trade`)).closedState).toBe("Terminated");
  } finally {
    expect(await close(paired ? [r3] : [r1, r2, r3])).toBe(paired ? 1 : 3);
    await setDate(today);
  }
});

// --- flow-repo-default-close-out ---
// A GMRA default close-out (wp-adr-repo-default-close-out, GMRA paragraph 10). B is the non-defaulting party: earlier specs
// leave A in default on the persistent chain, and none ever puts B in default. A repo A sells and a buy/sell-back B sells
// offset in quantity, so the close-out, which moves no securities, leaves both parties' tUST where it was and only the
// small net balance moves. The spec restores A's default status as it found it.
type CloseOutStatementView = { earlyTerminationDate: string; nonDefaultingParty: string; transactions: { repoId: string; buySellBack: boolean;
  repurchasePrice: string; defaultMarketValue: string }[]; heldMargin: { holder: string; value: string }[]; netAmount: string; balance: string; payer: string | null };
type RepoDefaultView = { counterpartyInDefault: boolean; inDefault: boolean; automaticEarlyTermination: boolean; openTransactions: number;
  preview?: CloseOutStatementView; closeOuts: { closeOutId: string; amount: string; paid: boolean; payer: string | null; toPay: boolean;
  noticeServed: boolean; verified: boolean; problem?: string; statement?: CloseOutStatementView }[] };

test("flow-repo-default-close-out: B declares A's default in the console -> Default Notice -> every purchased repo of the pair closes out, no securities move -> the party owing the net balance pays it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  const view = (svc: string) => call<RepoDefaultView>(`${svc}/repo-default`);
  const aWasInDefault = (await call<{ inDefault: boolean }>(`${GATEWAY.B}/defaults/${p.a}`)).inDefault;
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.b}`)).inDefault).toBe(false);
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000, "4.5"); // a repo A sells to B
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4", true); // a buy/sell-back B sells to A
  let closedOut = false;
  try {
    await setDate(inDays(3));
    const before = await view(SERVICE.B);
    expect(before.inDefault).toBe(false);
    expect(before.automaticEarlyTermination).toBe(false); // the baseline GMRA elections: a Default Notice is served
    const preview = before.preview!;
    const value = (s: CloseOutStatementView, id: string) => s.transactions.find((t) => t.repoId === id)!;
    // As at the Early Termination Date, three days in: 1,000,000 + 375 at 4.5% and + 333 at 4%; 10,366 tUST at 98.4.
    expect(value(preview, r1.repoId)).toMatchObject({ buySellBack: false, repurchasePrice: "1000375", defaultMarketValue: "1020014" });
    expect(value(preview, r2.repoId)).toMatchObject({ buySellBack: true, repurchasePrice: "1000333", defaultMarketValue: "1020014" });
    // From B's side r1 gives -19,639 and r2 +19,681; margin held between the pair, if any, is owed back by its holder.
    const margin = preview.heldMargin.reduce((sum, m) => sum + (m.holder === preview.nonDefaultingParty ? -Number(m.value) : Number(m.value)), 0);
    expect(Number(preview.netAmount)).toBe(42 + margin + otherTransactions(preview, [r1.repoId, r2.repoId]));

    const aSec = await balanceOf(GATEWAY.A, tUST, p.a), bSec = await balanceOf(GATEWAY.B, tUST, p.b);
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    // 1. B declares A's default and closes out in its console: the oracle records the default (if not already), B serves
    // the Default Notice on-chain, then records the statement and the balance; both repos close out.
    await page.goto("/#/live/B");
    await page.getByTestId("repo-default-close-out").click({ timeout: STEP_TIMEOUT });
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await repo(SERVICE.A, id))?.state, { timeout: 60_000 }).toBe("closedOut");
    closedOut = true;
    for (const gw of [GATEWAY.A, GATEWAY.B]) expect((await call<{ inDefault: boolean }>(`${gw}/defaults/${p.a}`)).inDefault).toBe(true);
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aSec);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bSec);

    // 2. Both services rebuild the statement from their own trades and agree; the defaulting party is offered no close-out.
    const a = await view(SERVICE.A), b = await view(SERVICE.B);
    expect(a.inDefault).toBe(true);
    expect(a.preview).toBeUndefined();
    const coA = a.closeOuts[0], coB = b.closeOuts[0];
    expect(coA.closeOutId).toBe(coB.closeOutId);
    expect(coA.verified && coB.verified).toBe(true);
    expect(coB.noticeServed).toBe(true);
    expect(coB.statement!.balance).toBe(preview.balance);
    expect(coB.amount).toBe(preview.balance);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    // 3. The party owing the balance pays it in its console.
    const amount = BigInt(coB.amount);
    if (amount > 0n) {
      const payerSvc = coB.payer === "A" ? "A" : "B";
      await page.goto(`/#/live/${payerSvc}`);
      await page.getByTestId(`repo-closeout-${coB.closeOutId}`).getByRole("button", { name: `Pay USD ${coB.amount}` }).click({ timeout: STEP_TIMEOUT });
      await expect.poll(async () => (await view(SERVICE.B)).closeOuts[0].paid, { timeout: 60_000 }).toBe(true);
      const sign = payerSvc === "A" ? -1n : 1n;
      expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + sign * amount);
      expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - sign * amount);
    } else {
      expect(coB.paid).toBe(true);
    }
    for (const svc of [SERVICE.A, SERVICE.B])
      for (const id of [r1.repoId, r2.repoId]) expect((await repo(svc, id))?.verified).toBe(true);
  } finally {
    if (!closedOut) await close([r1, r2]);
    if (!aWasInDefault) await call(`${ORACLE}/defaults`, "POST", { party: p.a, inDefault: false, notifiedBy: "e2e restore" });
    await setDate(today);
  }
});

/** The net contribution, from the non-defaulting party's side, of Transactions in a statement other than `ids` (repos
 *  left open between the pair by an earlier, interrupted run are closed out too). */
function otherTransactions(s: CloseOutStatementView, ids: string[]): number {
  const nd = s.nonDefaultingParty;
  return s.transactions.filter((t) => !ids.includes(t.repoId))
    .reduce((sum, t) => sum + ((t as unknown as { buyer: string }).buyer === nd ? Number(t.repurchasePrice) - Number(t.defaultMarketValue) : Number(t.defaultMarketValue) - Number(t.repurchasePrice)), 0);
}

// Securities loan delivery and return under the GMSLA (task-gmsla-loan-delivery-return, wp-adr-gmsla-loan-delivery-return).
// The rules are assumptions awaiting task-sme-gmsla-loan-delivery-return-rules.
type Loan = {
  loanId: string; role: string; state: string; quantity: string; collateral: string; collateralAmount: string; price?: string;
  marginPercent?: string; verified: boolean; problem?: string | null;
  lastReturn?: { qualification?: string; quantity: string; collateralAmount: string; cdmQualifications?: string[] };
};

test("flow-gmsla-loan-delivery-return: A lends tMMF to B against tUSD -> B affirms -> delivery settles -> B returns part, then the rest -> a loan against tUST returns in full; every balance restored", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUSD = p.tokens.tUSD, tUST = p.tokens.tUST;
  const today = new Date().toLocaleDateString("en-CA");
  // Setup: both business dates on today, so both services build the same return documents.
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const bal = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUsd: await balanceOf(GATEWAY.A, tUSD, p.a), bUsd: await balanceOf(GATEWAY.A, tUSD, p.b),
    aUst: await balanceOf(GATEWAY.A, tUST, p.a), bUst: await balanceOf(GATEWAY.A, tUST, p.b),
  });
  const loanOf = async (svc: string, id: string) => (await call<{ loans: Loan[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id)!;
  const known = new Set((await call<{ loans: Loan[] }>(`${SERVICE.A}/loans`)).loans.map((l) => l.loanId));
  const start = await bal();

  // 1. A books 100,000 tMMF to B against tUSD at a 4% rebate in its console; the margin is the GMSLA default.
  await page.goto("/#/live/A");
  const cardA = page.getByTestId("loans");
  await expect(cardA).toBeVisible({ timeout: STEP_TIMEOUT });
  await cardA.getByLabel("Loan quantity").fill("100000");
  await cardA.getByLabel("Loan collateral").selectOption("tUSD");
  await cardA.getByLabel("Loan rate (% p.a.)").fill("4");
  await cardA.getByRole("button", { name: "Book loan: lend to B" }).click();
  await expect.poll(async () => (await call<{ loans: Loan[] }>(`${SERVICE.A}/loans`)).loans.filter((l) => !known.has(l.loanId)).length, { timeout: STEP_TIMEOUT }).toBe(1);
  const id = (await call<{ loans: Loan[] }>(`${SERVICE.A}/loans`)).loans.find((l) => !known.has(l.loanId))!.loanId;
  const booked = await loanOf(SERVICE.A, id);
  expect(booked.verified).toBe(true);
  const collateral = BigInt(booked.collateralAmount);
  expect(Number(collateral)).toBe(Math.ceil(100_000 * Number(booked.price) * Number(booked.marginPercent) / 100 - 1e-9));

  // 2. B affirms after rebuilding the CDM execution; 3. both instruct the delivery, which swaps securities and collateral.
  await page.goto("/#/live/B");
  const rowB = page.getByTestId(`loan-${id}`);
  await rowB.getByRole("button", { name: "Affirm loan" }).click({ timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-state-${id}`)).toHaveText("affirmed ✓", { timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Settle delivery" }).click({ timeout: STEP_TIMEOUT });
  await expect(rowB).toContainText("delivery instructed, awaiting A", { timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  const rowA = page.getByTestId(`loan-${id}`);
  await rowA.getByRole("button", { name: "Settle delivery" }).click({ timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-state-${id}`)).toHaveText("open ✓", { timeout: STEP_TIMEOUT });
  let now = await bal();
  expect(now.bMmf - start.bMmf).toBe(100_000n);
  expect(start.aMmf - now.aMmf).toBe(100_000n);
  expect(now.aUsd - start.aUsd).toBe(collateral); // title transfer to the lender
  expect(start.bUsd - now.bUsd).toBe(collateral);

  // 4. B returns 40,000 in its console; A agrees; the lender redelivers collateral pro rata, rounded down.
  const part = (collateral * 40_000n) / 100_000n;
  await page.goto("/#/live/B");
  await rowB.getByLabel("Return quantity").fill("40000", { timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Return part" }).click();
  await expect(page.getByTestId(`loan-return-pending-${id}`)).toContainText("return of 40,000 instructed", { timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await rowA.getByRole("button", { name: /^Agree return of 40,000 tMMF/ }).click({ timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-last-return-${id}`)).toContainText("PartialReturn of 40,000", { timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-last-return-${id}`)).toContainText("PartialTermination");
  await expect(page.getByTestId(`loan-quantity-${id}`)).toContainText("60,000 tMMF");
  for (const svc of [SERVICE.A, SERVICE.B]) {
    const l = await loanOf(svc, id);
    expect([l.state, l.verified, l.quantity, l.collateralAmount]).toEqual(["open", true, "60000", String(collateral - part)]);
  }
  now = await bal();
  expect(start.bMmf + 60_000n).toBe(now.bMmf);
  expect(start.bUsd - collateral + part).toBe(now.bUsd);

  // 5. B returns the rest; A agrees; all the collateral comes back and the loan is returned.
  await page.goto("/#/live/B");
  await rowB.getByRole("button", { name: "Return in full" }).click({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await rowA.getByRole("button", { name: /^Agree return of 60,000 tMMF/ }).click({ timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-state-${id}`)).toHaveText("returned ✓", { timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-last-return-${id}`)).toContainText("FullReturn of 60,000");
  await expect(page.getByTestId(`loan-last-return-${id}`)).toContainText("Termination");
  expect(await bal()).toEqual(start);

  // 6. A second loan against tUST, set up through the services, returned in full: CDM also qualifies it as FullReturn (D4).
  const { loanId: id2, collateralAmount: ust } = await call<{ loanId: string; collateralAmount: number }>(`${SERVICE.A}/loans`, "POST",
    { security: "tMMF", quantity: 50_000, collateral: "tUST", ratePercent: "0.5" });
  await call(`${SERVICE.B}/loans/${id2}/affirm`, "POST", {});
  await call(`${SERVICE.A}/loans/${id2}/deliver`, "POST", {});
  await call(`${SERVICE.B}/loans/${id2}/deliver`, "POST", {});
  await expect.poll(async () => (await loanOf(SERVICE.B, id2)).state, { timeout: STEP_TIMEOUT }).toBe("open");
  now = await bal();
  expect(now.aUst - start.aUst).toBe(BigInt(ust));
  await call(`${SERVICE.B}/loans/${id2}/return`, "POST", { quantity: 50_000 });
  await page.goto("/#/live/A");
  await page.getByTestId(`loan-${id2}`).getByRole("button", { name: new RegExp(`^Agree return of 50,000 tMMF \\(collateral back ${ust.toLocaleString("en-US")} tUST\\)`) }).click({ timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-state-${id2}`)).toHaveText("returned ✓", { timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`loan-last-return-${id2}`)).toContainText("FullReturn of 50,000");
  await expect(page.getByTestId(`loan-last-return-${id2}`)).toContainText("CDM: FullReturn, Termination");
  expect(await bal()).toEqual(start);
  expect(errors).toEqual([]);
});

// --- flow-gmsla-marking ---
// The pair's loans are marked together at the feed prices (wp-adr-gmsla-marking). The tMMF price rises, so the lender A
// is short of collateral and calls B in its console; B rebuilds the mark statement before agreeing and delivers tUSD by
// title transfer. The price is restored, so B now holds too little and calls the excess back. The loan is returned and
// every balance ends where it started.
type GmslaMarking = {
  party: string; businessDate: string; netMarginHeldUsd: string; netExposureUsd: string; callableUsd: string; callOpen: boolean;
  statementHash: string; settledCalls: string[]; loans: { loanId: string; role: string; requirementUsd: string; collateralValueUsd: string; exposureUsd: string }[];
};

test("flow-gmsla-marking: the tMMF price rises -> the lender calls the shortfall, B delivers tUSD -> the price is restored -> B calls the excess back -> the loan is returned; every balance restored", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  const mark = (svc: string) => call<GmslaMarking>(`${svc}/gmsla-marking`);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tMMF}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const setPrice = async (price: number) => {
    await call(`${ORACLE}/market-data/tMMF`, "PUT", { price: String(price) });
    await feedIs(price);
  };
  const bal = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUsd: await balanceOf(GATEWAY.A, tUSD, p.a), bUsd: await balanceOf(GATEWAY.A, tUSD, p.b),
  });
  const settled = async (svc: string, callId: string) =>
    expect.poll(async () => (await call<{ calls: { callId: string; state: string }[] }>(`${svc}/state`)).calls.find((c) => c.callId === callId)?.state, { timeout: 60_000 }).toBe("settled");
  const noCallOpen = async () => {
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await mark(svc)).callOpen, { timeout: 30_000 }).toBe(false);
  };
  const loanState = async (svc: string, id: string) => (await call<{ loans: Loan[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id);

  // Setup: both business dates on today; no open loan and no GMSLA margin between the pair.
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const before = await mark(SERVICE.A);
  expect(before.loans).toEqual([]);
  expect(Number(before.netMarginHeldUsd)).toBe(0);
  const start = await bal();

  // A lends 5,000,000 tMMF to B against tUSD at the default margin (through the services; the UI path is
  // flow-gmsla-loan-delivery-return).
  const quantity = 5_000_000;
  const { loanId, collateralAmount } = await call<{ loanId: string; collateralAmount: number }>(`${SERVICE.A}/loans`, "POST",
    { security: "tMMF", quantity, collateral: "tUSD", ratePercent: "4" });
  await call(`${SERVICE.B}/loans/${loanId}/affirm`, "POST", {});
  await call(`${SERVICE.A}/loans/${loanId}/deliver`, "POST", {});
  await call(`${SERVICE.B}/loans/${loanId}/deliver`, "POST", {});
  await expect.poll(async () => (await loanState(SERVICE.B, loanId))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
  expect(collateralAmount).toBe(5_100_000);

  let returned = false;
  try {
    // At the booking price the collateral covers the margin: nothing to call either way.
    await expect.poll(async () => (await mark(SERVICE.A)).callableUsd, { timeout: 30_000 }).toBe("0");
    expect((await mark(SERVICE.B)).callableUsd).toBe("0");

    // The price rises to 1.10: A requires 5,610,000 and holds 5,100,000, so A may call 510,000; B's figure is the opposite.
    await setPrice(1.1);
    const shortfall = 5_610_000 - collateralAmount;
    await expect.poll(async () => (await mark(SERVICE.A)).callableUsd, { timeout: 30_000 }).toBe(String(shortfall));
    const m = await mark(SERVICE.A);
    expect(m.loans.map((l) => [l.role, l.requirementUsd, l.collateralValueUsd, l.exposureUsd])).toEqual([["lender", "5610000.00", "5100000.00", "510000.00"]]);
    expect(Number((await mark(SERVICE.B)).netExposureUsd)).toBe(-shortfall);
    expect((await mark(SERVICE.B)).callableUsd).toBe("0");

    // A calls in its console; a second call is refused while it is open.
    await page.goto("/#/live/A");
    const card = page.getByTestId("gmsla-marking");
    await expect(page.getByTestId("gmsla-net-exposure")).toHaveText(`net figure USD ${shortfall.toLocaleString("en-US")}`, { timeout: STEP_TIMEOUT });
    await card.getByRole("button", { name: `Call GMSLA margin from B: USD ${shortfall.toLocaleString("en-US")}` }).click({ timeout: STEP_TIMEOUT });
    let callId: string | undefined;
    await expect.poll(async () => {
      callId = (await call<{ calls: { callId: string; kind: string; amountUsd: string; state: string }[] }>(`${SERVICE.B}/state`)).calls
        .find((c) => c.kind === "VM" && c.amountUsd === String(shortfall) && c.state === "issued")?.callId;
      return callId ?? null;
    }, { timeout: 30_000 }).not.toBeNull();
    await expect(page.getByTestId("gmsla-call-open")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(call(`${SERVICE.A}/gmsla-marking/calls`, "POST", {})).rejects.toThrow("still open");

    // B agrees after rebuilding the statement. An under-covering proposal and tMMF are refused off-chain; then B
    // delivers the shortfall in tUSD and A accepts.
    await call(`${SERVICE.B}/calls/${callId}/response`, "POST", { response: "full" });
    await expect(call(`${SERVICE.B}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: shortfall - 1 }] })).rejects.toThrow("does not cover");
    await expect(call(`${SERVICE.B}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tMMF", qty: shortfall }] })).rejects.toThrow("tUSD or tUST");
    const first = await call<{ proposalId: number }>(`${SERVICE.B}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: shortfall }] });
    await call(`${SERVICE.A}/calls/${callId}/decision`, "POST", { proposalId: first.proposalId, accept: true });
    await call(`${SERVICE.B}/calls/${callId}/transfer`, "POST", { proposalId: first.proposalId });
    await settled(SERVICE.A, callId!);
    await noCallOpen();
    let now = await bal();
    expect(now.aUsd - start.aUsd).toBe(BigInt(collateralAmount + shortfall));
    // The margin counts in the next mark: nothing is left to call.
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await mark(svc)).callableUsd, { timeout: 30_000 }).toBe("0");
    expect((await mark(SERVICE.A)).netMarginHeldUsd).toBe(`${shortfall}.00`);
    await page.reload();
    await expect(page.getByTestId("gmsla-margin-held")).toHaveText(`margin held USD ${shortfall.toLocaleString("en-US")}`, { timeout: STEP_TIMEOUT });

    // The price is restored: B now has the excess to call back, which A delivers.
    await setPrice(1);
    await expect.poll(async () => (await mark(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(shortfall));
    const back = await call<{ callId: string; amountUsd: number }>(`${SERVICE.B}/gmsla-marking/calls`, "POST", {});
    expect(back.amountUsd).toBe(shortfall);
    await call(`${SERVICE.A}/calls/${back.callId}/response`, "POST", { response: "full" });
    const second = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${back.callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: shortfall }] });
    await call(`${SERVICE.B}/calls/${back.callId}/decision`, "POST", { proposalId: second.proposalId, accept: true });
    await call(`${SERVICE.A}/calls/${back.callId}/transfer`, "POST", { proposalId: second.proposalId });
    await settled(SERVICE.B, back.callId);
    await noCallOpen();
    for (const svc of [SERVICE.A, SERVICE.B]) expect(Number((await mark(svc)).netMarginHeldUsd)).toBe(0);
    now = await bal();
    expect(now.aUsd - start.aUsd).toBe(BigInt(collateralAmount));

    // The loan is returned in full; the return redelivers only the loan's own collateral.
    await call(`${SERVICE.B}/loans/${loanId}/return`, "POST", { quantity });
    await call(`${SERVICE.A}/loans/${loanId}/return`, "POST", {});
    await expect.poll(async () => (await loanState(SERVICE.A, loanId))?.state, { timeout: STEP_TIMEOUT }).toBe("returned");
    returned = true;
    await expect.poll(async () => (await mark(SERVICE.A)).loans.length, { timeout: 30_000 }).toBe(0);
    expect(await bal()).toEqual(start);
    expect(errors).toEqual([]);
  } finally {
    await call(`${ORACLE}/market-data/tMMF`, "PUT", { price: "1" });
    await feedIs(1);
    if (!returned) {
      // Leave no open loan for the next run: return it in full at the restored price.
      const l = await loanState(SERVICE.A, loanId);
      if (l?.state === "open") {
        await call(`${SERVICE.B}/loans/${loanId}/return`, "POST", { quantity: Number(l.quantity) }).catch(() => undefined);
        await call(`${SERVICE.A}/loans/${loanId}/return`, "POST", {}).catch(() => undefined);
      }
    }
  }
});

// --- flow-gmsla-recall ---
// The lender recalls all or part of an open loan by an anchored cdm-ext notice due two business days later
// (wp-adr-gmsla-recall); the borrower settles it through the return. A recalls part in its console, B returns it and A
// agrees, which clears the recall. A recalls the rest; past the due date both consoles show it overdue; B returns the
// rest. A recall on a second loan is withdrawn and moves nothing.
test("flow-gmsla-recall: A recalls part -> B returns it, the recall clears -> A recalls the rest, overdue past the due date -> returned -> a withdrawn recall moves nothing; every balance restored", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUSD = p.tokens.tUSD;
  const iso = (d: Date) => d.toLocaleDateString("en-CA");
  const today = iso(new Date());
  // The notice date plus n business days, weekends skipped (cdm-ext GmslaRecallSettlementDate).
  const addBusinessDays = (date: string, n: number) => {
    const d = new Date(`${date}T12:00:00`);
    while (n > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) n--;
    }
    return iso(d);
  };
  const setDate = async (date: string) => {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: date });
  };
  const bal = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUsd: await balanceOf(GATEWAY.A, tUSD, p.a), bUsd: await balanceOf(GATEWAY.A, tUSD, p.b),
  });
  type RecallView = { quantity: string; intendedSettlementDate: string; overdue: boolean; verified: boolean; recalledQuantity?: string };
  const loanOf = async (svc: string, id: string) => (await call<{ loans: (Loan & { recall?: RecallView })[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id)!;
  const openLoan = async (quantity: number) => {
    const { loanId } = await call<{ loanId: string }>(`${SERVICE.A}/loans`, "POST", { security: "tMMF", quantity, collateral: "tUSD", ratePercent: "4" });
    await call(`${SERVICE.B}/loans/${loanId}/affirm`, "POST", {});
    await call(`${SERVICE.A}/loans/${loanId}/deliver`, "POST", {});
    await call(`${SERVICE.B}/loans/${loanId}/deliver`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.B, loanId))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
    return loanId;
  };
  const returnAll = async (id: string) => {
    const l = await loanOf(SERVICE.A, id);
    if (l?.state !== "open") return;
    await call(`${SERVICE.B}/loans/${id}/return`, "POST", { quantity: Number(l.quantity) });
    await call(`${SERVICE.A}/loans/${id}/return`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.A, id))?.state, { timeout: STEP_TIMEOUT }).toBe("returned");
  };

  // Setup: both business dates on today; A lends 100,000 tMMF to B against tUSD (the UI path is
  // flow-gmsla-loan-delivery-return).
  await setDate(today);
  const start = await bal();
  const id = await openLoan(100_000);
  const ids = [id];
  try {
    // 1. A recalls 40,000 in its console; the notice is due two business days later and B's service verifies it.
    const due = addBusinessDays(today, 2);
    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`loan-${id}`);
    await rowA.getByLabel("Recall quantity").fill("40000", { timeout: STEP_TIMEOUT });
    await rowA.getByRole("button", { name: "Recall part" }).click();
    await expect(page.getByTestId(`loan-recall-${id}`)).toHaveText(`recall of 40,000 due ${due}`, { timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await loanOf(SERVICE.B, id)).recall, { timeout: 30_000 })
      .toMatchObject({ quantity: "40000", intendedSettlementDate: due, overdue: false, verified: true, recalledQuantity: "40000" });
    await expect(call(`${SERVICE.A}/loans/${id}/recall`, "POST", { quantity: 1 })).rejects.toThrow("already pending");
    await expect(call(`${SERVICE.B}/loans/${id}/recall`, "POST", { quantity: 1 })).rejects.toThrow("only the lender");
    // Nothing moves at the notice.
    const delivered = await bal();
    expect(start.aMmf - delivered.aMmf).toBe(100_000n);

    // 2. B returns the 40,000 recalled in its console (the entry starts at the recalled quantity); A agrees; the recall clears.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`loan-${id}`);
    await expect(page.getByTestId(`loan-recall-${id}`)).toHaveText(`recall of 40,000 due ${due}`, { timeout: STEP_TIMEOUT });
    await rowB.getByRole("button", { name: "Return part" }).click({ timeout: STEP_TIMEOUT });
    await page.goto("/#/live/A");
    await rowA.getByRole("button", { name: /^Agree return of 40,000 tMMF/ }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`loan-quantity-${id}`)).toContainText("60,000 tMMF", { timeout: STEP_TIMEOUT });
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).recall ?? null, { timeout: 30_000 }).toBeNull();
    await expect(rowA.getByLabel("Recall quantity")).toBeVisible();

    // 3. A recalls the rest; past the due date both services and B's console show it overdue.
    const rest = await call<{ intendedSettlementDate: string }>(`${SERVICE.A}/loans/${id}/recall`, "POST", {});
    expect(rest.intendedSettlementDate).toBe(due);
    const late = addBusinessDays(due, 1);
    await setDate(late);
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).recall?.overdue, { timeout: 30_000 }).toBe(true);
    await page.goto("/#/live/B");
    await expect(page.getByTestId(`loan-recall-${id}`)).toHaveText(`recall of 60,000 due ${due} (overdue)`, { timeout: STEP_TIMEOUT });
    // B returns the rest, on the same business date as A; the loan is returned and the recall cleared.
    await returnAll(id);
    expect((await loanOf(SERVICE.A, id)).recall ?? null).toBeNull();
    await setDate(today);
    expect(await bal()).toEqual(start);

    // 4. A recalls a second loan in full and withdraws the recall in its console: nothing moves, the loan stays open.
    const id2 = await openLoan(50_000);
    ids.push(id2);
    const before = await bal();
    await call(`${SERVICE.A}/loans/${id2}/recall`, "POST", {});
    await page.goto("/#/live/A");
    await expect(page.getByTestId(`loan-recall-${id2}`)).toHaveText(`recall of 50,000 due ${due}`, { timeout: STEP_TIMEOUT });
    await page.getByTestId(`loan-${id2}`).getByRole("button", { name: "Withdraw recall" }).click();
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id2)).recall ?? null, { timeout: 30_000 }).toBeNull();
    expect((await loanOf(SERVICE.B, id2)).state).toBe("open");
    expect(await bal()).toEqual(before);
    await expect(call(`${SERVICE.A}/loans/${id2}/recall/withdraw`, "POST", {})).rejects.toThrow("no recall");
    await returnAll(id2);
    expect(await bal()).toEqual(start);
    expect(errors).toEqual([]);
  } finally {
    await setDate(today);
    for (const l of ids) await returnAll(l).catch(() => undefined);
  }
});

// --- flow-gmsla-substitution ---
// The borrower substitutes all the non-cash collateral of a loan with another security (wp-adr-gmsla-substitution): the
// substitute quantity is the loan's required collateral at the feed prices (GmslaRequiredCollateral); the lender's
// service rebuilds the cdm-ext GmslaLoanSubstitution and agrees with the same hash, and one transaction moves the
// substitute to the lender and the collateral held back to the borrower. A refused substitution moves nothing; no
// return can be instructed while one is pending.
test("flow-gmsla-substitution: A lends tMMF to B against tUST -> B asks to substitute tAGY -> A refuses, nothing moves -> B asks again -> A agrees, tAGY in and tUST back in one transaction -> the return redelivers tAGY; every balance restored", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUST = p.tokens.tUST, tAGY = p.tokens.tAGY;
  const today = new Date().toLocaleDateString("en-CA");
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const bal = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUst: await balanceOf(GATEWAY.A, tUST, p.a), bUst: await balanceOf(GATEWAY.A, tUST, p.b),
    aAgy: await balanceOf(GATEWAY.A, tAGY, p.a), bAgy: await balanceOf(GATEWAY.A, tAGY, p.b),
  });
  type SubstitutionView = { collateral: string; collateralAmount: string; verified: boolean; problem?: string };
  type LastSubstitution = { quantity: string; qualification: string; cdmQualifySubstitution: boolean };
  type LoanView = Loan & { substitution?: SubstitutionView; lastSubstitution?: LastSubstitution; marginPercent?: string };
  const loanOf = async (svc: string, id: string) => (await call<{ loans: LoanView[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id)!;
  const returnAll = async (id: string) => {
    const l = await loanOf(SERVICE.A, id);
    if (l?.state !== "open") return;
    if (l.substitution) await call(`${SERVICE.A}/loans/${id}/substitute/refuse`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.B, id)).substitution ?? null, { timeout: 30_000 }).toBeNull();
    await call(`${SERVICE.B}/loans/${id}/return`, "POST", { quantity: Number(l.quantity) });
    await call(`${SERVICE.A}/loans/${id}/return`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.A, id))?.state, { timeout: STEP_TIMEOUT }).toBe("returned");
  };

  // Setup: A lends 100,000 tMMF to B against tUST (the UI path is flow-gmsla-loan-delivery-return).
  const start = await bal();
  const { loanId: id } = await call<{ loanId: string }>(`${SERVICE.A}/loans`, "POST", { security: "tMMF", quantity: 100_000, collateral: "tUST", ratePercent: "0.5" });
  try {
    await call(`${SERVICE.B}/loans/${id}/affirm`, "POST", {});
    await call(`${SERVICE.A}/loans/${id}/deliver`, "POST", {});
    await call(`${SERVICE.B}/loans/${id}/deliver`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.B, id))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
    const opened = await loanOf(SERVICE.A, id);
    const ustHeld = BigInt(opened.collateralAmount);
    // The substitute: 100,000 tMMF at its feed price x the margin / the tAGY feed price, rounded up.
    const margin = BigInt(opened.marginPercent!);
    const value = 100_000n * (await scaledPrice(tMMF)) * margin;
    const agyPrice = (await scaledPrice(tAGY)) * 100n;
    const agyQty = value / agyPrice + (value % agyPrice === 0n ? 0n : 1n);

    // 1. B asks in its console to substitute tAGY; A's service verifies the request; no return meanwhile.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`loan-${id}`);
    await rowB.getByRole("button", { name: "Substitute tAGY" }).click({ timeout: STEP_TIMEOUT });
    const requested = `${Number(agyQty).toLocaleString("en-US")} tAGY for ${Number(ustHeld).toLocaleString("en-US")} tUST requested`;
    await expect(page.getByTestId(`loan-substitution-${id}`)).toHaveText(requested, { timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).substitution, { timeout: 30_000 })
      .toMatchObject({ collateral: "tAGY", collateralAmount: String(agyQty), verified: true });
    await expect(call(`${SERVICE.B}/loans/${id}/return`, "POST", { quantity: 1 })).rejects.toThrow("substitution");
    await expect(call(`${SERVICE.B}/loans/${id}/substitute`, "POST", { collateral: "tAGY" })).rejects.toThrow("already pending");
    await expect(call(`${SERVICE.B}/loans/${id}/substitute/agree`, "POST", {})).rejects.toThrow("only the lender");
    const delivered = await bal();

    // 2. A refuses in its console: nothing moves and the loan keeps its tUST.
    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`loan-${id}`);
    await expect(page.getByTestId(`loan-substitution-${id}`)).toHaveText(requested, { timeout: STEP_TIMEOUT });
    await rowA.getByRole("button", { name: "Refuse substitution" }).click();
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).substitution ?? null, { timeout: 30_000 }).toBeNull();
    expect(await bal()).toEqual(delivered);
    expect((await loanOf(SERVICE.B, id)).collateral).toBe("tUST");

    // 3. B asks again; A agrees in its console: tAGY to A and all the tUST back to B in one transaction.
    await call(`${SERVICE.B}/loans/${id}/substitute`, "POST", { collateral: "tAGY" });
    await page.goto("/#/live/A");
    await rowA.getByRole("button", { name: "Agree substitution" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`loan-collateral-${id}`)).toContainText(`${Number(agyQty).toLocaleString("en-US")} tAGY`, { timeout: STEP_TIMEOUT });
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => {
        const l = await loanOf(svc, id);
        return { collateral: l.collateral, amount: l.collateralAmount, verified: l.verified, pending: l.substitution ?? null, last: l.lastSubstitution };
      }, { timeout: 30_000 }).toMatchObject({ collateral: "tAGY", amount: String(agyQty), verified: true, pending: null,
        last: { quantity: String(agyQty), qualification: "GmslaIsSubstitution", cdmQualifySubstitution: false } });
    }
    const after = await bal();
    expect(after.aAgy - delivered.aAgy).toBe(agyQty);
    expect(delivered.bAgy - after.bAgy).toBe(agyQty);
    expect(after.bUst - delivered.bUst).toBe(ustHeld);
    expect(delivered.aUst - after.aUst).toBe(ustHeld);
    expect(after.aMmf).toBe(delivered.aMmf); // the loaned securities stay with B
    await page.goto("/#/live/B");
    await expect(page.getByTestId(`loan-last-substitution-${id}`)).toContainText(`substituted ${Number(agyQty).toLocaleString("en-US")} tAGY`, { timeout: STEP_TIMEOUT });

    // 4. B returns the loan: A redelivers the tAGY; every balance ends where it started.
    await returnAll(id);
    expect(await bal()).toEqual(start);
    expect(errors).toEqual([]);
  } finally {
    await returnAll(id).catch(() => undefined);
  }
});

// --- flow-gmsla-rebate ---
// The borrower bills the rebate on a loan's cash collateral (wp-adr-gmsla-rebate): the cdm-ext GmslaLoanInvoice covers
// the period from the billed-through date (or the delivery) to the business date, split at each settled return, each
// part accruing CDM's FixedAmount on the cash held (ACT/360), the total rounded to whole tUSD. The lender's service
// rebuilds it over its own loan documents and pays it in tUSD, or refuses it; a returned loan is billed to its return date.
test("flow-gmsla-rebate: A lends tMMF to B against tUSD -> B returns part mid-period -> B bills the rebate over both parts, A pays -> the next invoice starts at the billed-through date, A refuses -> after the full return B bills to the return date, A pays", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUSD = p.tokens.tUSD;
  const iso = (d: Date) => d.toLocaleDateString("en-CA");
  const today = iso(new Date());
  const addDays = (date: string, n: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const d15 = addDays(today, 15), d30 = addDays(today, 30), d40 = addDays(today, 40);
  const setDate = async (date: string) => {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: date });
  };
  const bal = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUsd: await balanceOf(GATEWAY.A, tUSD, p.a), bUsd: await balanceOf(GATEWAY.A, tUSD, p.b),
  });
  type Pending = { amount: string; periodStart?: string; periodEnd: string; verified: boolean; problem?: string; periods?: { notional: string }[] };
  type Billing = { billedThrough?: string | null; pending?: Pending; billable?: { periodStart: string; periodEnd: string }; verified: boolean; problem?: string };
  type LoanView = Loan & { billing?: Billing };
  const loanOf = async (svc: string, id: string) => (await call<{ loans: LoanView[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id)!;
  // The invoice total: the sum of cash held x 4% x days / 360 over the parts, rounded half-up to whole tUSD.
  const rebate = (parts: [bigint, number][]) => {
    const n = parts.reduce((s, [held, days]) => s + held * BigInt(days) * 4n, 0n), d = 36_000n;
    return (2n * n + d) / (2n * d);
  };
  const fmt = (v: bigint) => Number(v).toLocaleString("en-US");
  const returnPart = async (id: string, quantity: number) => {
    await call(`${SERVICE.B}/loans/${id}/return`, "POST", { quantity });
    await call(`${SERVICE.A}/loans/${id}/return`, "POST", {});
  };

  // Setup: A lends 100,000 tMMF to B against tUSD at a 4% rebate, delivered today (the UI path is flow-gmsla-loan-delivery-return).
  await setDate(today);
  const start = await bal();
  const { loanId: id } = await call<{ loanId: string }>(`${SERVICE.A}/loans`, "POST", { security: "tMMF", quantity: 100_000, collateral: "tUSD", ratePercent: "4" });
  try {
    await call(`${SERVICE.B}/loans/${id}/affirm`, "POST", {});
    await call(`${SERVICE.A}/loans/${id}/deliver`, "POST", {});
    await call(`${SERVICE.B}/loans/${id}/deliver`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.B, id))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
    const held0 = BigInt((await loanOf(SERVICE.A, id)).collateralAmount);
    await expect(call(`${SERVICE.A}/loans/${id}/bill`, "POST", {})).rejects.toThrow("the borrower bills");

    // 1. Fifteen days on, B returns 40,000; less cash is held from then on.
    await setDate(d15);
    await returnPart(id, 40_000);
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).quantity, { timeout: STEP_TIMEOUT }).toBe("60000");
    const held1 = BigInt((await loanOf(SERVICE.A, id)).collateralAmount);
    expect(held1 < held0).toBe(true);

    // 2. Thirty days on, B bills in its console: two parts, split at the return; A's service rebuilds the invoice.
    await setDate(d30);
    const first = rebate([[held0, 15], [held1, 15]]);
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`loan-${id}`);
    await rowB.getByRole("button", { name: `Bill rebate ${today} to ${d30}` }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`loan-bill-${id}`)).toContainText(`rebate ${fmt(first)} tUSD for ${today} to ${d30}`, { timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).billing?.pending, { timeout: 30_000 })
      .toMatchObject({ amount: String(first), periodStart: today, periodEnd: d30, verified: true, periods: [{ notional: String(held0) }, { notional: String(held1) }] });
    await expect(call(`${SERVICE.B}/loans/${id}/bill`, "POST", {})).rejects.toThrow("already pending");
    await expect(call(`${SERVICE.B}/loans/${id}/bill/pay`, "POST", {})).rejects.toThrow("does not pay its own");
    const billed = await bal();

    // 3. A pays in its console: the rebate moves in tUSD from A to B and both services show the billed-through date.
    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`loan-${id}`);
    await rowA.getByRole("button", { name: `Pay ${fmt(first)} tUSD` }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`loan-billed-through-${id}`)).toHaveText(`billed through ${d30}`, { timeout: STEP_TIMEOUT });
    for (const svc of [SERVICE.A, SERVICE.B])
      await expect.poll(async () => { const b = (await loanOf(svc, id)).billing; return { through: b?.billedThrough, pending: b?.pending ?? null }; }, { timeout: 30_000 })
        .toEqual({ through: d30, pending: null });
    const paid = await bal();
    expect(billed.aUsd - paid.aUsd).toBe(first);
    expect(paid.bUsd - billed.bUsd).toBe(first);

    // 4. Ten days on, B bills again: the invoice starts at the billed-through date, on the cash kept. A refuses in its
    //    console: nothing moves and the billed-through date stays.
    await setDate(d40);
    const second = rebate([[held1, 10]]);
    const inv = await call<{ periodStart: string; periodEnd: string; amount: string }>(`${SERVICE.B}/loans/${id}/bill`, "POST", {});
    expect(inv).toMatchObject({ periodStart: d30, periodEnd: d40, amount: String(second) });
    await page.goto("/#/live/A");
    await expect(page.getByTestId(`loan-bill-${id}`)).toContainText(`rebate ${fmt(second)} tUSD for ${d30} to ${d40}`, { timeout: STEP_TIMEOUT });
    await rowA.getByRole("button", { name: "Refuse invoice" }).click();
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).billing?.pending ?? null, { timeout: 30_000 }).toBeNull();
    expect(await bal()).toEqual(paid);
    expect((await loanOf(SERVICE.B, id)).billing?.billedThrough).toBe(d30);

    // 5. B returns the rest; the returned loan is billed in B's console to its return date, A pays, and nothing is left to bill.
    await returnPart(id, 60_000);
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).state, { timeout: STEP_TIMEOUT }).toBe("returned");
    await setDate(addDays(d40, 5));
    await page.goto("/#/live/B");
    await rowB.getByRole("button", { name: `Bill rebate ${d30} to ${d40}` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).billing?.pending, { timeout: 30_000 }).toMatchObject({ amount: String(second), verified: true });
    await call(`${SERVICE.A}/loans/${id}/bill/pay`, "POST", {});
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).billing?.billedThrough, { timeout: 30_000 }).toBe(d40);
    await expect(call(`${SERVICE.B}/loans/${id}/bill`, "POST", {})).rejects.toThrow("nothing to bill");
    // The loaned securities and the collateral are back; A paid B the two rebates.
    const end = await bal();
    expect({ aMmf: end.aMmf, bMmf: end.bMmf }).toEqual({ aMmf: start.aMmf, bMmf: start.bMmf });
    expect(start.aUsd - end.aUsd).toBe(first + second);
    expect(end.bUsd - start.bUsd).toBe(first + second);
    expect(errors).toEqual([]);
  } finally {
    await setDate(today);
    const l = await loanOf(SERVICE.A, id).catch(() => undefined);
    if (l?.state === "open") await returnPart(id, Number(l.quantity)).catch(() => undefined);
  }
});

// --- flow-gmsla-lending-fee ---
// The lender bills the lending fee on a loan against securities (wp-adr-gmsla-lending-fee), through the billing of
// flow-gmsla-rebate: the cdm-ext GmslaLoanInvoice of rate type Fee accrues CDM's FixedAmount (0.5%, ACT/360) on the
// loaned quantity outstanding in each part of the period x the loaned security's feed price on the billing date, the
// total rounded to whole tUSD. The borrower's service rebuilds it over its own loan documents and feed and pays it in
// tUSD, or refuses it; a returned loan is billed to its return date.
test("flow-gmsla-lending-fee: A lends tMMF to B against tUST -> B returns part mid-period -> A bills the fee over both parts, B pays -> the next invoice starts at the billed-through date, B refuses -> after the full return A bills to the return date, B pays", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const iso = (d: Date) => d.toLocaleDateString("en-CA");
  const today = iso(new Date());
  const addDays = (date: string, n: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const d15 = addDays(today, 15), d30 = addDays(today, 30), d40 = addDays(today, 40);
  const setDate = async (date: string) => {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: date });
  };
  const bal = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUst: await balanceOf(GATEWAY.A, tUST, p.a), bUst: await balanceOf(GATEWAY.A, tUST, p.b),
    aUsd: await balanceOf(GATEWAY.A, tUSD, p.a), bUsd: await balanceOf(GATEWAY.A, tUSD, p.b),
  });
  type Pending = { amount: string; rateType?: string; price?: string; periodStart?: string; periodEnd: string; verified: boolean; problem?: string; periods?: { quantity?: string }[] };
  type Billing = { billedThrough?: string | null; rateType?: string; pending?: Pending; billable?: { periodStart: string; periodEnd: string }; verified: boolean };
  type LoanView = Loan & { billing?: Billing };
  const loanOf = async (svc: string, id: string) => (await call<{ loans: LoanView[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id)!;
  // The invoice total: the sum of quantity x price x 0.5% x days / 360 over the parts, rounded half-up to whole tUSD.
  // The feed price is scaled by 1e8 (OracleFeed.PRICE_SCALE).
  const fee = (price: bigint, parts: [number, number][]) => {
    const n = parts.reduce((s, [q, days]) => s + BigInt(q) * BigInt(days), 0n) * price * 5n, d = 1000n * 360n * 100_000_000n;
    return (2n * n + d) / (2n * d);
  };
  const fmt = (v: bigint) => Number(v).toLocaleString("en-US");
  const returnPart = async (id: string, quantity: number) => {
    await call(`${SERVICE.B}/loans/${id}/return`, "POST", { quantity });
    await call(`${SERVICE.A}/loans/${id}/return`, "POST", {});
  };

  // Setup: A lends 100,000 tMMF to B against tUST at a 0.5% fee, delivered today (the UI path is flow-gmsla-loan-delivery-return).
  await setDate(today);
  const start = await bal();
  const price = await scaledPrice(tMMF);
  const { loanId: id } = await call<{ loanId: string }>(`${SERVICE.A}/loans`, "POST", { security: "tMMF", quantity: 100_000, collateral: "tUST", ratePercent: "0.5" });
  try {
    await call(`${SERVICE.B}/loans/${id}/affirm`, "POST", {});
    await call(`${SERVICE.A}/loans/${id}/deliver`, "POST", {});
    await call(`${SERVICE.B}/loans/${id}/deliver`, "POST", {});
    await expect.poll(async () => (await loanOf(SERVICE.B, id))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
    await expect(call(`${SERVICE.B}/loans/${id}/bill`, "POST", {})).rejects.toThrow("the lender bills the fee");

    // 1. Fifteen days on, B returns 40,000; 60,000 stay on loan.
    await setDate(d15);
    await returnPart(id, 40_000);
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).quantity, { timeout: STEP_TIMEOUT }).toBe("60000");

    // 2. Thirty days on, A bills in its console: two parts, split at the return, at today's tMMF price; B's service rebuilds it.
    await setDate(d30);
    const first = fee(price, [[100_000, 15], [60_000, 15]]);
    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`loan-${id}`);
    await rowA.getByRole("button", { name: `Bill fee ${today} to ${d30}` }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`loan-bill-${id}`)).toContainText(`fee ${fmt(first)} tUSD for ${today} to ${d30}`, { timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await loanOf(SERVICE.B, id)).billing?.pending, { timeout: 30_000 })
      .toMatchObject({ rateType: "Fee", amount: String(first), periodStart: today, periodEnd: d30, verified: true,
        periods: [{ quantity: "100000" }, { quantity: "60000" }] });
    await expect(call(`${SERVICE.A}/loans/${id}/bill`, "POST", {})).rejects.toThrow("already pending");
    await expect(call(`${SERVICE.A}/loans/${id}/bill/pay`, "POST", {})).rejects.toThrow("does not pay its own");
    const billed = await bal();

    // 3. B pays in its console: the fee moves in tUSD from B to A and both services show the billed-through date.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`loan-${id}`);
    await rowB.getByRole("button", { name: `Pay ${fmt(first)} tUSD` }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`loan-billed-through-${id}`)).toHaveText(`billed through ${d30}`, { timeout: STEP_TIMEOUT });
    for (const svc of [SERVICE.A, SERVICE.B])
      await expect.poll(async () => { const b = (await loanOf(svc, id)).billing; return { through: b?.billedThrough, pending: b?.pending ?? null }; }, { timeout: 30_000 })
        .toEqual({ through: d30, pending: null });
    const paid = await bal();
    expect(billed.bUsd - paid.bUsd).toBe(first);
    expect(paid.aUsd - billed.aUsd).toBe(first);

    // 4. Ten days on, A bills again from the billed-through date on the 60,000 outstanding; B refuses in its console.
    await setDate(d40);
    const second = fee(price, [[60_000, 10]]);
    const inv = await call<{ periodStart: string; periodEnd: string; amount: string }>(`${SERVICE.A}/loans/${id}/bill`, "POST", {});
    expect(inv).toMatchObject({ periodStart: d30, periodEnd: d40, amount: String(second) });
    await page.goto("/#/live/B");
    await expect(page.getByTestId(`loan-bill-${id}`)).toContainText(`fee ${fmt(second)} tUSD for ${d30} to ${d40}`, { timeout: STEP_TIMEOUT });
    await rowB.getByRole("button", { name: "Refuse invoice" }).click();
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).billing?.pending ?? null, { timeout: 30_000 }).toBeNull();
    expect(await bal()).toEqual(paid);

    // 5. B returns the rest; A bills the returned loan in its console to the return date, B pays, nothing is left to bill.
    await returnPart(id, 60_000);
    await expect.poll(async () => (await loanOf(SERVICE.A, id)).state, { timeout: STEP_TIMEOUT }).toBe("returned");
    await setDate(addDays(d40, 5));
    await page.goto("/#/live/A");
    await rowA.getByRole("button", { name: `Bill fee ${d30} to ${d40}` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await loanOf(SERVICE.B, id)).billing?.pending, { timeout: 30_000 }).toMatchObject({ amount: String(second), verified: true });
    await call(`${SERVICE.B}/loans/${id}/bill/pay`, "POST", {});
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await loanOf(svc, id)).billing?.billedThrough, { timeout: 30_000 }).toBe(d40);
    await expect(call(`${SERVICE.A}/loans/${id}/bill`, "POST", {})).rejects.toThrow("nothing to bill");
    // The loaned securities and the collateral are back; B paid A the two fees.
    const end = await bal();
    expect({ aMmf: end.aMmf, bMmf: end.bMmf, aUst: end.aUst, bUst: end.bUst }).toEqual({ aMmf: start.aMmf, bMmf: start.bMmf, aUst: start.aUst, bUst: start.bUst });
    expect(end.aUsd - start.aUsd).toBe(first + second);
    expect(start.bUsd - end.bUsd).toBe(first + second);
    expect(errors).toEqual([]);
  } finally {
    await setDate(today);
    const l = await loanOf(SERVICE.A, id).catch(() => undefined);
    if (l?.state === "open") await returnPart(id, Number(l.quantity)).catch(() => undefined);
  }
});

// --- flow-gmsla-default-close-out ---
// A GMSLA default close-out (wp-adr-gmsla-default-close-out, GMSLA 2010 paragraph 11). B is the non-defaulting party, as
// in flow-repo-default-close-out. A lends 100,000 tMMF to B against tUST at a 0.5% fee, then B lends the same 100,000
// tMMF to A against tUST at 0.8%: the loans offset in tMMF and in tUST, so the close-out, which moves no securities or
// collateral, leaves both parties' holdings where they were, and the net balance is the difference of the fees accrued.
// The spec restores A's default status as it found it.
type LoanCloseOutView = { earlyTerminationDate: string; nonDefaultingParty: string; loans: { loanId: string; lender: string; borrower: string;
  quantity: string; defaultMarketValue: string; collateralValue: string; rateType: string | null; accruedAmount: string }[];
  heldMargin: { holder: string; value: string }[]; netAmount: string; balance: string; payer: string | null };
type LoanDefaultView = { counterpartyInDefault: boolean; inDefault: boolean; automaticEarlyTermination: boolean; openLoans: number;
  preview?: LoanCloseOutView; closeOuts: { closeOutId: string; amount: string; paid: boolean; payer: string | null; toPay: boolean;
  noticeServed: boolean; verified: boolean; problem?: string; statement?: LoanCloseOutView }[] };

test("flow-gmsla-default-close-out: B declares A's default in the console -> Default Notice -> every open loan of the pair closes out at its Default Market Value against the collateral, with the fees accrued; nothing moves -> the party owing the net balance pays it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tMMF = p.tokens.tMMF, tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const iso = (d: Date) => d.toLocaleDateString("en-CA");
  const today = iso(new Date());
  const d10 = (() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + 10); return iso(d); })();
  const setDate = async (date: string) => {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: date });
  };
  const view = (svc: string) => call<LoanDefaultView>(`${svc}/loan-default`);
  const loanOf = async (svc: string, id: string) => (await call<{ loans: Loan[] }>(`${svc}/loans`)).loans.find((l) => l.loanId === id)!;
  const held = async () => ({
    aMmf: await balanceOf(GATEWAY.A, tMMF, p.a), bMmf: await balanceOf(GATEWAY.A, tMMF, p.b),
    aUst: await balanceOf(GATEWAY.A, tUST, p.a), bUst: await balanceOf(GATEWAY.A, tUST, p.b),
  });
  // The fee: quantity x price x rate x days / 360, rounded half-up to whole tUSD; the feed price is scaled by 1e8.
  const fee = (price: bigint, rateBp: bigint, days: bigint) => {
    const n = 100_000n * days * price * rateBp, d = 10_000n * 360n * 100_000_000n;
    return (2n * n + d) / (2n * d);
  };
  const lend = async (lender: string, borrower: string, ratePercent: string) => {
    const { loanId } = await call<{ loanId: string }>(`${lender}/loans`, "POST", { security: "tMMF", quantity: 100_000, collateral: "tUST", ratePercent });
    await call(`${borrower}/loans/${loanId}/affirm`, "POST", {});
    await call(`${lender}/loans/${loanId}/deliver`, "POST", {});
    await call(`${borrower}/loans/${loanId}/deliver`, "POST", {});
    await expect.poll(async () => (await loanOf(lender, loanId))?.state, { timeout: STEP_TIMEOUT }).toBe("open");
    return loanId;
  };
  const returnAll = async (id: string, borrower: string, lender: string) => {
    await call(`${borrower}/loans/${id}/return`, "POST", { quantity: 100_000 }).catch(() => undefined);
    await call(`${lender}/loans/${id}/return`, "POST", {}).catch(() => undefined);
  };

  const aWasInDefault = (await call<{ inDefault: boolean }>(`${GATEWAY.B}/defaults/${p.a}`)).inDefault;
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.b}`)).inDefault).toBe(false);
  await setDate(today);
  const start = await held();
  const l1 = await lend(SERVICE.A, SERVICE.B, "0.5"); // A lends to B
  let l2: string | undefined, closedOut = false;
  try {
    l2 = await lend(SERVICE.B, SERVICE.A, "0.8"); // B lends the same tMMF to A
    await setDate(d10);
    const price = await scaledPrice(tMMF);
    const before = await view(SERVICE.B);
    expect(before.inDefault).toBe(false);
    expect(before.automaticEarlyTermination).toBe(false); // the baseline GMSLA: a Default Notice is served
    const preview = before.preview!;
    const value = (s: LoanCloseOutView, id: string) => s.loans.find((l) => l.loanId === id)!;
    const v1 = value(preview, l1), v2 = value(preview, l2);
    expect(v1).toMatchObject({ lender: "BANK-A", borrower: "BANK-B", quantity: "100000", rateType: "Fee", accruedAmount: String(fee(price, 50n, 10n)) });
    expect(v2).toMatchObject({ lender: "BANK-B", borrower: "BANK-A", quantity: "100000", rateType: "Fee", accruedAmount: String(fee(price, 80n, 10n)) });
    expect(v2.defaultMarketValue).toBe(v1.defaultMarketValue);
    expect(v2.collateralValue).toBe(v1.collateralValue);
    // From B's side: loan 1 gives -(DMV - collateral + fee 1), loan 2 +(DMV - collateral + fee 2); margin held is owed back
    // by its holder; loans left open by an interrupted earlier run are closed out too.
    const nd = preview.nonDefaultingParty;
    const side = (l: LoanCloseOutView["loans"][number]) => {
      const lenderSide = Number(l.defaultMarketValue) - Number(l.collateralValue) + (l.rateType === "Fee" ? 1 : -1) * Number(l.accruedAmount);
      return l.lender === nd ? lenderSide : -lenderSide;
    };
    const margin = preview.heldMargin.reduce((sum, m) => sum + (m.holder === nd ? -Number(m.value) : Number(m.value)), 0);
    const others = preview.loans.filter((l) => l.loanId !== l1 && l.loanId !== l2).reduce((sum, l) => sum + side(l), 0);
    expect(side(v1) + side(v2)).toBe(Number(fee(price, 80n, 10n) - fee(price, 50n, 10n)));
    expect(Number(preview.netAmount)).toBe(side(v1) + side(v2) + margin + others);
    const opened = await held();
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.A, tUSD, p.b);

    // 1. B declares A's default and closes out in its console: the oracle records the default (if not already), B serves
    // the Default Notice on-chain, then records the statement and the balance; both loans close out, nothing moves.
    await page.goto("/#/live/B");
    await page.getByTestId("loan-default-close-out").click({ timeout: STEP_TIMEOUT });
    for (const id of [l1, l2]) await expect.poll(async () => (await loanOf(SERVICE.A, id))?.state, { timeout: 60_000 }).toBe("closedOut");
    closedOut = true;
    for (const gw of [GATEWAY.A, GATEWAY.B]) expect((await call<{ inDefault: boolean }>(`${gw}/defaults/${p.a}`)).inDefault).toBe(true);
    expect(await held()).toEqual(opened);

    // 2. Both services rebuild the statement from their own loan documents and agree; the defaulting party is offered no close-out.
    await expect.poll(async () => (await view(SERVICE.A)).closeOuts[0]?.verified, { timeout: 30_000 }).toBe(true);
    const a = await view(SERVICE.A), b = await view(SERVICE.B);
    expect(a.inDefault).toBe(true);
    expect(a.preview).toBeUndefined();
    const coA = a.closeOuts[0], coB = b.closeOuts[0];
    expect(coA.closeOutId).toBe(coB.closeOutId);
    expect(coB.verified).toBe(true);
    expect(coB.noticeServed).toBe(true);
    expect(coB.statement!.balance).toBe(preview.balance);
    expect(coB.amount).toBe(preview.balance);

    // 3. The party owing the balance pays it in its console.
    const amount = BigInt(coB.amount);
    if (amount > 0n) {
      const payerSvc = coB.payer === "A" ? "A" : "B";
      await page.goto(`/#/live/${payerSvc}`);
      await page.getByTestId(`loan-closeout-${coB.closeOutId}`).getByRole("button", { name: `Pay USD ${coB.amount}` }).click({ timeout: STEP_TIMEOUT });
      await expect.poll(async () => (await view(SERVICE.B)).closeOuts[0].paid, { timeout: 60_000 }).toBe(true);
      const sign = payerSvc === "A" ? -1n : 1n;
      expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + sign * amount);
      expect(await balanceOf(GATEWAY.A, tUSD, p.b)).toBe(bUsd - sign * amount);
    } else {
      expect(coB.paid).toBe(true);
    }
    // The two loans offset: each party holds the tMMF and tUST it held before the spec.
    expect(await held()).toEqual(start);
    expect(errors).toEqual([]);
  } finally {
    if (!closedOut) {
      if (l2) await returnAll(l2, SERVICE.A, SERVICE.B);
      await returnAll(l1, SERVICE.B, SERVICE.A);
    }
    if (!aWasInDefault) await call(`${ORACLE}/defaults`, "POST", { party: p.a, inDefault: false, notifiedBy: "e2e restore" });
    await setDate(today);
  }
});

// --- flow-triparty-terms (task-triparty-terms-profile, wp-adr-triparty-terms-profile) ---

const SERVICE_T = "http://localhost:8003/api/v1";
type TripartyTermsView = {
  termsId: string; state: string; giver: string; receiver: string; agent: string; termsHash: string;
  receiverAffirmed: boolean; agentAffirmed: boolean; verified: boolean; problem: string | null;
  terms?: { giver: string; receiver: string; agent: string; gmraTermsHash: string; baseCurrency: string; effectiveDate: string;
    profile: { isin: string; token?: string; eligible: boolean; haircutBps: number | null; concentrationLimit: string | null }[] };
  canAffirm: boolean; canRefuse: boolean; canTerminate: boolean;
};
type TripartyView = { party: string; agent: boolean; canPropose: boolean; terms: TripartyTermsView[] };

test("flow-triparty-terms: A proposes triparty terms in its console naming B and the agent BANK-T -> B and T each check the document and affirm -> the terms are in effect on-chain and in all three services -> A terminates them; a proposal the agent refuses never takes effect", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);

  // Setup: close A-giver terms a failed earlier run left open, so A can propose. (A also receives under the B-giver
  // terms of flow-triparty-trade-start, which stay in effect while their repo is open.)
  for (const t of (await call<TripartyView>(`${SERVICE.A}/triparty`)).terms.filter((x) => x.giver === "A")) {
    if (t.state === "proposed") await call(`${SERVICE.A}/triparty/terms/${t.termsId}/refuse`, "POST", {});
    if (t.state === "effective") await call(`${SERVICE.A}/triparty/terms/${t.termsId}/terminate`, "POST", {});
  }
  await expect.poll(async () => (await call<TripartyView>(`${SERVICE.A}/triparty`)).canPropose, { timeout: 60_000 }).toBe(true);
  const known = new Set((await call<TripartyView>(`${SERVICE_T}/triparty`)).terms.map((t) => t.termsId));

  // 1. A, the giver, proposes the baseline terms in its console.
  await page.goto("/#/live/A");
  const cardA = page.getByTestId("triparty");
  await cardA.getByRole("button", { name: "Propose triparty terms (giver BANK-A, agent BANK-T)" }).click({ timeout: STEP_TIMEOUT });
  let id = "";
  await expect
    .poll(async () => {
      const t = (await call<TripartyView>(`${SERVICE_T}/triparty`)).terms.find((x) => !known.has(x.termsId));
      id = t?.termsId ?? "";
      return t?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("proposed");

  // 2. B, the receiver, checks the document (and the GMRA terms it names) and affirms in its console.
  await page.goto("/#/live/B");
  const rowB = page.getByTestId(`triparty-terms-${id}`);
  await expect(rowB.getByText("terms checked against this party's own build ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Affirm triparty terms" }).click();
  await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.A}/triparty/terms/${id}`)).receiverAffirmed, { timeout: 60_000 }).toBe(true);
  expect((await call<TripartyTermsView>(`${GATEWAY.A}/triparty/terms/${id}`)).state).toBe("proposed");

  // 3. The agent BANK-T checks the document and affirms in its own console; the terms take effect.
  await page.goto("/#/live/T");
  const rowT = page.getByTestId(`triparty-terms-${id}`);
  await expect(page.getByText("BANK-T · Triparty Agent")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowT.getByText("terms checked against this party's own build ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowT.getByTestId("triparty-profile-tAGY")).toContainText("at most 50% of the Purchase Price");
  await rowT.getByRole("button", { name: "Affirm triparty terms" }).click();
  await expect(rowT.getByText("in effect on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // All three services show the same terms in effect, checked, with the baseline profile; the chain agrees.
  const views: TripartyTermsView[] = [];
  for (const svc of [SERVICE.A, SERVICE.B, SERVICE_T]) {
    await expect
      .poll(async () => {
        const t = (await call<TripartyView>(`${svc}/triparty`)).terms.find((x) => x.termsId === id);
        return t?.state === "effective" && t.verified ? true : (t?.problem ?? t?.state ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
    views.push((await call<TripartyView>(`${svc}/triparty`)).terms.find((x) => x.termsId === id)!);
  }
  expect(new Set(views.map((v) => v.termsHash)).size).toBe(1);
  expect(views[0].terms).toEqual(views[2].terms);
  expect(views[0].terms).toMatchObject({ giver: "BANK-A", receiver: "BANK-B", agent: "BANK-T", baseCurrency: "USD" });
  expect(views[0].terms!.profile.map((e) => [e.token, e.haircutBps, e.concentrationLimit])).toEqual([["tUST", 200, null], ["tAGY", 300, "0.5"]]);
  expect(views[0]).toMatchObject({ giver: "A", receiver: "B", agent: "T" });
  const onChain = await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`);
  expect(onChain).toMatchObject({ state: "effective", termsHash: views[0].termsHash, receiverAffirmed: true, agentAffirmed: true });
  // One set in effect per giver, receiver and agent: A cannot propose another.
  expect((await call<TripartyView>(`${SERVICE.A}/triparty`)).canPropose).toBe(false);

  // 4. A terminates the terms in its console; nothing is open again.
  await page.goto("/#/live/A");
  const rowA = page.getByTestId(`triparty-terms-${id}`);
  await rowA.getByRole("button", { name: "Terminate triparty terms" }).click({ timeout: STEP_TIMEOUT });
  await expect(page.getByTestId(`triparty-terms-${id}`)).toHaveCount(0, { timeout: STEP_TIMEOUT });
  expect((await call<TripartyTermsView>(`${GATEWAY.A}/triparty/terms/${id}`)).state).toBe("terminated");

  // 5. A proposal the agent refuses never takes effect, and A can propose again.
  const { termsId } = await call<{ termsId: string }>(`${SERVICE.A}/triparty/terms`, "POST", {});
  await expect.poll(async () => (await call<TripartyView>(`${SERVICE_T}/triparty`)).terms.find((x) => x.termsId === termsId)?.canRefuse ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE_T}/triparty/terms/${termsId}/refuse`, "POST", {});
  await expect(call(`${SERVICE.B}/triparty/terms/${termsId}/affirm`, "POST", {})).rejects.toThrow(/not proposed/);
  expect((await call<TripartyTermsView>(`${GATEWAY.A}/triparty/terms/${termsId}`)).state).toBe("refused");
  await expect.poll(async () => (await call<TripartyView>(`${SERVICE.A}/triparty`)).canPropose, { timeout: 60_000 }).toBe(true);
});

// --- flow-triparty-trade-start (task-triparty-trade-start, wp-adr-triparty-trade-start) ---

type TripartyAllocationView = {
  covers: boolean; requiredValue: string; allocatedValue: string; cdmRepo: boolean;
  positions: { isin: string; token?: string; units: number; unitPrice: string; haircutBps: number; valueAfterHaircuts: string; share: string }[];
};
type TripartyRepoView = {
  repoId: string; state: string; purchasePrice: number; requestHash: string; tradeId?: string; requestVerified: boolean; requestProblem: string | null;
  allocationHash?: string; allocation?: TripartyAllocationView; allocationVerified?: boolean; allocationProblem?: string | null;
  canAffirm: boolean; canAllocate: boolean; canRefuseAllocation: boolean; canSettle: boolean; canCancel: boolean;
};
type TripartyTradeTermsView = TripartyTermsView & {
  canDeposit?: boolean; canRequest?: boolean; free?: { token: string; amount: number; rank: number }[]; repos?: TripartyRepoView[];
};
const tripartyTermsOf = async (svc: string, id: string) =>
  (await call<{ terms: TripartyTradeTermsView[] }>(`${svc}/triparty`)).terms.find((x) => x.termsId === id);
const tripartyRepoOf = async (svc: string, id: string, repoId: string) => (await tripartyTermsOf(svc, id))?.repos?.find((r) => r.repoId === repoId);

test("flow-triparty-trade-start: B deposits 2,000 tUST and 4,000 tAGY with BANK-T and requests a 500,000 tUSD repo -> A affirms the request -> T cannot cover it within the 50% tAGY limit and allocates nothing -> B deposits 1,000 tUST more -> T allocates 3,000 tUST and 2,190 tAGY and books the CDM repo -> A and B each recompute the allocation and A settles the purchase in one transaction -> B withdraws its free tAGY", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens.tUST, tAGY = p.tokens.tAGY, tUSD = p.tokens.tUSD;
  // The numbers below follow the feed prices the stack starts with (tUST 98.40, tAGY 99.20; 8 decimals).
  expect([await scaledPrice(tUST), await scaledPrice(tAGY)]).toEqual([9_840_000_000n, 9_920_000_000n]);

  // Setup: B-giver terms in effect (made through the services when an earlier run left none; flow-triparty-terms
  // shows that path in the consoles); repos a failed run left before settlement are cancelled; free deposits withdrawn.
  const giverTerms = async () => (await call<{ terms: TripartyTradeTermsView[] }>(`${SERVICE.B}/triparty`)).terms.filter((t) => t.giver === "B");
  for (const t of await giverTerms()) if (t.state === "proposed") await call(`${SERVICE.B}/triparty/terms/${t.termsId}/refuse`, "POST", {});
  let id = (await giverTerms()).find((t) => t.state === "effective")?.termsId ?? "";
  if (!id) {
    ({ termsId: id } = await call<{ termsId: string }>(`${SERVICE.B}/triparty/terms`, "POST", {}));
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await tripartyTermsOf(svc, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/triparty/terms/${id}/affirm`, "POST", {});
    }
    await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`)).state, { timeout: 60_000 }).toBe("effective");
  }
  for (const r of (await tripartyTermsOf(SERVICE.B, id))?.repos ?? []) if (r.canCancel) await call(`${SERVICE.B}/triparty/repos/${r.repoId}/cancel`, "POST", {});
  for (const h of (await tripartyTermsOf(SERVICE.B, id))?.free ?? []) if (h.amount > 0) await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: h.token });
  const known = new Set(((await tripartyTermsOf(SERVICE.B, id))?.repos ?? []).map((r) => r.repoId));
  const before = {
    bUst: await balanceOf(GATEWAY.B, tUST, p.b), bAgy: await balanceOf(GATEWAY.B, tAGY, p.b),
    bUsd: await balanceOf(GATEWAY.B, tUSD, p.b), aUsd: await balanceOf(GATEWAY.A, tUSD, p.a),
  };

  // 1. B, the giver, deposits 2,000 tUST ranked first and 4,000 tAGY ranked second in its console, and requests the repo.
  await page.goto("/#/live/B");
  const rowB = page.getByTestId(`triparty-terms-${id}`);
  const deposit = async (token: string, amount: number, rank: number, shown: string) => {
    await rowB.getByTestId("triparty-deposit-token").selectOption(token, { timeout: STEP_TIMEOUT });
    await rowB.getByTestId("triparty-deposit-amount").fill(String(amount));
    await rowB.getByTestId("triparty-deposit-rank").fill(String(rank));
    await rowB.getByRole("button", { name: "Deposit with BANK-T" }).click();
    await expect(rowB.getByTestId(`triparty-free-${token}`).locator("td").nth(1)).toHaveText(shown, { timeout: STEP_TIMEOUT });
  };
  await deposit("tUST", 2_000, 1, "2000");
  await deposit("tAGY", 4_000, 2, "4000");
  await rowB.getByTestId("triparty-request-price").fill("500000");
  await rowB.getByRole("button", { name: "Request triparty repo" }).click();
  let repoId = "";
  await expect
    .poll(async () => {
      const r = (await tripartyTermsOf(SERVICE.B, id))?.repos?.find((x) => !known.has(x.repoId));
      repoId = r?.repoId ?? "";
      return r?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("requested");

  // 2. A, the receiver, checks the request against the chain and affirms it in its console.
  await page.goto("/#/live/A");
  const repoA = page.getByTestId(`triparty-repo-${repoId}`);
  await expect(repoA.getByText("request checked ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await repoA.getByRole("button", { name: "Affirm triparty repo request" }).click();
  await expect.poll(async () => (await call<{ state: string }>(`${GATEWAY.A}/triparty/repos/${repoId}`)).state, { timeout: 60_000 }).toBe("affirmed");

  // 3. The agent allocates in its console. 2,000 tUST (192,864 after haircut) and tAGY capped at 2,598 units
  //    (249,989.95, within 50% of the Purchase Price) cannot cover 500,000: nothing is allocated on-chain.
  await page.goto("/#/live/T");
  const repoT = page.getByTestId(`triparty-repo-${repoId}`);
  await repoT.getByRole("button", { name: "Allocate collateral" }).click({ timeout: STEP_TIMEOUT });
  await expect(repoT.getByTestId("triparty-allocation-covers")).toContainText("cannot cover the Purchase Price", { timeout: STEP_TIMEOUT });
  const short = await call<{ state: string; allocation: unknown[] }>(`${GATEWAY.A}/triparty/repos/${repoId}`);
  expect([short.state, short.allocation]).toEqual(["affirmed", []]);

  // 4. B deposits 1,000 tUST more in its console.
  await page.goto("/#/live/B");
  await deposit("tUST", 1_000, 1, "3000");

  // 5. The agent allocates again: 3,000 tUST (289,296) and 2,190 tAGY (210,730.56, 42.15% of the Purchase Price),
  //    and books the CDM repo with one collateral position per asset.
  await page.goto("/#/live/T");
  await repoT.getByRole("button", { name: "Allocate collateral" }).click({ timeout: STEP_TIMEOUT });
  await expect(repoT.getByTestId("triparty-allocation-covers")).toContainText("covers the Purchase Price after haircuts ✓", { timeout: STEP_TIMEOUT });
  await expect(repoT.getByTestId("triparty-allocation-tUST")).toContainText("3000");
  await expect(repoT.getByTestId("triparty-allocation-tAGY")).toContainText("2190");
  await expect(repoT.getByTestId("triparty-allocation-tAGY")).toContainText("42.15%");
  const allocated = await call<{ state: string; allocation: { token: string; amount: string }[] }>(`${GATEWAY.B}/triparty/repos/${repoId}`);
  expect(allocated.state).toBe("allocated");
  expect(allocated.allocation.map((a) => [a.token.toLowerCase(), String(a.amount)])).toEqual([[tUST.toLowerCase(), "3000"], [tAGY.toLowerCase(), "2190"]]);

  // 6. A and B each recompute the allocation from the terms, the request, B's free account and the feed prices; A
  //    settles the purchase in its console: 500,000 tUSD to B and the allocated tokens to the repo's account, at once.
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const r = await tripartyRepoOf(svc, id, repoId);
        return r?.allocationVerified ? true : (r?.allocationProblem ?? r?.state ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
  }
  await page.goto("/#/live/A");
  await repoA.getByRole("button", { name: "Settle purchase against the allocation" }).click({ timeout: STEP_TIMEOUT });
  await expect(repoA.getByText("purchase settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(before.bUsd + 500_000n);
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(before.aUsd - 500_000n);
  const free = await call<{ token: string; amount: string }[]>(`${GATEWAY.B}/triparty/terms/${id}/free`);
  expect(free.map((h) => [h.token.toLowerCase(), String(h.amount)])).toEqual([[tUST.toLowerCase(), "0"], [tAGY.toLowerCase(), "1810"]]);

  // The three services show the same settled repo with the same allocation; it carries the CDM repo.
  const views: TripartyRepoView[] = [];
  for (const svc of [SERVICE.A, SERVICE.B, SERVICE_T]) {
    await expect.poll(async () => (await tripartyRepoOf(svc, id, repoId))?.state, { timeout: 60_000 }).toBe("settled");
    views.push((await tripartyRepoOf(svc, id, repoId))!);
  }
  expect(new Set(views.map((v) => v.allocationHash)).size).toBe(1);
  expect(views[0].allocation).toEqual(views[2].allocation);
  expect(views[0].allocation).toMatchObject({ covers: true, requiredValue: "500000", allocatedValue: "500026.56", cdmRepo: true });
  expect(views[0].allocationVerified && views[1].allocationVerified).toBe(true);

  // 7. B withdraws its free tAGY in its console; the allocated collateral stays with the agent for A.
  await page.goto("/#/live/B");
  await rowB.getByRole("button", { name: "Withdraw free tAGY" }).click({ timeout: STEP_TIMEOUT });
  await expect(rowB.getByTestId("triparty-free-tAGY").locator("td").nth(1)).toHaveText("0", { timeout: STEP_TIMEOUT });
  expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(before.bUst - 3_000n);
  expect(await balanceOf(GATEWAY.B, tAGY, p.b)).toBe(before.bAgy - 2_190n);
  // The terms cannot be terminated while the repo is open (trade end, task-triparty-trade-end, closes it).
  await expect(call(`${SERVICE.B}/triparty/terms/${id}/terminate`, "POST", {})).rejects.toThrow(/repos open/);
});

// --- flow-triparty-revaluation (task-triparty-revaluation, wp-adr-triparty-revaluation) ---
// The agent revalues a settled triparty repo at the feed prices against the Repurchase Price accrued to its business
// date, and moves the difference between the giver's free account and the repo on TripartySettlement in one
// transaction. The giver and the receiver recompute each revaluation from the chain at the block before it. The tUST
// and tAGY prices and the agent's business date are restored at the end either way.

type TripartyRevaluationView = {
  revaluationHash: string; block: string; verified: boolean; problem: string | null;
  revaluation?: { outcome: string; requiredValue: string; valueBefore: string; valueAfter: string; movements: { token?: string; units: number; direction: string }[] };
};

test("flow-triparty-revaluation: B repos 500,000 tUSD to A through BANK-T with 1,810 tAGY left free -> three days on tUST falls to 96 and tAGY to 97 -> T revalues and tops up 127 tAGY from B's free account -> A and B recompute it from the chain -> tAGY rises to 101 and tUST returns to 98.40 -> T releases 164 tAGY -> both recompute it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens.tUST, tAGY = p.tokens.tAGY;
  expect([await scaledPrice(tUST), await scaledPrice(tAGY)]).toEqual([9_840_000_000n, 9_920_000_000n]);
  const scaled = (usd: string) => BigInt(Math.round(Number(usd) * 100)) * 1_000_000n;
  const setPrice = async (symbol: "tUST" | "tAGY", usd: string) => {
    await call(`${ORACLE}/market-data/${symbol}`, "PUT", { price: usd });
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${p.tokens[symbol]}`)).price, { timeout: 30_000 }).toBe(String(scaled(usd)));
    }
  };

  // Setup through the services (flow-triparty-trade-start shows these steps in the consoles): B-giver terms in effect,
  // repos a failed run left before settlement cancelled, free deposits withdrawn; then the trade-start repo, settled.
  const giverTerms = async () => (await call<{ terms: TripartyTradeTermsView[] }>(`${SERVICE.B}/triparty`)).terms.filter((t) => t.giver === "B");
  for (const t of await giverTerms()) if (t.state === "proposed") await call(`${SERVICE.B}/triparty/terms/${t.termsId}/refuse`, "POST", {});
  let id = (await giverTerms()).find((t) => t.state === "effective")?.termsId ?? "";
  if (!id) {
    ({ termsId: id } = await call<{ termsId: string }>(`${SERVICE.B}/triparty/terms`, "POST", {}));
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await tripartyTermsOf(svc, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/triparty/terms/${id}/affirm`, "POST", {});
    }
    await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`)).state, { timeout: 60_000 }).toBe("effective");
  }
  for (const r of (await tripartyTermsOf(SERVICE.B, id))?.repos ?? []) if (r.canCancel) await call(`${SERVICE.B}/triparty/repos/${r.repoId}/cancel`, "POST", {});
  for (const h of (await tripartyTermsOf(SERVICE.B, id))?.free ?? []) if (h.amount > 0) await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: h.token });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tUST", amount: 3000, rank: 1 });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tAGY", amount: 4000, rank: 2 });
  const { repoId } = await call<{ repoId: string }>(`${SERVICE.B}/triparty/terms/${id}/repos`, "POST", { purchasePrice: 500000 });
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE_T, id, repoId))?.canAllocate ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE_T}/triparty/repos/${repoId}/allocate`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canSettle ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/settle`, "POST", {});
  await expect.poll(async () => (await call<{ state: string }>(`${GATEWAY.A}/triparty/repos/${repoId}`)).state, { timeout: 60_000 }).toBe("settled");
  const held = async () => (await call<{ allocation: { token: string; amount: string }[] }>(`${GATEWAY.B}/triparty/repos/${repoId}`)).allocation
    .map((a) => [a.token.toLowerCase(), String(a.amount)]);
  const freeAgy = async () => String((await call<{ token: string; amount: string }[]>(`${GATEWAY.B}/triparty/terms/${id}/free`))
    .find((h) => h.token.toLowerCase() === tAGY.toLowerCase())!.amount);
  expect(await held()).toEqual([[tUST.toLowerCase(), "3000"], [tAGY.toLowerCase(), "2190"]]);
  expect(await freeAgy()).toBe("1810");
  const revaluationsOf = async (svc: string) => ((await tripartyRepoOf(svc, id, repoId)) as unknown as { revaluations?: TripartyRevaluationView[] })?.revaluations ?? [];
  const recomputed = async (n: number) => {
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect
        .poll(async () => {
          const rs = await revaluationsOf(svc);
          return rs.length === n && rs[n - 1].verified ? true : (rs[n - 1]?.problem ?? rs.length);
        }, { timeout: 60_000 })
        .toBe(true);
    }
  };

  const purchaseDate = (await tripartyRepoOf(SERVICE.B, id, repoId) as unknown as { purchaseDate: string }).purchaseDate;
  const agentDate = (await call<{ businessDate: string }>(`${SERVICE_T}/business-date`)).businessDate;
  const day3 = new Date(Date.parse(`${purchaseDate}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  try {
    // 1. Three days on, tUST falls to 96.00 and tAGY to 97.00. The required value is 500,208.33; the holding is worth
    //    488,297.10 after haircuts. The agent revalues in its console and tops up 127 of B's free tAGY.
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: day3 });
    await setPrice("tUST", "96.0");
    await setPrice("tAGY", "97.0");
    await page.goto("/#/live/T");
    const repoT = page.getByTestId(`triparty-repo-${repoId}`);
    await repoT.getByRole("button", { name: "Revalue collateral" }).click({ timeout: STEP_TIMEOUT });
    const latestT = repoT.getByTestId("triparty-revaluation-latest");
    await expect(latestT.getByTestId("triparty-revaluation-outcome")).toContainText("topped up from the giver's free account", { timeout: STEP_TIMEOUT });
    await expect(latestT.getByTestId("triparty-revaluation-move-tAGY")).toContainText("+127 tAGY");
    await expect(latestT).toContainText("488,297.1 after haircuts for 500,208.33 required");
    expect(await held()).toEqual([[tUST.toLowerCase(), "3000"], [tAGY.toLowerCase(), "2317"]]);
    expect(await freeAgy()).toBe("1683");

    // 2. A and B each recompute the revaluation from the chain at the block before it; A's console shows it checked.
    await recomputed(1);
    await page.goto("/#/live/A");
    const latestA = page.getByTestId(`triparty-repo-${repoId}`).getByTestId("triparty-revaluation-latest");
    await expect(latestA.getByTestId("triparty-revaluation-verified")).toContainText("recomputed from the chain ✓", { timeout: STEP_TIMEOUT });
    const first = (await revaluationsOf(SERVICE.A))[0];
    expect(first.revaluation).toMatchObject({ outcome: "TopUp", requiredValue: "500208.33", valueBefore: "488297.1", valueAfter: "500246.53" });

    // 3. tAGY rises to 101.00 and tUST returns to 98.40: 516,292.49 after haircuts, 16,084.16 above the required
    //    value. The agent revalues again and releases 164 tAGY to B's free account.
    await setPrice("tUST", "98.4");
    await setPrice("tAGY", "101.0");
    await page.goto("/#/live/T");
    await repoT.getByRole("button", { name: "Revalue collateral" }).click({ timeout: STEP_TIMEOUT });
    await expect(latestT.getByTestId("triparty-revaluation-outcome")).toContainText("excess released to the giver's free account", { timeout: STEP_TIMEOUT });
    await expect(latestT.getByTestId("triparty-revaluation-move-tAGY")).toContainText("−164 tAGY");
    expect(await held()).toEqual([[tUST.toLowerCase(), "3000"], [tAGY.toLowerCase(), "2153"]]);
    expect(await freeAgy()).toBe("1847");
    await recomputed(2);
    const both = await revaluationsOf(SERVICE.B);
    expect(both.map((r) => r.revaluation?.outcome)).toEqual(["TopUp", "Release"]);
    expect(Number(both[1].block)).toBeGreaterThan(Number(both[0].block));
    const onChain = await call<{ hash: string; kind: string }[]>(`${GATEWAY.A}/triparty/repos/${repoId}/changes`);
    expect(onChain.map((r) => r.kind)).toEqual(["revaluation", "revaluation"]);
    expect(onChain.map((r) => r.hash)).toEqual(both.map((r) => r.revaluationHash));
  } finally {
    await setPrice("tUST", "98.4");
    await setPrice("tAGY", "99.2");
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: agentDate });
  }
  // B withdraws its free tAGY; the repo stays open with the agent until trade end (task-triparty-trade-end).
  await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: "tAGY" });
  expect(await freeAgy()).toBe("0");
});

// --- flow-triparty-substitution (task-triparty-substitution, wp-adr-triparty-substitution) ---
// The giver recalls units of an asset from a settled triparty repo; the agent returns them to the giver's free account
// and replaces them from it, without the returned asset, until the repo is covered again, or declines. The giver and the
// receiver recompute each substitution from the chain at the block before it. The agent's business date is set to the
// Purchase Date (required value 500,000) and restored at the end.

type TripartySubstitutionView = {
  substitutionHash: string; block: string; verified: boolean; problem: string | null;
  substitution?: { outcome: string; units: number; valueAfter: string; movements: { token?: string; units: number; direction: string }[]; workflowSteps: number };
};

test("flow-triparty-substitution: B repos 500,000 tUSD to A through BANK-T and deposits 1,500 tUST more -> B asks for 1,000 tAGY back in its console -> T substitutes 998 tUST from B's free account -> A and B recompute it from the chain -> B asks for the other 1,190 tAGY -> T declines: B's free tUST cannot replace them -> both recompute the decline", async ({ page }) => {
  // Two requests on top of a settled repo; after a service restart each party also rechecks the earlier changes.
  test.setTimeout(2 * TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens.tUST, tAGY = p.tokens.tAGY;
  expect([await scaledPrice(tUST), await scaledPrice(tAGY)]).toEqual([9_840_000_000n, 9_920_000_000n]);

  // Setup through the services, as in flow-triparty-revaluation: B-giver terms in effect, a settled trade-start repo.
  const giverTerms = async () => (await call<{ terms: TripartyTradeTermsView[] }>(`${SERVICE.B}/triparty`)).terms.filter((t) => t.giver === "B");
  for (const t of await giverTerms()) if (t.state === "proposed") await call(`${SERVICE.B}/triparty/terms/${t.termsId}/refuse`, "POST", {});
  let id = (await giverTerms()).find((t) => t.state === "effective")?.termsId ?? "";
  if (!id) {
    ({ termsId: id } = await call<{ termsId: string }>(`${SERVICE.B}/triparty/terms`, "POST", {}));
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await tripartyTermsOf(svc, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/triparty/terms/${id}/affirm`, "POST", {});
    }
    await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`)).state, { timeout: 60_000 }).toBe("effective");
  }
  for (const r of (await tripartyTermsOf(SERVICE.B, id))?.repos ?? []) if (r.canCancel) await call(`${SERVICE.B}/triparty/repos/${r.repoId}/cancel`, "POST", {});
  for (const h of (await tripartyTermsOf(SERVICE.B, id))?.free ?? []) if (h.amount > 0) await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: h.token });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tUST", amount: 3000, rank: 1 });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tAGY", amount: 4000, rank: 2 });
  const { repoId } = await call<{ repoId: string }>(`${SERVICE.B}/triparty/terms/${id}/repos`, "POST", { purchasePrice: 500000 });
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE_T, id, repoId))?.canAllocate ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE_T}/triparty/repos/${repoId}/allocate`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canSettle ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/settle`, "POST", {});
  await expect.poll(async () => (await call<{ state: string }>(`${GATEWAY.A}/triparty/repos/${repoId}`)).state, { timeout: 60_000 }).toBe("settled");
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tUST", amount: 1500, rank: 1 });
  const held = async () => (await call<{ allocation: { token: string; amount: string }[] }>(`${GATEWAY.B}/triparty/repos/${repoId}`)).allocation
    .map((a) => [a.token.toLowerCase(), String(a.amount)]);
  const freeOf = async (token: string) => String((await call<{ token: string; amount: string }[]>(`${GATEWAY.B}/triparty/terms/${id}/free`))
    .find((h) => h.token.toLowerCase() === token.toLowerCase())!.amount);
  expect(await held()).toEqual([[tUST.toLowerCase(), "3000"], [tAGY.toLowerCase(), "2190"]]);
  expect([await freeOf(tUST), await freeOf(tAGY)]).toEqual(["1500", "1810"]);
  const substitutionsOf = async (svc: string) => ((await tripartyRepoOf(svc, id, repoId)) as unknown as { substitutions?: TripartySubstitutionView[] })?.substitutions ?? [];
  const recomputed = async (n: number) => {
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect
        .poll(async () => {
          const ss = await substitutionsOf(svc);
          return ss.length === n && ss[n - 1].verified ? true : (ss[n - 1]?.problem ?? ss.length);
        }, { timeout: 60_000 })
        .toBe(true);
    }
  };

  const purchaseDate = (await tripartyRepoOf(SERVICE.B, id, repoId) as unknown as { purchaseDate: string }).purchaseDate;
  const agentDate = (await call<{ businessDate: string }>(`${SERVICE_T}/business-date`)).businessDate;
  try {
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: purchaseDate });
    // 1. B asks for 1,000 tAGY back in its console.
    await page.goto("/#/live/B");
    const repoB = page.getByTestId(`triparty-repo-${repoId}`);
    await repoB.getByTestId("triparty-recall-token").selectOption("tAGY", { timeout: STEP_TIMEOUT });
    await repoB.getByTestId("triparty-recall-units").fill("1000");
    await repoB.getByRole("button", { name: "Request substitution" }).click();
    await expect(repoB.getByTestId("triparty-substitution-pending")).toContainText("by the giver: 1000 tAGY back, awaiting the agent", { timeout: STEP_TIMEOUT });

    // 2. The agent substitutes: 1,000 tAGY back leave the repo 96,197.44 short; 998 of B's free tUST replace them.
    await page.goto("/#/live/T");
    const repoT = page.getByTestId(`triparty-repo-${repoId}`);
    await repoT.getByRole("button", { name: "Substitute collateral" }).click({ timeout: STEP_TIMEOUT });
    const latestT = repoT.getByTestId("triparty-substitution-latest");
    await expect(latestT.getByTestId("triparty-substitution-outcome")).toContainText("1000 tAGY asked back, returned to the giver's free account", { timeout: STEP_TIMEOUT });
    await expect(latestT.getByTestId("triparty-substitution-in-tUST")).toContainText("+998 tUST in");
    await expect(latestT).toContainText("CDM workflow: request and execution");
    expect(await held()).toEqual([[tUST.toLowerCase(), "3998"], [tAGY.toLowerCase(), "1190"]]);
    expect([await freeOf(tUST), await freeOf(tAGY)]).toEqual(["502", "2810"]);

    // 3. A and B recompute it from the chain at the block before; A's console shows it checked.
    await recomputed(1);
    await page.goto("/#/live/A");
    await expect(page.getByTestId(`triparty-repo-${repoId}`).getByTestId("triparty-substitution-latest").getByTestId("triparty-substitution-verified"))
      .toContainText("recomputed from the chain ✓", { timeout: STEP_TIMEOUT });

    // 4. B asks for the other 1,190 tAGY; 502 free tUST cannot replace them (free tAGY is the asset returned): declined.
    await page.goto("/#/live/B");
    await repoB.getByTestId("triparty-recall-token").selectOption("tAGY", { timeout: STEP_TIMEOUT });
    await repoB.getByTestId("triparty-recall-units").fill("1190");
    await repoB.getByRole("button", { name: "Request substitution" }).click();
    await expect(repoB.getByTestId("triparty-substitution-pending")).toContainText("1190 tAGY back", { timeout: STEP_TIMEOUT });
    await page.goto("/#/live/T");
    await repoT.getByRole("button", { name: "Substitute collateral" }).click({ timeout: STEP_TIMEOUT });
    await expect(latestT.getByTestId("triparty-substitution-outcome")).toContainText("declined: the free account cannot replace them; nothing moved", { timeout: STEP_TIMEOUT });
    expect(await held()).toEqual([[tUST.toLowerCase(), "3998"], [tAGY.toLowerCase(), "1190"]]);
    await recomputed(2);
    const ss = await substitutionsOf(SERVICE.B);
    expect(ss.map((s) => s.substitution?.outcome)).toEqual(["Substituted", "Declined"]);
    expect(ss.map((s) => s.substitution?.workflowSteps)).toEqual([2, 0]);
    const kinds = await call<{ hash: string; kind: string }[]>(`${GATEWAY.A}/triparty/repos/${repoId}/changes`);
    expect(kinds.map((c) => c.kind)).toEqual(["substitution", "declined"]);
    expect(kinds.map((c) => c.hash)).toEqual(ss.map((s) => s.substitutionHash));
  } finally {
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: agentDate });
  }
  // B withdraws its free tUST and tAGY; the repo stays open with the agent until trade end (task-triparty-trade-end).
  await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: "tUST" });
  await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: "tAGY" });
  expect([await freeOf(tUST), await freeOf(tAGY)]).toEqual(["0", "0"]);
});

// --- flow-triparty-reporting (task-triparty-reporting, wp-adr-triparty-reporting) ---
// The agent reports every settled repo under the terms and the giver's free collateral on its business date; the giver
// and the receiver rebuild the report from the chain at the block before it. Placed before flow-triparty-trade-end,
// which ends the repo this spec leaves open. The agent's business date is restored at the end.

type TripartyReportTerms = {
  report?: { reportHash: string; count: number; verified: boolean; problem: string | null;
    report?: { repos: { repoId: string; exposure: string; valueAfterHaircuts: string; covered: boolean }[]; free: { token?: string; units: number }[] } };
};

test("flow-triparty-reporting: B repos 500,000 tUSD to A through BANK-T with 1,810 tAGY left free -> on the Purchase Date T sends its report from its console -> the repo is reported at 500,026.56 after haircuts against 500,000, covered, and 1,810 tAGY free -> A and B rebuild the report from the chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  expect([await scaledPrice(p.tokens.tUST), await scaledPrice(p.tokens.tAGY)]).toEqual([9_840_000_000n, 9_920_000_000n]);

  // Setup through the services, as in flow-triparty-revaluation: B-giver terms in effect, a settled trade-start repo.
  const giverTerms = async () => (await call<{ terms: TripartyTradeTermsView[] }>(`${SERVICE.B}/triparty`)).terms.filter((t) => t.giver === "B");
  for (const t of await giverTerms()) if (t.state === "proposed") await call(`${SERVICE.B}/triparty/terms/${t.termsId}/refuse`, "POST", {});
  let id = (await giverTerms()).find((t) => t.state === "effective")?.termsId ?? "";
  if (!id) {
    ({ termsId: id } = await call<{ termsId: string }>(`${SERVICE.B}/triparty/terms`, "POST", {}));
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await tripartyTermsOf(svc, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/triparty/terms/${id}/affirm`, "POST", {});
    }
    await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`)).state, { timeout: 60_000 }).toBe("effective");
  }
  for (const r of (await tripartyTermsOf(SERVICE.B, id))?.repos ?? []) if (r.canCancel) await call(`${SERVICE.B}/triparty/repos/${r.repoId}/cancel`, "POST", {});
  for (const h of (await tripartyTermsOf(SERVICE.B, id))?.free ?? []) if (h.amount > 0) await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: h.token });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tUST", amount: 3000, rank: 1 });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tAGY", amount: 4000, rank: 2 });
  const { repoId } = await call<{ repoId: string }>(`${SERVICE.B}/triparty/terms/${id}/repos`, "POST", { purchasePrice: 500000 });
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE_T, id, repoId))?.canAllocate ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE_T}/triparty/repos/${repoId}/allocate`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canSettle ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/settle`, "POST", {});
  await expect.poll(async () => (await call<{ state: string }>(`${GATEWAY.A}/triparty/repos/${repoId}`)).state, { timeout: 60_000 }).toBe("settled");
  const termsOf = async (svc: string) => (await tripartyTermsOf(svc, id)) as unknown as TripartyReportTerms;
  const before = (await termsOf(SERVICE.B)).report?.count ?? 0;

  const purchaseDate = (await tripartyRepoOf(SERVICE.B, id, repoId) as unknown as { purchaseDate: string }).purchaseDate;
  const agentDate = (await call<{ businessDate: string }>(`${SERVICE_T}/business-date`)).businessDate;
  try {
    // 1. On the Purchase Date T sends its report from its console.
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: purchaseDate });
    await page.goto("/#/live/T");
    const termsT = page.getByTestId(`triparty-terms-${id}`);
    await termsT.getByRole("button", { name: "Send report" }).click({ timeout: STEP_TIMEOUT });
    const rowT = termsT.getByTestId(`triparty-report-repo-${repoId}`);
    await expect(rowT).toContainText("500,000", { timeout: STEP_TIMEOUT });
    await expect(rowT).toContainText("500,026.56");
    await expect(rowT).toContainText("3000 tUST, 2190 tAGY");
    await expect(rowT).toContainText("covered");
    await expect(termsT.getByTestId("triparty-report-free")).toContainText("1810 tAGY");

    // 2. A and B rebuild it from the chain at the block before; A's console shows it checked.
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => { const r = (await termsOf(svc)).report; return r && r.count === before + 1 && r.verified ? true : (r?.problem ?? r?.count ?? "none"); },
        { timeout: 90_000 }).toBe(true);
    }
    const mine = (await termsOf(SERVICE.A)).report!.report!.repos.find((r) => r.repoId === repoId)!;
    expect(mine).toMatchObject({ exposure: "500000", valueAfterHaircuts: "500026.56", covered: true });
    const onChain = await call<{ reportHash: string }[]>(`${GATEWAY.A}/triparty/terms/${id}/reports`);
    expect(onChain[onChain.length - 1].reportHash).toBe((await termsOf(SERVICE.B)).report!.reportHash);
    await page.goto("/#/live/A");
    await expect(page.getByTestId(`triparty-terms-${id}`).getByTestId("triparty-report-verified")).toContainText("rebuilt from the chain ✓", { timeout: STEP_TIMEOUT });
  } finally {
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: agentDate });
  }
  // B withdraws its free tAGY; flow-triparty-trade-end ends the repo.
  await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: "tAGY" });
});

// --- flow-triparty-trade-end (task-triparty-trade-end, wp-adr-triparty-trade-end) ---
// On the Repurchase Date the agent prepares the trade end and the giver pays the Repurchase Price to the receiver against
// the release of the whole holding to its free account, in one transaction. The spec then ends every other settled repo
// under the B-giver terms the same way, each at its own Repurchase Date, and B terminates the terms, so the runs do not
// accumulate open repos. The agent's business date is restored at the end.

type TripartyTradeEndRepo = {
  repoId: string; state: string; repurchaseDate?: string; canPrepareTradeEnd?: boolean; canSettleRepurchase?: boolean;
  tradeEnd?: { tradeEndHash: string; repurchasePrice: number; verified: boolean; problem: string | null };
  pendingSubstitution?: { mine: boolean; requestedBy?: string };
};

test("flow-triparty-trade-end: B repos 500,000 tUSD to A through BANK-T -> on the Repurchase Date T prepares the trade end -> A and B rebuild it -> B pays A 500,486 tUSD against the release of 3,000 tUST and 2,190 tAGY to its free account in one transaction -> B withdraws them -> every other settled repo under the terms ends the same way -> B terminates the terms", async ({ page }) => {
  test.setTimeout(3 * TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens.tUST, tAGY = p.tokens.tAGY, tUSD = p.tokens.tUSD;

  // Setup through the services, as in flow-triparty-revaluation: B-giver terms in effect, a settled trade-start repo.
  const giverTerms = async () => (await call<{ terms: TripartyTradeTermsView[] }>(`${SERVICE.B}/triparty`)).terms.filter((t) => t.giver === "B");
  for (const t of await giverTerms()) if (t.state === "proposed") await call(`${SERVICE.B}/triparty/terms/${t.termsId}/refuse`, "POST", {});
  let id = (await giverTerms()).find((t) => t.state === "effective")?.termsId ?? "";
  if (!id) {
    ({ termsId: id } = await call<{ termsId: string }>(`${SERVICE.B}/triparty/terms`, "POST", {}));
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await tripartyTermsOf(svc, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/triparty/terms/${id}/affirm`, "POST", {});
    }
    await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`)).state, { timeout: 60_000 }).toBe("effective");
  }
  for (const r of (await tripartyTermsOf(SERVICE.B, id))?.repos ?? []) if (r.canCancel) await call(`${SERVICE.B}/triparty/repos/${r.repoId}/cancel`, "POST", {});
  for (const h of (await tripartyTermsOf(SERVICE.B, id))?.free ?? []) if (h.amount > 0) await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: h.token });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tUST", amount: 3000, rank: 1 });
  await call(`${SERVICE.B}/triparty/terms/${id}/deposit`, "POST", { token: "tAGY", amount: 4000, rank: 2 });
  const { repoId } = await call<{ repoId: string }>(`${SERVICE.B}/triparty/terms/${id}/repos`, "POST", { purchasePrice: 500000 });
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE_T, id, repoId))?.canAllocate ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE_T}/triparty/repos/${repoId}/allocate`, "POST", {});
  await expect.poll(async () => (await tripartyRepoOf(SERVICE.A, id, repoId))?.canSettle ?? false, { timeout: 60_000 }).toBe(true);
  await call(`${SERVICE.A}/triparty/repos/${repoId}/settle`, "POST", {});
  await expect.poll(async () => (await call<{ state: string }>(`${GATEWAY.A}/triparty/repos/${repoId}`)).state, { timeout: 60_000 }).toBe("settled");
  const freeOf = async (token: string) => String((await call<{ token: string; amount: string }[]>(`${GATEWAY.B}/triparty/terms/${id}/free`))
    .find((h) => h.token.toLowerCase() === token.toLowerCase())?.amount ?? "0");
  expect([await freeOf(tUST), await freeOf(tAGY)]).toEqual(["0", "1810"]);
  const repoOf = async (svc: string, r: string) => (await tripartyRepoOf(svc, id, r)) as unknown as TripartyTradeEndRepo;
  const repurchaseDate = (await repoOf(SERVICE.B, repoId)).repurchaseDate!;
  const agentDate = (await call<{ businessDate: string }>(`${SERVICE_T}/business-date`)).businessDate;
  try {
    // 1. The day before the Repurchase Date the agent cannot prepare; on it, it prepares in its console.
    const dayBefore = new Date(Date.parse(`${repurchaseDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: dayBefore });
    expect((await repoOf(SERVICE_T, repoId)).canPrepareTradeEnd).toBe(false);
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: repurchaseDate });
    await page.goto("/#/live/T");
    const repoT = page.getByTestId(`triparty-repo-${repoId}`);
    await repoT.getByRole("button", { name: "Prepare trade end" }).click({ timeout: STEP_TIMEOUT });
    await expect(repoT.getByTestId("triparty-trade-end")).toContainText("500,486 tUSD from the giver to the receiver against the release of 3000 tUST and 2190 tAGY", { timeout: STEP_TIMEOUT });

    // 2. A and B rebuild the trade end from the chain; B settles in its console: 500,486 tUSD to A, the holding to its free account.
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => { const t = (await repoOf(svc, repoId)).tradeEnd; return t?.verified ? true : (t?.problem ?? "none"); }, { timeout: 60_000 }).toBe(true);
    }
    const aBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    await page.goto("/#/live/B");
    const repoB = page.getByTestId(`triparty-repo-${repoId}`);
    await expect(repoB.getByTestId("triparty-trade-end-verified")).toContainText("rebuilt by this party ✓", { timeout: STEP_TIMEOUT });
    await repoB.getByRole("button", { name: "Settle repurchase (500,486 tUSD)" }).click();
    await expect(repoB.getByTestId("triparty-repo-state")).toContainText("repurchased on-chain ✓", { timeout: STEP_TIMEOUT });
    expect((await balanceOf(GATEWAY.A, tUSD, p.a)) - aBefore).toBe(500_486n);
    expect([await freeOf(tUST), await freeOf(tAGY)]).toEqual(["3000", "4000"]);
    expect((await call<{ state: string }>(`${GATEWAY.A}/triparty/repos/${repoId}`)).state).toBe("repurchased");
    await page.goto("/#/live/A");
    await expect(page.getByTestId(`triparty-repo-${repoId}`).getByTestId("triparty-repo-state")).toContainText("repurchased on-chain ✓", { timeout: STEP_TIMEOUT });

    // 3. Every other settled repo under the terms ends the same way, each at its own Repurchase Date.
    for (const r of (await tripartyTermsOf(SERVICE.B, id))?.repos ?? []) {
      if (r.state !== "settled") continue;
      let other = await repoOf(SERVICE.B, r.repoId);
      if (other.pendingSubstitution) {
        await call(`${other.pendingSubstitution.requestedBy === "Agent" ? SERVICE_T : SERVICE.B}/triparty/repos/${r.repoId}/substitution/withdraw`, "POST", {});
      }
      await call(`${SERVICE_T}/business-date`, "POST", { businessDate: other.repurchaseDate });
      if (!other.tradeEnd) await call(`${SERVICE_T}/triparty/repos/${r.repoId}/trade-end`, "POST", {});
      await expect.poll(async () => (await repoOf(SERVICE.B, r.repoId)).canSettleRepurchase ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${SERVICE.B}/triparty/repos/${r.repoId}/repurchase`, "POST", {});
      other = await repoOf(SERVICE.B, r.repoId);
      expect(other.state).toBe("repurchased");
    }
  } finally {
    await call(`${SERVICE_T}/business-date`, "POST", { businessDate: agentDate });
  }
  // 4. B withdraws everything free and terminates the terms: no repo is open under them.
  for (const h of (await tripartyTermsOf(SERVICE.B, id))?.free ?? []) if (h.amount > 0) await call(`${SERVICE.B}/triparty/terms/${id}/withdraw`, "POST", { token: h.token });
  await call(`${SERVICE.B}/triparty/terms/${id}/terminate`, "POST", {});
  await expect.poll(async () => (await call<TripartyTermsView>(`${GATEWAY.B}/triparty/terms/${id}`)).state, { timeout: 60_000 }).toBe("terminated");
});

// --- flow-ccp-membership (task-ccp-membership, wp-adr-ccp-membership) ---

const SERVICE_C = "http://localhost:8004/api/v1";
type CcpView = {
  party: string; ccp: boolean; canPublish: boolean;
  rulebook: null | {
    rulebookHash: string; state: string; capital: number; fund: number; verified: boolean; problem: string | null;
    members: { party: string; bank: string; share: number; paid: boolean; admitted?: boolean }[];
    rulebook?: { ccp: string; role: string; initialMarginRate: string; variationMarginPeriodDays: number; defaultFund: number; ccpCapital: number; baseCurrency: string };
    canJoin: boolean; canLeave: boolean;
  };
};
const ccpOf = async (svc: string) => call<CcpView>(`${svc}/ccp`);
const paidOf = async (party: "A" | "B") => (await ccpOf(SERVICE_C)).rulebook?.members.find((m) => m.party === party)?.paid ?? false;

test("flow-ccp-membership: BANK-C publishes its CDM rulebook in its console and pays 250,000 tUSD of capital -> A and B each check the rulebook and pay their 500,000 tUSD share -> the rulebook is in effect with 1,250,000 tUSD held -> B leaves and gets its share back -> B rejoins", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  await ccpClearLeftovers();

  // Setup: a rulebook an earlier run published is reused; members an earlier run left paid leave through the services
  // so that each can join in its console.
  for (const p of ["A", "B"] as const) {
    if (await paidOf(p)) {
      await call(`${SERVICE[p]}/ccp/leave`, "POST", {});
      await expect.poll(() => paidOf(p), { timeout: 60_000 }).toBe(false);
    }
  }

  // 1. BANK-C publishes the rulebook and pays its capital in its console (skipped when the rulebook exists).
  await page.goto("/#/live/C");
  await expect(page.getByText("BANK-C · Central Counterparty")).toBeVisible({ timeout: STEP_TIMEOUT });
  const cardC = page.getByTestId("ccp-card");
  if ((await ccpOf(SERVICE_C)).canPublish) {
    await cardC.getByRole("button", { name: "Publish the rulebook and pay the capital" }).click({ timeout: STEP_TIMEOUT });
  }
  await expect.poll(async () => (await ccpOf(SERVICE_C)).rulebook?.capital ?? 0, { timeout: 60_000 }).toBe(250_000);
  await expect(cardC.getByTestId("ccp-terms")).toContainText("initial margin 5.00%", { timeout: STEP_TIMEOUT });

  // 2. and 3. Each member checks the rulebook against its own build and pays its share in its console.
  for (const p of ["A", "B"] as const) {
    await page.goto(`/#/live/${p}`);
    const card = page.getByTestId("ccp-card");
    await expect(card.getByText("checked", { exact: true })).toBeVisible({ timeout: STEP_TIMEOUT });
    await card.getByRole("button", { name: "Affirm the rulebook and pay the share" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(() => paidOf(p), { timeout: 60_000 }).toBe(true);
    await expect(card.getByTestId(`ccp-member-${p}`)).toContainText("yes", { timeout: STEP_TIMEOUT });
  }

  // The rulebook is in effect with the capital and the full fund; the three services hold the same checked document.
  const views: NonNullable<CcpView["rulebook"]>[] = [];
  for (const svc of [SERVICE_C, SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const r = (await ccpOf(svc)).rulebook;
        return r?.state === "Effective" && r.verified && r.fund === 1_000_000 ? true : (r?.problem ?? r?.state ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
    views.push((await ccpOf(svc)).rulebook!);
  }
  expect(new Set(views.map((v) => v.rulebookHash)).size).toBe(1);
  expect(views[0].capital + views[0].fund).toBe(1_250_000);
  expect(views[0].rulebook).toMatchObject({ ccp: "BANK-C", role: "ClearingOrganization", initialMarginRate: "0.05", variationMarginPeriodDays: 1,
    defaultFund: 1_000_000, ccpCapital: 250_000, baseCurrency: "USD" });
  // The rulebook's members; BANK-T, which flow-ccp-porting admits and which leaves at its end, is not one of them.
  expect(views[0].members.filter((m) => !m.admitted).map((m) => [m.bank, m.share])).toEqual([["BANK-A", 500_000], ["BANK-B", 500_000]]);
  const onChain = await call<{ rulebook: { state: string; fund: string; capital: string } }>(`${GATEWAY.A}/ccp/rulebook/${views[0].rulebookHash}`);
  expect(onChain.rulebook).toMatchObject({ state: "Effective" });
  expect(Number(onChain.rulebook.fund) + Number(onChain.rulebook.capital)).toBe(1_250_000);

  // 4. B, which clears nothing, leaves in its console and gets its share back; the rulebook stays in effect.
  await page.goto("/#/live/B");
  const cardB = page.getByTestId("ccp-card");
  await cardB.getByRole("button", { name: "Leave and get the share back" }).click({ timeout: STEP_TIMEOUT });
  await expect.poll(async () => (await ccpOf(SERVICE_C)).rulebook?.fund ?? null, { timeout: 60_000 }).toBe(500_000);
  expect((await ccpOf(SERVICE_C)).rulebook?.state).toBe("Effective");

  // 5. B rejoins by paying its share again.
  await cardB.getByRole("button", { name: "Affirm the rulebook and pay the share" }).click({ timeout: STEP_TIMEOUT });
  await expect.poll(async () => (await ccpOf(SERVICE_C)).rulebook?.fund ?? null, { timeout: 60_000 }).toBe(1_000_000);
  await expect(cardB.getByTestId("ccp-member-B")).toContainText("yes", { timeout: STEP_TIMEOUT });
});

// --- flow-ccp-clearing (task-ccp-clearing, wp-adr-ccp-clearing) ---

type ClearingView = {
  repoId: string; state: string; role: string; verified: boolean; problem: string | null; novationHash: string;
  legs?: { tradeId: string; seller: string; buyer: string }[]; cleared?: boolean; repurchaseDate?: string;
  canAffirm: boolean; canAccept: boolean; canInstruct: boolean; sellerInstructed: boolean; buyerInstructed: boolean;
};
const clearingOf = async (svc: string, id: string) =>
  (await call<{ clearings: ClearingView[] }>(`${svc}/ccp/clearings`)).clearings.find((c) => c.repoId === id);

test("flow-ccp-clearing: A books and B affirms a repo of tUST -> A submits it to BANK-C in its console, B affirms, BANK-C accepts -> the bilateral repo is novated into A–C and C–B by CDM's clearing split -> the purchase settles through BANK-C -> A cannot leave while it clears -> on the Repurchase Date the repurchase settles through BANK-C -> A can leave and rejoin", async ({ page }) => {
  test.setTimeout(2 * TEST_TIMEOUT);
  await ccpClearLeftovers();
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const ccpAddr = (await call<{ address: string }>(`${SERVICE_C}/health`)).address;
  const today = new Date().toLocaleDateString("en-CA");
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });

  // Setup: the rulebook in effect with A and B paid (flow-ccp-membership shows these steps in the consoles).
  if ((await ccpOf(SERVICE_C)).canPublish) await call(`${SERVICE_C}/ccp/rulebook`, "POST", {});
  await expect.poll(async () => (await ccpOf(SERVICE.A)).rulebook?.verified ?? false, { timeout: 60_000 }).toBe(true);
  for (const party of ["A", "B"] as const) {
    if (!(await paidOf(party))) {
      await call(`${SERVICE[party]}/ccp/join`, "POST", {});
      await expect.poll(() => paidOf(party), { timeout: 60_000 }).toBe(true);
    }
  }
  await expect.poll(async () => (await ccpOf(SERVICE_C)).rulebook?.state, { timeout: 60_000 }).toBe("Effective");

  // A books and B affirms a bilateral repo through the services (flow-repo-purchase-repurchase shows it in the consoles).
  const { repoId: id } = await call<{ repoId: string }>(`${SERVICE.A}/repos`, "POST", { security: "tUST", purchasePrice: 100000, ratePercent: "4", termDays: 7 });
  await expect.poll(async () => {
    const r = (await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.find((x) => x.repoId === id);
    return r ? (r.verified ? r.state : r.problem) : null;
  }, { timeout: 60_000 }).toBe("booked");
  await call(`${SERVICE.B}/repos/${id}/affirm`, "POST", {});
  await expect.poll(async () => (await call<{ repos: Repo[] }>(`${SERVICE.A}/repos`)).repos.find((x) => x.repoId === id)?.state, { timeout: 60_000 }).toBe("affirmed");
  const repo = (await call<{ repos: Repo[] }>(`${SERVICE.A}/repos`)).repos.find((x) => x.repoId === id)!;
  const qty = BigInt(repo.quantity), pp = BigInt(repo.purchasePrice), rp = BigInt(repo.repurchasePrice);
  const bal = async () => ({
    aUST: await balanceOf(GATEWAY.A, tUST, p.a), bUST: await balanceOf(GATEWAY.A, tUST, p.b),
    aUSD: await balanceOf(GATEWAY.A, tUSD, p.a), bUSD: await balanceOf(GATEWAY.A, tUSD, p.b), cUSD: await balanceOf(GATEWAY.A, tUSD, ccpAddr),
  });
  const before = await bal();

  // 1. A, the seller, submits the repo to BANK-C in its console.
  await page.goto("/#/live/A");
  const cardA = page.getByTestId("ccp-card");
  await cardA.getByTestId(`ccp-clearable-${id}`).getByRole("button", { name: "Submit to BANK-C for clearing" }).click({ timeout: STEP_TIMEOUT });
  await expect.poll(async () => (await clearingOf(SERVICE.B, id))?.state ?? null, { timeout: 60_000 }).toBe("submitted");

  // 2. B, the buyer, rebuilds the novation from its own booking and affirms in its console.
  await page.goto("/#/live/B");
  const rowB = page.getByTestId(`ccp-clearing-${id}`);
  await expect(rowB.getByText("novation checked")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowB.getByTestId("ccp-clearing-legs")).toContainText("BANK-A → BANK-C, BANK-C → BANK-B");
  await expect(rowB.getByTestId("ccp-clearing-legs")).toContainText("CDM cleared trade: yes");
  await rowB.getByRole("button", { name: "Affirm the submission" }).click();
  await expect.poll(async () => (await clearingOf(SERVICE_C, id))?.state ?? null, { timeout: 60_000 }).toBe("affirmed");

  // 3. BANK-C rebuilds the novation from the trade the clearing event carries and accepts in its console.
  await page.goto("/#/live/C");
  const rowC = page.getByTestId(`ccp-clearing-${id}`);
  await expect(rowC.getByText("novation checked")).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowC.getByRole("button", { name: "Accept for clearing" }).click();
  await expect(rowC.getByTestId("ccp-clearing-state")).toHaveText("cleared", { timeout: STEP_TIMEOUT });

  // The bilateral repo is novated; the three services hold the same checked novation.
  await expect.poll(async () => (await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.find((x) => x.repoId === id)?.state, { timeout: 60_000 }).toBe("novated");
  const views: ClearingView[] = [];
  for (const svc of [SERVICE.A, SERVICE.B, SERVICE_C]) {
    await expect.poll(async () => { const c = await clearingOf(svc, id); return c?.state === "cleared" && c.verified ? true : (c?.problem ?? c?.state ?? null); }, { timeout: 60_000 }).toBe(true);
    views.push((await clearingOf(svc, id))!);
  }
  expect(new Set(views.map((v) => v.novationHash)).size).toBe(1);
  expect(views[0].legs!.map((l) => [l.seller, l.buyer])).toEqual([["BANK-A", "BANK-C"], ["BANK-C", "BANK-B"]]);
  expect(views[0].cleared).toBe(true);
  // A clears a repo, so it cannot leave.
  await expect(call(`${SERVICE.A}/ccp/leave`, "POST", {})).rejects.toThrow();

  // 4. The purchase: B instructs its leg, then A; the second instruction moves the securities and the cash.
  await page.goto("/#/live/B");
  await page.getByTestId(`ccp-clearing-${id}`).getByRole("button", { name: "Instruct the purchase of my leg" }).click({ timeout: STEP_TIMEOUT });
  await expect.poll(async () => (await clearingOf(SERVICE.A, id))?.buyerInstructed ?? false, { timeout: 60_000 }).toBe(true);
  expect(await bal()).toEqual(before);
  await page.goto("/#/live/A");
  await page.getByTestId(`ccp-clearing-${id}`).getByRole("button", { name: "Instruct the purchase of my leg" }).click({ timeout: STEP_TIMEOUT });
  await expect.poll(async () => (await clearingOf(SERVICE.A, id))?.state ?? null, { timeout: 60_000 }).toBe("purchased");
  expect(await bal()).toEqual({ ...before, aUST: before.aUST - qty, bUST: before.bUST + qty, aUSD: before.aUSD + pp, bUSD: before.bUSD - pp });

  // 5. On the Repurchase Date: A instructs its leg's repurchase, then B; BANK-C's cash is unchanged throughout.
  const due = views[0].repurchaseDate!;
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
  try {
    await page.reload();
    await page.getByTestId(`ccp-clearing-${id}`).getByRole("button", { name: "Instruct the repurchase of my leg" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await clearingOf(SERVICE.B, id))?.sellerInstructed ?? false, { timeout: 60_000 }).toBe(true);
    await page.goto("/#/live/B");
    await page.getByTestId(`ccp-clearing-${id}`).getByRole("button", { name: "Instruct the repurchase of my leg" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await clearingOf(SERVICE_C, id))?.state ?? null, { timeout: 60_000 }).toBe("repurchased");
    expect(await bal()).toEqual({ ...before, aUSD: before.aUSD - (rp - pp), bUSD: before.bUSD + (rp - pp) });
  } finally {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  }

  // 6. A clears nothing now: it leaves and gets its share back, then rejoins.
  await call(`${SERVICE.A}/ccp/leave`, "POST", {});
  await expect.poll(() => paidOf("A"), { timeout: 60_000 }).toBe(false);
  await call(`${SERVICE.A}/ccp/join`, "POST", {});
  await expect.poll(() => paidOf("A"), { timeout: 60_000 }).toBe(true);
});

// --- flow-ccp-margin, flow-ccp-default, flow-ccp-porting (task-ccp-margin, task-ccp-default, task-ccp-porting) ---

type CcpRoundView = {
  roundId: string; businessDate: string; state: string; canCancel: boolean;
  members: { party: string; vm: number; im: number; net: number; paid: boolean }[];
  repos: { repoId: string; vm: number }[];
  mine?: { vm: number; im: number; net: number; calls?: string[]; verified: boolean; problem: string | null; paid: boolean; canPay: boolean };
};
type CcpMarginView = {
  businessDate: string; canIssue: boolean; rounds: CcpRoundView[];
  preview?: { party: string; vm: number; im: number; net: number; lines: { repoId: string; price: string }[] }[]; previewProblem?: string;
};
type CcpDefaultView = {
  closeOutHash: string; defaulter: string; loss: number; fromInitialMargin: number; fromDefaulterFund: number; fromCapital: number;
  fromMembersFund: number; returned: number; dueOutstanding: number; due: { party: string; amount: number }[]; mineDue: number;
  transactions?: { repoId: string; survivor: string; residual: number; survivorAmount: number }[]; verified: boolean; problem: string | null;
};
type CcpClearingFull = ClearingView & {
  seller: string; buyer: string; vmBalance?: number;
  porting?: { from: string; to: string; payment: number; state: string; verified: boolean; problem: string | null } | null;
};
type CcpMember = { party: string; paid: boolean; contributed?: number; imHeld?: number; admitted?: boolean };

const CCP_SERVICE = { A: SERVICE.A, B: SERVICE.B, T: SERVICE_T, C: SERVICE_C } as const;
const marginOf = (svc: string) => call<CcpMarginView>(`${svc}/ccp/margin`);
const defaultsOf = async (svc: string) => (await call<{ defaults: CcpDefaultView[] }>(`${svc}/ccp/defaults`)).defaults;
const fullClearingOf = async (svc: string, id: string) =>
  (await call<{ clearings: CcpClearingFull[] }>(`${svc}/ccp/clearings`)).clearings.find((c) => c.repoId === id);
const ccpMemberOf = async (party: string) =>
  ((await ccpOf(SERVICE_C)).rulebook?.members as CcpMember[] | undefined)?.find((m) => m.party === party);
const setCcpDates = async (businessDate: string) => {
  for (const svc of Object.values(CCP_SERVICE)) await call(`${svc}/business-date`, "POST", { businessDate });
};

/** The tUST price on the feed, read by the members' gateways and by the CCP's margin build. */
async function setTustFeed(price: number) {
  const p = await parties();
  await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(price) });
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${p.tokens.tUST}`)).price, { timeout: 30_000 })
      .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
  }
}

/** The rulebook in effect with A and B paid (flow-ccp-membership shows these steps in the consoles). */
async function ccpReady() {
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
async function ccpPurchased() {
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
async function ccpRound(): Promise<CcpRoundView> {
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
async function ccpClearLeftovers() {
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

test("flow-ccp-margin: A's repo of tUST to B is cleared by BANK-C and purchased -> tUST falls to 97 -> BANK-C issues the day's CDM margin calls in its console: A owes variation margin, which goes to B, and each member 5,000 tUSD of initial margin -> A and B each rebuild their statement and pay in their consoles -> tUST returns to 98.40 and the next round moves the variation margin back -> after the repurchase a round returns the rest and the initial margin; every balance restored but the repo interest", async ({ page }) => {
  test.setTimeout(2 * TEST_TIMEOUT);
  await ccpClearLeftovers();
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const ccpAddr = (await call<{ address: string }>(`${SERVICE_C}/health`)).address;
  const today = new Date().toLocaleDateString("en-CA");
  await setCcpDates(today);
  await ccpReady();
  const bal = async () => ({
    aUST: await balanceOf(GATEWAY.A, tUST, p.a), bUST: await balanceOf(GATEWAY.A, tUST, p.b),
    aUSD: await balanceOf(GATEWAY.A, tUSD, p.a), bUSD: await balanceOf(GATEWAY.A, tUSD, p.b), cUSD: await balanceOf(GATEWAY.A, tUSD, ccpAddr),
  });
  const start = await bal();
  const { id, pp, rp, due } = await ccpPurchased();
  try {
    // 1. tUST falls to 97; BANK-C's build of the day prices the repo at the feed.
    await setTustFeed(97);
    await expect.poll(async () => {
      const a = (await marginOf(SERVICE_C)).preview?.find((x) => x.party === "A");
      return Number(a?.lines.find((l) => l.repoId === id)?.price ?? 0);
    }, { timeout: 60_000 }).toBe(97);

    // 2. BANK-C issues the round in its console.
    await page.goto("/#/live/C");
    const cardC = page.getByTestId("ccp-card");
    await expect(cardC.getByTestId("ccp-margin-preview")).toBeVisible({ timeout: STEP_TIMEOUT });
    const roundsBefore = (await marginOf(SERVICE_C)).rounds.length;
    await cardC.getByRole("button", { name: "Issue today's margin calls" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await marginOf(SERVICE_C)).rounds.length, { timeout: 60_000 }).toBe(roundsBefore + 1);
    const r1 = (await marginOf(SERVICE_C)).rounds[0];
    const a1 = r1.members.find((m) => m.party === "A")!, b1 = r1.members.find((m) => m.party === "B")!;
    expect(r1.state).toBe("issued");
    expect(a1.vm).toBeGreaterThan(0);
    expect(b1.vm).toBe(-a1.vm);
    expect([a1.im, b1.im]).toEqual([5_000, 5_000]);
    expect(r1.repos.find((x) => x.repoId === id)?.vm).toBe(a1.vm);
    const afterPurchase = await bal();

    // 3. Each member rebuilds its own statement from the chain and the feed, and pays its net in its console.
    for (const party of ["A", "B"] as const) {
      await page.goto(`/#/live/${party}`);
      const round = page.getByTestId(`ccp-round-${r1.roundId}`);
      await expect(round.getByText("statement checked")).toBeVisible({ timeout: STEP_TIMEOUT });
      await expect(round.getByTestId("ccp-round-mine")).toContainText(party === "A" ? "CDM calls VM, NonRegIM" : "CDM calls NonRegIM");
      const net = r1.members.find((m) => m.party === party)!.net;
      if (net > 0) await round.getByRole("button", { name: "Pay my margin" }).click({ timeout: STEP_TIMEOUT });
    }
    await expect.poll(async () => (await marginOf(SERVICE_C)).rounds.find((x) => x.roundId === r1.roundId)?.state, { timeout: 60_000 }).toBe("settled");
    // The variation margin passed from A to B; the initial margin stays with CcpClearing; BANK-C's own cash is unchanged.
    expect(await bal()).toEqual({ ...afterPurchase, aUSD: afterPurchase.aUSD - BigInt(a1.net), bUSD: afterPurchase.bUSD - BigInt(b1.net) });
    expect(await ccpMemberOf("A")).toMatchObject({ imHeld: 5_000 });
    expect((await fullClearingOf(SERVICE_C, id))?.vmBalance).toBe(a1.vm);

    // 4. tUST returns to 98.40: the next round moves the variation margin back and calls no initial margin.
    await setTustFeed(PRICE_TUST);
    const r2 = await ccpRound();
    const a2 = r2.members.find((m) => m.party === "A")!;
    expect(r2.repos.find((x) => x.repoId === id)!.vm).toBeLessThan(0);
    expect(r2.members.map((m) => m.im)).toEqual([0, 0]);

    // 5. On the Repurchase Date the repurchase settles; the round of that date returns the variation margin still paid
    // and all the initial margin.
    await setCcpDates(due);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await clearingOf(svc, id))?.canInstruct ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/ccp/clearings/${id}/instruct`, "POST", {});
    }
    await expect.poll(async () => (await clearingOf(SERVICE_C, id))?.state ?? null, { timeout: 60_000 }).toBe("repurchased");
    const r3 = await ccpRound();
    expect(r3.members.find((m) => m.party === "A")!.im).toBe(-5_000);
    expect(r3.members.find((m) => m.party === "B")!.im).toBe(-5_000);
    expect(a1.vm + a2.vm + (r3.repos.find((x) => x.repoId === id)?.vm ?? 0)).toBe(0);
    expect((await fullClearingOf(SERVICE_C, id))?.vmBalance).toBe(0);
    for (const party of ["A", "B"]) expect(await ccpMemberOf(party)).toMatchObject({ imHeld: 0 });
    expect(await bal()).toEqual({ ...start, aUSD: start.aUSD - (rp - pp), bUSD: start.bUSD + (rp - pp) });
  } finally {
    await setTustFeed(PRICE_TUST);
    await setCcpDates(today);
  }
});

test("flow-ccp-default: A's repo of tUST to B is cleared and purchased and the initial margin paid -> tUST falls to 95 -> BANK-C declares A's default in its console and closes out the repo at the feed price -> the loss comes out of A's initial margin, B is paid what the close-out owes it and the rest of A's margin and share goes back to A -> B checks the CDM close-out in its console -> a round returns B's initial margin -> A rejoins", async ({ page }) => {
  test.setTimeout(2 * TEST_TIMEOUT);
  await ccpClearLeftovers();
  const p = await parties();
  const tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  await setCcpDates(today);
  await ccpReady();
  const aWasInDefault = (await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.a}`)).inDefault;
  const { id } = await ccpPurchased();
  await ccpRound();
  expect(await ccpMemberOf("A")).toMatchObject({ imHeld: 5_000, contributed: 500_000 });
  const capital = (await ccpOf(SERVICE_C)).rulebook!.capital;
  try {
    // 1. tUST falls to 95 after the round, past the repo's haircut; BANK-C declares A's default in its console.
    await setTustFeed(95);
    const defaultsBefore = (await defaultsOf(SERVICE_C)).length;
    const aBefore = await balanceOf(GATEWAY.A, tUSD, p.a), bBefore = await balanceOf(GATEWAY.A, tUSD, p.b);
    await page.goto("/#/live/C");
    await page.getByTestId("ccp-card").getByRole("button", { name: "Declare the default of BANK-A and close out" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await defaultsOf(SERVICE_C)).length, { timeout: 60_000 }).toBe(defaultsBefore + 1);

    // 2. The close-out and the waterfall: the loss on the repo, from A's initial margin; the rest goes back to A.
    await expect.poll(async () => { const d = (await defaultsOf(SERVICE_C))[0]; return d.verified ? true : d.problem; }, { timeout: 60_000 }).toBe(true);
    const d = (await defaultsOf(SERVICE_C))[0];
    expect(d.defaulter).toBe("A");
    expect(d.loss).toBeGreaterThan(0);
    expect(d.loss).toBeLessThan(5_000);
    expect([d.fromInitialMargin, d.fromDefaulterFund, d.fromCapital, d.fromMembersFund]).toEqual([d.loss, 0, 0, 0]);
    expect(d.returned).toBe(505_000 - d.loss);
    // B, the buyer, is owed the residual and is paid in the close-out; nothing is left to pay.
    expect(d.due).toEqual([]);
    expect(d.dueOutstanding).toBe(0);
    expect(d.transactions?.map((t) => [t.repoId, t.survivor, t.survivorAmount])).toEqual([[id, "BANK-B", d.loss]]);
    expect((await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.a}`)).inDefault).toBe(true);
    expect((await clearingOf(SERVICE_C, id))?.state).toBe("closedOut");
    expect(await paidOf("A")).toBe(false);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aBefore + BigInt(d.returned));
    expect(await balanceOf(GATEWAY.A, tUSD, p.b)).toBe(bBefore + BigInt(d.loss));
    expect((await ccpOf(SERVICE_C)).rulebook!.capital).toBe(capital);

    // 3. B rebuilds the close-out from the novation and the chain in its console; A checks it too.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId("ccp-default-A").first();
    await expect(rowB.getByText("close-out checked")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(rowB.getByTestId("ccp-default-survivors")).toHaveText(`BANK-B paid ${d.loss.toLocaleString("en-US")}`);
    await expect.poll(async () => (await defaultsOf(SERVICE.A))[0]?.verified ?? false, { timeout: 60_000 }).toBe(true);

    // 4. B clears nothing now: the next round returns its initial margin and settles at once.
    const r = await ccpRound();
    expect(r.members).toEqual([expect.objectContaining({ party: "B", im: -5_000 })]);
    expect(await ccpMemberOf("B")).toMatchObject({ imHeld: 0 });
    expect(await balanceOf(GATEWAY.A, tUSD, p.b)).toBe(bBefore + BigInt(d.loss) + 5_000n);
  } finally {
    await setTustFeed(PRICE_TUST);
    if (!aWasInDefault) await call(`${ORACLE}/defaults`, "POST", { party: p.a, inDefault: false, notifiedBy: "e2e restore" });
    await expect.poll(async () => (await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.a}`)).inDefault, { timeout: 30_000 }).toBe(aWasInDefault);
  }
  // 5. A rejoins by paying its share again.
  await call(`${SERVICE.A}/ccp/join`, "POST", {});
  await expect.poll(() => paidOf("A"), { timeout: 60_000 }).toBe(true);
});

test("flow-ccp-porting: A's repo of tUST to B is cleared and purchased and the initial margin paid -> BANK-C admits BANK-T with a CDM admission in its console and T joins in its console -> A ports its leg to T: T checks the CDM porting and accepts, BANK-C approves -> T pays A the leg's value -> on the Repurchase Date T and B repurchase through BANK-C -> a round returns the margin -> T leaves", async ({ page }) => {
  test.setTimeout(2 * TEST_TIMEOUT);
  await ccpClearLeftovers();
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const t = (await call<{ address: string }>(`${SERVICE_T}/health`)).address;
  const today = new Date().toLocaleDateString("en-CA");
  await setCcpDates(today);
  await ccpReady();
  const { id, qty, rp, due } = await ccpPurchased();
  await ccpRound();
  try {
    // 1. BANK-C admits BANK-T in its console (an earlier run's admission is reused).
    if (!(await ccpMemberOf("T"))) {
      await page.goto("/#/live/C");
      await page.getByTestId("ccp-card").getByRole("button", { name: "Admit BANK-T as a member" }).click({ timeout: STEP_TIMEOUT });
      await expect.poll(async () => (await ccpMemberOf("T"))?.admitted ?? false, { timeout: 60_000 }).toBe(true);
    }

    // 2. T checks the rulebook and its admission and pays its share in its console.
    await page.goto("/#/live/T");
    const cardT = page.getByTestId("ccp-card");
    await expect(cardT.getByText("checked", { exact: true })).toBeVisible({ timeout: STEP_TIMEOUT });
    await cardT.getByRole("button", { name: "Affirm the rulebook and pay the share" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await ccpMemberOf("T"))?.paid ?? false, { timeout: 60_000 }).toBe(true);

    // 3. A ports its leg to T in its console.
    const bal = async () => ({
      aUSD: await balanceOf(GATEWAY.A, tUSD, p.a), bUSD: await balanceOf(GATEWAY.A, tUSD, p.b), tUSD: await balanceOf(GATEWAY.A, tUSD, t),
      aUST: await balanceOf(GATEWAY.A, tUST, p.a), bUST: await balanceOf(GATEWAY.A, tUST, p.b), tUST: await balanceOf(GATEWAY.A, tUST, t),
    });
    const before = await bal();
    await page.goto("/#/live/A");
    await page.getByTestId(`ccp-clearing-${id}`).getByRole("button", { name: "Port my leg to BANK-T" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await fullClearingOf(SERVICE_T, id))?.porting?.state ?? null, { timeout: 60_000 }).toBe("requested");

    // 4. T rebuilds the porting from the novation's leg and the feed, and accepts in its console.
    await page.goto("/#/live/T");
    const rowT = page.getByTestId(`ccp-clearing-${id}`);
    await expect(rowT.getByText("porting checked")).toBeVisible({ timeout: STEP_TIMEOUT });
    await rowT.getByRole("button", { name: "Accept the porting" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await fullClearingOf(SERVICE_C, id))?.porting?.state ?? null, { timeout: 60_000 }).toBe("accepted");

    // 5. BANK-C rebuilds it and approves in its console: T pays A the payment and becomes the leg's seller.
    await page.goto("/#/live/C");
    const rowC = page.getByTestId(`ccp-clearing-${id}`);
    await expect(rowC.getByText("porting checked")).toBeVisible({ timeout: STEP_TIMEOUT });
    await rowC.getByRole("button", { name: "Approve the porting" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await fullClearingOf(SERVICE_C, id))?.porting?.state ?? null, { timeout: 60_000 }).toBe("executed");
    const c = (await fullClearingOf(SERVICE_C, id))!;
    expect([c.seller, c.buyer]).toEqual(["T", "B"]);
    const payment = BigInt(c.porting!.payment);
    expect(await bal()).toEqual({ ...before, aUSD: before.aUSD + payment, tUSD: before.tUSD - payment });
    for (const svc of [SERVICE.A, SERVICE.B, SERVICE_T]) {
      await expect.poll(async () => { const x = await fullClearingOf(svc, id); return x?.porting?.verified ? true : (x?.porting?.problem ?? null); }, { timeout: 60_000 }).toBe(true);
    }

    // 6. On the Repurchase Date T and B instruct their legs: T pays the Repurchase Price and gets the securities.
    await setCcpDates(due);
    for (const svc of [SERVICE_T, SERVICE.B]) {
      await expect.poll(async () => (await clearingOf(svc, id))?.canInstruct ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/ccp/clearings/${id}/instruct`, "POST", {});
    }
    await expect.poll(async () => (await clearingOf(SERVICE_C, id))?.state ?? null, { timeout: 60_000 }).toBe("repurchased");
    expect(await bal()).toEqual({ ...before, aUSD: before.aUSD + payment, tUSD: before.tUSD - payment - rp, bUSD: before.bUSD + rp,
      tUST: before.tUST + qty, bUST: before.bUST - qty });

    // 7. The round of that date returns A's and B's initial margin and any variation margin still paid.
    const r = await ccpRound();
    expect(r.members.find((m) => m.party === "A")?.im).toBe(-5_000);
    expect(r.members.find((m) => m.party === "B")?.im).toBe(-5_000);
    for (const party of ["A", "B", "T"]) expect((await ccpMemberOf(party))?.imHeld ?? 0).toBe(0);
    expect((await fullClearingOf(SERVICE_C, id))?.vmBalance).toBe(0);
  } finally {
    await setCcpDates(today);
  }
  // 8. T clears nothing now and leaves with its share.
  await call(`${SERVICE_T}/ccp/leave`, "POST", {});
  await expect.poll(async () => (await ccpMemberOf("T"))?.paid ?? true, { timeout: 60_000 }).toBe(false);
});
