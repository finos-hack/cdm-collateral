// Scenarios as data (wp-adr-ux-scenario-grid). Each step is an engine action, so guided mode, free mode and the
// tests all run through the same rules. `display` and `why` carry the explanation shown in guided mode; `caps`
// are capability rows of the CDM coverage matrices (docs/analysis/*coverage-matrix.md); `calm` are step numbers of
// the CALM flow (architecture/prototype.architecture.json).
import type { Action } from "../domain/engine";
import type { AgreementKind, PartyId, State } from "../domain/types";

export interface Step {
  actor: PartyId;
  say: string;
  why: string;
  refs: string[];
  caps: (number | string)[];
  calm: string;
  label: string;
  display?: [string, string][];
  action: Action;
}

export interface Scenario {
  id: string;
  kind: AgreementKind;
  title: string;
  flow: string;
  parties: PartyId[];
  init: () => State;
  steps: Step[];
  outcome: string;
}

export function baseState(kind: AgreementKind): State {
  return {
    kind,
    block: 1204,
    feed: { tUST: 98.4, tMMF: 1, tUSD: 1 },
    mock: { tUST: 98.4, tMMF: 1, tUSD: 1 },
    defaulted: [],
    wallet:
      kind === "IM"
        ? { A: { tUST: 400_000, tMMF: 20_000_000, tUSD: 0 }, B: { tUST: 0, tMMF: 0, tUSD: 0 } }
        : { A: { tUST: 0, tMMF: 0, tUSD: 15_000_000 }, B: { tUST: 0, tMMF: 0, tUSD: 7_000_000 } },
    pledges: [],
    calls: [],
    ev: [],
    req: 0,
    held: 0,
    reused: 0,
    nextCall: 1,
    step: 0,
  };
}

/** IM state after the basic call has settled: 128,589 tUST pledged against C-0001. */
export function settledImState(): State {
  const s = baseState("IM");
  s.wallet.A.tUST -= 128_589;
  s.pledges.push({ token: "tUST", qty: 128_589, call: "C-0001", state: "pledged" });
  s.calls.push({ id: "C-0001", kind: "IM", from: "B", to: "A", amount: 12_400_000, deadline: "2026-10-19", state: "settled", agreed: 12_400_000, disputed: 0, proposals: [{ id: "P-1", assets: [["tUST", 128_589]], state: "accepted" }] });
  s.nextCall = 2;
  s.req = 12_400_000;
  return s;
}

const issueIm: Step = {
  actor: "B", say: "Issue the initial margin call", calm: "1–5", caps: [6, 7, 9, 11], label: "Issue call",
  why: "BANK-B's SIMM calculation shows USD 62.4m of initial margin. Above the USD 50m IM threshold, with nothing held yet, BANK-A must deliver USD 12.4m. The call is recorded on-chain (state, amount, deadline, content hash) and the full CDM content goes to BANK-A's service.",
  refs: ["CDM MarginCallIssuance", "ISO 20022 colr.003", "ADR wp-adr-margin-call-state-onchain"],
  display: [["Valuation date", "2026-10-16"], ["SIMM initial margin", "USD 62,400,000"], ["IM threshold", "USD 50,000,000"], ["Collateral held", "USD 0"], ["Delivery amount (rounded up)", "USD 12,400,000"], ["Settlement deadline", "2026-10-19"]],
  action: { type: "issueCall", by: "B", to: "A", kind: "IM", amount: 12_400_000, deadline: "2026-10-19", requirement: 12_400_000 },
};

export const SCENARIOS: Scenario[] = [
  {
    id: "im-call", kind: "IM", title: "Initial margin call, collateral proposal and pledge", flow: "flow-im-margin-call-pledge", parties: ["A", "B"],
    init: () => baseState("IM"),
    outcome: "BANK-B called USD 12,400,000 of initial margin, BANK-A agreed and proposed tokenized Treasuries, BANK-B accepted them, and BANK-A pledged them into the collateral control contract. The tokens are segregated: BANK-B cannot reuse them, and they leave the contract only by return or enforcement.",
    steps: [
      issueIm,
      { actor: "A", say: "Agree in full", calm: "6–9", caps: [11], label: "Agree",
        why: "BANK-A's own SIMM run agrees with the amount. The response is recorded on-chain and the CDM MarginCallResponse goes to BANK-B.",
        refs: ["CDM MarginCallResponse", "ISO 20022 colr.004"], display: [["Response", "Agree in full"], ["Agreed amount", "USD 12,400,000"]],
        action: { type: "respond", by: "A", callId: "C-0001", response: "full", agreed: 12_400_000 } },
      { actor: "A", say: "Propose collateral", calm: "10–12", caps: [24, 3, 4], label: "Propose",
        why: "BANK-A proposes tokenized Treasuries. At 98.40 and a 2% haircut, 128,589 units are worth USD 12,400,094 after haircut, just above the call.",
        refs: ["ISO 20022 colr.007", "CDM MarginCallResponseAction"], display: [["Propose", "tUST 128,589 units"], ["Value after 2% haircut", "USD 12,400,094"]],
        action: { type: "propose", by: "A", callId: "C-0001", assets: [["tUST", 128_589]] } },
      { actor: "B", say: "Check the proposal and accept it", calm: "13–19", caps: [3, 4, 5, 25], label: "Accept proposal",
        why: "BANK-B checks the proposed tokens against its own copy of the eligibility schedule: eligible asset, haircut, concentration limits, value after haircut. All pass, so BANK-B accepts on-chain with its own key.",
        refs: ["ISO 20022 colr.008", "CDM EligibleCollateralSpecification"],
        action: { type: "decideProposal", by: "B", callId: "C-0001", proposalId: "P-1", accept: true } },
      { actor: "A", say: "Pledge the accepted collateral", calm: "20–23", caps: [13, 17, 16], label: "Pledge",
        why: "BANK-A's gateway submits pledge(). The control contract checks it against the agreed call and the accepted proposal, pulls the tokens from BANK-A's wallet and marks the call settled, all in one finalized block.",
        refs: ["ADR wp-adr-im-segregation", "ASR concept-asr-settlement-finality"], display: [["Pledge", "tUST 128,589 units"], ["To", "Collateral control contract (segregated)"], ["Against", "C-0001 / P-1"]],
        action: { type: "pledge", by: "A", callId: "C-0001", proposalId: "P-1" } },
      { actor: "B", say: "Confirm the books match the ledger", calm: "24–26", caps: [16, 19], label: "Confirm",
        why: "Each party's gateway reports the finalized events to its own workflow service. Both books now show the same call state and collateral, without a reconciliation message between them.",
        refs: ["ADR wp-adr-per-participant-services"], display: [["C-0001", "settled on-chain and in BANK-B's books"], ["Held for BANK-B", "128,589 tUST in the control contract"]],
        action: { type: "message", by: "B", to: "B", what: "Ledger events", text: "Gateways reported Pledged and CallSettled to both workflow services" } },
    ],
  },
  {
    id: "im-dispute", kind: "IM", title: "Partial agreement, dispute and rejected proposal", flow: "flow-im-margin-call-pledge", parties: ["A", "B"],
    init: () => baseState("IM"),
    outcome: "BANK-A agreed USD 11.9m and disputed USD 0.5m. Its first proposal (all money market fund shares) broke BANK-B's 50% concentration limit and was rejected; the second mix was accepted and pledged. The agreed part settled on-chain. The disputed USD 500,000 stays open on the call while the parties compare SIMM inputs off-chain.",
    steps: [
      issueIm,
      { actor: "A", say: "Agree part, dispute the rest", calm: "6–9", caps: [11, 12], label: "Partially agree",
        why: "BANK-A's SIMM run gives a lower figure: its interest-rate delta sensitivities differ from BANK-B's. It agrees USD 11.9m and disputes USD 0.5m. The disputed amount is recorded on the call; resolving it happens off-chain.",
        refs: ["CDM MarginCallResponse", "ISO 20022 colr.004", "ISO 20022 colr.009", "ASR concept-asr-onchain-call-state"],
        display: [["Response", "Partially agree"], ["Agreed", "USD 11,900,000"], ["Disputed", "USD 500,000 (SIMM IR delta sensitivities differ)"]],
        action: { type: "respond", by: "A", callId: "C-0001", response: "partial", agreed: 11_900_000, reason: "SIMM IR delta sensitivities differ" } },
      { actor: "A", say: "Propose fund shares", calm: "10–12", caps: [24], label: "Propose",
        why: "BANK-A proposes tokenized money market fund shares only: 12,395,834 shares are worth USD 11,900,001 after the 4% haircut.",
        refs: ["ISO 20022 colr.007"], display: [["Propose", "tMMF 12,395,834 shares"], ["Value after 4% haircut", "USD 11,900,001"]],
        action: { type: "propose", by: "A", callId: "C-0001", assets: [["tMMF", 12_395_834]] } },
      { actor: "B", say: "Reject the proposal: concentration limit", calm: "13–19", caps: [3, 5, 25], label: "Reject proposal",
        why: "Fund shares are eligible, but the schedule allows at most 50% of the collateral in them. This proposal is 100% fund shares, so BANK-B rejects it with the reason.",
        refs: ["ISO 20022 colr.008", "CDM ConcentrationLimit"],
        action: { type: "decideProposal", by: "B", callId: "C-0001", proposalId: "P-1", accept: false, reason: "tMMF over the 50% concentration limit" } },
      { actor: "A", say: "Propose a new mix", calm: "10–12", caps: [24], label: "Propose",
        why: "BANK-A splits the collateral: Treasuries plus fund shares under the limit. Together they cover the agreed USD 11.9m after haircuts, with fund shares at 48.5% of market value.",
        refs: ["ISO 20022 colr.007"], display: [["tUST", "64,200 units → USD 6,190,934 after haircut"], ["tMMF", "5,950,000 shares → USD 5,712,000 after haircut"], ["Total after haircuts", "USD 11,902,934"]],
        action: { type: "propose", by: "A", callId: "C-0001", assets: [["tUST", 64_200], ["tMMF", 5_950_000]] } },
      { actor: "B", say: "Accept the new proposal", calm: "13–19", caps: [3, 4, 5, 25], label: "Accept proposal",
        why: "Both assets are eligible, haircuts applied, fund shares under 50%, and the value covers the agreed amount.",
        refs: ["ISO 20022 colr.008"],
        action: { type: "decideProposal", by: "B", callId: "C-0001", proposalId: "P-2", accept: true } },
      { actor: "A", say: "Pledge the agreed part", calm: "20–26", caps: [13, 17], label: "Pledge",
        why: "The control contract takes only the accepted assets and checks they cover the agreed amount. The call is settled for the agreed USD 11.9m; the disputed USD 0.5m stays open on the call.",
        refs: ["ADR wp-adr-im-segregation"], display: [["Pledge", "tUST 64,200 + tMMF 5,950,000"], ["Against", "C-0001 / P-2"]],
        action: { type: "pledge", by: "A", callId: "C-0001", proposalId: "P-2" } },
      { actor: "B", say: "Start dispute resolution off-chain", calm: "–", caps: [12], label: "Request CRIF files",
        why: "The parties exchange their SIMM inputs (CRIF sensitivity files) and recalculate. When they settle the difference, a new call for the resolved amount goes through the same steps.",
        refs: ["ISO 20022 colr.009", "ISDA SIMM CRIF"], display: [["Disputed", "USD 500,000"], ["Next", "exchange CRIF files, recalculate"]],
        action: { type: "message", by: "B", to: "A", what: "Dispute resolution", text: "Request: CRIF sensitivity file for the 2026-10-16 portfolio" } },
    ],
  },
  {
    id: "im-reval", kind: "IM", title: "Revaluation and top-up call", flow: "flow-revaluation-top-up", parties: ["M", "B", "A"],
    init: settledImState,
    outcome: "A Treasury sell-off moved tUST from 98.40 to 94.00. The pledged collateral fell to USD 11,845,619 after haircut, USD 554,381 short of the requirement and above the USD 500,000 minimum transfer amount. BANK-B called USD 560,000 (rounded up), and BANK-A topped up with 6,080 more tUST units.",
    steps: [
      { actor: "M", say: "Move the tUST price", calm: "1–3", caps: [], label: "Set price",
        why: "The market data operator stands in for price vendors. A rates sell-off moves the tokenized Treasury from 98.40 to 94.00 in the mock source.",
        refs: ["Mock market data"], display: [["Asset", "tUST"], ["Price", "98.40 → 94.00"]],
        action: { type: "setMockPrice", by: "M", token: "tUST", price: 94 } },
      { actor: "M", say: "Publish the price to the oracle feed", calm: "4", caps: [], label: "Publish",
        why: "The oracle service signs the update with the oracle publisher key and writes it to the on-chain feed through the operator's gateway.",
        refs: ["Oracle feed contract"], action: { type: "publishPrice", by: "M", token: "tUST" } },
      { actor: "B", say: "Revalue the collateral", calm: "5–6", caps: [4, 9], label: "Revalue",
        why: "BANK-B's service values the pledged tokens at the new feed price after haircut and compares them with the requirement. The console's coverage figure now shows the shortfall.",
        refs: ["CDM Haircut", "CSA minimum transfer amount"],
        display: [["Pledged", "tUST 128,589 × 94.00 × 98%"], ["Value after haircut", "USD 11,845,619"], ["Required", "USD 12,400,000"], ["Shortfall", "USD 554,381 > MTA USD 500,000"], ["Call (rounded up)", "USD 560,000"]],
        action: { type: "none" } },
      { actor: "B", say: "Issue the top-up call", calm: "→ call flow", caps: [6, 7, 11], label: "Issue call",
        why: "From here the top-up follows the same call, proposal and pledge steps as the initial call.",
        refs: ["CDM MarginCallIssuance", "ISO 20022 colr.003"], display: [["Delivery amount", "USD 560,000"], ["Settlement deadline", "2026-10-19"]],
        action: { type: "issueCall", by: "B", to: "A", kind: "IM", amount: 560_000, deadline: "2026-10-19" } },
      { actor: "A", say: "Agree", calm: "6–9", caps: [11], label: "Agree",
        why: "BANK-A sees the same feed price and agrees.", refs: ["CDM MarginCallResponse"],
        action: { type: "respond", by: "A", callId: "C-0002", response: "full", agreed: 560_000 } },
      { actor: "A", say: "Propose collateral", calm: "10–12", caps: [24], label: "Propose",
        why: "6,080 tUST units are worth USD 560,090 after haircut at the new price.", refs: ["ISO 20022 colr.007"],
        display: [["Propose", "tUST 6,080 units → USD 560,090"]],
        action: { type: "propose", by: "A", callId: "C-0002", assets: [["tUST", 6_080]] } },
      { actor: "B", say: "Accept the proposal", calm: "13–19", caps: [3, 25], label: "Accept proposal",
        why: "Eligible asset, haircut applied, value covers the call.", refs: ["ISO 20022 colr.008"],
        action: { type: "decideProposal", by: "B", callId: "C-0002", proposalId: "P-1", accept: true } },
      { actor: "A", say: "Pledge the top-up", calm: "20–26", caps: [13, 17], label: "Pledge",
        why: "The top-up is pledged into the same contract. Coverage is back above the requirement.", refs: ["ADR wp-adr-im-segregation"],
        action: { type: "pledge", by: "A", callId: "C-0002", proposalId: "P-1" } },
    ],
  },
  {
    id: "im-return", kind: "IM", title: "Return of excess initial margin", flow: "flow-return", parties: ["A", "B"],
    init: settledImState,
    outcome: "Trades matured and BANK-A's SIMM fell to USD 58.1m, so only USD 8.1m is required above the threshold. BANK-A called for USD 4,300,000 back (rounded down). BANK-B agreed and released 44,591 tUST units by signing returnPledge() with its own key.",
    steps: [
      { actor: "A", say: "Call for the return of excess margin", calm: "1–5", caps: [6, 7, 11], label: "Issue return call",
        why: "Industry practice treats a return as a margin call in the other direction. Required falls to USD 8.1m; BANK-B holds USD 12,400,094 after haircut, so the excess is USD 4,300,094, rounded down to USD 4,300,000.",
        refs: ["CDM MarginCallIssuance", "ISO 20022 colr.003"],
        display: [["SIMM initial margin", "USD 58,100,000"], ["Required above threshold", "USD 8,100,000"], ["Held after haircut", "USD 12,400,094"], ["Return amount (rounded down)", "USD 4,300,000"]],
        action: { type: "issueCall", by: "A", to: "B", kind: "Return", amount: 4_300_000, deadline: "2026-10-19", requirement: 8_100_000 } },
      { actor: "B", say: "Agree and release the collateral", calm: "6–11", caps: [11, 13, 17], label: "Agree and release",
        why: "BANK-B's own SIMM run gives USD 58.14m, close enough to agree. Its gateway records the agreement and submits returnPledge() with BANK-B's key. The contract checks the agreed return call and sends 44,591 tUST units (USD 4,299,999 after haircut) back to BANK-A.",
        refs: ["CDM MarginCallResponse", "ISO 20022 colr.004", "ADR wp-adr-im-segregation"], display: [["Release", "tUST 44,591 units"], ["Signed by", "BANK-B key"]],
        action: { type: "agreeReturn", by: "B", callId: "C-0002", release: [["tUST", 44_591]] } },
      { actor: "A", say: "Check the returned collateral", calm: "12", caps: [16], label: "Confirm",
        why: "BANK-A's wallet shows the returned units; the contract still holds the rest for BANK-B.",
        refs: ["ASR concept-asr-settlement-finality"], display: [["Returned", "44,591 tUST"], ["Still pledged", "83,998 tUST"]],
        action: { type: "message", by: "A", to: "A", what: "Ledger events", text: "Returned event recorded in BANK-A's books" } },
    ],
  },
  {
    id: "im-default", kind: "IM", title: "Default and enforcement", flow: "flow-default-enforcement", parties: ["B", "M", "A"],
    init: settledImState,
    outcome: "BANK-A failed to pay. BANK-B served the legal notices off-chain, the operator published the default status, and BANK-B enforced: the control contract confirmed the default on the oracle feed and moved the 128,589 pledged tUST units to BANK-B.",
    steps: [
      { actor: "B", say: "Declare an Event of Default", calm: "1–3", caps: [23], label: "Declare default",
        why: "BANK-A missed a payment (ISDA Master Agreement Section 5(a)(i)). The notice designating an Early Termination Date is a legal notice delivered as Section 12 requires; the chain only gets the default status.",
        refs: ["ISDA 2002 MA §5(a)(i), §6, §12"], display: [["Defaulting party", "BANK-A"], ["Event", "Failure to pay (§5(a)(i))"], ["Notice", "delivered off-chain (§12)"]],
        action: { type: "message", by: "B", to: "A", what: "Legal notice", text: "Notice of Event of Default and Early Termination Date (off-chain, §12); default forwarded to the oracle service" } },
      { actor: "M", say: "Publish the default status", calm: "4–5", caps: [], label: "Publish default",
        why: "The oracle service writes BANK-A's default status to the on-chain feed, signed by the oracle publisher.",
        refs: ["Oracle feed contract"], action: { type: "publishDefault", by: "M", party: "A" } },
      { actor: "B", say: "Enforce against the pledged collateral", calm: "6–9", caps: [17], label: "Enforce",
        why: "BANK-B's gateway submits enforce() with BANK-B's key. The control contract reads the default status from the feed and only then moves the pledged tokens to BANK-B.",
        refs: ["ADR wp-adr-im-segregation", "Assumption nw-assumption-contract-control"],
        action: { type: "enforce", by: "B", callId: "C-0001" } },
      { actor: "B", say: "Apply the collateral to the close-out amount", calm: "–", caps: [23], label: "Record",
        why: "BANK-B values the collateral against its close-out amount. Any surplus is owed back to BANK-A under the CSA; that settlement is off-chain in this prototype.",
        refs: ["ISDA 2002 MA §6(e)"], display: [["Collateral received", "tUST 128,589 → USD 12,653,158 at 98.40"], ["Close-out amount (example)", "USD 11,700,000"], ["Surplus owed to BANK-A", "USD 953,158"]],
        action: { type: "message", by: "B", to: "A", what: "Close-out statement", text: "Close-out USD 11,700,000; collateral USD 12,653,158; surplus USD 953,158 owed to BANK-A" } },
    ],
  },
  {
    id: "vm-call", kind: "VM", title: "Variation margin call by title transfer", flow: "VM variant of the call flow (not in CALM yet)", parties: ["A", "B"],
    init: () => { const s = baseState("VM"); s.held = 5_000_000; s.req = 5_000_000; return s; },
    outcome: "BANK-B's exposure rose to USD 8.24m with USD 5m held, so it called USD 3.24m. BANK-A paid in deposit tokens straight to BANK-B's wallet. Title passed: no control contract, and BANK-B was free to reuse the cash, which it did. Compare the IM scenario, where the same call ends in a segregated pledge.",
    steps: [
      { actor: "B", say: "Issue the variation margin call", calm: "–", caps: [10, 21, 6, 7, 11], label: "Issue call",
        why: "Mark-to-market exposure of BANK-B to BANK-A is USD 8.24m. The credit support balance is USD 5m, threshold zero, so the Delivery Amount is USD 3.24m.",
        refs: ["CDM MarginCallIssuance", "ISO 20022 colr.003"], display: [["Exposure (MTM)", "USD 8,240,000"], ["Credit support balance", "USD 5,000,000"], ["Delivery amount", "USD 3,240,000"]],
        action: { type: "issueCall", by: "B", to: "A", kind: "VM", amount: 3_240_000, deadline: "2026-10-19", requirement: 8_240_000 } },
      { actor: "A", say: "Agree in full", calm: "–", caps: [11], label: "Agree",
        why: "BANK-A agrees with the exposure.", refs: ["CDM MarginCallResponse", "ISO 20022 colr.004"],
        action: { type: "respond", by: "A", callId: "C-0001", response: "full", agreed: 3_240_000 } },
      { actor: "A", say: "Propose cash", calm: "–", caps: [24], label: "Propose",
        why: "BANK-A offers USD deposit tokens, the only eligible credit support under this CSA.", refs: ["ISO 20022 colr.007"],
        action: { type: "propose", by: "A", callId: "C-0001", assets: [["tUSD", 3_240_000]] } },
      { actor: "B", say: "Accept the proposal", calm: "–", caps: [3, 25], label: "Accept proposal",
        why: "Cash in USD, zero haircut, covers the call.", refs: ["ISO 20022 colr.008"],
        action: { type: "decideProposal", by: "B", callId: "C-0001", proposalId: "P-1", accept: true } },
      { actor: "A", say: "Transfer the cash outright", calm: "–", caps: [13], label: "Transfer",
        why: "Under a title transfer CSA the collateral goes straight to the Transferee's wallet. No control contract; the call is settled by the transfer.",
        refs: ["English law VM CSA, title transfer"], action: { type: "settleByTransfer", by: "A", callId: "C-0001", proposalId: "P-1" } },
      { actor: "B", say: "Reuse the cash received", calm: "–", caps: [16], label: "Move to treasury",
        why: "Title passed, so BANK-B can use the cash, here to fund its own payments. Under the IM pledge this is impossible: the tokens stay in the control contract.",
        refs: ["Contrast: ADR wp-adr-im-segregation"], action: { type: "transfer", by: "B", token: "tUSD", qty: 3_240_000, to: "BANK-B treasury" } },
    ],
  },
  {
    id: "vm-return", kind: "VM", title: "Variation margin return", flow: "VM variant of the return flow (not in CALM yet)", parties: ["A", "B"],
    init: () => { const s = baseState("VM"); s.held = 8_240_000; s.req = 8_240_000; s.wallet.B.tUSD = 10_240_000; return s; },
    outcome: "Exposure fell to USD 6m, so BANK-A called for USD 2.24m back. BANK-B agreed and paid equivalent cash back. Under title transfer it returns equivalent credit support, not the same tokens.",
    steps: [
      { actor: "A", say: "Call for the return amount", calm: "–", caps: [6, 7, 11], label: "Issue return call",
        why: "Exposure is now USD 6m and BANK-B holds USD 8.24m, so USD 2.24m is due back to BANK-A.",
        refs: ["CDM MarginCallIssuance"], display: [["Exposure (MTM)", "USD 6,000,000"], ["Credit support balance", "USD 8,240,000"], ["Return amount", "USD 2,240,000"]],
        action: { type: "issueCall", by: "A", to: "B", kind: "Return", amount: 2_240_000, deadline: "2026-10-19", requirement: 6_000_000 } },
      { actor: "B", say: "Agree and pay back equivalent cash", calm: "–", caps: [11, 13], label: "Agree and transfer",
        why: "BANK-B agrees and transfers deposit tokens back. They need not be the same tokens it received.",
        refs: ["CDM MarginCallResponse", "ISO 20022 colr.004"], action: { type: "agreeReturnTransfer", by: "B", callId: "C-0001", assets: [["tUSD", 2_240_000]] } },
      { actor: "A", say: "Check the balance", calm: "–", caps: [16], label: "Confirm",
        why: "Credit support balance now USD 6m, matching the exposure.", refs: [],
        action: { type: "message", by: "A", to: "A", what: "Ledger events", text: "Return recorded in BANK-A's books" } },
    ],
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
