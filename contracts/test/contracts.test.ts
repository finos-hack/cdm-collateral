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
      // BANK-A (pledgor) calls for a return; BANK-B (secured party) agrees and releases.
      await marginCall.write.issueCall([R, RETURN, bAddr, 300n * SCALE, 0n, zeroHash], { account: bankA.account });
      await control.write.returnCollateral([R, [{ token: tUST.address, qty: 3n }]], { account: bankB.account });
      assert.equal(await control.read.pledgedBalance([aAddr, bAddr, tUST.address]), 8n);
      assert.equal(await tUST.read.balanceOf([aAddr]), 992n); // 989 + 3 back
    });

    it("rejects a return from the wrong party", async () => {
      await pledge11();
      await marginCall.write.issueCall([R, RETURN, bAddr, 300n * SCALE, 0n, zeroHash], { account: bankA.account });
      await assert.rejects(control.write.returnCollateral([R, [{ token: tUST.address, qty: 3n }]], { account: bankA.account }));
    });

    it("rejects releasing more than the return amount", async () => {
      await pledge11();
      await marginCall.write.issueCall([R, RETURN, bAddr, 300n * SCALE, 0n, zeroHash], { account: bankA.account });
      // 4 tUST after 2% = 392 > 300 return amount.
      await assert.rejects(control.write.returnCollateral([R, [{ token: tUST.address, qty: 4n }]], { account: bankB.account }));
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
      await control.write.settleByTransfer([C, 0n], { account: bankA.account });
      assert.equal(await tUST.read.balanceOf([bAddr]), 5n);
      assert.equal(await tUST.read.balanceOf([control.address]), 0n); // title passed, nothing escrowed
    });
  });
});
