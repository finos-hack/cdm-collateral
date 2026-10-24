// Verification runner for flow-im-margin-call-pledge (full-agreement, single-token happy path) driven through two
// per-participant Besu gateway adapters against the running network: bank-b is the secured party (caller), bank-a is
// the pledgor. Each lifecycle step is signed by the acting party's own node key, and on-chain state is read back and
// asserted after settlement. This proves the chain + gateway layers independently of the Java workflow service.
import { keccak256, stringToHex, getAddress } from "viem";
import { BesuAdapter, CallKind, ResponseType, CallStateName, ProposalStateName } from "./besu.ts";
import { loadRegistry } from "./registry.ts";

const SCALE = 100000000n; // OracleFeed.PRICE_SCALE = 1e8

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function main() {
  const reg = loadRegistry();
  const securedParty = new BesuAdapter("bank-b", reg); // caller / receiver of collateral
  const pledgor = new BesuAdapter("bank-a", reg); // posts collateral
  const bankA = getAddress(reg.parties["bank-a"]);
  const bankB = getAddress(reg.parties["bank-b"]);
  const tUST = reg.tokens["tUST"].address;

  const callId = keccak256(stringToHex(`C-${Date.now()}`)); // unique per run; the chain keeps prior state
  const amount = 5_000_000n * SCALE; // USD 5,000,000, scaled
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
  const pledgeQty = 60000n; // 60,000 tUST; value after 2% haircut at 98.4 covers the agreed amount
  const hash = (o: unknown) => keccak256(stringToHex(JSON.stringify(o)));

  console.log(`flow-im-margin-call-pledge  callId=${callId.slice(0, 10)}…`);
  console.log(`secured party (bank-b) ${bankB}\npledgor      (bank-a) ${bankA}\ntUST token            ${tUST}\n`);

  const startBalA = await pledgor.tokenBalance(tUST, bankA);
  const startPledged = await securedParty.pledgedBalance(bankA, bankB, tUST);

  // 1. Secured party issues the IM call (CDM MarginCallIssuance hash on-chain).
  let r = await securedParty.issueCall(callId, CallKind.IM, bankA, amount, deadline, hash({ msg: "MarginCallIssuance", callId, amount: amount.toString() }));
  console.log(`1. issueCall     signed by bank-b   block ${r.block}`);

  // 2. Pledgor agrees in full.
  r = await pledgor.respond(callId, ResponseType.Full, amount, hash({ msg: "MarginCallResponse", callId, response: "full" }));
  console.log(`2. respond(full) signed by bank-a   block ${r.block}`);

  // 3. Pledgor proposes 60,000 tUST.
  const prop = await pledgor.propose(callId, [{ token: tUST, qty: pledgeQty }], hash({ msg: "CollateralProposal", callId, assets: [["tUST", "60000"]] }));
  console.log(`3. propose       signed by bank-a   block ${prop.block}  proposalId ${prop.proposalId}`);

  // 4. Secured party accepts the proposal.
  r = await securedParty.decide(callId, prop.proposalId, true);
  console.log(`4. decide(accept) signed by bank-b  block ${r.block}`);

  // 5. Pledgor approves the control contract, then pledges.
  r = await pledgor.approve(tUST, reg.contracts.collateralControl, pledgeQty);
  console.log(`5a. approve      signed by bank-a   block ${r.block}`);
  r = await pledgor.pledge(callId, prop.proposalId);
  console.log(`5b. pledge       signed by bank-a   block ${r.block}`);

  // Read back and assert on-chain state.
  console.log(`\nassertions (read from chain):`);
  const call = await securedParty.getCall(callId);
  const pstate = await securedParty.getProposalState(callId, prop.proposalId);
  const pledged = await securedParty.pledgedBalance(bankA, bankB, tUST);
  const endBalA = await pledgor.tokenBalance(tUST, bankA);

  assert(CallStateName[call.state] === "settled", `call state is "settled" (got "${CallStateName[call.state]}")`);
  assert(ProposalStateName[pstate] === "accepted", `proposal state is "accepted" (got "${ProposalStateName[pstate]}")`);
  assert(pledged - startPledged === pledgeQty, `escrow rose by ${pledgeQty} tUST (${startPledged} -> ${pledged})`);
  assert(startBalA - endBalA === pledgeQty, `pledgor tUST balance fell by ${pledgeQty} (${startBalA} -> ${endBalA})`);
  assert(call.agreed === amount && call.disputed === 0n, `agreed=${call.agreed} disputed=${call.disputed}`);

  console.log(`\nflow-im-margin-call-pledge: COMPLETE on-chain through per-party gateways.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
