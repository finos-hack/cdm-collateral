import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toHex, zeroHash, getAddress } from "viem";

// Contract unit + property tests (architecture/testing.md, Smart contracts — unit / property). Runs on the in-memory
// EDR network. Enum numeric values follow CollateralTypes.sol: CallKind {IM:0, VM:1, Return:2};
// ResponseType {Full:0, Partial:1, Dispute:2}.
const IM = 0, VM = 1, RETURN = 2;
const FULL = 0, PARTIAL = 1, DISPUTE = 2;
const SCALE = 100000000n; // OracleFeed.PRICE_SCALE = 1e8
const id = (n: number) => keccak256(toHex(`C-${n}`));

const { viem } = await network.connect();

describe("CDM collateral contracts", async () => {
  let operator: any, bankA: any, bankB: any;
  let opAddr: `0x${string}`, aAddr: `0x${string}`, bAddr: `0x${string}`;

  before(async () => {
    const wallets = await viem.getWalletClients();
    [operator, bankA, bankB] = wallets;
    opAddr = getAddress(operator.account.address);
    aAddr = getAddress(bankA.account.address);
    bAddr = getAddress(bankB.account.address);
  });

  let oracle: any, marginCall: any, control: any, tUST: any, tMMF: any;

  async function deployStack() {
    marginCall = await viem.deployContract("MarginCall", []);
    oracle = await viem.deployContract("OracleFeed", [opAddr]);
    control = await viem.deployContract("CollateralControl", [marginCall.address, oracle.address]);
    await marginCall.write.setControl([control.address]);

    tUST = await viem.deployContract("TokenizedCollateral", ["Tokenized UST", "tUST", "US912810TM60", "912810TM6", "QX4V2W9N3"]);
    tMMF = await viem.deployContract("TokenizedCollateral", ["Tokenized MMF", "tMMF", "US9128100000", "912810000", "QZ0000000"]);

    // Opening balances: BANK-A holds collateral to pledge.
    await tUST.write.mint([aAddr, 1000n]);
    await tMMF.write.mint([aAddr, 1000n]);

    // Eligibility schedule (IM): tUST 2% haircut, tMMF 8% haircut.
    await control.write.setEligibility([tUST.address, true, 200]);
    await control.write.setEligibility([tMMF.address, true, 800]);

    // Oracle prices: tUST = 100.00, tMMF = 50.00.
    await oracle.write.publishPrice([tUST.address, 100n * SCALE], { account: operator.account });
    await oracle.write.publishPrice([tMMF.address, 50n * SCALE], { account: operator.account });
  }

  beforeEach(deployStack);

  describe("OracleFeed", () => {
    it("only the publisher may write", async () => {
      await assert.rejects(oracle.write.publishPrice([tUST.address, 1n], { account: bankA.account }));
      await assert.rejects(oracle.write.setDefault([aAddr, true], { account: bankA.account }));
    });
    it("stores prices and default status", async () => {
      assert.equal(await oracle.read.price([tUST.address]), 100n * SCALE);
      assert.equal(await oracle.read.isDefaulted([aAddr]), false);
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      assert.equal(await oracle.read.isDefaulted([aAddr]), true);
    });
    it("reverts reading a price that was never published", async () => {
      await assert.rejects(oracle.read.price([bAddr]));
    });
  });

  describe("initial margin: call, propose, pledge", () => {
    // BANK-B (secured party) calls initial margin; BANK-A (pledgor) delivers into escrow.
    const C = id(1);
    const agreed = 1000n * SCALE;

    async function issueAndAgree() {
      await marginCall.write.issueCall([C, IM, aAddr, agreed, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
    }

    it("runs the full happy path and escrows the collateral", async () => {
      await issueAndAgree();
      // 11 tUST after 2% haircut = 11 * 100 * 0.98 = 1078 >= 1000.
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await control.write.pledge([C, 0n, zeroHash], { account: bankA.account });

      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 11n);
      assert.equal(await tUST.read.balanceOf([control.address]), 11n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 989n);
      const call = await marginCall.read.getCall([C]);
      assert.equal(call.state, 5); // Settled
    });

    it("rejects a response from the wrong party", async () => {
      await marginCall.write.issueCall([C, IM, aAddr, agreed, 0n, zeroHash], { account: bankB.account });
      await assert.rejects(marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankB.account }));
    });

    it("rejects a pledge before the proposal is accepted", async () => {
      await issueAndAgree();
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await assert.rejects(control.write.pledge([C, 0n, zeroHash], { account: bankA.account })); // ProposalNotAccepted
    });

    it("rejects a pledge whose value after haircut is below the agreed amount", async () => {
      await issueAndAgree();
      // 10 tUST after 2% = 980 < 1000.
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 10n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 10n], { account: bankA.account });
      await assert.rejects(control.write.pledge([C, 0n, zeroHash], { account: bankA.account })); // ValueBelowAgreed
    });

    it("rejects a proposal decision from anyone but the caller", async () => {
      await issueAndAgree();
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await assert.rejects(marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankA.account }));
    });
  });

  describe("replacement of a cancelled call (task-csa-call-replacement)", () => {
    const OLD = id(50), NEW = id(51), OTHER = id(52);
    const amount = 1000n * SCALE;
    const h = (s: string) => keccak256(toHex(s));

    async function cancelled() {
      await marginCall.write.issueCall([OLD, IM, aAddr, amount, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.withdrawCall([OLD, h("w")], { account: bankB.account });
    }

    it("links a replacement to the cancelled call, once", async () => {
      await cancelled();
      await marginCall.write.issueReplacementCall([NEW, OLD, IM, aAddr, 900n * SCALE, 0n, h("i")], { account: bankB.account });
      assert.equal((await marginCall.read.getCall([NEW])).state, 1); // Issued
      assert.equal(await marginCall.read.replacementOf([OLD]), NEW);
      assert.equal(await marginCall.read.replaces([NEW]), OLD);
      const events = await marginCall.getEvents.CallReplaced();
      assert.equal(events.length, 1);
      assert.equal(events[0].args.replacedCallId, OLD);
      await assert.rejects(marginCall.write.issueReplacementCall([OTHER, OLD, IM, aAddr, amount, 0n, h("i")], { account: bankB.account }));
    });

    it("does not replace a call that is not cancelled", async () => {
      await marginCall.write.issueCall([OLD, IM, aAddr, amount, 0n, zeroHash], { account: bankB.account });
      await assert.rejects(marginCall.write.issueReplacementCall([NEW, OLD, IM, aAddr, amount, 0n, h("i")], { account: bankB.account }));
      await assert.rejects(marginCall.write.issueReplacementCall([NEW, id(59), IM, aAddr, amount, 0n, h("i")], { account: bankB.account }));
    });

    it("requires the same caller, called party and kind", async () => {
      await cancelled();
      await assert.rejects(marginCall.write.issueReplacementCall([NEW, OLD, IM, bAddr, amount, 0n, h("i")], { account: bankA.account }));
      await assert.rejects(marginCall.write.issueReplacementCall([NEW, OLD, IM, opAddr, amount, 0n, h("i")], { account: bankB.account }));
      await assert.rejects(marginCall.write.issueReplacementCall([NEW, OLD, VM, aAddr, amount, 0n, h("i")], { account: bankB.account }));
      await assert.rejects(marginCall.write.issueReplacementCall([OLD, OLD, IM, aAddr, amount, 0n, h("i")], { account: bankB.account }));
    });
  });

  describe("margin call cancellation (task-csa-call-cancellation)", () => {
    const C = id(40);
    const amount = 1000n * SCALE;
    const CANCELLED = 7, PROPOSAL_CANCELLED = 4;
    const h = (s: string) => keccak256(toHex(s));

    async function issue() {
      await marginCall.write.issueCall([C, IM, aAddr, amount, 0n, zeroHash], { account: bankB.account });
    }

    it("lets the calling party withdraw an unanswered call, and nobody else", async () => {
      await issue();
      await assert.rejects(marginCall.write.withdrawCall([C, h("w")], { account: bankA.account }));
      await marginCall.write.withdrawCall([C, h("w")], { account: bankB.account });
      assert.equal((await marginCall.read.getCall([C])).state, CANCELLED);
      await assert.rejects(marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account }));
    });

    it("does not withdraw an answered call or take a request on an unanswered one", async () => {
      await issue();
      await assert.rejects(marginCall.write.requestCancellation([C, h("r")], { account: bankB.account }));
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await assert.rejects(marginCall.write.withdrawCall([C, h("w")], { account: bankB.account }));
    });

    it("cancels an answered call on request and acceptance, voiding the accepted proposal and blocking the pledge", async () => {
      await issue();
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await marginCall.write.requestCancellation([C, h("r")], { account: bankB.account });
      assert.equal((await marginCall.read.getCall([C])).cancellationRequestedBy, bAddr);
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await assert.rejects(control.write.pledge([C, 0n, zeroHash], { account: bankA.account })); // CancellationPending
      await assert.rejects(marginCall.write.decideCancellation([C, true, h("d")], { account: bankB.account })); // the requester
      await marginCall.write.decideCancellation([C, true, h("d")], { account: bankA.account });
      const call = await marginCall.read.getCall([C]);
      assert.equal(call.state, CANCELLED);
      assert.equal(call.cancellationRequestedBy, "0x0000000000000000000000000000000000000000");
      assert.equal((await marginCall.read.getProposal([C, 0n])).state, PROPOSAL_CANCELLED);
      await assert.rejects(control.write.pledge([C, 0n, zeroHash], { account: bankA.account })); // BadState
      assert.equal(await tUST.read.balanceOf([aAddr]), 1000n);
    });

    it("leaves the call where it was on refusal, takes one request at a time, and cancels a wholly disputed call", async () => {
      await issue();
      await marginCall.write.respond([C, DISPUTE, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.requestCancellation([C, h("r1")], { account: bankA.account });
      await assert.rejects(marginCall.write.requestCancellation([C, h("r2")], { account: bankB.account }));
      await marginCall.write.decideCancellation([C, false, h("d1")], { account: bankB.account });
      assert.equal((await marginCall.read.getCall([C])).state, 4); // Disputed
      await assert.rejects(marginCall.write.decideCancellation([C, true, h("d2")], { account: bankB.account })); // no request
      await marginCall.write.requestCancellation([C, h("r3")], { account: bankA.account });
      await marginCall.write.decideCancellation([C, true, h("d3")], { account: bankB.account });
      assert.equal((await marginCall.read.getCall([C])).state, CANCELLED);
    });

    it("does not cancel a settled call", async () => {
      await issue();
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await control.write.pledge([C, 0n, zeroHash], { account: bankA.account });
      await assert.rejects(marginCall.write.requestCancellation([C, h("r")], { account: bankB.account }));
    });
  });

  describe("return of initial margin", () => {
    const C = id(2), R = id(3);
    const agreed = 1000n * SCALE;

    async function pledge11() {
      await marginCall.write.issueCall([C, IM, aAddr, agreed, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await control.write.pledge([C, 0n, zeroHash], { account: bankA.account });
    }

    it("releases pledged collateral on an agreed return", async () => {
      await pledge11();
      // BANK-A (pledgor) calls for a return; BANK-B (secured party) agrees (respond) and releases (settle).
      await marginCall.write.issueCall([R, RETURN, bAddr, 300n * SCALE, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.respond([R, FULL, 0n, zeroHash], { account: bankB.account });
      await control.write.returnCollateral([R, [{ token: tUST.address, qty: 3n }], zeroHash], { account: bankB.account });
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 8n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 992n); // 989 + 3 back
      assert.equal((await marginCall.read.getCall([R])).state, 5); // Settled
    });

    it("rejects a return from the wrong party", async () => {
      await pledge11();
      await marginCall.write.issueCall([R, RETURN, bAddr, 300n * SCALE, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.respond([R, FULL, 0n, zeroHash], { account: bankB.account });
      await assert.rejects(control.write.returnCollateral([R, [{ token: tUST.address, qty: 3n }], zeroHash], { account: bankA.account }));
    });

    it("rejects releasing more than the return amount", async () => {
      await pledge11();
      await marginCall.write.issueCall([R, RETURN, bAddr, 300n * SCALE, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.respond([R, FULL, 0n, zeroHash], { account: bankB.account });
      // 4 tUST after 2% = 392 > 300 return amount.
      await assert.rejects(control.write.returnCollateral([R, [{ token: tUST.address, qty: 4n }], zeroHash], { account: bankB.account }));
    });
  });

  describe("default and enforcement", () => {
    const C = id(4);
    const agreed = 1000n * SCALE;

    async function pledge11() {
      await marginCall.write.issueCall([C, IM, aAddr, agreed, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await control.write.pledge([C, 0n, zeroHash], { account: bankA.account });
    }

    it("rejects enforcement before a default is on the feed", async () => {
      await pledge11();
      await assert.rejects(control.write.enforce([C], { account: bankB.account })); // NoDefault
    });

    it("seizes pledged collateral after the default is published", async () => {
      await pledge11();
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.enforce([C], { account: bankB.account });
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 0n);
      assert.equal(await tUST.read.balanceOf([bAddr]), 11n);
    });

    it("property: total tUST supply is conserved across pledge and enforce", async () => {
      const supply = await tUST.read.totalSupply();
      await pledge11();
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.enforce([C], { account: bankB.account });
      const sum =
        (await tUST.read.balanceOf([aAddr])) +
        (await tUST.read.balanceOf([bAddr])) +
        (await tUST.read.balanceOf([control.address]));
      assert.equal(sum, supply);
    });

    it("rejects enforcement by anyone but the secured party", async () => {
      await pledge11();
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await assert.rejects(control.write.enforce([C], { account: bankA.account }));
    });
  });

  describe("two-way initial margin: reclaim on the secured party's default", () => {
    const H = keccak256(toHex("cdm-reclaim"));
    const R = id(40);

    // Both legs: A pledges 11 tUST to B, B pledges 4 tMMF to A.
    async function pledgeBothLegs() {
      await tMMF.write.mint([bAddr, 100n]);
      const ca = id(41), cb = id(42);
      await marginCall.write.issueCall([ca, IM, aAddr, 1n * SCALE, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([ca, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([ca, [{ token: tUST.address, qty: 11n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([ca, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 11n], { account: bankA.account });
      await control.write.pledge([ca, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.issueCall([cb, IM, bAddr, 1n * SCALE, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.respond([cb, FULL, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.propose([cb, [{ token: tMMF.address, qty: 4n }], zeroHash], { account: bankB.account });
      await marginCall.write.decideProposal([cb, 0n, true, zeroHash], { account: bankA.account });
      await tMMF.write.approve([control.address, 4n], { account: bankB.account });
      await control.write.pledge([cb, 0n, zeroHash], { account: bankB.account });
      return { ca, cb };
    }

    it("keeps the two legs apart in escrow", async () => {
      await pledgeBothLegs();
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 11n);
      assert.equal(await control.read.pledgedBalance([bAddr, aAddr, tMMF.address]), 4n);
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tMMF.address]), 0n);
    });

    it("A defaults: B enforces against A's leg and reclaims its own", async () => {
      const { ca } = await pledgeBothLegs();
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.enforce([ca], { account: bankB.account });
      await control.write.reclaim([R, aAddr, H], { account: bankB.account });
      assert.equal(await tUST.read.balanceOf([bAddr]), 11n);
      assert.equal(await tMMF.read.balanceOf([bAddr]), 100n);
      assert.equal(await control.read.pledgedBalance([bAddr, aAddr, tMMF.address]), 0n);
      assert.equal(await control.read.reclaimCdmHash([R]), H);
      const [ev] = await control.getEvents.Reclaimed();
      assert.equal(ev.args.pledgor?.toLowerCase(), bAddr.toLowerCase());
      assert.equal(ev.args.securedParty?.toLowerCase(), aAddr.toLowerCase());
    });

    it("rejects a reclaim before the secured party's default, by the defaulting party, without a hash, with a reused id, or with nothing pledged", async () => {
      await pledgeBothLegs();
      await assert.rejects(control.write.reclaim([R, aAddr, H], { account: bankB.account })); // NoDefault
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await assert.rejects(control.write.reclaim([R, bAddr, H], { account: bankA.account })); // B not in default
      await assert.rejects(control.write.reclaim([R, aAddr, zeroHash], { account: bankB.account }));
      await control.write.reclaim([R, aAddr, H], { account: bankB.account });
      await assert.rejects(control.write.reclaim([R, aAddr, H], { account: bankB.account })); // reused id
      await assert.rejects(control.write.reclaim([id(43), aAddr, H], { account: bankB.account })); // NothingPledged
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 11n); // A's leg untouched
    });
  });

  describe("variation margin: title transfer", () => {
    const C = id(5);
    const agreed = 500n * SCALE;

    it("moves title directly from deliverer to receiver", async () => {
      // BANK-B calls VM, BANK-A delivers title (no escrow).
      await marginCall.write.issueCall([C, VM, aAddr, agreed, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 5n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 5n], { account: bankA.account });
      await control.write.settleByTransfer([C, 0n, zeroHash], { account: bankA.account });
      assert.equal(await tUST.read.balanceOf([bAddr]), 5n);
      assert.equal(await tUST.read.balanceOf([control.address]), 0n); // title passed, nothing escrowed
    });

    it("returns variation margin by transferring equivalent credit support back", async () => {
      const R = id(6);
      // Deliver VM title A -> B first.
      await marginCall.write.issueCall([C, VM, aAddr, agreed, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tUST.address, qty: 5n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 5n], { account: bankA.account });
      await control.write.settleByTransfer([C, 0n, zeroHash], { account: bankA.account });

      // BANK-A calls for a VM return; BANK-B agrees (respond) and transfers equivalent support back (settle).
      await marginCall.write.issueCall([R, RETURN, bAddr, agreed, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.respond([R, FULL, 0n, zeroHash], { account: bankB.account });
      await tUST.write.approve([control.address, 5n], { account: bankB.account });
      await control.write.returnByTransfer([R, [{ token: tUST.address, qty: 5n }], zeroHash], { account: bankB.account });
      assert.equal(await tUST.read.balanceOf([bAddr]), 0n); // credit support returned to A
      assert.equal((await marginCall.read.getCall([R])).state, 5); // Settled
    });
  });
  // tUST is 100.00 at a 2% haircut (98.00 a unit after haircut), tMMF 50.00 at 8% (46.00 a unit).
  async function pledgeFor(callId: `0x${string}`, qty: bigint) {
    await marginCall.write.issueCall([callId, IM, aAddr, 1n * SCALE, 0n, zeroHash], { account: bankB.account });
    await marginCall.write.respond([callId, FULL, 0n, zeroHash], { account: bankA.account });
    await marginCall.write.propose([callId, [{ token: tUST.address, qty }], zeroHash], { account: bankA.account });
    await marginCall.write.decideProposal([callId, 0n, true, zeroHash], { account: bankB.account });
    await tUST.write.approve([control.address, qty], { account: bankA.account });
    await control.write.pledge([callId, 0n, zeroHash], { account: bankA.account });
  }
  const H = keccak256(toHex("cdm"));

  describe("close-out netting on default (G15)", () => {
    const O = id(20);

    it("applies pledged collateral up to the amount owed, in whole units, and returns the surplus", async () => {
      await pledgeFor(id(21), 11n); // 1,078.00 after haircut
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.closeOut([O, aAddr, 500n * SCALE, H], { account: bankB.account });
      // ceil(500 / 98) = 6 units (588.00) applied, 5 returned.
      assert.equal(await tUST.read.balanceOf([bAddr]), 6n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 1000n - 11n + 5n);
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 0n);
      assert.equal(await control.read.closeOutCdmHash([O]), H);
      const [ev] = await control.getEvents.ClosedOut();
      assert.equal(ev.args.owed, 500n * SCALE);
      assert.equal(ev.args.applied, 588n * SCALE);
    });

    it("applies everything when the amount owed exceeds the collateral held", async () => {
      await pledgeFor(id(22), 11n);
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.closeOut([O, aAddr, 2000n * SCALE, H], { account: bankB.account });
      assert.equal(await tUST.read.balanceOf([bAddr]), 11n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 1000n - 11n);
    });

    it("returns all collateral when nothing is owed", async () => {
      await pledgeFor(id(23), 11n);
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.closeOut([O, aAddr, 0n, H], { account: bankB.account });
      assert.equal(await tUST.read.balanceOf([bAddr]), 0n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 1000n);
    });

    it("applies across tokens in the order first pledged", async () => {
      await pledgeFor(id(24), 2n); // 196.00
      const C = id(25);
      await marginCall.write.issueCall([C, IM, aAddr, 1n * SCALE, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([C, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([C, [{ token: tMMF.address, qty: 10n }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([C, 0n, true, zeroHash], { account: bankB.account });
      await tMMF.write.approve([control.address, 10n], { account: bankA.account });
      await control.write.pledge([C, 0n, zeroHash], { account: bankA.account });
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.closeOut([O, aAddr, 300n * SCALE, H], { account: bankB.account });
      // 2 tUST (196.00), then ceil(104 / 46) = 3 tMMF (138.00): 334.00 applied, 7 tMMF returned.
      assert.equal(await tUST.read.balanceOf([bAddr]), 2n);
      assert.equal(await tMMF.read.balanceOf([bAddr]), 3n);
      assert.equal(await tMMF.read.balanceOf([aAddr]), 1000n - 3n);
      const [ev] = await control.getEvents.ClosedOut();
      assert.equal(ev.args.applied, 334n * SCALE);
    });

    it("rejects a close-out before a default is on the feed, without a statement hash, with a reused id, or with nothing pledged", async () => {
      await pledgeFor(id(26), 11n);
      await assert.rejects(control.write.closeOut([O, aAddr, 1n, H], { account: bankB.account })); // NoDefault
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await assert.rejects(control.write.closeOut([O, aAddr, 1n, zeroHash], { account: bankB.account }));
      await control.write.closeOut([O, aAddr, 1n, H], { account: bankB.account });
      await assert.rejects(control.write.closeOut([O, aAddr, 1n, H], { account: bankB.account })); // CloseOutExists
      await assert.rejects(control.write.closeOut([id(27), aAddr, 1n, H], { account: bankB.account })); // NothingPledged
    });

    it("property: total supply is conserved across a close-out", async () => {
      const supply = await tUST.read.totalSupply();
      await pledgeFor(id(28), 11n);
      await oracle.write.setDefault([aAddr, true], { account: operator.account });
      await control.write.closeOut([O, aAddr, 333n * SCALE, H], { account: bankB.account });
      const sum = (await tUST.read.balanceOf([aAddr])) + (await tUST.read.balanceOf([bAddr])) + (await tUST.read.balanceOf([control.address]));
      assert.equal(sum, supply);
    });
  });

  describe("substitution of pledged collateral (G16)", () => {
    const S = id(30);
    const original = () => [{ token: tUST.address, qty: 5n }]; // 490.00 after haircut
    const substitute = (qty: bigint) => [{ token: tMMF.address, qty }]; // 46.00 a unit after haircut

    it("requests, consents and settles: the substitute enters escrow and the originals go back", async () => {
      await pledgeFor(id(31), 11n);
      await control.write.requestSubstitution([S, bAddr, original(), substitute(11n), H], { account: bankA.account }); // 506.00
      assert.equal((await control.read.getSubstitution([S])).state, 1); // Requested
      await control.write.decideSubstitution([S, true, H], { account: bankB.account });
      await tMMF.write.approve([control.address, 11n], { account: bankA.account });
      await control.write.settleSubstitution([S, H], { account: bankA.account });
      const sub = await control.read.getSubstitution([S]);
      assert.equal(sub.state, 4); // Settled
      assert.equal(sub.settleCdmHash, H);
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 6n);
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tMMF.address]), 11n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 1000n - 11n + 5n);
      assert.equal(await tMMF.read.balanceOf([aAddr]), 1000n - 11n);
      const [orig, subst] = await control.read.getSubstitutionAssets([S]);
      assert.equal(orig[0].qty, 5n);
      assert.equal(subst[0].qty, 11n);
    });

    it("does not settle a refused substitution or one not yet consented", async () => {
      await pledgeFor(id(32), 11n);
      await control.write.requestSubstitution([S, bAddr, original(), substitute(11n), H], { account: bankA.account });
      await tMMF.write.approve([control.address, 11n], { account: bankA.account });
      await assert.rejects(control.write.settleSubstitution([S, H], { account: bankA.account })); // BadState: not consented
      await control.write.decideSubstitution([S, false, H], { account: bankB.account });
      assert.equal((await control.read.getSubstitution([S])).state, 3); // Refused
      await assert.rejects(control.write.settleSubstitution([S, H], { account: bankA.account }));
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 11n);
    });

    it("rejects a substitute worth less than the originals and originals not in escrow", async () => {
      await pledgeFor(id(33), 11n);
      await assert.rejects(control.write.requestSubstitution([S, bAddr, original(), substitute(10n), H], { account: bankA.account })); // 460 < 490
      await assert.rejects(control.write.requestSubstitution([S, bAddr, [{ token: tUST.address, qty: 12n }], substitute(100n), H], { account: bankA.account }));
    });

    it("lets only the secured party decide and only the pledgor settle", async () => {
      await pledgeFor(id(34), 11n);
      await control.write.requestSubstitution([S, bAddr, original(), substitute(11n), H], { account: bankA.account });
      await assert.rejects(control.write.decideSubstitution([S, true, H], { account: bankA.account }));
      await control.write.decideSubstitution([S, true, H], { account: bankB.account });
      await assert.rejects(control.write.settleSubstitution([S, H], { account: bankB.account }));
    });

    it("checks the value again at settlement", async () => {
      await pledgeFor(id(35), 11n);
      await control.write.requestSubstitution([S, bAddr, original(), substitute(11n), H], { account: bankA.account });
      await control.write.decideSubstitution([S, true, H], { account: bankB.account });
      await oracle.write.publishPrice([tMMF.address, 40n * SCALE], { account: operator.account }); // 36.80 a unit: 404.80 < 490
      await tMMF.write.approve([control.address, 11n], { account: bankA.account });
      await assert.rejects(control.write.settleSubstitution([S, H], { account: bankA.account })); // SubstituteBelowOriginal
    });
  });
  describe("interest on cash collateral (G17)", () => {
    const N = id(40);
    let tUSD: any;
    beforeEach(async () => {
      tUSD = await viem.deployContract("TokenizedCollateral", ["USD deposit token", "tUSD", "", "", ""]);
      await control.write.setEligibility([tUSD.address, true, 0]);
      await tUSD.write.mint([aAddr, 1000n]);
      await tUSD.write.mint([bAddr, 1000n]);
    });

    it("pays a positive Interest Amount from the secured party to the pledgor at once", async () => {
      await tUSD.write.approve([control.address, 35n], { account: bankB.account });
      await control.write.stateInterest([N, aAddr, tUSD.address, 35n, H], { account: bankB.account });
      const s = await control.read.getInterest([N]);
      assert.equal(s.state, 2); // Settled
      assert.equal(s.amount, 35n);
      assert.equal(s.cdmHash, H);
      assert.equal(await tUSD.read.balanceOf([aAddr]), 1035n);
      assert.equal(await tUSD.read.balanceOf([bAddr]), 965n);
    });

    it("records a negative Interest Amount for the pledgor to pay", async () => {
      await control.write.stateInterest([N, aAddr, tUSD.address, -5n, H], { account: bankB.account });
      assert.equal((await control.read.getInterest([N])).state, 1); // Stated
      await assert.rejects(control.write.payInterest([N], { account: bankB.account })); // WrongParty
      await tUSD.write.approve([control.address, 5n], { account: bankA.account });
      await control.write.payInterest([N], { account: bankA.account });
      assert.equal((await control.read.getInterest([N])).state, 2);
      assert.equal(await tUSD.read.balanceOf([aAddr]), 995n);
      assert.equal(await tUSD.read.balanceOf([bAddr]), 1005n);
      await assert.rejects(control.write.payInterest([N], { account: bankA.account })); // BadState
    });

    it("settles a zero amount with no transfer", async () => {
      await control.write.stateInterest([N, aAddr, tUSD.address, 0n, H], { account: bankB.account });
      assert.equal((await control.read.getInterest([N])).state, 2);
      assert.equal(await tUSD.read.balanceOf([aAddr]), 1000n);
    });

    it("rejects a reused id, a missing hash, a non-cash token, the secured party as pledgor and an unknown id", async () => {
      await control.write.stateInterest([N, aAddr, tUSD.address, 0n, H], { account: bankB.account });
      await assert.rejects(control.write.stateInterest([N, aAddr, tUSD.address, 0n, H], { account: bankB.account }));
      await assert.rejects(control.write.stateInterest([id(41), aAddr, tUSD.address, 0n, zeroHash], { account: bankB.account }));
      await assert.rejects(control.write.stateInterest([id(42), aAddr, tUST.address, 0n, H], { account: bankB.account })); // haircut
      await assert.rejects(control.write.stateInterest([id(43), bAddr, tUSD.address, 0n, H], { account: bankB.account }));
      await assert.rejects(control.read.getInterest([id(44)]));
      await assert.rejects(control.write.payInterest([id(44)], { account: bankA.account }));
    });
  });
  describe("settlement netting (task-csa-settlement-netting)", () => {
    // BANK-B calls VM from BANK-A (A pays B), BANK-A calls a VM return from BANK-B (B pays A), and BANK-B states an
    // Interest Amount held for netting (B pays A when positive). One net transfer of tUSD settles all of them.
    const V = id(60), R = id(61), I = id(62), N = id(63);
    const NH = keccak256(toHex("netting"));
    const hashes = [keccak256(toHex("settle-V")), keccak256(toHex("settle-R"))];
    let tUSD: any;
    beforeEach(async () => {
      tUSD = await viem.deployContract("TokenizedCollateral", ["USD deposit token", "tUSD", "", "", ""]);
      await control.write.setEligibility([tUSD.address, true, 0]);
      await oracle.write.publishPrice([tUSD.address, 1n * SCALE], { account: operator.account });
      await tUSD.write.mint([aAddr, 1000n]);
      await tUSD.write.mint([bAddr, 1000n]);
    });

    async function vmCall(callId: `0x${string}`, usd: bigint, token = tUSD.address) {
      await marginCall.write.issueCall([callId, VM, aAddr, usd * SCALE, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([callId, FULL, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.propose([callId, [{ token, qty: usd }], zeroHash], { account: bankA.account });
      await marginCall.write.decideProposal([callId, 0n, true, zeroHash], { account: bankB.account });
    }
    async function returnCall(callId: `0x${string}`, usd: bigint) {
      await marginCall.write.issueCall([callId, RETURN, bAddr, usd * SCALE, 0n, zeroHash], { account: bankA.account });
      await marginCall.write.respond([callId, FULL, 0n, zeroHash], { account: bankB.account });
    }

    it("settles a VM call, a VM return and an Interest Amount by one transfer of the net", async () => {
      await vmCall(V, 100n);
      await returnCall(R, 30n);
      await control.write.stateInterestForNetting([I, aAddr, tUSD.address, 5n, H], { account: bankB.account });
      assert.equal((await control.read.getInterest([I])).state, 1); // Stated: held, nothing paid
      assert.equal(await tUSD.read.balanceOf([aAddr]), 1000n);

      // A owes 100, B owes 30 + 5: A pays 65.
      await tUSD.write.approve([control.address, 65n], { account: bankA.account });
      await control.write.settleNetted([N, [V, R], hashes, [I], tUSD.address, NH], { account: bankA.account });
      assert.equal(await tUSD.read.balanceOf([aAddr]), 935n);
      assert.equal(await tUSD.read.balanceOf([bAddr]), 1065n);
      for (const [c, h] of [[V, hashes[0]], [R, hashes[1]]]) {
        const call = await marginCall.read.getCall([c]);
        assert.equal(call.state, 5); // Settled
        assert.equal(call.settleCdmHash, h);
        assert.equal(await control.read.nettedIn([c]), N);
      }
      assert.equal((await control.read.getInterest([I])).state, 2);
      assert.equal(await control.read.nettedIn([I]), N);
      const [n, calls, interest] = await control.read.getNetting([N]);
      assert.equal(getAddress(n.payer), aAddr);
      assert.equal(getAddress(n.receiver), bAddr);
      assert.equal(n.amount, 65n);
      assert.equal(n.cdmHash, NH);
      assert.deepEqual(calls, [V, R]);
      assert.deepEqual(interest, [I]);
    });

    it("is paid by the party that owes the net, and moves nothing when the movements offset", async () => {
      await vmCall(V, 30n);
      await returnCall(R, 30n);
      await assert.rejects(control.write.settleNetted([N, [V, R], hashes, [], tUSD.address, NH], { account: operator.account })); // WrongParty
      await control.write.settleNetted([N, [V, R], hashes, [], tUSD.address, NH], { account: bankB.account });
      assert.equal(await tUSD.read.balanceOf([aAddr]), 1000n);
      assert.equal(await tUSD.read.balanceOf([bAddr]), 1000n);
      const [n] = await control.read.getNetting([N]);
      assert.equal(n.amount, 0n);
      assert.equal(n.payer, "0x0000000000000000000000000000000000000000");
    });

    it("rejects the party that is owed the net", async () => {
      await vmCall(V, 20n);
      await returnCall(R, 30n);
      await assert.rejects(control.write.settleNetted([N, [V, R], hashes, [], tUSD.address, NH], { account: bankA.account })); // NotNetPayer
      await tUSD.write.approve([control.address, 10n], { account: bankB.account });
      await control.write.settleNetted([N, [V, R], hashes, [], tUSD.address, NH], { account: bankB.account });
      assert.equal(await tUSD.read.balanceOf([aAddr]), 1010n);
    });

    it("does not net a call twice, a call not agreed, a non-cash proposal, an IM call, a settled interest or a reused id", async () => {
      await vmCall(V, 100n);
      await returnCall(R, 30n);
      await tUSD.write.approve([control.address, 1000n], { account: bankA.account });
      await assert.rejects(control.write.settleNetted([N, [V, V], hashes, [], tUSD.address, NH], { account: bankA.account })); // second V is Settled
      await assert.rejects(control.write.settleNetted([N, [V], [hashes[0]], [], tUSD.address, NH], { account: bankA.account })); // one movement
      await assert.rejects(control.write.settleNetted([N, [V, R], hashes, [], tUSD.address, zeroHash], { account: bankA.account }));

      const U = id(64); // unanswered
      await marginCall.write.issueCall([U, VM, aAddr, 10n * SCALE, 0n, zeroHash], { account: bankB.account });
      await assert.rejects(control.write.settleNetted([N, [V, U], hashes, [], tUSD.address, NH], { account: bankA.account }));

      const S = id(65); // accepted proposal in tUST
      await vmCall(S, 5n, tUST.address);
      await assert.rejects(control.write.settleNetted([N, [V, S], hashes, [], tUSD.address, NH], { account: bankA.account }));

      const M = id(66); // initial margin
      await marginCall.write.issueCall([M, IM, aAddr, 10n * SCALE, 0n, zeroHash], { account: bankB.account });
      await marginCall.write.respond([M, FULL, 0n, zeroHash], { account: bankA.account });
      await assert.rejects(control.write.settleNetted([N, [V, M], hashes, [], tUSD.address, NH], { account: bankA.account }));

      const P = id(67); // interest paid at once
      await tUSD.write.approve([control.address, 5n], { account: bankB.account });
      await control.write.stateInterest([P, aAddr, tUSD.address, 5n, H], { account: bankB.account });
      await assert.rejects(control.write.settleNetted([N, [V, R], hashes, [P], tUSD.address, NH], { account: bankA.account }));

      await control.write.settleNetted([N, [V, R], hashes, [], tUSD.address, NH], { account: bankA.account });
      await returnCall(id(68), 1n);
      await vmCall(id(69), 2n);
      await assert.rejects(control.write.settleNetted([N, [id(68), id(69)], hashes, [], tUSD.address, NH], { account: bankA.account })); // NettingExists
    });

    it("lets the secured party pay a held positive Interest Amount alone", async () => {
      await control.write.stateInterestForNetting([I, aAddr, tUSD.address, 7n, H], { account: bankB.account });
      await assert.rejects(control.write.payInterest([I], { account: bankA.account })); // the secured party pays
      await tUSD.write.approve([control.address, 7n], { account: bankB.account });
      await control.write.payInterest([I], { account: bankB.account });
      assert.equal(await tUSD.read.balanceOf([aAddr]), 1007n);
      await assert.rejects(control.write.stateInterestForNetting([id(70), aAddr, tUSD.address, 0n, H], { account: bankB.account }));
    });
  });

  describe("amendment of agreement terms (task-csa-amendment)", () => {
    const M = id(50);
    const H2 = keccak256(toHex("cdm-2"));
    const terms = (bps: number) => [{ token: tMMF.address, eligible: true, haircutBps: bps }];

    it("applies agreed haircut terms to the pair only, and moves the pair's agreement hash", async () => {
      await control.write.proposeAmendment([M, aAddr, bAddr, terms(1000), zeroHash, H], { account: bankB.account });
      assert.equal(await control.read.pendingAmendment([aAddr, bAddr]), M);
      assert.equal((await control.read.eligibilityFor([aAddr, bAddr, tMMF.address])).haircutBps, 800); // not yet
      await control.write.decideAmendment([M, true, H2], { account: bankA.account });
      const [a, t] = await control.read.getAmendment([M]);
      assert.equal(a.state, 2); // Agreed
      assert.equal(t[0].haircutBps, 1000);
      assert.equal((await control.read.eligibilityFor([aAddr, bAddr, tMMF.address])).haircutBps, 1000);
      assert.equal((await control.read.eligibilityFor([aAddr, bAddr, tUST.address])).haircutBps, 200); // copied
      assert.equal((await control.read.eligibilityFor([bAddr, aAddr, tMMF.address])).haircutBps, 800); // other pair
      assert.equal(await control.read.agreementHash([aAddr, bAddr]), H);
      assert.equal(await control.read.pendingAmendment([aAddr, bAddr]), zeroHash);
    });

    it("values a pledge at the pair's amended haircut", async () => {
      await control.write.proposeAmendment([M, aAddr, bAddr, [{ token: tUST.address, eligible: false, haircutBps: 0 }], zeroHash, H], { account: bankA.account });
      await control.write.decideAmendment([M, true, H2], { account: bankB.account });
      await assert.rejects(pledgeFor(id(51), 11n)); // tUST no longer eligible for this pair
    });

    it("leaves the terms unchanged on refusal", async () => {
      await control.write.proposeAmendment([M, aAddr, bAddr, terms(1000), zeroHash, H], { account: bankB.account });
      await control.write.decideAmendment([M, false, H2], { account: bankA.account });
      assert.equal((await control.read.getAmendment([M]))[0].state, 3); // Refused
      assert.equal((await control.read.eligibilityFor([aAddr, bAddr, tMMF.address])).haircutBps, 800);
      assert.equal(await control.read.agreementHash([aAddr, bAddr]), zeroHash);
    });

    it("rejects an outsider, a stale before hash, a second pending amendment, a reused id and the proposer deciding", async () => {
      const [, , , outsider] = await viem.getWalletClients();
      await assert.rejects(control.write.proposeAmendment([M, aAddr, bAddr, terms(1000), zeroHash, H], { account: outsider.account }));
      await assert.rejects(control.write.proposeAmendment([M, aAddr, bAddr, terms(1000), H, H], { account: bankB.account })); // stale
      await control.write.proposeAmendment([M, aAddr, bAddr, terms(1000), zeroHash, H], { account: bankB.account });
      await assert.rejects(control.write.proposeAmendment([id(52), aAddr, bAddr, terms(900), zeroHash, H], { account: bankA.account })); // pending
      await assert.rejects(control.write.decideAmendment([M, true, H2], { account: bankB.account })); // proposer
      await control.write.decideAmendment([M, true, H2], { account: bankA.account });
      await assert.rejects(control.write.proposeAmendment([M, aAddr, bAddr, terms(900), H, H2], { account: bankA.account })); // reused id
      await assert.rejects(control.write.decideAmendment([M, true, H2], { account: bankA.account })); // decided
      await assert.rejects(control.write.proposeAmendment([id(53), aAddr, bAddr, [{ token: tMMF.address, eligible: true, haircutBps: 10000 }], H, H2], { account: bankA.account }));
      await control.write.proposeAmendment([id(54), aAddr, bAddr, terms(900), H, H2], { account: bankA.account }); // next one
    });
  });

  describe("master agreement terms: GMRA chain per pair (task-repo-gmra-terms)", () => {
    const GMRA = keccak256(toHex("GMRA"));
    const G = id(60);
    const H2 = keccak256(toHex("cdm-2"));

    it("moves the pair's GMRA terms hash on consent, either party proposing, and leaves the CSA chain alone", async () => {
      await control.write.proposeTermsAmendment([G, GMRA, bAddr, zeroHash, H], { account: bankA.account });
      const pair = await control.read.pairKey([aAddr, bAddr]);
      assert.equal(pair, await control.read.pairKey([bAddr, aAddr]));
      assert.equal(await control.read.pendingTermsAmendment([GMRA, pair]), G);
      await control.write.decideTermsAmendment([G, true, H2], { account: bankB.account });
      assert.equal(await control.read.termsHash([GMRA, pair]), H);
      assert.equal(await control.read.pendingTermsAmendment([GMRA, pair]), zeroHash);
      assert.equal(await control.read.amendmentKind([G]), GMRA);
      const [a] = await control.read.getAmendment([G]);
      assert.equal(a.state, 2); // Agreed
      assert.equal(getAddress(a.proposer), aAddr);
      assert.equal(await control.read.agreementHash([aAddr, bAddr]), zeroHash); // CSA chain
      await control.write.proposeTermsAmendment([id(61), GMRA, aAddr, H, H2], { account: bankB.account }); // B proposes next
      await control.write.decideTermsAmendment([id(61), true, H], { account: bankA.account });
      assert.equal(await control.read.termsHash([GMRA, pair]), H2);
    });

    it("leaves the terms hash unchanged on refusal", async () => {
      await control.write.proposeTermsAmendment([G, GMRA, bAddr, zeroHash, H], { account: bankA.account });
      await control.write.decideTermsAmendment([G, false, H2], { account: bankB.account });
      assert.equal((await control.read.getAmendment([G]))[0].state, 3); // Refused
      assert.equal(await control.read.termsHash([GMRA, await control.read.pairKey([aAddr, bAddr])]), zeroHash);
    });

    it("rejects no kind, oneself, a stale hash, a second pending amendment, the proposer or an outsider deciding, and crossing chains", async () => {
      const [, , , outsider] = await viem.getWalletClients();
      await assert.rejects(control.write.proposeTermsAmendment([G, zeroHash, bAddr, zeroHash, H], { account: bankA.account }));
      await assert.rejects(control.write.proposeTermsAmendment([G, GMRA, aAddr, zeroHash, H], { account: bankA.account }));
      await assert.rejects(control.write.proposeTermsAmendment([G, GMRA, bAddr, H, H], { account: bankA.account })); // stale
      await control.write.proposeTermsAmendment([G, GMRA, bAddr, zeroHash, H], { account: bankA.account });
      await assert.rejects(control.write.proposeTermsAmendment([id(62), GMRA, aAddr, zeroHash, H], { account: bankB.account })); // pending
      await assert.rejects(control.write.decideTermsAmendment([G, true, H2], { account: bankA.account })); // proposer
      await assert.rejects(control.write.decideTermsAmendment([G, true, H2], { account: outsider.account }));
      await assert.rejects(control.write.decideAmendment([G, true, H2], { account: bankB.account })); // CSA path
      await control.write.proposeAmendment([id(63), aAddr, bAddr, [], zeroHash, H], { account: bankA.account });
      await assert.rejects(control.write.decideTermsAmendment([id(63), true, H2], { account: bankB.account })); // GMRA path
    });
  });

  describe("portfolio reconciliation record (task-csa-reconciliation)", () => {
    let rec: any, bankC: any;
    const H = (s: string) => keccak256(toHex(s));
    const SA = H("snap-A"), SB = H("snap-B");
    beforeEach(async () => {
      rec = await viem.deployContract("PortfolioReconciliation", []);
      bankC = (await viem.getWalletClients())[3];
      await rec.write.commitSnapshot([SA, bAddr, H("A trades")], { account: bankA.account });
      await rec.write.commitSnapshot([SB, aAddr, H("B trades")], { account: bankB.account });
    });
    const runId = async () => rec.read.reconciliationIdOf([SA, SB]);

    it("records each snapshot hash once, for its party and counterparty", async () => {
      const s = await rec.read.getSnapshot([SA]);
      assert.equal(getAddress(s.party), aAddr);
      assert.equal(getAddress(s.counterparty), bAddr);
      assert.equal(s.snapshotHash, H("A trades"));
      await assert.rejects(rec.write.commitSnapshot([SA, bAddr, H("again")], { account: bankA.account }));
      await assert.rejects(rec.write.commitSnapshot([H("self"), aAddr, H("x")], { account: bankA.account }));
    });
    it("agrees when both parties commit the same result", async () => {
      const r = await runId();
      await rec.write.commitResult([r, SA, SB, H("result"), 2], { account: bankA.account });
      assert.equal((await rec.read.getRun([r])).state, 1); // OneResult
      await rec.write.commitResult([r, SA, SB, H("result"), 2], { account: bankB.account });
      const run = await rec.read.getRun([r]);
      assert.equal(run.state, 2); // Agreed
      assert.equal(run.breakCount, 2);
    });
    it("records a disagreement when the results differ", async () => {
      const r = await runId();
      await rec.write.commitResult([r, SA, SB, H("result"), 0], { account: bankB.account });
      await rec.write.commitResult([r, SA, SB, H("other"), 0], { account: bankA.account });
      assert.equal((await rec.read.getRun([r])).state, 3); // Disagreed
    });
    it("rejects a wrong id, a missing snapshot, an outsider, a second result and snapshots of different pairs", async () => {
      const r = await runId();
      await assert.rejects(rec.write.commitResult([H("wrong"), SA, SB, H("result"), 0], { account: bankA.account }));
      const missing = H("missing");
      await assert.rejects(rec.write.commitResult([await rec.read.reconciliationIdOf([SA, missing]), SA, missing, H("result"), 0], { account: bankA.account }));
      await assert.rejects(rec.write.commitResult([r, SA, SB, H("result"), 0], { account: bankC.account }));
      await rec.write.commitResult([r, SA, SB, H("result"), 0], { account: bankA.account });
      await assert.rejects(rec.write.commitResult([r, SA, SB, H("result"), 0], { account: bankA.account }));
      const SC = H("snap-C");
      await rec.write.commitSnapshot([SC, aAddr, H("C trades")], { account: bankC.account });
      await assert.rejects(rec.write.commitResult([await rec.read.reconciliationIdOf([SB, SC]), SB, SC, H("result"), 0], { account: bankB.account }));
    });
  });

  describe("repo purchase and repurchase, delivery versus payment (task-repo-purchase-repurchase)", () => {
    let repo: any, tUSD: any, bankC: any;
    const H = (s: string) => keccak256(toHex(s));
    const R = H("REPO-1");
    const PURCHASE = 0, REPURCHASE = 1;
    const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
    beforeEach(async () => {
      repo = await viem.deployContract("RepoSettlement", []);
      tUSD = await viem.deployContract("TokenizedCollateral", ["USD deposit token", "tUSD", "US0000000USD", "000000USD", "QUSD00000"]);
      bankC = (await viem.getWalletClients())[3];
      await tUSD.write.mint([aAddr, 1000n]); // the seller pays the Price Differential out of its own cash
      await tUSD.write.mint([bAddr, 10000n]);
      // A sells 103 tUST to B for 10,000 tUSD; Repurchase Price 10,009.
      await repo.write.book([R, bAddr, tUST.address, 103n, tUSD.address, 10000n, 10009n, H("trade")], { account: bankA.account });
    });
    const bal = async (t: any, a: `0x${string}`) => t.read.balanceOf([a]);
    const approveLegs = async (sec: any, secFrom: any, secQty: bigint, cashFrom: any, cashAmt: bigint) => {
      await sec.write.approve([repo.address, secQty], { account: secFrom.account });
      await tUSD.write.approve([repo.address, cashAmt], { account: cashFrom.account });
    };

    it("books, affirms with the same hash, and settles the purchase in the second instruction", async () => {
      await assert.rejects(repo.write.affirm([R, H("other")], { account: bankB.account }));
      await assert.rejects(repo.write.affirm([R, H("trade")], { account: bankA.account }));
      await assert.rejects(repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account })); // not affirmed
      await repo.write.affirm([R, H("trade")], { account: bankB.account });
      assert.equal((await repo.read.getRepo([R])).state, 2); // Affirmed
      await approveLegs(tUST, bankA, 103n, bankB, 10000n);
      await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      assert.equal(await bal(tUST, bAddr), 0n); // one instruction moves nothing
      await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
      const r = await repo.read.getRepo([R]);
      assert.equal(r.state, 3); // Purchased
      assert.equal(r.purchaseHash, H("p"));
      assert.equal(await bal(tUST, bAddr), 103n);
      assert.equal(await bal(tUST, aAddr), 897n);
      assert.equal(await bal(tUSD, aAddr), 11000n);
      assert.equal(await bal(tUSD, bAddr), 0n);
    });

    it("settles the repurchase at the Repurchase Price, reversing both legs", async () => {
      await repo.write.affirm([R, H("trade")], { account: bankB.account });
      await approveLegs(tUST, bankA, 103n, bankB, 10000n);
      await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
      await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      await approveLegs(tUST, bankB, 103n, bankA, 10009n);
      await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
      await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
      const r = await repo.read.getRepo([R]);
      assert.equal(r.state, 4); // Repurchased
      assert.equal(r.repurchaseHash, H("r"));
      assert.equal(await bal(tUST, aAddr), 1000n);
      assert.equal(await bal(tUSD, aAddr), 991n); // paid 9 of Price Differential
      assert.equal(await bal(tUSD, bAddr), 10009n);
      await assert.rejects(repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account }));
    });

    it("rejects a different hash, a second instruction, an outsider, a missing allowance and a bad booking", async () => {
      await repo.write.affirm([R, H("trade")], { account: bankB.account });
      await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
      await assert.rejects(repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account }));
      await assert.rejects(repo.write.instruct([R, PURCHASE, H("p")], { account: bankC.account }));
      await assert.rejects(repo.write.instruct([R, PURCHASE, H("q")], { account: bankB.account }));
      await assert.rejects(repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account })); // not purchased
      await assert.rejects(repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account })); // no allowances: both legs or neither
      assert.equal(await bal(tUST, bAddr), 0n);
      assert.equal((await repo.read.getInstructions([R, PURCHASE]))[0], H("p"));
      await assert.rejects(repo.write.book([R, bAddr, tUST.address, 1n, tUSD.address, 1n, 1n, H("t")], { account: bankA.account }));
      await assert.rejects(repo.write.book([H("R2"), aAddr, tUST.address, 1n, tUSD.address, 1n, 1n, H("t")], { account: bankA.account }));
      await assert.rejects(repo.write.book([H("R3"), bAddr, tUST.address, 1n, tUSD.address, 10n, 9n, H("t")], { account: bankA.account }));
      assert.deepEqual(await repo.read.reposOf([bAddr]), [R]);
    });

    describe("reprice (task-repo-reprice)", () => {
      const REPRICE = 2;
      const purchased = async () => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      };

      it("settles in the second instruction: the seller pays, the prices and trade hash change, the securities stay", async () => {
        await purchased();
        await tUSD.write.approve([repo.address, 500n], { account: bankA.account });
        const seller = await bal(tUSD, aAddr), buyer = await bal(tUSD, bAddr), held = await bal(tUST, bAddr);
        await repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), seller);
        await repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankA.account });
        assert.equal(await bal(tUSD, aAddr), seller - 500n);
        assert.equal(await bal(tUSD, bAddr), buyer + 500n);
        assert.equal(await bal(tUST, bAddr), held);
        const r = await repo.read.getRepo([R]);
        assert.equal(r.purchasePrice, 9500n);
        assert.equal(r.repurchasePrice, 9506n);
        assert.equal(r.tradeHash, H("rp"));
        assert.equal(r.state, 3);
        const [s, b] = await repo.read.getInstructions([R, REPRICE]);
        assert.equal(s, ZERO_BYTES32);
        assert.equal(b, ZERO_BYTES32);
      });

      it("the buyer pays when the cash difference is negative", async () => {
        await purchased();
        await tUSD.write.mint([bAddr, 400n]);
        await tUSD.write.approve([repo.address, 400n], { account: bankB.account });
        const seller = await bal(tUSD, aAddr);
        await repo.write.instructReprice([R, H("rp"), 10400n, 10406n, -400n], { account: bankA.account });
        await repo.write.instructReprice([R, H("rp"), 10400n, 10406n, -400n], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), seller + 400n);
      });

      it("the second party must state the same hash and amounts, and a party can replace its own instruction", async () => {
        await purchased();
        await tUSD.write.approve([repo.address, 500n], { account: bankA.account });
        await repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankB.account });
        await assert.rejects(repo.write.instructReprice([R, H("other"), 9500n, 9506n, 500n], { account: bankA.account }));
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9400n, 9506n, 500n], { account: bankA.account }));
        await repo.write.instructReprice([R, H("rp2"), 9400n, 9406n, 500n], { account: bankB.account });
        await repo.write.instructReprice([R, H("rp2"), 9400n, 9406n, 500n], { account: bankA.account });
        assert.equal((await repo.read.getRepo([R])).tradeHash, H("rp2"));
      });

      it("needs a purchased repo, a party, valid prices, and no repurchase instruction", async () => {
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankA.account })); // booked
        await purchased();
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankC.account }));
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 0n, 9506n, 500n], { account: bankA.account }));
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9500n, 9499n, 500n], { account: bankA.account }));
        await assert.rejects(repo.write.instruct([R, REPRICE, H("rp")], { account: bankA.account }));
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankB.account }));
      });

      it("the repurchase clears a pending reprice", async () => {
        await purchased();
        await repo.write.instructReprice([R, H("stale"), 9500n, 9506n, 500n], { account: bankB.account });
        await tUSD.write.approve([repo.address, 10009n], { account: bankA.account });
        await tUST.write.approve([repo.address, 103n], { account: bankB.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
        const [s, b] = await repo.read.getInstructions([R, REPRICE]);
        assert.equal(b, ZERO_BYTES32);
        assert.equal(s, ZERO_BYTES32);
      });
    });

    describe("adjustment (task-repo-adjustment)", () => {
      const ADJUSTMENT = 3, REPRICE_PHASE = 2;
      const purchased = async () => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      };

      it("settles in the second instruction: the seller delivers more securities and pays the accrued cash", async () => {
        await purchased();
        await tUST.write.approve([repo.address, 7n], { account: bankA.account });
        await tUSD.write.approve([repo.address, 3n], { account: bankA.account });
        const heldB = await bal(tUST, bAddr), cashA = await bal(tUSD, aAddr);
        await repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 3n], { account: bankB.account });
        assert.equal(await bal(tUST, bAddr), heldB);
        await repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 3n], { account: bankA.account });
        assert.equal(await bal(tUST, bAddr), heldB + 7n);
        assert.equal(await bal(tUSD, aAddr), cashA - 3n);
        const r = await repo.read.getRepo([R]);
        assert.equal(r.quantity, 110n);
        assert.equal(r.purchasePrice, 10000n);
        assert.equal(r.repurchasePrice, 10006n);
        assert.equal(r.tradeHash, H("adj"));
        assert.equal(r.state, 3);
      });

      it("the buyer returns securities when the quantity falls", async () => {
        await purchased();
        await tUST.write.approve([repo.address, 3n], { account: bankB.account });
        const heldA = await bal(tUST, aAddr);
        await repo.write.instructAdjustment([R, H("adj"), 100n, 10006n, 0n], { account: bankA.account });
        await repo.write.instructAdjustment([R, H("adj"), 100n, 10006n, 0n], { account: bankB.account });
        assert.equal(await bal(tUST, aAddr), heldA + 3n);
      });

      it("the second party must state the same hash and amounts", async () => {
        await purchased();
        await repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 3n], { account: bankB.account });
        await assert.rejects(repo.write.instructAdjustment([R, H("x"), 110n, 10006n, 3n], { account: bankA.account }));
        await assert.rejects(repo.write.instructAdjustment([R, H("adj"), 111n, 10006n, 3n], { account: bankA.account }));
      });

      it("needs a purchased repo, a party and valid amounts, cannot go through instruct, and excludes a pending reprice", async () => {
        await assert.rejects(repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 3n], { account: bankA.account })); // booked
        await purchased();
        await assert.rejects(repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 3n], { account: bankC.account }));
        await assert.rejects(repo.write.instructAdjustment([R, H("adj"), 0n, 10006n, 3n], { account: bankA.account }));
        await assert.rejects(repo.write.instructAdjustment([R, H("adj"), 110n, 9999n, 3n], { account: bankA.account }));
        await assert.rejects(repo.write.instruct([R, ADJUSTMENT, H("adj")], { account: bankA.account }));
        await repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankB.account });
        await assert.rejects(repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 3n], { account: bankA.account }));
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankC.account }));
        assert.ok((await repo.read.getInstructions([R, REPRICE_PHASE]))[1] !== ZERO_BYTES32);
      });

      it("the repurchase clears a pending adjustment and returns the adjusted quantity", async () => {
        await purchased();
        await tUST.write.approve([repo.address, 7n], { account: bankA.account });
        await repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 0n], { account: bankB.account });
        await repo.write.instructAdjustment([R, H("adj"), 110n, 10006n, 0n], { account: bankA.account });
        await repo.write.instructAdjustment([R, H("stale"), 112n, 10006n, 0n], { account: bankB.account });
        await tUSD.write.approve([repo.address, 10006n], { account: bankA.account });
        await tUST.write.approve([repo.address, 110n], { account: bankB.account });
        const heldB = await bal(tUST, bAddr);
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
        assert.equal(await bal(tUST, bAddr), heldB - 110n);
        assert.equal((await repo.read.getInstructions([R, ADJUSTMENT]))[1], ZERO_BYTES32);
      });
    });
  });
});
