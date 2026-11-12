import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toHex, zeroHash, zeroAddress, getAddress } from "viem";

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
      repo = await viem.deployContract("RepoSettlement", [oracle.address]);
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

    describe("substitution (task-repo-substitution)", () => {
      const SUBSTITUTION = 4, REPRICE_PHASE = 2;
      const purchased = async () => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      };
      const approveSwap = async () => {
        await tMMF.write.approve([repo.address, 206n], { account: bankA.account });
        await tUST.write.approve([repo.address, 103n], { account: bankB.account });
      };

      it("settles in the buyer's instruction: both securities move, the repo changes and no cash moves", async () => {
        await purchased();
        await approveSwap();
        const ustA = await bal(tUST, aAddr), ustB = await bal(tUST, bAddr), mmfA = await bal(tMMF, aAddr), mmfB = await bal(tMMF, bAddr), cashA = await bal(tUSD, aAddr);
        await repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankA.account });
        assert.equal(await bal(tUST, aAddr), ustA);
        await repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankB.account });
        assert.equal(await bal(tUST, aAddr), ustA + 103n);
        assert.equal(await bal(tUST, bAddr), ustB - 103n);
        assert.equal(await bal(tMMF, aAddr), mmfA - 206n);
        assert.equal(await bal(tMMF, bAddr), mmfB + 206n);
        assert.equal(await bal(tUSD, aAddr), cashA);
        const r = await repo.read.getRepo([R]);
        assert.equal(getAddress(r.security), getAddress(tMMF.address));
        assert.equal(r.quantity, 206n);
        assert.equal(r.tradeHash, H("sub"));
        assert.equal(r.purchasePrice, 10000n);
        assert.equal((await repo.read.getInstructions([R, SUBSTITUTION]))[0], ZERO_BYTES32);
      });

      it("the buyer cannot request, and the agreement must state the same terms", async () => {
        await purchased();
        await assert.rejects(repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankB.account }));
        await repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankA.account });
        await assert.rejects(repo.write.instructSubstitution([R, H("x"), tMMF.address, 206n], { account: bankB.account }));
        await assert.rejects(repo.write.instructSubstitution([R, H("sub"), tMMF.address, 207n], { account: bankB.account }));
      });

      it("refuses the current security, a zero quantity and a repo not purchased", async () => {
        await assert.rejects(repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankA.account }));
        await purchased();
        await assert.rejects(repo.write.instructSubstitution([R, H("sub"), tUST.address, 206n], { account: bankA.account }));
        await assert.rejects(repo.write.instructSubstitution([R, H("sub"), tMMF.address, 0n], { account: bankA.account }));
      });

      it("the buyer's refusal clears the request, and only the buyer can refuse", async () => {
        await purchased();
        await assert.rejects(repo.write.refuseSubstitution([R], { account: bankB.account }));
        await repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankA.account });
        await assert.rejects(repo.write.refuseSubstitution([R], { account: bankA.account }));
        await repo.write.refuseSubstitution([R], { account: bankB.account });
        assert.equal((await repo.read.getInstructions([R, SUBSTITUTION]))[0], ZERO_BYTES32);
        const r = await repo.read.getRepo([R]);
        assert.equal(getAddress(r.security), getAddress(tUST.address));
        assert.equal(r.quantity, 103n);
      });

      it("the seller can replace its request, and a pending substitution blocks a reprice", async () => {
        await purchased();
        await approveSwap();
        await repo.write.instructSubstitution([R, H("first"), tMMF.address, 300n], { account: bankA.account });
        await repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankA.account });
        await assert.rejects(repo.write.instructReprice([R, H("rp"), 9500n, 9506n, 500n], { account: bankB.account }));
        assert.equal((await repo.read.getInstructions([R, REPRICE_PHASE]))[1], ZERO_BYTES32);
        await repo.write.instructSubstitution([R, H("sub"), tMMF.address, 206n], { account: bankB.account });
        assert.equal((await repo.read.getRepo([R])).quantity, 206n);
      });

      it("the repurchase clears a pending substitution and returns the current securities", async () => {
        await purchased();
        await repo.write.instructSubstitution([R, H("stale"), tMMF.address, 206n], { account: bankA.account });
        await tUSD.write.approve([repo.address, 10009n], { account: bankA.account });
        await tUST.write.approve([repo.address, 103n], { account: bankB.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
        assert.equal((await repo.read.getInstructions([R, SUBSTITUTION]))[0], ZERO_BYTES32);
      });
    });

    describe("interim interest and manufactured income (task-repo-income)", () => {
      const INTERIM = 5, INCOME = 6;
      const purchased = async () => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      };

      it("interim interest settles in the buyer's instruction: the cash moves and the Repurchase Price falls", async () => {
        await purchased();
        await tUSD.write.approve([repo.address, 4n], { account: bankA.account });
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        const before = (await repo.read.getRepo([R])).repurchasePrice;
        await repo.write.instructInterimInterest([R, H("int"), 4n, before - 4n], { account: bankA.account });
        assert.equal(await bal(tUSD, aAddr), cashA);
        await repo.write.instructInterimInterest([R, H("int"), 4n, before - 4n], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), cashA - 4n);
        assert.equal(await bal(tUSD, bAddr), cashB + 4n);
        const r = await repo.read.getRepo([R]);
        assert.equal(r.repurchasePrice, before - 4n);
        assert.equal(r.tradeHash, H("int"));
      });

      it("income settles in the seller's instruction: the buyer pays and the trade does not change", async () => {
        await purchased();
        await tUSD.write.mint([bAddr, 100n]);
        await tUSD.write.approve([repo.address, 9n], { account: bankB.account });
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await repo.write.instructIncome([R, H("inc"), 9n], { account: bankB.account });
        await repo.write.instructIncome([R, H("inc"), 9n], { account: bankA.account });
        assert.equal(await bal(tUSD, aAddr), cashA + 9n);
        assert.equal(await bal(tUSD, bAddr), cashB - 9n);
        assert.equal((await repo.read.getRepo([R])).tradeHash, H("trade"));
        await tUSD.write.approve([repo.address, 9n], { account: bankB.account });
        await assert.rejects(repo.write.instructIncome([R, H("inc"), 9n], { account: bankB.account }));
      });

      it("the payer instructs first and the agreement must state the same amounts", async () => {
        await purchased();
        const rp = (await repo.read.getRepo([R])).repurchasePrice;
        await assert.rejects(repo.write.instructInterimInterest([R, H("int"), 4n, rp - 4n], { account: bankB.account }));
        await assert.rejects(repo.write.instructIncome([R, H("inc"), 9n], { account: bankA.account }));
        await repo.write.instructInterimInterest([R, H("int"), 4n, rp - 4n], { account: bankA.account });
        await assert.rejects(repo.write.instructInterimInterest([R, H("int"), 5n, rp - 5n], { account: bankB.account }));
      });

      it("only the receiver refuses, a refusal clears the payment, and only one phase can be pending", async () => {
        await purchased();
        const rp = (await repo.read.getRepo([R])).repurchasePrice;
        await assert.rejects(repo.write.refusePayment([R, INTERIM], { account: bankB.account }));
        await repo.write.instructInterimInterest([R, H("int"), 4n, rp - 4n], { account: bankA.account });
        await assert.rejects(repo.write.refusePayment([R, INTERIM], { account: bankA.account }));
        await assert.rejects(repo.write.instructIncome([R, H("inc"), 9n], { account: bankB.account }));
        await repo.write.refusePayment([R, INTERIM], { account: bankB.account });
        assert.equal((await repo.read.getInstructions([R, INTERIM]))[0], ZERO_BYTES32);
        await repo.write.instructIncome([R, H("inc"), 9n], { account: bankB.account });
        await assert.rejects(repo.write.refusePayment([R, INCOME], { account: bankB.account }));
        await repo.write.refusePayment([R, INCOME], { account: bankA.account });
        assert.equal((await repo.read.getInstructions([R, INCOME]))[1], ZERO_BYTES32);
        await assert.rejects(repo.write.refusePayment([R, 2], { account: bankA.account }));
      });

      it("the repurchase clears a pending payment", async () => {
        await purchased();
        await repo.write.instructIncome([R, H("inc"), 9n], { account: bankB.account });
        await tUSD.write.approve([repo.address, 10009n], { account: bankA.account });
        await tUST.write.approve([repo.address, 103n], { account: bankB.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
        assert.equal((await repo.read.getInstructions([R, INCOME]))[1], ZERO_BYTES32);
      });
    });

    describe("roll (task-repo-roll)", () => {
      const ROLL = 7;
      const purchased = async () => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
      };

      for (const [first, second, name] of [[0, 1, "the seller proposes"], [1, 0, "the buyer proposes"]] as const) {
        it(`${name}: the second instruction moves the interest and updates the repo, and the securities stay`, async () => {
          await purchased();
          const before = await repo.read.getRepo([R]);
          const interest = before.repurchasePrice - before.purchasePrice;
          assert.ok(interest > 0n);
          await tUSD.write.approve([repo.address, interest], { account: bankA.account });
          const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr), secA = await bal(tUST, aAddr), secB = await bal(tUST, bAddr);
          const parties = [bankA, bankB];
          await repo.write.instructRoll([R, H("roll"), before.repurchasePrice + 7n], { account: parties[first].account });
          assert.equal(await bal(tUSD, aAddr), cashA);
          await repo.write.instructRoll([R, H("roll"), before.repurchasePrice + 7n], { account: parties[second].account });
          assert.equal(await bal(tUSD, aAddr), cashA - interest);
          assert.equal(await bal(tUSD, bAddr), cashB + interest);
          assert.equal(await bal(tUST, aAddr), secA);
          assert.equal(await bal(tUST, bAddr), secB);
          const r = await repo.read.getRepo([R]);
          assert.equal(r.repurchasePrice, before.repurchasePrice + 7n);
          assert.equal(r.purchasePrice, before.purchasePrice);
          assert.equal(r.tradeHash, H("roll"));
        });
      }

      it("the agreement must state the same terms, and a roll below the Purchase Price is rejected", async () => {
        await purchased();
        const rp = (await repo.read.getRepo([R])).repurchasePrice;
        await assert.rejects(repo.write.instructRoll([R, H("roll"), 9999n], { account: bankA.account }));
        await repo.write.instructRoll([R, H("roll"), rp], { account: bankA.account });
        await assert.rejects(repo.write.instructRoll([R, H("other"), rp], { account: bankB.account }));
        await assert.rejects(repo.write.instructRoll([R, H("roll"), rp + 1n], { account: bankB.account }));
      });

      it("only the other party refuses, and a refusal clears the roll and moves nothing", async () => {
        await purchased();
        const rp = (await repo.read.getRepo([R])).repurchasePrice;
        await assert.rejects(repo.write.refuseRoll([R], { account: bankB.account }));
        await repo.write.instructRoll([R, H("roll"), rp], { account: bankA.account });
        await assert.rejects(repo.write.refuseRoll([R], { account: bankA.account }));
        const cashA = await bal(tUSD, aAddr);
        await repo.write.refuseRoll([R], { account: bankB.account });
        assert.equal((await repo.read.getInstructions([R, ROLL]))[0], ZERO_BYTES32);
        assert.equal(await bal(tUSD, aAddr), cashA);
        assert.equal((await repo.read.getRepo([R])).tradeHash, H("trade"));
      });

      it("a roll cannot be pending with another phase, a repurchase instruction stops it, and the repurchase clears it", async () => {
        await purchased();
        const rp = (await repo.read.getRepo([R])).repurchasePrice;
        await repo.write.instructIncome([R, H("inc"), 9n], { account: bankB.account });
        await assert.rejects(repo.write.instructRoll([R, H("roll"), rp], { account: bankA.account }));
        await repo.write.refusePayment([R, 6], { account: bankA.account });

        await repo.write.instructRoll([R, H("roll"), rp], { account: bankA.account });
        await tUSD.write.approve([repo.address, rp], { account: bankA.account });
        await tUST.write.approve([repo.address, 103n], { account: bankB.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await assert.rejects(repo.write.instructRoll([R, H("roll"), rp], { account: bankB.account }));
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
        assert.equal((await repo.read.getInstructions([R, ROLL]))[0], ZERO_BYTES32);
      });
    });
    describe("buy/sell-back (task-repo-buy-sell-back)", () => {
      const INTERIM = 5, INCOME = 6;
      const B1 = H("BSB-1"), B2 = H("BSB-2");
      // BSB-1: A sells 103 tUST to B for 10,000 tUSD; Repurchase Price 10,009.
      const purchasedBsb = async () => {
        await repo.write.bookBuySellBack([B1, bAddr, tUST.address, 103n, tUSD.address, 10000n, 10009n, H("bsb")], { account: bankA.account });
        await repo.write.affirm([B1, H("bsb")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([B1, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([B1, PURCHASE, H("p")], { account: bankB.account });
      };
      const agreeIncome = async (id: `0x${string}`, doc: string, deduction: bigint) => {
        await repo.write.instructIncome([id, H(doc), deduction], { account: bankB.account });
        await repo.write.instructIncome([id, H(doc), deduction], { account: bankA.account });
      };

      it("is booked as a buy/sell-back; a repo is not", async () => {
        await purchasedBsb();
        assert.equal(await repo.read.isBuySellBack([B1]), true);
        assert.equal(await repo.read.isBuySellBack([R]), false);
        assert.equal(await repo.read.sellBackPrice([B1]), 10009n);
      });

      it("agreed income moves no cash and lowers the Sell Back Price, which the repurchase pays", async () => {
        await purchasedBsb();
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await agreeIncome(B1, "inc1", 4n);
        await agreeIncome(B1, "inc2", 2n);
        assert.equal(await bal(tUSD, aAddr), cashA);
        assert.equal(await bal(tUSD, bAddr), cashB);
        assert.equal(await repo.read.incomeDeduction([B1]), 6n);
        assert.equal(await repo.read.sellBackPrice([B1]), 10003n);
        assert.equal((await repo.read.getRepo([B1])).repurchasePrice, 10009n);
        await approveLegs(tUST, bankB, 103n, bankA, 10003n);
        await repo.write.instruct([B1, REPURCHASE, H("r")], { account: bankA.account });
        await repo.write.instruct([B1, REPURCHASE, H("r")], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), cashA - 10003n);
        assert.equal(await bal(tUSD, bAddr), cashB + 10003n);
      });

      it("has no interim interest, and the deduction stays below the Repurchase Price", async () => {
        await purchasedBsb();
        await assert.rejects(repo.write.instructInterimInterest([B1, H("int"), 4n, 10005n], { account: bankA.account }));
        await repo.write.instructIncome([B1, H("big"), 10009n], { account: bankB.account });
        await assert.rejects(repo.write.instructIncome([B1, H("big"), 10009n], { account: bankA.account }));
        await repo.write.refusePayment([B1, INCOME], { account: bankA.account });
        assert.equal(await repo.read.incomeDeduction([B1]), 0n);
        assert.equal((await repo.read.getInstructions([B1, INTERIM]))[0], ZERO_BYTES32);
      });

      it("a roll nets the deduction against the Price Differential and resets it", async () => {
        await purchasedBsb();
        await agreeIncome(B1, "inc1", 4n);
        await tUSD.write.approve([repo.address, 5n], { account: bankA.account });
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await repo.write.instructRoll([B1, H("roll"), 10016n], { account: bankA.account });
        await repo.write.instructRoll([B1, H("roll"), 10016n], { account: bankB.account });
        // Price Differential 9 less the deduction 4: the Seller pays 5
        assert.equal(await bal(tUSD, aAddr), cashA - 5n);
        assert.equal(await bal(tUSD, bAddr), cashB + 5n);
        assert.equal(await repo.read.incomeDeduction([B1]), 0n);
        assert.equal(await repo.read.sellBackPrice([B1]), 10016n);
      });

      it("a roll with a deduction above the Price Differential has the Buyer pay the excess", async () => {
        await purchasedBsb();
        await agreeIncome(B1, "inc1", 12n);
        await tUSD.write.mint([bAddr, 3n]);
        await tUSD.write.approve([repo.address, 3n], { account: bankB.account });
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await repo.write.instructRoll([B1, H("roll"), 10016n], { account: bankB.account });
        await repo.write.instructRoll([B1, H("roll"), 10016n], { account: bankA.account });
        assert.equal(await bal(tUSD, aAddr), cashA + 3n);
        assert.equal(await bal(tUSD, bAddr), cashB - 3n);
        assert.equal(await repo.read.incomeDeduction([B1]), 0n);
      });

      it("pairs off only with a buy/sell-back, netting the Sell Back Prices", async () => {
        await purchasedBsb();
        // REPO-1 (a repo) is B's offsetting candidate in the wrong type: B sells 103 tUST back to A.
        const R2 = H("REPO-2");
        await repo.write.book([R2, aAddr, tUST.address, 103n, tUSD.address, 10000n, 10006n, H("t2")], { account: bankB.account });
        await repo.write.affirm([R2, H("t2")], { account: bankA.account });
        await approveLegs(tUST, bankB, 103n, bankA, 10000n);
        await repo.write.instruct([R2, PURCHASE, H("p2")], { account: bankB.account });
        await repo.write.instruct([R2, PURCHASE, H("p2")], { account: bankA.account });
        await assert.rejects(repo.write.instructPairOff([B1, R2, H("po")], { account: bankA.account }));
        // BSB-2: the same in a buy/sell-back.
        await tUST.write.mint([bAddr, 103n]);
        await tUSD.write.mint([aAddr, 10000n]);
        await repo.write.bookBuySellBack([B2, aAddr, tUST.address, 103n, tUSD.address, 10000n, 10006n, H("bsb2")], { account: bankB.account });
        await repo.write.affirm([B2, H("bsb2")], { account: bankA.account });
        await approveLegs(tUST, bankB, 103n, bankA, 10000n);
        await repo.write.instruct([B2, PURCHASE, H("p3")], { account: bankB.account });
        await repo.write.instruct([B2, PURCHASE, H("p3")], { account: bankA.account });
        await agreeIncome(B1, "inc1", 4n);
        // Sell Back Prices 10,005 and 10,006: the Seller of BSB-2 (B) pays A 1.
        await tUSD.write.approve([repo.address, 1n], { account: bankB.account });
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await repo.write.instructPairOff([B1, B2, H("po")], { account: bankA.account });
        await repo.write.instructPairOff([B2, B1, H("po")], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), cashA + 1n);
        assert.equal(await bal(tUSD, bAddr), cashB - 1n);
        for (const id of [B1, B2]) assert.equal((await repo.read.getRepo([id])).state, 4);
      });
    });

    describe("pair-off (task-repo-pair-off)", () => {
      const PAIR_OFF = 8, ROLL = 7;
      const R2 = H("REPO-2");
      // REPO-1: A sells 103 tUST to B, Repurchase Price 10,009. REPO-2: B sells the same 103 tUST back to A for 10,000,
      // Repurchase Price 10,006 (unless given). The pair-off nets to 3 tUSD from A to B.
      const bothPurchased = async (rp2 = 10006n) => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
        await repo.write.book([R2, aAddr, tUST.address, 103n, tUSD.address, 10000n, rp2, H("trade2")], { account: bankB.account });
        await repo.write.affirm([R2, H("trade2")], { account: bankA.account });
        await approveLegs(tUST, bankB, 103n, bankA, 10000n);
        await repo.write.instruct([R2, PURCHASE, H("p2")], { account: bankB.account });
        await repo.write.instruct([R2, PURCHASE, H("p2")], { account: bankA.account });
      };

      for (const [first, name] of [[0, "the seller of REPO-1 proposes"], [1, "the buyer of REPO-1 proposes"]] as const) {
        it(`${name}: the agreement repurchases both repos, no securities move and only the net cash is paid`, async () => {
          await bothPurchased();
          await tUSD.write.approve([repo.address, 3n], { account: bankA.account });
          const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr), secA = await bal(tUST, aAddr), secB = await bal(tUST, bAddr);
          const parties = [bankA, bankB];
          await repo.write.instructPairOff([R, R2, H("po")], { account: parties[first].account });
          assert.equal(await repo.read.pairOffWith([R]), R2);
          assert.equal(await repo.read.pairOffWith([R2]), R);
          assert.equal(await bal(tUSD, aAddr), cashA); // one instruction moves nothing
          await repo.write.instructPairOff([R2, R, H("po")], { account: parties[1 - first].account }); // either order
          for (const id of [R, R2]) {
            const r = await repo.read.getRepo([id]);
            assert.equal(r.state, 4); // Repurchased
            assert.equal(r.repurchaseHash, H("po"));
            assert.equal(await repo.read.pairOffWith([id]), ZERO_BYTES32);
            assert.equal((await repo.read.getInstructions([id, PAIR_OFF]))[0], ZERO_BYTES32);
          }
          assert.equal(await bal(tUSD, aAddr), cashA - 3n);
          assert.equal(await bal(tUSD, bAddr), cashB + 3n);
          assert.equal(await bal(tUST, aAddr), secA);
          assert.equal(await bal(tUST, bAddr), secB);
        });
      }

      it("moves no cash when the Repurchase Prices are equal, and the Seller of REPO-2 pays when its price is higher", async () => {
        await bothPurchased(10009n);
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account });
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), cashA);
        assert.equal(await bal(tUSD, bAddr), cashB);
      });

      it("pays from the Seller of REPO-2 when its Repurchase Price is the higher", async () => {
        await bothPurchased(10015n);
        await tUSD.write.approve([repo.address, 6n], { account: bankB.account });
        const cashA = await bal(tUSD, aAddr), cashB = await bal(tUSD, bAddr);
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankB.account });
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account });
        assert.equal(await bal(tUSD, aAddr), cashA + 6n);
        assert.equal(await bal(tUSD, bAddr), cashB - 6n);
      });

      it("rejects one repo twice, repos that do not offset, an outsider, a different hash and a repeated instruction", async () => {
        await bothPurchased();
        await assert.rejects(repo.write.instructPairOff([R, R, H("po")], { account: bankA.account }));
        // REPO-3: A sells to B again, the same direction as REPO-1.
        const R3 = H("REPO-3");
        await tUST.write.mint([aAddr, 103n]);
        await tUSD.write.mint([bAddr, 10000n]);
        await repo.write.book([R3, bAddr, tUST.address, 103n, tUSD.address, 10000n, 10009n, H("t3")], { account: bankA.account });
        await repo.write.affirm([R3, H("t3")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R3, PURCHASE, H("p3")], { account: bankA.account });
        await repo.write.instruct([R3, PURCHASE, H("p3")], { account: bankB.account });
        await assert.rejects(repo.write.instructPairOff([R, R3, H("po")], { account: bankA.account }));
        // REPO-4: B sells to A, but another quantity; not purchased yet.
        const R4 = H("REPO-4");
        await repo.write.book([R4, aAddr, tUST.address, 50n, tUSD.address, 5000n, 5003n, H("t4")], { account: bankB.account });
        await assert.rejects(repo.write.instructPairOff([R, R4, H("po")], { account: bankA.account }));
        await assert.rejects(repo.write.instructPairOff([R, R2, H("po")], { account: bankC.account }));
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account });
        await assert.rejects(repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account }));
        await assert.rejects(repo.write.instructPairOff([R2, R, H("other")], { account: bankB.account }));
        assert.equal((await repo.read.getRepo([R])).state, 3); // still Purchased
      });

      it("only the other party refuses, and a refusal clears the pair-off on both repos and moves nothing", async () => {
        await bothPurchased();
        await assert.rejects(repo.write.refusePairOff([R], { account: bankB.account }));
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account });
        await assert.rejects(repo.write.refusePairOff([R2], { account: bankA.account }));
        await assert.rejects(repo.write.refusePairOff([R], { account: bankC.account }));
        const cashA = await bal(tUSD, aAddr);
        await repo.write.refusePairOff([R2], { account: bankB.account });
        for (const id of [R, R2]) {
          assert.equal(await repo.read.pairOffWith([id]), ZERO_BYTES32);
          assert.equal((await repo.read.getInstructions([id, PAIR_OFF]))[1], ZERO_BYTES32);
          assert.equal((await repo.read.getRepo([id])).state, 3);
        }
        assert.equal(await bal(tUSD, aAddr), cashA);
      });

      it("a repurchase instruction blocks a pair-off, and a repurchased repo cannot pair off", async () => {
        await bothPurchased();
        await tUST.write.mint([bAddr, 103n]); // B delivered its 103 tUST in REPO-2
        await tUSD.write.mint([aAddr, 10000n]); // A paid 10,000 tUSD for REPO-2
        await tUST.write.approve([repo.address, 103n], { account: bankB.account });
        await tUSD.write.approve([repo.address, 10009n], { account: bankA.account });
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await assert.rejects(repo.write.instructPairOff([R, R2, H("po")], { account: bankB.account }));

        // REPO-1 settles its repurchase; it can no longer pair off.
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankB.account });
        assert.equal((await repo.read.getRepo([R])).state, 4);
        await assert.rejects(repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account })); // R is repurchased
      });

      it("a pending pair-off blocks a roll on either repo, and the repurchase of one repo clears it on both", async () => {
        await bothPurchased();
        await repo.write.instructPairOff([R, R2, H("po")], { account: bankA.account });
        const rp2 = (await repo.read.getRepo([R2])).repurchasePrice;
        await assert.rejects(repo.write.instructRoll([R2, H("roll"), rp2], { account: bankB.account }));
        assert.equal((await repo.read.getInstructions([R2, ROLL]))[0], ZERO_BYTES32);
        // The repurchase of REPO-2 settles despite the pending pair-off and clears it on both repos.
        await tUSD.write.mint([bAddr, 6n]); // B holds 10,000 tUSD and owes the Price Differential
        await tUST.write.approve([repo.address, 103n], { account: bankA.account });
        await tUSD.write.approve([repo.address, 10006n], { account: bankB.account });
        await repo.write.instruct([R2, REPURCHASE, H("r2")], { account: bankA.account });
        await assert.rejects(repo.write.instructPairOff([R2, R, H("po")], { account: bankB.account })); // repurchase instructed
        await repo.write.instruct([R2, REPURCHASE, H("r2")], { account: bankB.account });
        assert.equal(await repo.read.pairOffWith([R]), ZERO_BYTES32);
        assert.equal((await repo.read.getInstructions([R, PAIR_OFF]))[0], ZERO_BYTES32);
        assert.equal((await repo.read.getRepo([R])).state, 3); // REPO-1 is still open
      });
    });
    describe("default close-out (task-repo-default-close-out)", () => {
      const R2 = H("REPO-2"), R3 = H("REPO-3");
      const CLOSED_OUT = 5;
      const CO = H("CO-1");
      // REPO-1 (A sells 103 tUST to B) and REPO-2 (B sells 50 tUST to A) purchased; REPO-3 booked only.
      const purchased = async () => {
        await repo.write.affirm([R, H("trade")], { account: bankB.account });
        await approveLegs(tUST, bankA, 103n, bankB, 10000n);
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankA.account });
        await repo.write.instruct([R, PURCHASE, H("p")], { account: bankB.account });
        await tUSD.write.mint([aAddr, 5000n]);
        await repo.write.book([R2, aAddr, tUST.address, 50n, tUSD.address, 5000n, 5003n, H("t2")], { account: bankB.account });
        await repo.write.affirm([R2, H("t2")], { account: bankA.account });
        await tUST.write.approve([repo.address, 50n], { account: bankB.account });
        await tUSD.write.approve([repo.address, 5000n], { account: bankA.account });
        await repo.write.instruct([R2, PURCHASE, H("p2")], { account: bankB.account });
        await repo.write.instruct([R2, PURCHASE, H("p2")], { account: bankA.account });
        await repo.write.book([R3, bAddr, tUST.address, 1n, tUSD.address, 100n, 101n, H("t3")], { account: bankA.account });
      };
      const defaultB = () => oracle.write.setDefault([bAddr, true], { account: operator.account });

      it("needs the oracle's default record, and the non-defaulting party may not be in default", async () => {
        await purchased();
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
        await assert.rejects(repo.write.serveDefaultNotice([bAddr, H("n")], { account: bankA.account }));
        await defaultB();
        await assert.rejects(repo.write.closeOutDefault([CO, aAddr, zeroHash, H("st"), tUSD.address, aAddr, 7n], { account: bankB.account }));
        await oracle.write.setDefault([aAddr, true], { account: operator.account });
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
      });

      it("closes out every purchased repo of the pair in one transaction and moves no securities", async () => {
        await purchased();
        await defaultB();
        const ust = [await bal(tUST, aAddr), await bal(tUST, bAddr)];
        const usd = [await bal(tUSD, aAddr), await bal(tUSD, bAddr)];
        await repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account });
        for (const r of [R, R2]) {
          const x = await repo.read.getRepo([r]);
          assert.equal(x.state, CLOSED_OUT);
          assert.equal(x.repurchaseHash, H("st"));
        }
        assert.equal((await repo.read.getRepo([R3])).state, 1); // booked only: not closed out
        assert.deepEqual([await bal(tUST, aAddr), await bal(tUST, bAddr)], ust);
        assert.deepEqual([await bal(tUSD, aAddr), await bal(tUSD, bAddr)], usd);
        const c = await repo.read.getCloseOut([CO]);
        assert.equal(getAddress(c.payer), bAddr);
        assert.equal(c.amount, 7n);
        assert.equal(c.paid, false);
        assert.deepEqual(await repo.read.closeOutsOf([bAddr]), [CO]);
        await assert.rejects(repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account })); // closed out
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
        await assert.rejects(repo.write.closeOutDefault([H("CO-2"), bAddr, zeroHash, H("st2"), tUSD.address, bAddr, 7n], { account: bankA.account })); // nothing left
      });

      it("the payer pays the balance once; a zero balance has no payer", async () => {
        await purchased();
        await defaultB();
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, zeroHash.slice(0, 42), 7n], { account: bankA.account }));
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 0n], { account: bankA.account }));
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bankC.account.address, 7n], { account: bankA.account }));
        // A, the non-defaulting party, owes the balance
        await repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, aAddr, 7n], { account: bankA.account });
        await assert.rejects(repo.write.payCloseOut([CO], { account: bankB.account }));
        await assert.rejects(repo.write.payCloseOut([CO], { account: bankA.account })); // no allowance
        await tUSD.write.approve([repo.address, 7n], { account: bankA.account });
        const a = await bal(tUSD, aAddr), b = await bal(tUSD, bAddr);
        await repo.write.payCloseOut([CO], { account: bankA.account });
        assert.equal(await bal(tUSD, aAddr), a - 7n);
        assert.equal(await bal(tUSD, bAddr), b + 7n);
        assert.equal((await repo.read.getCloseOut([CO])).paid, true);
        await tUSD.write.approve([repo.address, 7n], { account: bankA.account });
        await assert.rejects(repo.write.payCloseOut([CO], { account: bankA.account }));
      });

      it("a zero balance is recorded as settled", async () => {
        await purchased();
        await defaultB();
        await repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, zeroHash.slice(0, 42), 0n], { account: bankA.account });
        assert.equal((await repo.read.getCloseOut([CO])).paid, true);
      });

      it("a close-out under a Default Notice names the notice served", async () => {
        await purchased();
        await defaultB();
        await assert.rejects(repo.write.serveDefaultNotice([aAddr, H("n")], { account: bankA.account }));
        await assert.rejects(repo.write.serveDefaultNotice([bAddr, zeroHash], { account: bankA.account }));
        await repo.write.serveDefaultNotice([bAddr, H("n")], { account: bankA.account });
        assert.equal(await repo.read.defaultNotice([aAddr, bAddr]), H("n"));
        await assert.rejects(repo.write.closeOutDefault([CO, bAddr, H("other"), H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
        await repo.write.closeOutDefault([CO, bAddr, H("n"), H("st"), tUSD.address, bAddr, 7n], { account: bankA.account });
        assert.equal((await repo.read.getCloseOut([CO])).noticeHash, H("n"));
      });

      it("a pending repurchase instruction lapses at the close-out", async () => {
        await purchased();
        await repo.write.instruct([R, REPURCHASE, H("r")], { account: bankA.account });
        await defaultB();
        await repo.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account });
        assert.equal((await repo.read.getInstructions([R, REPURCHASE]))[0], ZERO_BYTES32);
      });
    });
  });

  describe("securities loan delivery and return (task-gmsla-loan-delivery-return)", () => {
    let loans: any, tUSD: any, bankC: any;
    const H = (s: string) => keccak256(toHex(s));
    const L = H("LOAN-1");
    const bal = async (t: any, a: `0x${string}`) => t.read.balanceOf([a]);
    beforeEach(async () => {
      loans = await viem.deployContract("SecuritiesLoan", [oracle.address]);
      tUSD = await viem.deployContract("TokenizedCollateral", ["USD deposit token", "tUSD", "US0000000USD", "000000USD", "QUSD00000"]);
      bankC = (await viem.getWalletClients())[3];
      await tUSD.write.mint([bAddr, 10000n]);
      // A lends 100 tMMF to B against 5,100 tUSD (100 × 50.00 × 1.02).
      await loans.write.book([L, bAddr, tMMF.address, 100n, tUSD.address, 5100n, H("trade")], { account: bankA.account });
    });
    const deliver = async () => {
      await loans.write.affirm([L, H("trade")], { account: bankB.account });
      await tMMF.write.approve([loans.address, 100n], { account: bankA.account });
      await tUSD.write.approve([loans.address, 5100n], { account: bankB.account });
      await loans.write.instructDelivery([L, H("d")], { account: bankA.account });
      await loans.write.instructDelivery([L, H("d")], { account: bankB.account });
    };

    it("books, affirms with the same hash, and delivers securities and collateral in the second instruction", async () => {
      await assert.rejects(loans.write.affirm([L, H("other")], { account: bankB.account }));
      await assert.rejects(loans.write.affirm([L, H("trade")], { account: bankA.account }));
      await assert.rejects(loans.write.instructDelivery([L, H("d")], { account: bankA.account })); // not affirmed
      await loans.write.affirm([L, H("trade")], { account: bankB.account });
      assert.equal((await loans.read.getLoan([L])).state, 2); // Affirmed
      await tMMF.write.approve([loans.address, 100n], { account: bankA.account });
      await tUSD.write.approve([loans.address, 5100n], { account: bankB.account });
      await loans.write.instructDelivery([L, H("d")], { account: bankB.account });
      assert.equal(await bal(tMMF, bAddr), 0n); // one instruction moves nothing
      assert.deepEqual(await loans.read.getDeliveryInstructions([L]), [`0x${"0".repeat(64)}`, H("d")]);
      await loans.write.instructDelivery([L, H("d")], { account: bankA.account });
      const l = await loans.read.getLoan([L]);
      assert.equal(l.state, 3); // Open
      assert.equal(l.deliveryHash, H("d"));
      assert.equal(await bal(tMMF, bAddr), 100n);
      assert.equal(await bal(tMMF, aAddr), 900n);
      assert.equal(await bal(tUSD, aAddr), 5100n); // title transfer: the lender holds the collateral
      assert.equal(await bal(tUSD, bAddr), 4900n);
      assert.equal(await bal(tUSD, loans.address), 0n);
    });

    it("settles a partial return, then the full return of the rest, restoring every balance", async () => {
      await deliver();
      await tMMF.write.approve([loans.address, 100n], { account: bankB.account });
      await tUSD.write.approve([loans.address, 5100n], { account: bankA.account });
      await loans.write.instructReturn([L, 40n, 2040n, H("r1")], { account: bankB.account });
      await assert.rejects(loans.write.instructReturn([L, 40n, 2000n, H("r1")], { account: bankA.account })); // other terms
      await assert.rejects(loans.write.instructReturn([L, 40n, 2040n, H("x")], { account: bankA.account })); // other hash
      assert.deepEqual(await loans.read.getReturnInstructions([L]), [`0x${"0".repeat(64)}`, H("r1"), 40n, 2040n]);
      await loans.write.instructReturn([L, 40n, 2040n, H("r1")], { account: bankA.account });
      let l = await loans.read.getLoan([L]);
      assert.equal(l.state, 3); // still Open
      assert.equal(l.quantity, 60n);
      assert.equal(l.collateralAmount, 3060n);
      assert.equal(l.tradeHash, H("r1"));
      assert.equal(await bal(tMMF, aAddr), 940n);
      assert.equal(await bal(tUSD, bAddr), 6940n);
      // A full return must redeliver all the collateral held.
      await assert.rejects(loans.write.instructReturn([L, 60n, 3000n, H("r2")], { account: bankB.account }));
      await assert.rejects(loans.write.instructReturn([L, 61n, 3060n, H("r2")], { account: bankB.account }));
      await loans.write.instructReturn([L, 60n, 3060n, H("r2")], { account: bankB.account });
      await loans.write.instructReturn([L, 60n, 3060n, H("r2")], { account: bankA.account });
      l = await loans.read.getLoan([L]);
      assert.equal(l.state, 4); // Returned
      assert.equal(l.quantity, 0n);
      assert.equal(l.collateralAmount, 0n);
      assert.equal(await bal(tMMF, aAddr), 1000n);
      assert.equal(await bal(tMMF, bAddr), 0n);
      assert.equal(await bal(tUSD, aAddr), 0n);
      assert.equal(await bal(tUSD, bAddr), 10000n);
      await assert.rejects(loans.write.instructReturn([L, 1n, 0n, H("r3")], { account: bankB.account }));
    });

    it("rejects an outsider, a second instruction, a return before delivery, a missing allowance and a bad booking", async () => {
      await assert.rejects(loans.write.instructReturn([L, 1n, 0n, H("r")], { account: bankB.account })); // not open
      await loans.write.affirm([L, H("trade")], { account: bankB.account });
      await loans.write.instructDelivery([L, H("d")], { account: bankA.account });
      await assert.rejects(loans.write.instructDelivery([L, H("d")], { account: bankA.account }));
      await assert.rejects(loans.write.instructDelivery([L, H("d")], { account: bankC.account }));
      await assert.rejects(loans.write.instructDelivery([L, H("e")], { account: bankB.account }));
      await assert.rejects(loans.write.instructDelivery([L, H("d")], { account: bankB.account })); // no allowances
      assert.equal(await bal(tMMF, bAddr), 0n);
      await assert.rejects(loans.write.book([L, bAddr, tMMF.address, 1n, tUSD.address, 1n, H("t")], { account: bankA.account }));
      await assert.rejects(loans.write.book([H("L2"), aAddr, tMMF.address, 1n, tUSD.address, 1n, H("t")], { account: bankA.account }));
      await assert.rejects(loans.write.book([H("L3"), bAddr, tMMF.address, 0n, tUSD.address, 1n, H("t")], { account: bankA.account }));
      await assert.rejects(loans.write.book([H("L4"), bAddr, tMMF.address, 1n, tUSD.address, 0n, H("t")], { account: bankA.account }));
      assert.deepEqual(await loans.read.loansOf([bAddr]), [L]);
    });

    it("the lender recalls part; a smaller return reduces the recall and a return of the rest clears it (task-gmsla-recall)", async () => {
      const Z = `0x${"0".repeat(64)}`;
      await assert.rejects(loans.write.recall([L, 40n, 20261113, H("n1")], { account: bankA.account })); // not open
      await deliver();
      await assert.rejects(loans.write.recall([L, 40n, 20261113, H("n1")], { account: bankB.account })); // not the lender
      await assert.rejects(loans.write.recall([L, 101n, 20261113, H("n1")], { account: bankA.account })); // too much
      await assert.rejects(loans.write.recall([L, 0n, 20261113, H("n1")], { account: bankA.account }));
      await assert.rejects(loans.write.recall([L, 40n, 20261113, Z as `0x${string}`], { account: bankA.account }));
      await loans.write.recall([L, 40n, 20261113, H("n1")], { account: bankA.account });
      assert.deepEqual(await loans.read.getRecall([L]), [40n, 20261113, H("n1")]);
      await assert.rejects(loans.write.recall([L, 10n, 20261113, H("n2")], { account: bankA.account })); // one pending
      // Nothing moves at the notice; the borrower returns 30, then 10.
      assert.equal(await bal(tMMF, bAddr), 100n);
      await tMMF.write.approve([loans.address, 100n], { account: bankB.account });
      await tUSD.write.approve([loans.address, 5100n], { account: bankA.account });
      await loans.write.instructReturn([L, 30n, 1530n, H("r1")], { account: bankB.account });
      await loans.write.instructReturn([L, 30n, 1530n, H("r1")], { account: bankA.account });
      assert.deepEqual(await loans.read.getRecall([L]), [10n, 20261113, H("n1")]);
      await loans.write.instructReturn([L, 10n, 510n, H("r2")], { account: bankB.account });
      await loans.write.instructReturn([L, 10n, 510n, H("r2")], { account: bankA.account });
      assert.deepEqual(await loans.read.getRecall([L]), [0n, 0, Z]);
      assert.equal((await loans.read.getLoan([L])).quantity, 60n);
      // A recall of the rest is cleared by the full return.
      await loans.write.recall([L, 60n, 20261116, H("n3")], { account: bankA.account });
      await loans.write.instructReturn([L, 60n, 3060n, H("r3")], { account: bankB.account });
      await loans.write.instructReturn([L, 60n, 3060n, H("r3")], { account: bankA.account });
      assert.deepEqual(await loans.read.getRecall([L]), [0n, 0, Z]);
      assert.equal((await loans.read.getLoan([L])).state, 4);
    });

    it("the lender withdraws a pending recall; only the lender, only a pending one", async () => {
      await deliver();
      await assert.rejects(loans.write.withdrawRecall([L, H("w")], { account: bankA.account })); // none pending
      await loans.write.recall([L, 100n, 20261113, H("n1")], { account: bankA.account });
      await assert.rejects(loans.write.withdrawRecall([L, H("w")], { account: bankB.account }));
      await loans.write.withdrawRecall([L, H("w")], { account: bankA.account });
      assert.deepEqual(await loans.read.getRecall([L]), [0n, 0, `0x${"0".repeat(64)}`]);
      assert.equal((await loans.read.getLoan([L])).quantity, 100n);
      await loans.write.recall([L, 50n, 20261114, H("n2")], { account: bankA.account }); // a new recall after withdrawal
      assert.equal((await loans.read.getRecall([L]))[0], 50n);
    });

    it("the borrower substitutes all the collateral with the lender's agreement in one transaction (task-gmsla-substitution)", async () => {
      const Z = `0x${"0".repeat(64)}`;
      const tAGY = await viem.deployContract("TokenizedCollateral", ["Tokenized agency bond", "tAGY", "US3137EAGY10", "3137EAGY1", "QAGY00000"]);
      await tAGY.write.mint([bAddr, 100n]);
      await assert.rejects(loans.write.requestSubstitution([L, tAGY.address, 52n, H("s1")], { account: bankB.account })); // not open
      await deliver();
      await assert.rejects(loans.write.requestSubstitution([L, tAGY.address, 52n, H("s1")], { account: bankA.account })); // not the borrower
      await assert.rejects(loans.write.requestSubstitution([L, tUSD.address, 52n, H("s1")], { account: bankB.account })); // same collateral
      await assert.rejects(loans.write.requestSubstitution([L, tMMF.address, 52n, H("s1")], { account: bankB.account })); // the loaned security
      await assert.rejects(loans.write.requestSubstitution([L, tAGY.address, 0n, H("s1")], { account: bankB.account }));
      await assert.rejects(loans.write.requestSubstitution([L, tAGY.address, 52n, Z as `0x${string}`], { account: bankB.account }));
      await loans.write.requestSubstitution([L, tAGY.address, 52n, H("s1")], { account: bankB.account });
      const [subToken, subQty, subHash] = await loans.read.getSubstitution([L]);
      assert.deepEqual([subToken.toLowerCase(), subQty, subHash], [tAGY.address.toLowerCase(), 52n, H("s1")]);
      await assert.rejects(loans.write.requestSubstitution([L, tAGY.address, 53n, H("s2")], { account: bankB.account })); // one pending
      await assert.rejects(loans.write.instructReturn([L, 10n, 510n, H("r")], { account: bankB.account })); // no return meanwhile
      await assert.rejects(loans.write.agreeSubstitution([L, H("s1")], { account: bankB.account })); // not the lender
      await assert.rejects(loans.write.agreeSubstitution([L, H("x")], { account: bankA.account })); // other hash
      await tAGY.write.approve([loans.address, 52n], { account: bankB.account });
      await tUSD.write.approve([loans.address, 5100n], { account: bankA.account });
      await loans.write.agreeSubstitution([L, H("s1")], { account: bankA.account });
      const l = await loans.read.getLoan([L]);
      assert.equal(l.collateral.toLowerCase(), tAGY.address.toLowerCase());
      assert.equal(l.collateralAmount, 52n);
      assert.equal(l.tradeHash, H("s1"));
      assert.equal(l.quantity, 100n);
      assert.equal(await bal(tAGY, aAddr), 52n);
      assert.equal(await bal(tUSD, bAddr), 10000n); // all the cash collateral is back
      assert.equal(await bal(tUSD, aAddr), 0n);
      assert.deepEqual(await loans.read.getSubstitution([L]), ["0x0000000000000000000000000000000000000000", 0n, Z]);
      // The full return now redelivers the substitute.
      await tMMF.write.approve([loans.address, 100n], { account: bankB.account });
      await tAGY.write.approve([loans.address, 52n], { account: bankA.account });
      await loans.write.instructReturn([L, 100n, 52n, H("r")], { account: bankB.account });
      await loans.write.instructReturn([L, 100n, 52n, H("r")], { account: bankA.account });
      assert.equal(await bal(tAGY, bAddr), 100n);
    });

    it("the borrower bills the rebate; the lender pays it in tUSD and the loan is billed through the period end (task-gmsla-rebate)", async () => {
      const Z = `0x${"0".repeat(64)}`;
      await assert.rejects(loans.write.bill([L, tUSD.address, 20261211, 17n, H("i1")], { account: bankB.account })); // not delivered
      await deliver();
      await assert.rejects(loans.write.bill([L, tUSD.address, 20261211, 17n, H("i1")], { account: bankC.account })); // not a party
      await assert.rejects(loans.write.bill([L, tUSD.address, 20261211, 0n, H("i1")], { account: bankB.account }));
      await assert.rejects(loans.write.bill([L, tUSD.address, 20261211, 17n, Z as `0x${string}`], { account: bankB.account }));
      await loans.write.bill([L, tUSD.address, 20261211, 17n, H("i1")], { account: bankB.account });
      await assert.rejects(loans.write.bill([L, tUSD.address, 20261212, 1n, H("i2")], { account: bankB.account })); // one pending
      await assert.rejects(loans.write.payBill([L, H("i1")], { account: bankB.account })); // the biller does not pay
      await assert.rejects(loans.write.payBill([L, H("x")], { account: bankA.account })); // other hash
      const [biller, token, end, amount, hash, through] = await loans.read.getBill([L]);
      assert.deepEqual([biller.toLowerCase(), token.toLowerCase(), end, amount, hash, through], [bAddr.toLowerCase(), tUSD.address.toLowerCase(), 20261211, 17n, H("i1"), 0]);
      const a0 = await bal(tUSD, aAddr), b0 = await bal(tUSD, bAddr);
      await tUSD.write.approve([loans.address, 17n], { account: bankA.account });
      await loans.write.payBill([L, H("i1")], { account: bankA.account });
      assert.equal(await bal(tUSD, aAddr), a0 - 17n);
      assert.equal(await bal(tUSD, bAddr), b0 + 17n);
      assert.equal((await loans.read.getBill([L]))[5], 20261211);
      assert.equal((await loans.read.getBill([L]))[3], 0n);
      await assert.rejects(loans.write.bill([L, tUSD.address, 20261211, 5n, H("i2")], { account: bankB.account })); // not after billed
      // The lender refuses the next invoice; a returned loan can still be billed.
      await loans.write.bill([L, tUSD.address, 20261215, 5n, H("i2")], { account: bankB.account });
      await assert.rejects(loans.write.refuseBill([L], { account: bankB.account }));
      await loans.write.refuseBill([L], { account: bankA.account });
      assert.equal((await loans.read.getBill([L]))[5], 20261211);
      await tUSD.write.mint([aAddr, 100n]); // the lender redelivers all 5,100 after paying 17
      await tMMF.write.approve([loans.address, 100n], { account: bankB.account });
      await tUSD.write.approve([loans.address, 5100n], { account: bankA.account });
      await loans.write.instructReturn([L, 100n, 5100n, H("r")], { account: bankB.account });
      await loans.write.instructReturn([L, 100n, 5100n, H("r")], { account: bankA.account });
      await loans.write.bill([L, tUSD.address, 20261215, 5n, H("i3")], { account: bankB.account });
      await tUSD.write.approve([loans.address, 5n], { account: bankA.account });
      await loans.write.payBill([L, H("i3")], { account: bankA.account });
      assert.equal((await loans.read.getBill([L]))[5], 20261215);
    });

    it("the lender refuses a substitution; none can be requested while a return is pending", async () => {
      const tAGY = await viem.deployContract("TokenizedCollateral", ["Tokenized agency bond", "tAGY", "US3137EAGY10", "3137EAGY1", "QAGY00000"]);
      await deliver();
      await assert.rejects(loans.write.refuseSubstitution([L], { account: bankA.account })); // none pending
      await loans.write.requestSubstitution([L, tAGY.address, 52n, H("s1")], { account: bankB.account });
      await assert.rejects(loans.write.refuseSubstitution([L], { account: bankB.account }));
      await loans.write.refuseSubstitution([L], { account: bankA.account });
      assert.equal((await loans.read.getSubstitution([L]))[1], 0n);
      assert.equal((await loans.read.getLoan([L])).tradeHash, H("trade"));
      await loans.write.instructReturn([L, 10n, 510n, H("r")], { account: bankB.account });
      await assert.rejects(loans.write.requestSubstitution([L, tAGY.address, 52n, H("s2")], { account: bankB.account }));
    });

    describe("default close-out (task-gmsla-default-close-out)", () => {
      const L2 = H("LOAN-2"), L3 = H("LOAN-3"), CO = H("LCO-1");
      const CLOSED_OUT = 5;
      const defaultB = () => oracle.write.setDefault([bAddr, true], { account: operator.account });
      // LOAN-1 (A lends 100 tMMF to B) and LOAN-2 (B lends 50 tMMF to A against 2,550 tUSD) open; LOAN-3 booked only.
      const opened = async () => {
        await deliver();
        await tUSD.write.mint([aAddr, 3000n]);
        await loans.write.book([L2, aAddr, tMMF.address, 50n, tUSD.address, 2550n, H("t2")], { account: bankB.account });
        await loans.write.affirm([L2, H("t2")], { account: bankA.account });
        await tMMF.write.approve([loans.address, 50n], { account: bankB.account });
        await tUSD.write.approve([loans.address, 2550n], { account: bankA.account });
        await loans.write.instructDelivery([L2, H("d2")], { account: bankB.account });
        await loans.write.instructDelivery([L2, H("d2")], { account: bankA.account });
        await loans.write.book([L3, bAddr, tMMF.address, 1n, tUSD.address, 51n, H("t3")], { account: bankA.account });
      };

      it("needs the oracle's default record, and the non-defaulting party may not be in default", async () => {
        await opened();
        await assert.rejects(loans.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
        await assert.rejects(loans.write.serveDefaultNotice([bAddr, H("n")], { account: bankA.account }));
        await defaultB();
        await assert.rejects(loans.write.closeOutDefault([CO, aAddr, zeroHash, H("st"), tUSD.address, aAddr, 7n], { account: bankB.account }));
        await oracle.write.setDefault([aAddr, true], { account: operator.account });
        await assert.rejects(loans.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
        await oracle.write.setDefault([aAddr, false], { account: operator.account });
      });

      it("closes out every open loan of the pair, lapses what is pending, moves nothing, and the payer pays the balance", async () => {
        await opened();
        await loans.write.recall([L, 10n, 20261201, H("rc")], { account: bankA.account });
        await loans.write.bill([L, tUSD.address, 20261201, 3n, H("i")], { account: bankA.account });
        await defaultB();
        const before = [await bal(tMMF, aAddr), await bal(tMMF, bAddr), await bal(tUSD, aAddr), await bal(tUSD, bAddr)];
        await assert.rejects(loans.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 0n], { account: bankA.account }));
        await assert.rejects(loans.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bankC.account.address, 7n], { account: bankA.account }));
        await loans.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account });
        for (const id of [L, L2]) {
          assert.equal((await loans.read.getLoan([id])).state, CLOSED_OUT);
          assert.equal(await loans.read.closeOutOf([id]), CO);
        }
        assert.equal((await loans.read.getLoan([L3])).state, 1); // still Booked
        assert.equal((await loans.read.getRecall([L]))[0], 0n);
        assert.equal((await loans.read.getBill([L]))[4], zeroHash);
        assert.deepEqual([await bal(tMMF, aAddr), await bal(tMMF, bAddr), await bal(tUSD, aAddr), await bal(tUSD, bAddr)], before);
        assert.deepEqual(await loans.read.closeOutsOf([aAddr]), [CO]);
        assert.deepEqual(await loans.read.closeOutsOf([bAddr]), [CO]);
        await assert.rejects(loans.write.closeOutDefault([CO, bAddr, zeroHash, H("st"), tUSD.address, bAddr, 7n], { account: bankA.account }));
        await assert.rejects(loans.write.closeOutDefault([H("LCO-2"), bAddr, zeroHash, H("st2"), tUSD.address, bAddr, 7n], { account: bankA.account })); // nothing left
        await assert.rejects(loans.write.instructReturn([L, 10n, 510n, H("r")], { account: bankB.account }));
        await assert.rejects(loans.write.bill([L, tUSD.address, 20261231, 3n, H("i2")], { account: bankA.account }));
        await assert.rejects(loans.write.payCloseOut([CO], { account: bankA.account })); // not the payer
        await tUSD.write.approve([loans.address, 7n], { account: bankB.account });
        await loans.write.payCloseOut([CO], { account: bankB.account });
        assert.equal(await bal(tUSD, aAddr), before[2] + 7n);
        assert.equal((await loans.read.getCloseOut([CO])).paid, true);
        await assert.rejects(loans.write.payCloseOut([CO], { account: bankB.account }));
        await oracle.write.setDefault([bAddr, false], { account: operator.account });
      });

      it("a served Default Notice must be the one recorded; a zero balance is paid at once", async () => {
        await opened();
        await defaultB();
        await loans.write.serveDefaultNotice([bAddr, H("n")], { account: bankA.account });
        assert.equal(await loans.read.defaultNotice([aAddr, bAddr]), H("n"));
        await assert.rejects(loans.write.closeOutDefault([CO, bAddr, H("other"), H("st"), tUSD.address, zeroAddress, 0n], { account: bankA.account }));
        await loans.write.closeOutDefault([CO, bAddr, H("n"), H("st"), tUSD.address, zeroAddress, 0n], { account: bankA.account });
        const c = await loans.read.getCloseOut([CO]);
        assert.equal(c.noticeHash, H("n"));
        assert.equal(c.paid, true);
        await oracle.write.setDefault([bAddr, false], { account: operator.account });
      });
    });
  });
});
