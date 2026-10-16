// Reference data for the prototype. All parties, tokens, prices and amounts are invented test data.
import type { AgreementKind, PartyId, TokenId } from "./types";

export const TOKENS: Record<TokenId, { name: string; unit: string }> = {
  tUST: { name: "Tokenized US Treasury 4.25% 2034", unit: "unit (USD 100 face)" },
  tMMF: { name: "Tokenized USD government MMF", unit: "share" },
  tUSD: { name: "USD deposit token", unit: "USD" },
};

export const PARTIES: Record<PartyId, { name: string; node: string; stack: number }> = {
  A: { name: "BANK-A", node: "bank-a · 8547", stack: 1 },
  B: { name: "BANK-B", node: "bank-b · 8549", stack: 2 },
  M: { name: "MKT", node: "mkt · 8545", stack: 0 },
};

export interface EligibilityRow {
  token: TokenId;
  haircut: number;
  /** Maximum share of the market value of collateral delivered against one call, if limited. */
  concentration?: number;
}

export interface Agreement {
  label: string;
  doc: string;
  roles: Record<PartyId, string>;
  terms: [string, string][];
  eligible: EligibilityRow[];
  mta: number;
  rounding: number;
}

export const AGREEMENTS: Record<AgreementKind, Agreement> = {
  IM: {
    label: "ISDA IM · pledge",
    doc: "2018 ISDA IM Credit Support Annex (Security Interest, New York law)",
    roles: { A: "Pledgor", B: "Secured Party", M: "Market data operator" },
    terms: [
      ["IM model", "ISDA SIMM"],
      ["IM threshold", "USD 50,000,000"],
      ["Minimum transfer amount", "USD 500,000"],
      ["Rounding", "delivery up, return down, USD 10,000"],
      ["Custody", "collateral control contract (segregated)"],
    ],
    eligible: [
      { token: "tUST", haircut: 0.02 },
      { token: "tMMF", haircut: 0.04, concentration: 0.5 },
    ],
    mta: 500_000,
    rounding: 10_000,
  },
  VM: {
    label: "ISDA VM CSA · title transfer",
    doc: "2016 ISDA Credit Support Annex for Variation Margin (English law, title transfer)",
    roles: { A: "Transferor", B: "Transferee", M: "Market data operator" },
    terms: [
      ["Threshold", "USD 0"],
      ["Minimum transfer amount", "USD 250,000"],
      ["Rounding", "delivery up, return down, USD 10,000"],
      ["Title", "passes to the Transferee; reuse allowed"],
      ["Return", "equivalent credit support"],
    ],
    eligible: [{ token: "tUSD", haircut: 0 }],
    mta: 250_000,
    rounding: 10_000,
  },
};

export const usd = (n: number) => "USD " + Math.round(n).toLocaleString("en-US");
export const qty = (n: number) => Math.round(n).toLocaleString("en-US");
export const px = (n: number) => n.toFixed(2);
