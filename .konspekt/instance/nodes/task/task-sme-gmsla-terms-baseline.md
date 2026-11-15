```yaml
id: task-sme-gmsla-terms-baseline
type: task
title: Confirm with a business SME the baseline GMSLA elections and their amendment
status: open
review: accepted
provenance:
  conversationId: gmsla-terms
  sourceRef: ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c
  timestamp: 2026-11-11T15:30:34Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 0993e4fa3e595a8c5ff438c2ddcfc242e6a1bc95
    contentHash: 0993e4fa3e595a8c5ff438c2ddcfc242e6a1bc95
createdAt: 2026-11-11T15:30:34Z
updatedAt: 2026-11-11T15:32:22Z
```
# Task: confirm the baseline GMSLA elections and their amendment

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-default-close-out-rules]]. The project owner
chose the design for [[task-gmsla-terms]] on 2026-11-11 ([[wp-adr-gmsla-terms]]). The baseline elections are
assumptions stated from model memory of GMSLA 2010 and not checked against the text. Questions for the SME:

1. CDM's GMSLA elections hold one notification time. Which notices does it govern under GMSLA 2010 (margin calls, recall notices, both), and is 10:00 London a usual baseline?
2. GMSLA 2010 has no standard minimum transfer amount. Is a per-party minimum transfer amount in the Schedule usual, and does it apply to the aggregated mark under paragraph 5.4?
3. The prototype's agreement carries a default margin of 102% for loans that state none. Is margin always agreed per loan, or is an agreement-level default usual?
4. The baseline has automatic early termination not applicable for both parties. Is that usual for an English law GMSLA 2010 between two banks?
5. The baseline applies netting of deliveries (paragraph 5.6) and the failure-to-redeliver indemnity (paragraph 6.4). Are these the usual elections?
6. An agreed amendment of the elections takes effect on its effective date. Does it apply to loans already outstanding, or only to new loans?
