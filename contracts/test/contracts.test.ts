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
});
