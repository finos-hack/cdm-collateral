```yaml
id: artifact-provenance-whiteboard
name: "Whiteboard: tokenized collateral provenance, aircraft case"
kind: diagram
location: https://claude.ai/artifact/J67W5ETrt6TP2r8C51X1y9
createdAt: 2026-11-21T21:50:00Z
updatedAt: 2026-11-22T14:25:17Z
review: proposed
provenance:
  sourceRef: ni:///sha-256;i2FpMGjbdYLRkcrMU1OhsDLT_SYqPgG6E7N4xuFvQLM
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T14:25:17Z
  confidence: 0.7
```
# Artifact: whiteboard of the provenance links in the aircraft case

A Claude Whiteboard made on 2026-11-21 for [[task-document-provenance]], under [[goal-tokenized-collateral]]. It shows
the path from token holders to the token, the SPV that holds the aircraft and the aircraft itself, with the asset
manager, the lender and the appraiser, and labels each link with the document behind it:

| From | To | Document |
|------|----|----------|
| Token holders | Token | token register |
| Token | SPV | token terms |
| SPV | Aircraft | title, FAA registry |
| Asset manager | SPV | SPV constitution |
| Lender | Aircraft | mortgage, International Registry |
| Lender | Asset manager | loan agreement, $100M |
| Appraiser | Token | appraisal, issue price |

It marks the aircraft as missing from CDM (G40), notes that no link carries a document hash (G41), and lists what each
link records: document, hash, record keeper, validity. The project owner named it as the source of the links for the
tUST pilot (2026-11-22). The board lives in claude.ai, not in the repository; this entry records where it is.
