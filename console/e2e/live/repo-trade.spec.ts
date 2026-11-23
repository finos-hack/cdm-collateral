import { expect, test } from "@playwright/test";
import {
  PRICE_TUST,
  TEST_TIMEOUT,
  STEP_TIMEOUT,
  SERVICE,
  GATEWAY,
  ZERO_HASH,
  call,
  parties,
  balanceOf,
  ORACLE,
  GmraTerms,
  Repo,
  RepoTrade,
  RepoMargin,
  repoAdjustFixture,
  scaledPrice,
  substituteQuantity,
  liveStackGate,
} from "./harness";

// Live specs of the repo-trade module (task-live-suite-modules); shared helpers are in ./harness.ts. Each module runs on its
// own stack in e2e-live-stack.yml, so the specs of one file run in order on one chain.
liveStackGate();

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
