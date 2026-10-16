// CDM 7.6.0 coverage per capability row, from docs/analysis/cdm-csa-coverage-matrix.md and
// docs/analysis/cdm-other-agreements-coverage-matrix.md (0 absent, 1 enum only, 2 data types, 3 functions,
// 4 events, 5 samples or tests), and the scenario grid (wp-adr-ux-scenario-grid). Ported from the approved
// HTML prototype (ui-prototype/clickable.html).
export type Family = "IM" | "VM" | "R" | "S" | "T" | "C";
export type CellSpec = ["go", string, (number | string)[]] | ["plan", string, (number | string)[]] | ["na"] | ["na", string];
export interface Row { name: string; sub: string; fam: Family; cells: CellSpec[] }

export const CAP: Record<"CSA" | "R" | "S" | "T" | "C", Record<string, [string, number]>> = {
  CSA: { 1: ["Agreement terms", 5], 2: ["Amendment of terms", 4], 3: ["Eligibility", 5], 4: ["Haircuts and valuation", 3], 5: ["Concentration limits", 2],
    6: ["Threshold, MTA, rounding", 3], 7: ["Delivery / Return Amount", 3], 9: ["IM amount (SIMM)", 2], 10: ["Exposure for VM", 2], 11: ["Margin call issue / response", 2],
    12: ["Dispute", 2], 13: ["Transfer and settlement", 2], 14: ["Substitution", 2], 15: ["Interest on cash collateral", 2], 16: ["Positions and balances", 2],
    17: ["Custody and segregation", 2], 19: ["Reconciliation", 0], 21: ["Exposure netting", 0], 23: ["Close-out netting", 2], 24: ["Collateral proposal", 2], 25: ["Proposal acceptance / rejection", 0] },
  R: { R2: ["Amendment of terms", 0], R3: ["Eligibility", 3], R4: ["Haircut / margin ratio", 5], R5: ["Concentration limits", 2], R6: ["Exposure calculation", 3], R7: ["Margin maintenance", 2],
    R9: ["Dispute", 2], R10: ["Transfer and settlement", 4], R11: ["Substitution", 5], R12: ["Repo interest", 5], R16: ["Positions", 2], R20: ["Event of default", 0], R21: ["Exposure netting", 0],
    R23: ["Close-out netting", 0], R24: ["Collateral proposal", 2], R25: ["Proposal acceptance / rejection", 0] },
  S: { S2: ["Amendment of terms", 2], S3: ["Collateral schedule", 3], S4: ["Haircut / margin", 5], S5: ["Concentration limits", 2], S6: ["Collateral requirement", 3], S7: ["Marking to market", 2],
    S8: ["Dispute", 2], S9: ["Transfer and settlement", 5], S10: ["Substitution", 4], S11: ["Lending fee and billing", 5], S12: ["Rebate", 2], S13: ["Loan return", 5], S14: ["Recall", 2],
    S17: ["Positions", 2], S19: ["Events of default", 2], S20: ["Manufactured payments", 2], S23: ["Exposure netting / aggregation", 2], S25: ["Close-out netting", 2], S26: ["Collateral proposal", 2], S27: ["Proposal acceptance / rejection", 0] },
  T: { T1: ["Triparty agreement terms", 1], T4: ["Haircuts", 3], T6: ["Required value from agent", 0], T7: ["Allocation by agent", 0], T8: ["Substitution by agent", 2], T9: ["Settlement through agent", 0] },
  C: { C5: ["IM calculation (CCP)", 0], C6: ["VM / settlement price", 2], C7: ["CCP margin call", 2], C9: ["Eligibility / haircuts", 3], C10: ["Transfer and settlement", 2], C11: ["Interest on cash collateral", 2],
    C12: ["Default management / porting", 0], C14: ["Position netting", 2], C16: ["Close-out netting", 0], C18: ["Substitution at the CCP", 2] },
};

export function capInfo(fam: Family, id: number | string) {
  const table = fam === "IM" || fam === "VM" ? CAP.CSA : CAP[fam];
  const entry = table[String(id)];
  if (!entry) throw new Error(`Unknown capability row ${id} for ${fam}`);
  const [name, score] = entry;
  // Row 7 (Delivery / Return Amount) is executable for IM only.
  return { id: String(id), name, score: fam === "VM" && String(id) === "7" ? 2 : score };
}

export function weakest(fam: Family, caps: (number | string)[]) {
  const infos = caps.map((c) => capInfo(fam, c));
  const min = Math.min(...infos.map((i) => i.score));
  return { min, infos, weak: infos.filter((i) => i.score === min) };
}

export const COLS = ["Call → proposal → settle", "Revaluation / top-up", "Return", "Substitution", "Dispute", "Default / enforcement", "Interest and income", "Terms amendment", "Loan return / recall"];
export const IMC = { call: [1, 3, 4, 5, 6, 7, 9, 11, 13, 16, 17, 24, 25], reval: [4, 6, 7, 9, 11, 16], ret: [7, 11, 13, 17] };
export const VMC = { call: [1, 3, 4, 6, 7, 10, 11, 13, 16, 21, 24, 25], reval: [4, 6, 7, 10, 11], ret: [7, 11, 13] };
export const ROWS: Row[] = [
  { name: "ISDA IM (CSA / CTA)", sub: "pledge into segregation", fam: "IM", cells: [["go", "im-call", IMC.call], ["go", "im-reval", IMC.reval], ["go", "im-return", IMC.ret], ["plan", "", [14]], ["go", "im-dispute", [12]], ["go", "im-default", [17, 23]], ["plan", "", [15]], ["plan", "", [2]], ["na"]] },
  { name: "ISDA VM CSA", sub: "title transfer, two-way", fam: "VM", cells: [["go", "vm-call", VMC.call], ["plan", "", VMC.reval], ["go", "vm-return", VMC.ret], ["plan", "", [14]], ["plan", "", [12]], ["plan", "close-out netting", [23]], ["plan", "", [15]], ["plan", "", [2]], ["na"]] },
  { name: "Repo (GMRA)", sub: "seller / buyer · also reprice (R8), roll and repurchase (R13)", fam: "R", cells: [["plan", "margin transfer", ["R3", "R4", "R5", "R6", "R7", "R10", "R16", "R21", "R24", "R25"]], ["plan", "", ["R4", "R6", "R7"]], ["plan", "", ["R7", "R10"]], ["plan", "", ["R11"]], ["plan", "", ["R9"]], ["plan", "", ["R20", "R23"]], ["plan", "repo interest", ["R12"]], ["plan", "", ["R2"]], ["na"]] },
  { name: "Securities lending (GMSLA)", sub: "lender / borrower", fam: "S", cells: [["plan", "mark to market", ["S3", "S4", "S5", "S6", "S7", "S9", "S17", "S23", "S26", "S27"]], ["plan", "", ["S4", "S6", "S7"]], ["plan", "excess collateral", ["S7", "S9"]], ["plan", "", ["S10"]], ["plan", "", ["S8"]], ["plan", "", ["S19", "S25"]], ["plan", "fee, rebate, manufactured payments", ["S11", "S12", "S20"]], ["plan", "", ["S2"]], ["plan", "", ["S13", "S14"]]] },
  { name: "Triparty", sub: "agent allocates", fam: "T", cells: [["na", "agent allocates"], ["plan", "", ["T4", "T6"]], ["plan", "", ["T7", "T9"]], ["plan", "", ["T8"]], ["na"], ["na", "follows the underlying agreement"], ["na", "follows the underlying agreement"], ["plan", "", ["T1"]], ["na"]] },
  { name: "CCP margin", sub: "call not negotiated", fam: "C", cells: [["plan", "not negotiated", ["C5", "C6", "C7", "C9", "C10", "C14"]], ["plan", "", ["C6", "C9"]], ["plan", "", ["C7", "C10"]], ["plan", "", ["C18"]], ["na"], ["plan", "porting", ["C12", "C16"]], ["plan", "", ["C11"]], ["na", "CCP rulebook"], ["na"]] },
];
