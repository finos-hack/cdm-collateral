import { expect, test } from "@playwright/test";
import {
  TEST_TIMEOUT,
  STEP_TIMEOUT,
  SERVICE,
  GATEWAY,
  call,
  parties,
  balanceOf,
  ORACLE,
  RegisterBreaksView,
  setTransferAgentPaused,
  TripartyCompletion,
  scaledPrice,
  SERVICE_T,
  TripartyTermsView,
  TripartyView,
  TripartyRepoView,
  TripartyTradeTermsView,
  tripartyTermsOf,
  tripartyRepoOf,
  TripartyRevaluationView,
  TripartySubstitutionView,
  TripartyReportTerms,
  TripartyTradeEndRepo,
  liveStackGate,
} from "./harness";

// Live specs of the triparty module (task-live-suite-modules); shared helpers are in ./harness.ts. Each module runs on its
// own stack in e2e-live-stack.yml, so the specs of one file run in order on one chain.
liveStackGate();

test("flow-registered-collateral-triparty: A proposes triparty terms with tMMF in the profile -> B and T check and affirm -> A deposits tMMF, not complete until the transfer agent confirms -> A withdraws it, which waits too -> A terminates the terms", async () => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const termsOf = async (svc: string, id: string) => (await call<{ terms: TripartyCompletion[] }>(`${svc}/triparty`)).terms.find((t) => t.termsId === id);
  const amount = 10_000 + (Date.now() % 9000);
  let id = "";
  let deposited = false;
  try {
    // Setup: close A-giver terms an earlier run left open, so A can propose.
    for (const t of (await call<TripartyView>(`${SERVICE.A}/triparty`)).terms.filter((x) => x.giver === "A")) {
      if (t.state === "proposed") await call(`${SERVICE.A}/triparty/terms/${t.termsId}/refuse`, "POST", {});
      if (t.state === "effective") await call(`${SERVICE.A}/triparty/terms/${t.termsId}/terminate`, "POST", {});
    }
    await expect.poll(async () => (await call<TripartyView>(`${SERVICE.A}/triparty`)).canPropose, { timeout: 60_000 }).toBe(true);

    // A proposes the profile with tMMF; B and T each check it against their own build and affirm.
    ({ termsId: id } = await call<{ termsId: string }>(`${SERVICE.A}/triparty/terms`, "POST", { registeredCollateral: true }));
    for (const svc of [SERVICE.B, SERVICE_T]) {
      await expect.poll(async () => (await termsOf(svc, id))?.canAffirm ?? false, { timeout: 60_000 }).toBe(true);
      await call(`${svc}/triparty/terms/${id}/affirm`, "POST", {});
    }
    for (const svc of [SERVICE.A, SERVICE.B, SERVICE_T]) {
      await expect.poll(async () => {
        const t = await termsOf(svc, id);
        return t?.state === "effective" && t.verified ? true : (t?.problem ?? t?.state ?? null);
      }, { timeout: 60_000 }).toBe(true);
    }
    const t = (await termsOf(SERVICE_T, id))!;
    expect(t.terms!.profile.map((e) => [e.token, e.haircutBps, e.concentrationLimit])).toEqual([["tUST", 200, null], ["tAGY", 300, "0.5"], ["tMMF", 400, null]]);

    // A deposits tMMF with the agent while the transfer agent is paused: in the agent's book, not complete.
    await setTransferAgentPaused(true);
    await call(`${SERVICE.A}/triparty/terms/${id}/deposit`, "POST", { token: "tMMF", amount, rank: 1 });
    deposited = true;
    for (const svc of [SERVICE.A, SERVICE.B, SERVICE_T]) {
      await expect.poll(async () => (await termsOf(svc, id))?.recordKeeper?.length ?? 0, { timeout: 60_000 }).toBe(1);
      const v = (await termsOf(svc, id))!;
      expect(v.recordKeeperError).toBeUndefined();
      expect(v.settlementComplete).toBe(false);
      expect(v.recordKeeper![0].identifier).toContain("Deposited");
      expect(v.recordKeeper![0].tokens.find((x) => x.symbol === "tMMF")).toMatchObject({ confirmed: false, complete: false });
    }
    expect((await call<RegisterBreaksView>(`${SERVICE.A}/register/breaks`)).tokens.find((x) => x.symbol === "tMMF")!.reconciled).toBe(false);
    await setTransferAgentPaused(false);
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await termsOf(svc, id))?.settlementComplete, { timeout: 60_000 }).toBe(true);
    }

    // The withdrawal waits for the transfer agent in the same way.
    await setTransferAgentPaused(true);
    await call(`${SERVICE.A}/triparty/terms/${id}/withdraw`, "POST", { token: "tMMF", amount });
    deposited = false;
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await termsOf(svc, id))?.recordKeeper?.length ?? 0, { timeout: 60_000 }).toBe(2);
      const v = (await termsOf(svc, id))!;
      expect(v.settlementComplete).toBe(false);
      expect(v.recordKeeper!.map((r) => r.complete)).toEqual([true, false]);
    }
    await setTransferAgentPaused(false);
    for (const svc of [SERVICE.A, SERVICE_T]) {
      await expect.poll(async () => (await termsOf(svc, id))?.settlementComplete, { timeout: 60_000 }).toBe(true);
    }
    await expect.poll(async () => (await call<RegisterBreaksView>(`${SERVICE.A}/register/breaks`)).tokens.find((x) => x.symbol === "tMMF")!.reconciled, { timeout: 60_000 }).toBe(true);
  } finally {
    await setTransferAgentPaused(false);
    if (id) {
      if (deposited) await call(`${SERVICE.A}/triparty/terms/${id}/withdraw`, "POST", { token: "tMMF", amount }).catch(() => undefined);
      const t = await termsOf(SERVICE.A, id).catch(() => undefined);
      if (t?.state === "effective") await call(`${SERVICE.A}/triparty/terms/${id}/terminate`, "POST", {}).catch(() => undefined);
      if (t?.state === "proposed") await call(`${SERVICE.A}/triparty/terms/${id}/refuse`, "POST", {}).catch(() => undefined);
    }
  }
});

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
