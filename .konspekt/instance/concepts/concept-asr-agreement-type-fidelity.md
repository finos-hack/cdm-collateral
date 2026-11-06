```yaml
id: concept-asr-agreement-type-fidelity
label: Each flow follows its agreement type's legal mechanism
subtype: asr
review: accepted
provenance:
  conversationId: adr-asr-traceability
  sourceRef: 5927fa0239a8781c51442acdf4500e2af1eea411
  contentHash: 5927fa0239a8781c51442acdf4500e2af1eea411
  timestamp: 2026-11-06T21:52:57Z
  confidence: 0.6
createdAt: 2026-11-06T21:52:57Z
updatedAt: 2026-11-06T22:27:21Z
```
# Each flow follows its agreement type's legal mechanism

The prototype shows every collateral flow per agreement type (ISDA IM pledge, ISDA VM CSA title transfer, GMRA,
GMSLA, triparty, CCP margin), and each runs the mechanism that agreement prescribes: pledge or title transfer, whether
calls are negotiated, and how many parties take part. Basis: `docs/analysis/collateral-flows.md` and the constraint
`nw-mimic-real-flows`.

---

**Note.** Post-factum filler: written on 2026-11-06, after the ADR it drives, from that ADR's context section, so the
ADR does not lack an ASR. No requirement was stated for it before the decision. Accepted by the project owner on these
terms (source `33850d5`).
