import { expect, test } from "@playwright/test";
import {
  PRICE_TUST,
  TEST_TIMEOUT,
  STEP_TIMEOUT,
  SERVICE,
  GATEWAY,
  call,
  parties,
  balanceOf,
  ORACLE,
  Repo,
  SERVICE_T,
  SERVICE_C,
  CcpView,
  ccpOf,
  paidOf,
  ClearingView,
  clearingOf,
  marginOf,
  defaultsOf,
  fullClearingOf,
  ccpMemberOf,
  setCcpDates,
  setTustFeed,
  ccpReady,
  ccpPurchased,
  ccpRound,
  ccpClearLeftovers,
  liveStackGate,
} from "./harness";

// Live specs of the ccp module (task-live-suite-modules); shared helpers are in ./harness.ts. Each module runs on its
// own stack in e2e-live-stack.yml, so the specs of one file run in order on one chain.
liveStackGate();

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
