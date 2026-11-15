```yaml
id: task-sme-repo-income-rules
type: task
title: Confirm with a business SME the rules for interim interest and manufactured income under the GMRA
status: open
review: accepted
provenance:
  conversationId: repo-income
  sourceRef: ni:///sha-256;XuMQGaMObuTxDr0x7MGn7pUSYEVltV-616LlxZQY8lg
  timestamp: 2026-11-08T20:48:34Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 6add904ae373a15afccd62650872d36b5f15a134
    contentHash: 6add904ae373a15afccd62650872d36b5f15a134
createdAt: 2026-11-08T20:48:34Z
updatedAt: 2026-11-08T21:19:44Z
```
# Task: confirm the rules for interim interest and manufactured income under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-substitution-rules]]. The project owner chose the
design for [[task-repo-income]] on 2026-11-08. The details below are assumptions ([[wp-adr-repo-income]]). Questions for
the SME:

1. **Interim amount.** The prototype pays the whole Price Differential accrued to the date, less earlier interim payments,
   and reduces the Repurchase Price by it. Is that correct, and are partial payments needed?
2. **Who starts it.** The prototype lets the Seller start an interim payment and needs the Buyer's agreement. Can either
   party demand it?
3. **Income amount.** The prototype computes income per unit times the quantity, rounded to whole tUSD. Is it the amount
   paid by the issuer on the securities held, and is withholding tax taken into account?
4. **Income date.** The prototype pays when the parties agree, with the income date as a stated field. Must payment be on
   the income date, and who holds the securities on the record date?
5. **Set-off.** Under paragraph 5, may income be set off against other amounts, or applied to reduce the Repurchase Price
   or the exposure?
6. **Rate change.** CDM's on-demand rate change is not built. Is an agreed change of the repo rate needed?
