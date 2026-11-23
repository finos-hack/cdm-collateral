import { expect, test } from "@playwright/test";
import {
  TEST_TIMEOUT,
  STEP_TIMEOUT,
  SERVICE,
  GATEWAY,
  ZERO_HASH,
  call,
  parties,
  balanceOf,
  ORACLE,
  RegisterBreaksView,
  setTransferAgentPaused,
  LoanCompletion,
  GmslaTerms,
  scaledPrice,
  Loan,
  GmslaMarking,
  LoanCloseOutView,
  LoanDefaultView,
  liveStackGate,
} from "./harness";

// Live specs of the gmsla module (task-live-suite-modules); shared helpers are in ./harness.ts. Each module runs on its
// own stack in e2e-live-stack.yml, so the specs of one file run in order on one chain.
liveStackGate();

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
      // The ledger side is complete: the delivery's anchor is, and only the transfer agent's confirmation is missing.
      expect(l.recordKeeper![0]).toMatchObject({ anchorStatus: "Complete", documentVerified: true });
      expect(l.recordKeeper![0].anchorHash).toMatch(/^0x[0-9a-f]{64}$/i);
    }
    expect((await loanOf(SERVICE.A, loanId!))!.recordKeeper![0].anchorHash).toBe((await loanOf(SERVICE.B, loanId!))!.recordKeeper![0].anchorHash);
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
