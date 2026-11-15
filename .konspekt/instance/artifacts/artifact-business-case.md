```yaml
id: artifact-business-case
name: Business case for CDM-based collateral management
kind: doc
location: docs/analysis/business-case.md
createdAt: 2026-10-24T00:00:00Z
updatedAt: 2026-10-24T00:00:00Z
review: accepted
provenance:
  sourceRef: ni:///sha-256;AsIdYOX8bT1f5j6GNb9Y5Dft_LTr_K-Yi6St4gtJrP0
  conversationId: spec-writer-2026-10-24
  timestamp: 2026-10-24T13:56:51.384Z
  confidence: 0.55
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: ea0826b663d0d09e10c9f2e0ae7dd4c2921059d4
    contentHash: ea0826b663d0d09e10c9f2e0ae7dd4c2921059d4
```
# Artifact: Business case for CDM-based collateral management

Business-case document for `goal-business-case`, to live at `docs/analysis/business-case.md` (not yet written; this
record proposes it). It closes the ambiguity that the goal is accepted but states only its title: the goal body asks
for "the problem, who it serves, and the value that justifies building it", the source excerpt
(`82d9f5b6…`) records only the words "business case", `README.md` is one line, and no task, artifact or noteworthy on
canonical (`e2e-wiring`) links to the goal. No document on canonical states why the prototype is built, for whom, or
what result would justify continuing it.

Content the document will settle:

1. **Problem.** The collateral workflow gap in CDM as recorded in `docs/analysis/findings.md`: margin call types
   with no lifecycle (F2, O8, X1), no mapping to ISO 20022 `colr` or FpML collateral messages (S1), four unmapped
   eligibility taxonomies (TX4), and credit ratings with no scale or order, so minimum-rating criteria cannot be evaluated (TX3). The document states these as the
   operational problem the project addresses, citing finding IDs and not restating them.
2. **Who it serves.** The participants named in `architecture/prototype.architecture.json` (pledgor operations,
   secured party operations, market data operator), and the external audience the analyses already address: the
   CDM Collateral Working Group (finding F2 external context) and tokenized-collateral initiatives
   (`docs/architecture/blockchain-applicability.md`, sources GDF, DTCC).
3. **Value.** Each value claim labelled as observed (cited source) or hypothesis (to be tested by the prototype),
   for example: one shared CDM representation of a margin call between counterparties instead of per-firm formats;
   executable eligibility and call calculation; settlement against tokenized collateral with deterministic finality.
4. **Scope and non-goals.** What the prototype must demonstrate to support the case (the five CALM flows of
   `task-e2e-wiring`) and what it does not claim (production privacy, `nw-assumption-besu-visibility`; SIMM, M4).
5. **Success criteria and open decisions.** Measurable outcomes that would justify further investment, and the
   decisions the human owns (target audience priority, contribution of `cdm-ext` changes upstream).

Canonical surfaces checked: `nodes/goal/goal-business-case.md`, its source and transition rows, all edges and
nodes on `e2e-wiring` for references to the goal (none found), `README.md`, `docs/analysis/findings.md`,
`docs/architecture/blockchain-applicability.md`, `architecture/prototype.architecture.json`. Placement under
`docs/analysis/` was confirmed by the human in this conversation. Confidence is 0.55 because the value and
success-criteria sections depend on human intent that no canonical surface records.
