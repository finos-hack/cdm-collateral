// Unit tests for the provenance card (task-document-provenance): the service is replaced by a fetch stub serving
// /provenance and recording the seed POST.
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvenanceCard } from "./ProvenanceCard";
import type { LiveProvenance } from "../domain/liveApi";

const link = (relation: string, ok = true, breaks: { kind: string; detail: string }[] = []) => ({
  relation, recordHash: "0x" + "ab".repeat(32), recordKeeper: "did:key:zDnaeExample", ok, breaks,
});

const COMPLETE: LiveProvenance = {
  deployed: true,
  anchors: 22,
  tokens: [
    { symbol: "tUST", token: "urn:dti:QX4V2W9N3", authoritativeRecord: "Bearer", complete: true, anchors: 22, tokensOnAsset: ["urn:dti:QX4V2W9N3"], breaks: [],
      links: ["cdmx:IssuedAgainst", "cdmx:TokenTerms", "cdmx:Custody", "cdmx:Constitution", "cdmx:Valuation"].map((r) => link(r)) },
    { symbol: "tMMF", token: "urn:dti:QZ0000000", authoritativeRecord: "Registered", recordKeeper: "MMF Transfer Agent", controlAgreement: "CA-TMMF-2026-01",
      securedParty: "bank-b", complete: false, anchors: 22, tokensOnAsset: ["urn:dti:QZ0000000"],
      breaks: [{ kind: "ControlAgreementMismatch", relation: "cdmx:ControlAgreement", detail: "another secured party" }],
      links: [...["cdmx:IssuedAgainst", "cdmx:TokenTerms", "cdmx:Register", "cdmx:Constitution", "cdmx:Valuation"].map((r) => link(r)),
        link("cdmx:ControlAgreement", false, [{ kind: "ControlAgreementMismatch", detail: "another secured party" }])] },
  ],
};

let calls: { method: string; url: string; body?: unknown }[] = [];

function stub(first: LiveProvenance, after: LiveProvenance = first) {
  let seeded = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/provenance/seed")) { seeded = true; return new Response(JSON.stringify({ tokens: [] }), { status: 200 }); }
    return new Response(JSON.stringify(seeded ? after : first), { status: 200 });
  }));
}

beforeEach(() => { calls = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ProvenanceCard", () => {
  it("shows each token's path and its breaks, for the pledge to the leg's secured party", async () => {
    stub(COMPLETE);
    render(<ProvenanceCard party="A" legPledgor="A" />);
    expect(await screen.findByText("provenance complete ✓")).toBeTruthy();
    expect(screen.getByText("1 provenance break")).toBeTruthy();
    expect(screen.getByTestId("provenance-tMMF-ControlAgreement").textContent).toContain("ControlAgreementMismatch");
    expect(screen.getByText("Register statement")).toBeTruthy();
    expect(calls[0].url).toContain("/api/v1/provenance?securedParty=bank-b");
    expect(screen.queryByTestId("provenance-seed")).toBeNull();
  });

  it("offers the fixture seed only when nothing is anchored, and checks again after it", async () => {
    const empty: LiveProvenance = { deployed: true, anchors: 0, tokens: COMPLETE.tokens.map((t) => ({ ...t, anchors: 0, complete: false })) };
    stub(empty, COMPLETE);
    render(<ProvenanceCard party="B" legPledgor="A" />);
    fireEvent.click(await screen.findByTestId("provenance-seed"));
    await waitFor(() => expect(screen.getByText("provenance complete ✓")).toBeTruthy());
    const seed = calls.find((c) => c.url.includes("/provenance/seed"))!;
    expect(seed.method).toBe("POST");
    expect(seed.body).toEqual({ pledgor: "bank-a", securedParty: "bank-b" });
  });

  it("shows nothing in a deployment without ProvenanceAnchors", async () => {
    stub({ deployed: false, anchors: 0, tokens: [] });
    const { container } = render(<ProvenanceCard party="A" legPledgor="A" />);
    await waitFor(() => expect(calls.length).toBe(1));
    await waitFor(() => expect(container.querySelector("[data-testid=provenance]")).toBeNull());
  });
});
