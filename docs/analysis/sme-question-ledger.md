# SME question ledger

Every question to revisit with a business subject-matter expert (SME), one row per question. Each section is one
konspekt task, which holds the question's context and the project owner's interim decision. Add a row whenever a task
records a new assumption or question for an SME; set **Status** to `answered` and fill **Answer** when an SME replies.

**Interim decision** is what the prototype does until the SME answers: the catalog of decisions made while waiting
for SMEs. Each comes from the task named in the section heading; `(project owner, date)` marks a choice the project
owner made, and `none recorded` means the task states no interim behaviour. When an SME answers, keep the interim
decision and record whether the answer changed it.

Status of the ledger: 229 questions in 40 tasks, all open. The same questions as a page: [`docs/sme-questions.html`](../sme-questions.html).

## Variation and initial margin rules

### `task-sme-enforcement-event-definition`: what an Enforcement Event is under the IM Security Agreement

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| ENF-1 | With no elections, is the Enforcement Event an Early Termination Date reached, or does a continuing Event of Default suffice? | The prototype keeps its current reading of the two `enforcementEvent` booleans in `EnforcementEventOccurred` until the SME answers. (project owner, 2026-11-03) | open | |
| ENF-2 | What does `earlyTerminationDate = False` remove: the trigger, or a distinction between designated and deemed Early Termination Dates? | The prototype keeps its current reading of the two `enforcementEvent` booleans in `EnforcementEventOccurred` until the SME answers. (project owner, 2026-11-03) | open | |
| ENF-3 | Does `failureToPay` mean the ISDA MA Section 5(a)(i) Event of Default from the notice, a failure under the security agreement itself, or something with its own grace period? | The prototype keeps its current reading of the two `enforcementEvent` booleans in `EnforcementEventOccurred` until the SME answers. (project owner, 2026-11-03) | open | |
| ENF-4 | Under Automatic Early Termination no notice is given, but the model's `DefaultNotice` needs a notice date. How is that handled? | The prototype keeps its current reading of the two `enforcementEvent` booleans in `EnforcementEventOccurred` until the SME answers. (project owner, 2026-11-03) | open | |
| ENF-5 | Are Specified Conditions (Termination Events treated as defaults) Enforcement Events? | The prototype keeps its current reading of the two `enforcementEvent` booleans in `EnforcementEventOccurred` until the SME answers. (project owner, 2026-11-03) | open | |

### `task-sme-registered-asset-completion`: what completes settlement and enforcement of registered and claim-based tokens

Brief for the SME, with research and the interim rules: [`sme-brief-registered-assets.md`](sme-brief-registered-assets.md).

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| REG-1 | For a Registered asset, is a pledge or title transfer complete at the on-chain transfer, or when the transfer agent updates the register? Is the on-chain transfer an instruction to the register or evidence of it? | Complete only when the record keeper confirms the register update; the confirmation names the record keeper, the asset and the CDM record. (project owner, 2026-11-21) | open | |
| REG-2 | For a Claim asset, what must the intermediary confirm, and does the token holder have a proprietary claim or only a contractual one? | Complete only when the intermediary confirms the credit to the receiving account, as for REG-1. (project owner, 2026-11-21) | open | |
| REG-3 | What gives the secured party control for each record type (for example UCC Articles 8, 9 and 12, or the English law equivalent), and is the escrow contract enough? | A Registered or Claim token is eligible collateral only if a control agreement with its record keeper is recorded for it. (project owner, 2026-11-21) | open | |
| REG-4 | On enforcement, who must act for each record type, and can the secured party enforce without the record keeper? | Enforcement is complete only after the record keeper's confirmation, the same rule as settlement. (project owner, 2026-11-21) | open | |
| REG-5 | If the chain and the register disagree, which prevails, and how is the difference resolved? | The record keeper's record prevails; a mismatch with the chain is reported as a break and the step is not complete until reconciled. (project owner, 2026-11-21) | open | |
| REG-6 | Worked case: an asset manager pledges an aircraft to a bank for a $100M loan, and tokens are issued on the SPV that holds it. Is the aircraft a Registered asset in the prototype's terms, with the International Registry (Cape Town Convention) and the national registry (FAA in the US) as the authoritative records, and does the on-chain record count for anything legally? | none recorded | open | |
| REG-7 | In that case, what does one token represent: a share of the SPV, a note it issues, or a beneficial interest in the aircraft? Which document fixes it (offering memorandum, token terms, trust deed), and which party keeps the record of who holds the tokens? | none recorded | open | |
| REG-8 | If the aircraft is already mortgaged to the lender and the mortgage is registered as an international interest, what consent does issuing the tokens need, and how does the token holders' claim rank against the mortgage? | In the provenance check (aircraft fixtures only; no aircraft token is deployed), every interest the registry shows in the asset, such as a mortgage registered as an international interest, needs the interest holder's consent to the token, attested by the holder (`cdmx:InterestConsent`); without it the path reports `InterestNotConsented`. Ranking is not modelled. (`task-document-provenance`, 2026-11-22) | open | |
| REG-9 | Which document sets the number of tokens, the issue price and the value of the aircraft at tokenization (an appraisal, for example by an ISTAT-certified appraiser), and what in the token terms decides whether the token's price follows the aircraft's value afterwards (published NAV, redemption rights, an oracle feed)? | none recorded | open | |
| REG-10 | Can a token backed by a physical asset be eligible collateral under a CSA, GMRA or GMSLA at all (it is not financial collateral in the Financial Collateral Directive's sense), or does it belong only in an asset-finance agreement? If the prototype should model it, which CDM additions does G40 need first: an asset type, an MSN identifier, an asset-finance agreement type? | none recorded | open | |

### `task-sme-document-provenance`: who keeps each link from a token to its asset, and what counts as evidence

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| PROV-1 | For each link from a pledged token back to its underlying asset (the security or loan agreement, the registry entry, the SPV's constitution, the token terms, the valuation), who keeps the authoritative copy? Would a hash of that copy anchored on the ledger, with the copy itself held off the ledger, be accepted as evidence of the link by a court, a regulator or an auditor? | Each link is a W3C PROV-O JSON-LD record held off the ledger in the payload store; its keccak-256 hash over the JCS canonical form is anchored on the ledger (`ProvenanceAnchors`), and the record keeper's statement that the link holds is a W3C Verifiable Credential on a P-256 key. Fixture documents only; whether such a hash is accepted as evidence is not assumed. (project owner, 2026-11-22, `wp-adr-document-provenance`) | open | |
| PROV-2 | Which of those links must a secured party verify before it accepts a tokenized asset as collateral, and when must it verify them again: at each pledge, at each revaluation, or only when a document is amended? | For tUST and tMMF (`provenanceRequired`) the receiving party checks the whole path when it takes the collateral: CSA proposal acceptance and substitution consent, repo affirmation and substitution, securities loan booking and collateral substitution, triparty settlement and substitution, CCP acceptance for clearing; a superseded link is judged against the version pinned at the pledge. No check at revaluation or on amendment. (`task-document-provenance`, 2026-11-22) | open | |

### `task-sme-two-way-im-rules`: two-way initial margin and the pledgor's reclaim on default

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| IM2-1 | Which paragraph of the 2018 NY law IM CSA, and of the control agreement with the custodian, gives the pledgor its collateral back when the secured party is the Defaulting Party? Is it the Pledgor's Rights and Remedies paragraph? | The pledgor reclaims its collateral when the secured party is the Defaulting Party; the prototype cites no specific CSA or control agreement paragraph for it. (project owner, 2026-11-07) | open | |
| IM2-2 | The prototype lets the pledgor reclaim as soon as the oracle feed records the secured party's default. Does it need a notice, a waiting period, or a designated Early Termination Date first? | The pledgor may reclaim as soon as the oracle feed records the secured party's default, with no notice, waiting period or designated Early Termination Date. (project owner, 2026-11-07) | open | |
| IM2-3 | The prototype returns the whole leg at once. Can the custodian hold back part of it, for example for amounts the pledgor owes on the other leg, or does segregation forbid that? | The custodian returns the whole leg to the pledgor at once, with no part held back. (project owner, 2026-11-07) | open | |
| IM2-4 | The non-defaulting party enforces or closes out the defaulting party's leg and reclaims its own in separate steps. Is any order between them required? | The non-defaulting party enforces or closes out the defaulting party's leg and reclaims its own leg in separate steps. (project owner, 2026-11-07) | open | |
| IM2-5 | In one IM CSA with both parties posting, is each party's Substitution election, Minimum Transfer Amount and eligibility schedule stated per party (Party1, Party2) as the prototype assumes? | Each party's Substitution election, Minimum Transfer Amount and eligibility schedule are stated per party (Party1, Party2) in the one IM CSA. (project owner, 2026-11-07) | open | |

### `task-revaluation-top-up-modelling`: how a revaluation shortfall is called

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TOP-1 | Is a revaluation shortfall called by an ordinary IM margin call (the interim basis), or by a dedicated top-up call with its own CDM representation and on-chain record? | A revaluation shortfall is called by an ordinary IM margin call for the shortfall, following `flow-im-margin-call-pledge`. (project owner, 2026-11-01) | open | |

## Call lifecycle and settlement

### `task-sme-call-cancellation-rules`: cancelling a margin call

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| CAN-1 | Can the calling party withdraw an unanswered call alone? Is there a cut-off (for example the Notification Time, or once the called party has started to process the call)? | none recorded | open | |
| CAN-2 | Once a call is agreed, partly agreed or disputed, does cancellation need the other party's acceptance? Can either party request it? What happens to a request neither accepted nor refused? | none recorded | open | |
| CAN-3 | Can a call be cancelled while a proposal is pending, or after it is accepted but before settlement? Is the proposal then void, or must it be rejected or withdrawn first? Does the answer change once settlement instructions have been sent? | none recorded | open | |
| CAN-4 | Is cancellation the right way to close a call disputed in full, or is it closed by the dispute resolution (Paragraph 5) and a new call? | none recorded | open | |
| CAN-5 | Is a cancelled call usually replaced by a new call, and should the new call refer to the one it replaces? | none recorded | open | |
| CAN-6 | Is a reason required for a cancellation or a refusal, and is there a standard list (ISO 20022 colr.005 and colr.006 reason codes)? | none recorded | open | |
| CAN-7 | Is a settled call ever cancelled, or is the only way back a return call? | none recorded | open | |

### `task-sme-settlement-netting-rules`: settlement netting of collateral movements

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| NET-1 | When do a VM delivery and a VM return between the same parties fall due on the same day, and should they net? | none recorded | open | |
| NET-2 | Does `netInterestWithMarginCalls` cover netting an Interest Amount with a delivery and with a return? Does `netPostedAndHeldInterest` belong in the same netting? | none recorded | open | |
| NET-3 | Is it enough that the party owing the net pays it, or do both parties first agree a netting statement (as under ISDA Master Agreement Section 2(c))? | none recorded | open | |
| NET-4 | Only cash nets in the prototype. Do deliveries and returns of the same security net in practice? | Only cash movements net; deliveries and returns of securities settle separately. (project owner, 2026-11-06) | open | |
| NET-5 | Which settlement date and cut-off define the movements that net together? | none recorded | open | |
| NET-6 | Confirm that initial margin, segregated with a custodian, never nets with variation margin or interest. | Initial margin, segregated with a custodian, never nets with variation margin or interest. (project owner, 2026-11-06) | open | |

### `task-sme-interest-daily-balances`: daily cash balances and rates of an Interest Period

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| INT-1 | Which balance counts for a day: the cash held at the end of the day, at a cut-off time, or the settled balance only? How are transfers in flight treated? | The live flow uses the current tUSD balance in escrow as the cash balance for every day of the Interest Period. (project owner, 2026-11-06) | open | |
| INT-2 | Which rate applies on a non-business day, and on which day is the rate observed (same day, or with a lookback)? | The live flow uses one rate, entered by the secured party, for every calendar day of the Interest Period. (project owner, 2026-11-06) | open | |
| INT-3 | Who supplies the balances and rates for the statement, and can the pledgor dispute them? | The secured party enters the rate, and the balance is the current tUSD balance in escrow. (project owner, 2026-11-06) | open | |
| INT-4 | For tokenized cash on a ledger, does the on-chain balance at the end of a calendar day (by block time) serve as the day's balance? | The live flow uses the current tUSD balance in escrow for every day of the Interest Period, not a per-day end-of-day balance. (project owner, 2026-11-06) | open | |

## Allocation and reconciliation

### `task-sme-allocation-ranking`: ranking and rules for collateral allocation

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| ALR-1 | Which default ranking do pledgors use in practice: lowest haircut first, highest haircut first, funding cost, or another cheapest-to-deliver measure? | The pledgor supplies the ranking; the default is the registry order. (project owner, 2026-11-07) | open | |
| ALR-2 | The last asset is rounded up to whole units. Is overshooting by less than one unit's value acceptable, or is a minimum transfer or rounding amount from the CSA applied? | The last asset is rounded up to whole units, so a suggestion may exceed the agreed amount by less than one unit's value. (project owner, 2026-11-07) | open | |
| ALR-3 | Should a suggestion respect the schedule's concentration limits against the collateral already held? | The allocation does not apply concentration limits. (project owner, 2026-11-07) | open | |
| ALR-4 | Suggestions cover new IM and VM calls only. Does allocation apply to substitution or to returns chosen by the secured party? | Suggestions are offered for new IM and VM calls only. (project owner, 2026-11-07) | open | |
| ALR-5 | The registry order puts tUSD (cash) last. Should cash come first, last, or be excluded from suggestions unless the pledgor ranks it? | The default registry order puts tUSD (cash) last, so a large call uses cash only after tUST and tMMF run out. (project owner, 2026-11-07) | open | |

### `task-sme-allocation-concentration`: concentration limits on a suggested basket

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| ALC-1 | Which concentration limits does a CSA eligibility schedule carry in practice: a share of the total collateral per asset, per issuer, per asset class, or an absolute amount? | The allocation applies no concentration limits; they are out of scope of `task-csa-allocation`, and gap G34 stays partial. (project owner, 2026-11-07) | open | |
| ALC-2 | Is a limit tested against the collateral already held plus the new basket, against the agreed amount of the call, or against the total credit support amount? | The allocation applies no concentration limits; they are out of scope of `task-csa-allocation`, and gap G34 stays partial. (project owner, 2026-11-07) | open | |
| ALC-3 | Is the limit applied to market value or to value after haircuts? | The allocation applies no concentration limits; they are out of scope of `task-csa-allocation`, and gap G34 stays partial. (project owner, 2026-11-07) | open | |
| ALC-4 | When the ranked inventory would breach a limit, does the allocation skip to the next asset, cap the asset at the limit, or reject the suggestion? Is an existing breach corrected by the next call? | The allocation applies no concentration limits; they are out of scope of `task-csa-allocation`, and gap G34 stays partial. (project owner, 2026-11-07) | open | |

### `task-sme-reconciliation-rules`: matching rules, tolerances and cadence for portfolio reconciliation

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| REC-1 | Which fields must match for a trade to reconcile, beyond product, notional and currency, dates, fixed rate, floating index, and payer and receiver? | A trade reconciles when product, notional and currency, effective and termination dates, fixed rate, floating index, and payer and receiver match. (project owner, 2026-11-07) | open | |
| REC-2 | What difference in a trade's valuation counts as a break: an absolute amount, a percentage of the larger valuation, or both? Is the tolerance set per trade, per portfolio, or in the CSA? | none recorded | open | |
| REC-3 | How often do counterparties reconcile in practice, and should the prototype reconcile on request only or on a schedule? | none recorded | open | |
| REC-4 | Which breaks justify disputing a call? Is a dispute raised only when answering a call, or also against a call already agreed? | none recorded | open | |
| REC-5 | Must both snapshots share one as-of time, and what happens when one party's snapshot is late? | none recorded | open | |

## Repo under the GMRA

### `task-sme-repo-margin-exposure`: GMRA exposure and Net Margin rules

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| RPM-1 | Is Transaction Exposure the Repurchase Price accrued to the date times the Margin Ratio, less the market value of the securities? (Written from model memory of the GMRA; not checked against agreement text.) | Transaction Exposure is the Repurchase Price accrued to the date times the Margin Ratio, less the market value of the securities. | open | |
| RPM-2 | Is Net Exposure the sum of the Transaction Exposures across the pair's repos in both directions, less the net margin held? | Net Exposure is the sum of the Transaction Exposures across the pair's repos in both directions, less the net margin held. | open | |
| RPM-3 | Interest on Cash Margin uses ACT/360 and one rate for the whole period, because `NetMarginInterest` has no day count attribute. Is that acceptable? | Interest on Cash Margin uses ACT/360 and one rate for the whole period, because `NetMarginInterest` has no day count attribute. (project owner, 2026-11-08) | open | |

### `task-sme-repo-live-spec-returns`: returning amounts in a live spec

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| RLS-1 | The live spec `flow-repo-purchase-repurchase` leaves the 875 tUSD Price Differential with the buyer on every run. Should a live spec also return such amounts itself? | The live spec `flow-repo-purchase-repurchase` leaves the 875 tUSD Price Differential with the buyer on every run, and `check` restores the free balances before each run. | open | |

### `task-sme-repo-reprice-rules`: repricing a repo under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| RPR-1 | The prototype settles the Price Differential accrued to the reprice date in the cash difference. Is it settled then, or carried to the final Repurchase Price? | The Price Differential accrued to the reprice date is settled in the cash difference. (project owner, 2026-11-08) | open | |
| RPR-2 | Is the new Purchase Price the market value of the securities divided by the Margin Ratio? | The new Purchase Price is the market value of the securities divided by the Margin Ratio. (project owner, 2026-11-08) | open | |
| RPR-3 | The prototype reprices every open repo of the pair, one settlement each. Does paragraph 4(i)(i) require all repos, and must they settle together? | The prototype reprices every open repo of the pair, one settlement each. (project owner, 2026-11-08) | open | |
| RPR-4 | The prototype offers a reprice under the same minimum transfer amount as a margin call. Does the minimum apply to a reprice? | A reprice is offered under the same minimum transfer amount as a margin call. (project owner, 2026-11-08) | open | |
| RPR-5 | Is a reprice agreed in place of a margin call, or is it a way of satisfying a call already made? | none recorded | open | |
| RPR-6 | The prototype sets each repriced Transaction Exposure to about zero and leaves Net Margin already held unchanged, so after a reprice the other party can call that margin back. Should a reprice take the margin held into account? | Each repriced Transaction Exposure is set to about zero and Net Margin held is left unchanged, so the other party can call that margin back after the reprice. (project owner, 2026-11-08) | open | |

### `task-sme-repo-adjustment-rules`: adjusting a repo under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| RAD-1 | The prototype has the Seller pay the Price Differential accrued to the adjustment date in cash. Is it settled then, carried to the final Repurchase Price, or added to the new Purchase Price? | The Seller pays the Price Differential accrued to the adjustment date in cash. (project owner, 2026-11-08) | open | |
| RAD-2 | Is the new quantity the Purchase Price times the Margin Ratio divided by the price, rounded up to whole units? | The new quantity is the Purchase Price times the Margin Ratio divided by the price, rounded up to whole units. (project owner, 2026-11-08) | open | |
| RAD-3 | The prototype adjusts every open repo of the pair, one settlement each. Does paragraph 4(i)(ii) require all repos, and must they settle together? | The prototype adjusts every open repo of the pair, one settlement each. (project owner, 2026-11-08) | open | |
| RAD-4 | The prototype offers an adjustment under the same minimum transfer amount as a margin call. Does the minimum apply to an adjustment? | An adjustment is offered under the same minimum transfer amount as a margin call. (project owner, 2026-11-08) | open | |
| RAD-5 | Is an adjustment agreed in place of a margin call, or is it a way of satisfying a call already made? | none recorded | open | |
| RAD-6 | The prototype leaves Net Margin held unchanged, so after an adjustment the other party can call that margin back. Should an adjustment take the margin held into account? | Net Margin held is left unchanged, so the other party can call that margin back after an adjustment. (project owner, 2026-11-08) | open | |

### `task-sme-repo-substitution-rules`: substituting repo securities under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| SUB-1 | Must the substitute's Market Value be at least that of the securities it replaces, on the substitution date, with quantity rounded up to whole units? | The substitute's Market Value on the substitution date is at least that of the securities it replaces, with quantity rounded up to whole units. (project owner, 2026-11-08) | open | |
| SUB-2 | The prototype accepts any security with a feed price and relies on the Buyer's agreement. Does the GMRA or Annex I limit which securities may be substituted? | Any security with a feed price may be substituted, subject to the Buyer's agreement. (project owner, 2026-11-08) | open | |
| SUB-3 | The prototype replaces all the securities of one repo. Is a partial substitution in scope? | A substitution replaces all the securities of one repo. (project owner, 2026-11-08) | open | |
| SUB-4 | The prototype moves no cash and keeps the Repurchase Price. Is that correct under paragraph 8? | A substitution moves no cash and keeps the Repurchase Price. (project owner, 2026-11-08) | open | |
| SUB-5 | May the Buyer refuse a substitution without a reason? | none recorded | open | |
| SUB-6 | A rounded-up substitute may leave a small excess with the Buyer, and later price moves follow the new security. Is any margin step required at the substitution? | No margin step is taken at the substitution; a rounded-up substitute may leave a small excess with the Buyer, and later price moves follow the new security. (project owner, 2026-11-08) | open | |

### `task-sme-repo-income-rules`: interim interest and manufactured income under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| INC-1 | The prototype pays the whole Price Differential accrued to the date, less earlier interim payments, and reduces the Repurchase Price by it. Is that correct, and are partial payments needed? | An interim payment pays the whole Price Differential accrued to the date, less earlier interim payments, and reduces the Repurchase Price by it. (project owner, 2026-11-08) | open | |
| INC-2 | The prototype lets the Seller start an interim payment and needs the Buyer's agreement. Can either party demand it? | The Seller starts an interim payment and the Buyer must agree to it. (project owner, 2026-11-08) | open | |
| INC-3 | The prototype computes income per unit times the quantity, rounded to whole tUSD. Is it the amount paid by the issuer on the securities held, and is withholding tax taken into account? | Income is the income per unit times the quantity, rounded to whole tUSD. (project owner, 2026-11-08) | open | |
| INC-4 | The prototype pays when the parties agree, with the income date as a stated field. Must payment be on the income date, and who holds the securities on the record date? | Income is paid when the parties agree, with the income date as a stated field. (project owner, 2026-11-08) | open | |
| INC-5 | Under paragraph 5, may income be set off against other amounts, or applied to reduce the Repurchase Price or the exposure? | none recorded | open | |
| INC-6 | CDM's on-demand rate change is not built. Is an agreed change of the repo rate needed? | CDM's on-demand rate change is not built, so the repo rate cannot be changed by agreement. (project owner, 2026-11-08) | open | |

### `task-sme-repo-roll-rules`: a repo roll under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| ROL-1 | The prototype has the Seller pay the Price Differential on the roll date and keeps the Purchase Price. Is that correct, or is the interest added to the new Purchase Price, or the Transaction reset to the market value? | The Seller pays the Price Differential on the roll date and the Purchase Price is kept. (project owner, 2026-11-08) | open | |
| ROL-2 | The prototype rolls only on the Repurchase Date. Can a Transaction be rolled earlier, or after a missed date? | A repo rolls only on its Repurchase Date. (project owner, 2026-11-08) | open | |
| ROL-3 | The prototype keeps the securities and does not revalue them at the roll. Must the rolled Transaction be priced or margined again at the roll? | The roll keeps the securities and does not revalue them. (project owner, 2026-11-08) | open | |
| ROL-4 | The proposing party enters the new repo rate and the other party agrees to it. Is there any constraint on the rate? | The proposing party enters the new repo rate and the other party agrees to it. (project owner, 2026-11-08) | open | |
| ROL-5 | After a refusal the repo stays due for repurchase on the same date. Is any other consequence intended? | After a refusal the repo stays due for repurchase on the same date. (project owner, 2026-11-08) | open | |
| ROL-6 | A settled repurchase clears a pending roll, and a repurchase instruction stops a roll from settling. Is that the right precedence? | A settled repurchase clears a pending roll, and a repurchase instruction stops a roll from settling. (project owner, 2026-11-08) | open | |
| ROL-7 | CDM closes the trade and opens another with the same identifier. Under the GMRA, is a roll a new Transaction needing its own Confirmation? | CDM closes the trade and opens another with the same identifier. (project owner, 2026-11-08) | open | |

### `task-sme-repo-pair-off-rules`: a repo pair-off under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| POF-1 | The prototype pairs off two repos only when they are between the same parties in opposite directions, with the same security, quantity, cash currency and Repurchase Date. Which of these must match in practice, and is a pair-off of repos with different Repurchase Dates possible? | Two repos pair off only when they are between the same parties in opposite directions, with the same security, quantity, cash currency and Repurchase Date. (project owner, 2026-11-10) | open | |
| POF-2 | Only equal quantities pair off. Is a partial pair-off (the difference delivered) common, and how is the residual treated? | Only repos of equal quantity pair off (full pair-off only). (project owner, 2026-11-10) | open | |
| POF-3 | The prototype nets the repurchase legs on the common Repurchase Date. Is pairing off the purchase legs (the repos never start) also in scope? | The prototype nets the repurchase legs on the common Repurchase Date. (project owner, 2026-11-10) | open | |
| POF-4 | The net cash is the difference of the two Repurchase Prices, paid by the Seller of the repo with the higher one. Are interim interest, income or margin also netted into it? | The net cash is the difference of the two Repurchase Prices, paid by the Seller of the repo with the higher one. (project owner, 2026-11-10) | open | |
| POF-5 | Either party proposes and the other agrees or refuses. Is a pair-off agreed bilaterally like this, or instructed through a settlement system? | Either party proposes the pair-off and the other agrees or refuses. (project owner, 2026-11-10) | open | |
| POF-6 | The paired repos leave the pair's Net Exposure on settlement. Must the margin held be adjusted at the same time? | The paired repos leave the pair's Net Exposure on settlement. (project owner, 2026-11-10) | open | |
| POF-7 | CDM keeps both trades and adds a package reference; the prototype then marks both repurchased. Under the GMRA, are the two Transactions terminated, or settled by netting? | CDM keeps both trades and adds a package reference; the prototype then marks both repurchased. (project owner, 2026-11-10) | open | |

### `task-sme-repo-buy-sell-back-rules`: a buy/sell-back under the GMRA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| BSB-1 | The income lowers the sell-back price by the income amount plus interest at the repo rate (ACT/360) from the income date to the Repurchase Date. Is that the GMRA Buy/Sell Back Annex formula, and which rate applies? | The income lowers the sell-back price by the income amount plus interest at the repo rate (ACT/360) from the income date to the Repurchase Date. (project owner, 2026-11-11) | open | |
| BSB-2 | The deduction is fixed when the Seller agrees it, to the Repurchase Date of that time. Is it recomputed if the Transaction is later repriced or adjusted? | The deduction is fixed when the Seller agrees it, to the Repurchase Date at that time. (project owner, 2026-11-11) | open | |
| BSB-3 | The Buyer enters the income per unit and date and the Seller agrees. Is that how the income is agreed in practice? | The Buyer enters the income per unit and date and the Seller agrees. (project owner, 2026-11-11) | open | |
| BSB-4 | A buy/sell-back's Transaction Exposure uses the accrued Repurchase Price less the full deduction. Should the interest part of the deduction accrue to the valuation date instead? | A buy/sell-back's Transaction Exposure uses the accrued Repurchase Price less the full deduction. (project owner, 2026-11-11) | open | |
| BSB-5 | Margin maintenance, repricing, adjustment, substitution, roll and pair-off apply as for a repo; interim interest does not. Is that right for a buy/sell-back under the Annex, and for an undocumented one? | Margin maintenance, repricing, adjustment, substitution, roll and pair-off apply as for a repo; interim interest does not. (project owner, 2026-11-11) | open | |
| BSB-6 | At a roll the Seller pays the Price Differential less the deduction, the Buyer pays any excess, and the deduction resets. Is that correct? | At a roll the Seller pays the Price Differential less the deduction, the Buyer pays any excess, and the deduction resets. (project owner, 2026-11-11) | open | |
| BSB-7 | Only two trades of the same type pair off. Can a repo and a buy/sell-back be paired off? | Only two trades of the same type pair off. (project owner, 2026-11-11) | open | |
| BSB-8 | The tokenized securities accrue no coupon, so the prototype quotes no accrued interest in the purchase and sell-back prices. For coupon securities, how are the clean price and accrued interest stated? | The tokenized securities accrue no coupon, so the purchase and sell-back prices quote no accrued interest. (project owner, 2026-11-11) | open | |

### `task-sme-repo-default-close-out-rules`: a GMRA default and close-out

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| DCO-1 | Each Transaction enters as the Repurchase Price accrued to the Early Termination Date, owed by the Seller, against the Default Market Value of the Equivalent Securities, owed by the Buyer. Is that paragraph 10(c)? | Each Transaction enters as the Repurchase Price accrued to the Early Termination Date, owed by the Seller, against the Default Market Value of the Equivalent Securities, owed by the Buyer. (project owner, 2026-11-11) | open | |
| DCO-2 | The prototype uses one market price at the Default Valuation Time. Under paragraph 10(e) the non-defaulting party may use the net proceeds of a sale or purchase, or quotations. Which method applies when? | The prototype uses one oracle market price at the Default Valuation Time as the Default Market Value. (project owner, 2026-11-11) | open | |
| DCO-3 | The elections hold a Default Valuation Time and a business day calendar. Which day: the Early Termination Date, or a number of dealing days after it? | The elections hold a Default Valuation Time and a business day calendar, and the prototype values at one oracle price at that time. (project owner, 2026-11-11) | open | |
| DCO-4 | The oracle records a default without its kind, and with automatic early termination elected every default terminates without notice. Should only an Act of Insolvency do so? | The oracle records a default without its kind; with automatic early termination elected, every default terminates without notice. (project owner, 2026-11-11) | open | |
| DCO-5 | Cash Margin is owed back at its amount and Margin Securities at their Default Market Value. Is accrued Net Margin interest also included? | Cash Margin is owed back at its amount and Margin Securities at their Default Market Value. (project owner, 2026-11-11) | open | |
| DCO-6 | Agreed income that was due and not paid enters the balance. Does interest on it apply? | Agreed income that was due and not paid enters the balance. (project owner, 2026-11-11) | open | |
| DCO-7 | A buy/sell-back enters at its Repurchase Price less the income deduction. Is that right under the Buy/Sell Back Annex when the income date falls after the Early Termination Date? | A buy/sell-back enters at its Repurchase Price less the income deduction. (project owner, 2026-11-11) | open | |
| DCO-8 | The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. Which apply? | The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. (project owner, 2026-11-11) | open | |
| DCO-9 | The close-out ends only Transactions whose purchase has settled; one booked and affirmed but not yet purchased stays open. Does the Event of Default terminate it too, and with what value? | The close-out ends only Transactions whose purchase has settled; one booked and affirmed but not yet purchased stays open. (project owner, 2026-11-11) | open | |

## Securities lending under the GMSLA

### `task-sme-gmsla-terms-baseline`: the baseline GMSLA elections and their amendment

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| GST-1 | CDM's GMSLA elections hold one notification time. Which notices does it govern under GMSLA 2010 (margin calls, recall notices, both), and is 10:00 London a usual baseline? | CDM's GMSLA elections hold one notification time, set to 10:00 London in the baseline. (project owner, 2026-11-11) | open | |
| GST-2 | GMSLA 2010 has no standard minimum transfer amount. Is a per-party minimum transfer amount in the Schedule usual, and does it apply to the aggregated mark under paragraph 5.4? | The Schedule carries a per-party minimum transfer amount, applied to the aggregated mark: a call is made only when the net figure exceeds the calling party's minimum. (project owner, 2026-11-11) | open | |
| GST-3 | The prototype's agreement carries a default margin of 102% for loans that state none. Is margin always agreed per loan, or is an agreement-level default usual? | The agreement carries a default margin of 102% for loans that state none. (project owner, 2026-11-11) | open | |
| GST-4 | The baseline has automatic early termination not applicable for both parties. Is that usual for an English law GMSLA 2010 between two banks? | Automatic early termination is not applicable for both parties in the baseline. (project owner, 2026-11-11) | open | |
| GST-5 | The baseline applies netting of deliveries (paragraph 5.6) and the failure-to-redeliver indemnity (paragraph 6.4). Are these the usual elections? | The baseline applies netting of deliveries (paragraph 5.6) and the failure-to-redeliver indemnity (paragraph 6.4). (project owner, 2026-11-11) | open | |
| GST-6 | An agreed amendment of the elections takes effect on its effective date. Does it apply to loans already outstanding, or only to new loans? | An agreed amendment of the elections takes effect on its effective date. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-loan-delivery-return-rules`: securities loan delivery and return under the GMSLA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| LDR-1 | The initial collateral is the Market Value of the Loaned Securities at the booking date's price times the loan's margin, rounded up. Is that the Required Collateral Value under GMSLA 2010, and is it priced on the trade date or the settlement date? | The initial collateral is the Market Value of the Loaned Securities at the booking date's price times the loan's margin, rounded up. (project owner, 2026-11-11) | open | |
| LDR-2 | On a partial return the lender redelivers collateral in proportion to the quantity returned, in the same settlement. Is that usual, or is the excess collateral returned only through the next mark? | On a partial return the lender redelivers collateral in proportion to the quantity returned, in the same settlement. (project owner, 2026-11-11) | open | |
| LDR-3 | Open loans may be returned on any business day, and the prototype settles a return when both parties instruct it. What notice of return does the borrower give, and what is the standard settlement period? | Open loans may be returned on any business day, and a return settles when both parties instruct it. (project owner, 2026-11-11) | open | |
| LDR-4 | A cash-collateral loan states a rebate rate, and a loan against securities states a fee rate, both fixed at booking. Are both agreed per loan, and can a rate change during the loan? | A cash-collateral loan states a rebate rate and a loan against securities states a fee rate, both fixed at booking. (project owner, 2026-11-11) | open | |
| LDR-5 | Collateral passes to the lender by outright title transfer, as under GMSLA 2010. Should the prototype also support the GMSLA 2018 security interest (pledge) variant? | Collateral passes to the lender by outright title transfer, as under GMSLA 2010. (project owner, 2026-11-11) | open | |
| LDR-6 | A full return is qualified as a full return and not as a termination. Is the end of a loan by full return treated differently from its early termination (for example on recall or default)? | A full return is qualified as a full return and not as a termination. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-marking-rules`: marking securities loans under the GMSLA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| MRK-1 | Loans are marked together per pair (GMSLA paragraph 5.4): each party's requirement as lender less the collateral it holds, the two directions netted to one figure. Is that how aggregated marking is computed, and is margin from earlier calls netted in the same figure? | Loans are marked together per pair: each party's requirement as lender less the collateral it holds, the two directions netted to one figure. (project owner, 2026-11-11) | open | |
| MRK-2 | Either party may call: a lender short of collateral calls for more, and a borrower over-collateralised calls for the excess back. Is that usual, and is the call made by notice to the other party? | Either party may call: a lender short of collateral calls for more, and an over-collateralised borrower calls for the excess back. (project owner, 2026-11-11) | open | |
| MRK-3 | A call is made only when the net figure exceeds the calling party's minimum transfer amount. Does the GMSLA minimum transfer amount apply this way, and is there also a rounding of the amount called? | A call is made only when the net figure exceeds the calling party's minimum transfer amount. (project owner, 2026-11-11) | open | |
| MRK-4 | Collateral is valued at its market price without a haircut, the loan's margin being the buffer. Is a haircut on non-cash collateral applied as well under GMSLA 2010? | Collateral is valued at its market price without a haircut, the loan's margin being the buffer. (project owner, 2026-11-11) | open | |
| MRK-5 | The margin delivered on a call stays with the pair and is netted at the next mark; a return of a loan redelivers only that loan's own collateral. Is margin attributed to individual loans in practice? | Margin delivered on a call stays with the pair and is netted at the next mark; a return of a loan redelivers only that loan's own collateral. (project owner, 2026-11-11) | open | |
| MRK-6 | Prices are the feed prices on the business date, and a call settles by the next business day. What are the usual valuation time and settlement period for a margin call under the GMSLA? | Prices are the feed prices on the business date, and a call settles by the next business day. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-recall-rules`: recalling loaned securities under the GMSLA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| RCL-1 | The lender recalls all or part of a loan by notice, and the borrower must return the securities by the end of the standard settlement time for them. Is two business days after the notice the right date for the prototype's securities, and is the notice date the day the notice is given or the next business day after a cut-off time? | The lender recalls all or part of a loan by notice, and the borrower must return the securities two business days after the notice. (project owner, 2026-11-11) | open | |
| RCL-2 | A recall is recorded as a notice and does not change the loan; the loan ends only when the securities are returned. Is that how a recall works under GMSLA 2010, or does the notice itself terminate the loan for the recalled quantity? | A recall is recorded as a notice and does not change the loan; the loan ends only when the securities are returned. (project owner, 2026-11-11) | open | |
| RCL-3 | The lender may withdraw a recall before the securities are returned. Is a withdrawal usual, and does it need the borrower's agreement? | The lender may withdraw a recall before the securities are returned. (project owner, 2026-11-11) | open | |
| RCL-4 | When the borrower misses the date, the prototype only shows the recall as overdue. What may the lender do, and from when: a buy-in, a default notice, or both (row 19)? | When the borrower misses the date, the prototype only shows the recall as overdue. (project owner, 2026-11-11) | open | |
| RCL-5 | The collateral stays with the lender until the return, which redelivers it in proportion. Is that right, or is collateral released when the recall is made? | The collateral stays with the lender until the return, which redelivers it in proportion. (project owner, 2026-11-11) | open | |
| RCL-6 | A borrower's own return of part of a recalled loan reduces the quantity still recalled. Is that how a partial return during a recall is treated? | A borrower's own return of part of a recalled loan reduces the quantity still recalled. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-substitution-rules`: substituting non-cash collateral of a loan under the GMSLA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| LSB-1 | The borrower may substitute the collateral of a loan with alternative collateral acceptable to the lender. Under GMSLA 2010, is the lender's agreement needed for each substitution, or only that the substitute be eligible under the agreed collateral schedule? | The borrower may substitute the collateral of a loan with alternative collateral acceptable to the lender. (project owner, 2026-11-11) | open | |
| LSB-2 | The substitute must be worth at least the loan's required collateral (the loaned value times the margin) at the substitution date's prices. Is that the right test, or must it equal the value of the collateral it replaces? | The substitute must be worth at least the loan's required collateral (the loaned value times the margin) at the substitution date's prices. (project owner, 2026-11-11) | open | |
| LSB-3 | The substitute and the original collateral move in one transaction. In practice, must the borrower deliver the substitute first, with the lender returning the original afterwards, and by when? | The substitute and the original collateral move in one transaction. (project owner, 2026-11-11) | open | |
| LSB-4 | A substitution replaces all the collateral of one loan. Are partial substitutions, giving a loan with mixed collateral, usual under the GMSLA? | A substitution replaces all the collateral of one loan. (project owner, 2026-11-11) | open | |
| LSB-5 | The loan's fee is unchanged by a substitution. Is the fee repriced when the collateral changes, for example to a lower-grade security? | The loan's fee is unchanged by a substitution. (project owner, 2026-11-11) | open | |
| LSB-6 | A substitution is allowed while a recall is pending. Is that right, or does a recall freeze the collateral until the return? | A substitution is allowed while a recall is pending. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-rebate-rules`: billing and paying the rebate on cash collateral under the GMSLA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| RBT-1 | The rebate is billed from the last billed date to the business date, at any time the borrower chooses. Under GMSLA 2010 practice, is the rebate settled monthly, and on which day (e.g. the first business days of the next month)? | The rebate is billed from the last billed date to the business date, at any time the borrower chooses. (project owner, 2026-11-11) | open | |
| RBT-2 | The rebate accrues daily on the cash collateral actually held, ACT/360, the start day counted and the end day not. Is that the usual accrual convention for a USD cash rebate? | The rebate accrues daily on the cash collateral actually held, ACT/360, the start day counted and the end day not. (project owner, 2026-11-11) | open | |
| RBT-3 | The borrower issues the invoice and the lender pays on agreement. In practice, who issues the rebate statement, and how is a disputed amount handled? | The borrower issues the rebate invoice and the lender pays on agreement. (project owner, 2026-11-11) | open | |
| RBT-4 | The invoice total is the sum of the daily accruals per sub-period, rounded half-up once (to whole tUSD in the prototype, whose cash token has no decimals). Is rounding per invoice the usual practice, or per day? | The invoice total is the sum of the daily accruals per sub-period, rounded half-up once to whole tUSD. (project owner, 2026-11-11) | open | |
| RBT-5 | Negative rebate rates are refused. Are negative rebates (the borrower pays) used for USD cash collateral, and should the prototype support them? | Negative rebate rates are refused. (project owner, 2026-11-11) | open | |
| RBT-6 | A returned loan can still be billed for the period up to its return date. Is the final rebate usually settled with the return, or billed with the next periodic statement? | A returned loan can still be billed for the period up to its return date. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-fee-rules`: billing and paying the lending fee under the GMSLA

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| FEE-1 | The lending fee accrues on the market value of the loaned securities, without the margin. CDM's billing function charges it on the market value times the margin (the collateral requirement). Under GMSLA 2010 practice, is the fee charged on the loan value or on the collateral value? | The lending fee accrues on the market value of the loaned securities, without the margin. (project owner, 2026-11-11) | open | |
| FEE-2 | The prototype values the loaned securities at one price per invoice, the feed price on the billing date, because its feed keeps no history. In practice, is the fee accrued daily on each day's market value, and which price source and time are used? | The loaned securities are valued at one price per invoice, the feed price on the billing date, because the feed keeps no history. (project owner, 2026-11-11) | open | |
| FEE-3 | The fee accrues ACT/360, the start day counted and the end day not, at a fixed rate agreed at booking. Is that the usual convention for a USD-denominated lending fee, and are fee rates renegotiated during an open loan? | The fee accrues ACT/360, the start day counted and the end day not, at a fixed rate agreed at booking. (project owner, 2026-11-11) | open | |
| FEE-4 | The lender issues the fee invoice and the borrower pays on agreement, in USD cash. In practice, who issues the fee statement, how often, and how is a disputed amount handled? | The lender issues the fee invoice and the borrower pays on agreement, in USD cash. (project owner, 2026-11-11) | open | |
| FEE-5 | A substitution of the collateral does not change the fee. Is that right, or does the fee depend on the type of collateral held? | A substitution of the collateral does not change the fee. (project owner, 2026-11-11) | open | |
| FEE-6 | A returned loan can still be billed for the period up to its return date. Is the final fee usually settled with the return, or billed with the next periodic statement? | A returned loan can still be billed for the period up to its return date. (project owner, 2026-11-11) | open | |

### `task-sme-gmsla-default-rules`: a GMSLA default and close-out

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| DFL-1 | Each loan enters as the Default Market Value of the Equivalent Securities, owed to the lender, against the value of the Equivalent Collateral the lender holds, owed to the borrower. Is that GMSLA 2010 paragraph 11, and is cash collateral owed back at its amount? | Each loan enters as the Default Market Value of the Equivalent Securities, owed to the lender, against the value of the Equivalent Collateral the lender holds, owed to the borrower. (project owner, 2026-11-11) | open | |
| DFL-2 | The prototype values securities at one oracle price on the Early Termination Date. Under paragraph 11 the non-defaulting party may use the proceeds of a sale or purchase, or quotations, at the Default Valuation Time. Which method applies when, and on which day? | Securities are valued at one oracle price on the Early Termination Date. (project owner, 2026-11-11) | open | |
| DFL-3 | The fee or rebate accrued from the billed-through date to the Early Termination Date, and any invoice still unpaid, enter the balance. Is that right, and does interest run on unpaid amounts? | The fee or rebate accrued from the billed-through date to the Early Termination Date, and any invoice still unpaid, enter the balance. (project owner, 2026-11-11) | open | |
| DFL-4 | Margin held under the pair's GMSLA calls is set off at its value, cash at par and securities at their Default Market Value. With aggregated marking, is that margin treated as collateral of all the loans? | Margin held under the pair's GMSLA calls is set off at its value, cash at par and securities at their Default Market Value. (project owner, 2026-11-11) | open | |
| DFL-5 | Automatic early termination follows the defaulting party's election, and the oracle does not record the kind of default. Should only an Act of Insolvency terminate without notice? | Automatic early termination follows the defaulting party's election, and the oracle does not record the kind of default. (project owner, 2026-11-11) | open | |
| DFL-6 | Loans booked and affirmed but not delivered stay open after the close-out. Does the Event of Default terminate them too, and at what value? | Loans booked and affirmed but not delivered stay open after the close-out. (project owner, 2026-11-11) | open | |
| DFL-7 | A returned loan with a period not yet billed is not in the close-out and can still be billed. Should its unpaid rate enter the balance? | A returned loan with a period not yet billed is not in the close-out and can still be billed. (project owner, 2026-11-11) | open | |
| DFL-8 | The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. Which apply under paragraph 11? | The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. (project owner, 2026-11-11) | open | |
| DFL-9 | The GMSLA and GMRA close-outs between the same pair are separate statements. Is cross-agreement set-off (for example under a master netting agreement) expected? | The GMSLA and GMRA close-outs between the same pair are separate statements, with no cross-agreement set-off. (project owner, 2026-11-11) | open | |

## Triparty repo

### `task-sme-triparty-terms-profile`: the triparty terms and the collateral profile

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TPT-1 | A triparty repo has a triparty agreement between the giver, the receiver and the agent, beside the GMRA between the giver and the receiver. Which terms does the triparty agreement hold that the prototype's terms leave out (the agent's fees, its liability, the cut-off times, the accounts)? | none recorded | open | |
| TPT-2 | The prototype's profile reuses the CSA schedule: US Treasuries at a 2% haircut and agency debt at 3%. Is that a usual triparty repo profile, or do agents' profiles usually state margin as a ratio per asset class? | The profile reuses the CSA schedule: US Treasuries at a 2% haircut and agency debt at 3%. (project owner, 2026-11-11) | open | |
| TPT-3 | The profile limits agency debt to 50% of the allocated value after haircuts. Are concentration limits in triparty profiles usually per asset class, per issuer, or both, and measured before or after haircuts? | The profile limits agency debt to 50% of the allocated value after haircuts. (project owner, 2026-11-11) | open | |
| TPT-4 | Either the giver or the receiver may propose the terms, and the agent affirms them. Is the agent a party to the triparty agreement that consents to its terms, or only its operator? | Either the giver or the receiver may propose the terms, and the agent affirms them. (project owner, 2026-11-11) | open | |
| TPT-5 | The terms are set once and only terminated, not amended. How are changes to a profile agreed in practice, and do they apply to repos already allocated? | The terms are set once and only terminated, not amended. (project owner, 2026-11-11) | open | |
| TPT-6 | The giver or the receiver can terminate the triparty terms while nothing is allocated. What notice does termination take, and can the agent terminate? | The giver or the receiver can terminate the triparty terms while nothing is allocated. (project owner, 2026-11-11) | open | |

### `task-sme-triparty-trade-start`: the triparty allocation and the purchase through the agent

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TPS-1 | The profile's haircuts take the place of the GMRA margin ratio: the allocated value after haircuts covers the Purchase Price. Is that how triparty repo margin is applied, or is a margin ratio applied on top of the haircuts? | The profile's haircuts take the place of the GMRA margin ratio: the allocated value after haircuts covers the Purchase Price. (project owner, 2026-11-12) | open | |
| TPS-2 | The agent allocates in the giver's own ranking of its assets. Do agents allocate in the giver's ranking, by their own optimisation (cheapest to deliver), or by a rule in the triparty agreement? | The agent allocates in the giver's own ranking of its assets. (project owner, 2026-11-12) | open | |
| TPS-3 | A concentration limit is measured as a share of the Purchase Price the allocation covers. Do agents measure limits against the exposure, the total allocated value, or the giver's whole allocation across repos? | A concentration limit is measured as a share of the Purchase Price the allocation covers. (project owner, 2026-11-12) | open | |
| TPS-4 | When the giver's deposit cannot cover the Purchase Price within the profile, the agent allocates nothing. Do agents allocate partially and report a shortfall, or hold the trade unsettled? | When the giver's deposit cannot cover the Purchase Price within the profile, the agent allocates nothing. (project owner, 2026-11-12) | open | |
| TPS-5 | The allocated collateral stays in the agent's books in an account per repo, held by the receiver by title. Is the receiver's account at the agent per repo, or one account per giver and receiver? | The allocated collateral stays in the agent's books in an account per repo, held by the receiver by title. (project owner, 2026-11-12) | open | |
| TPS-6 | The receiver affirms the agent's allocation before the purchase settles. Does the receiver confirm allocations in practice, or is the agent's allocation binding on both parties? | The receiver affirms the agent's allocation before the purchase settles. (project owner, 2026-11-12) | open | |
| TPS-7 | The agent values the collateral at the oracle feed price. Which price sources and times do agents use for the allocation? | The agent values the collateral at the oracle feed price. (project owner, 2026-11-12) | open | |

### `task-sme-triparty-revaluation`: the triparty agent's daily revaluation, top-up and release

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TPR-1 | The agent's required value is the Purchase Price plus the repo interest accrued to the day. Do agents use the accrued Repurchase Price, the Purchase Price, or a value the parties report (the "exposure")? | The agent's required value is the Purchase Price plus the repo interest accrued to the day. (project owner, 2026-11-12) | open | |
| TPR-2 | There is no threshold: any shortfall is topped up and any excess released. Do agents apply a minimum movement, a tolerance band, or a percentage of the exposure? | There is no threshold: any shortfall is topped up and any excess released. (project owner, 2026-11-12) | open | |
| TPR-3 | A top-up comes from the giver's free collateral in the giver's ranking. Do agents top up by the same rule as the initial allocation, or by a separate one? | A top-up comes from the giver's free collateral in the giver's ranking. (project owner, 2026-11-12) | open | |
| TPR-4 | An excess is released from the asset the giver ranked last. Do agents release from a particular asset, pro rata, or by the giver's instruction? | An excess is released from the asset the giver ranked last. (project owner, 2026-11-12) | open | |
| TPR-5 | When the giver's free collateral cannot cover a shortfall, nothing moves and the shortfall is recorded. Do agents move what they can, notify the parties, or treat it as a margin call between them? | When the giver's free collateral cannot cover a shortfall, nothing moves and the shortfall is recorded. (project owner, 2026-11-12) | open | |
| TPR-6 | A concentration breach caused by price moves alone is recorded and left to substitution. Do agents rebalance during the daily revaluation? | A concentration breach caused by price moves alone is recorded and left to substitution. (project owner, 2026-11-12) | open | |
| TPR-7 | The agent revalues on request in the prototype. When and how often do agents revalue, and at which prices (closing, intraday)? | The agent revalues on request. (project owner, 2026-11-12) | open | |
| TPR-8 | The revaluation moves collateral without either party's affirmation. Is the agent's daily reallocation binding on both parties under the triparty agreement? | The revaluation moves collateral without either party's affirmation. (project owner, 2026-11-12) | open | |

### `task-sme-triparty-substitution`: the triparty agent's substitution of collateral

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TPU-1 | The giver asks for a number of units of one asset back. Do givers recall specific securities by quantity, whole positions, or a value? | The giver asks for a number of units of one asset back. (project owner, 2026-11-12) | open | |
| TPU-2 | The agent replaces the returned units from the giver's free collateral in the giver's ranking until the repo is covered again. Do agents replace by the allocation rule, by equal value, or by the giver's instruction? | The agent replaces the returned units from the giver's free collateral in the giver's ranking until the repo is covered again. (project owner, 2026-11-12) | open | |
| TPU-3 | When the free collateral cannot replace the returned units, the agent declines the whole request. Do agents return part of the request, or queue it until collateral arrives? | When the free collateral cannot replace the returned units, the agent declines the whole request. (project owner, 2026-11-12) | open | |
| TPU-4 | The agent may start a substitution itself to bring an asset back within its concentration limit. Do agents rebalance breaches on their own, and how quickly? | The agent may start a substitution itself to bring an asset back within its concentration limit. (project owner, 2026-11-12) | open | |
| TPU-5 | The receiver does not affirm a substitution. Is the receiver notified or asked to consent under the triparty agreement? | The receiver does not affirm a substitution. (project owner, 2026-11-12) | open | |
| TPU-6 | One substitution request may be pending per repo. Do agents process several recalls on one repo at once, or across a giver's repos together? | One substitution request may be pending per repo. (project owner, 2026-11-12) | open | |
| TPU-7 | The substitution takes effect when the agent records it. What cut-off times and settlement timing do agents apply to recalls? | The substitution takes effect when the agent records it. (project owner, 2026-11-12) | open | |

### `task-sme-triparty-trade-end`: the triparty trade end through the agent

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TPE-1 | The agent prepares the trade end on the Repurchase Date and the giver settles it. Does the agent settle the close-out on its own, or does it wait for the giver's cash? | The agent prepares the trade end on the Repurchase Date and the giver settles it. (project owner, 2026-11-12) | open | |
| TPE-2 | Trade end happens on the Repurchase Date only. How do agents handle open (on-demand) repos and early terminations? | Trade end happens on the Repurchase Date only. (project owner, 2026-11-12) | open | |
| TPE-3 | The giver pays the Repurchase Price directly to the receiver in the same step as the release. Does the cash move through the agent's books, or through a separate cash agent or payment system? | The giver pays the Repurchase Price directly to the receiver in the same step as the release. (project owner, 2026-11-12) | open | |
| TPE-4 | The released collateral returns to the giver's free account at the agent. Is released collateral kept at the agent for the next repo, or delivered back to the giver's custody? | The released collateral returns to the giver's free account at the agent. (project owner, 2026-11-12) | open | |
| TPE-5 | A pending substitution blocks the trade end. How do agents handle a recall that is pending at the Repurchase Date? | A pending substitution blocks the trade end. (project owner, 2026-11-12) | open | |
| TPE-6 | The receiver does not confirm the trade end. Is the receiver's confirmation of the repayment needed before the agent releases? | The receiver does not confirm the trade end. (project owner, 2026-11-12) | open | |

### `task-sme-triparty-reporting`: the triparty agent's report to both parties

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| TPP-1 | The agent reports all settled repos under one set of terms with the giver's free collateral in one report. Do agents report per repo, per terms, or per giver and receiver across their repos? | The agent reports all settled repos under one set of terms, with the giver's free collateral, in one report. | open | |
| TPP-2 | The report states the exposure as the Repurchase Price accrued to the day. Is that the exposure agents report, or the value the parties gave them? | The report states the exposure as the Repurchase Price accrued to the day. | open | |
| TPP-3 | The report states each asset's price, haircut and value after haircuts, and whether the repo is covered. Which fields do the giver and the receiver use to reconcile, and in which format (for example ISO 20022 colr messages)? | The report states each asset's price, haircut and value after haircuts, and whether the repo is covered. | open | |
| TPP-4 | The giver's free collateral is reported to both parties. Is the giver's unallocated inventory shown to the receiver? | The giver's free collateral is reported to both parties. | open | |
| TPP-5 | The agent reports on request in the prototype. How often and at which cut-offs do agents report? | The agent reports on request. | open | |

## CCP (GMRA repo cleared by BANK-C)

### `task-sme-ccp-membership`: CCP membership, the rulebook and the default fund

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| CCM-1 | The rulebook is one document with a bilateral membership agreement per member under it. Do CCP repo services document membership as a rulebook plus a clearing membership agreement per member, and which terms sit in each? | The rulebook is one document with a bilateral membership agreement per member under it. | open | |
| CCM-2 | The initial margin is a flat 5% of each cleared repo's cash amount. How do repo CCPs set initial margin (per security class, VaR or SPAN-type models), and is it per trade or per portfolio? | The initial margin is a flat 5% of each cleared repo's cash amount. | open | |
| CCM-3 | The default fund is fixed in the rulebook (1,000,000 split equally). How are default fund contributions sized and resized, and how often? | The default fund is fixed in the rulebook at 1,000,000, split equally among the members. | open | |
| CCM-4 | The CCP's own capital (skin in the game) is paid in once, when the rulebook is published. Where does the CCP's capital sit in the default waterfall, and is it held with the default fund? | The CCP's own capital (250,000) is paid in once, when the rulebook is published. | open | |
| CCM-5 | The rulebook is in effect once every named member has paid, and stays in effect when a member leaves. What are the CCP's admission conditions, and is the service suspended when a member's contribution falls short? | The rulebook is in effect once every named member has paid, and stays in effect when a member leaves. | open | |
| CCM-6 | A member that clears no repo may leave and get its contribution back at once. What notice period and conditions apply to a member's resignation and the return of its contribution? | A member that clears no repo may leave and get its contribution back at once. | open | |

### `task-sme-ccp-clearing`: clearing a bilateral repo by novation to the CCP

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| CCC-1 | The repo is submitted after both parties affirm it and before the purchase settles. Do repo CCPs accept trades for clearing before the start leg settles, after it, or both (for example forward-starting repos)? | The repo is submitted after both parties affirm it and before the purchase settles. | open | |
| CCC-2 | The seller submits and the buyer affirms the submission. Do both members submit, does a trading venue or matching service submit, or does one party give up the trade? | The seller submits the repo and the buyer affirms the submission. | open | |
| CCC-3 | The CCP checks only that both are paid members and the security is eligible. Which further checks does a CCP make at acceptance (credit limits, initial margin posted first, settlement eligibility)? | The CCP checks only that both are paid members and the security is eligible. | open | |
| CCC-4 | The purchase and the repurchase settle in one transaction between the members, the CCP netting to zero. Do CCPs settle each leg against the CCP's own accounts, or net members' obligations and settle once per day? | The purchase and the repurchase each settle in one transaction between the members, the CCP netting to zero. | open | |
| CCC-5 | A refused repo stays bilateral and may be submitted again. What happens to a trade the CCP rejects under the members' agreements? | A refused repo stays bilateral and may be submitted again. | open | |

### `task-sme-ccp-margin`: the CCP's daily variation margin and initial margin

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| CVM-1 | BANK-C issues one round per business date when it chooses, and the members pay that day. Do repo CCPs also call intraday, and what is the payment deadline? | BANK-C issues one round per business date when it chooses, and the members pay that day. | open | |
| CVM-2 | Variation margin is GMRA Transaction Exposure at the repo's Margin Ratio. Do repo CCPs margin the exposure with the haircut, or the mark-to-market without it, and do they pay price alignment interest on variation margin? | Variation margin is the GMRA Transaction Exposure at the repo's Margin Ratio. | open | |
| CVM-3 | Initial margin is a flat 5% of the Purchase Prices of a member's open cleared repos. Which initial margin models do repo CCPs use (VaR, haircut schedules), and on which base? | Initial margin is a flat 5% of the Purchase Prices of a member's open cleared repos. | open | |
| CVM-4 | Each member pays or receives one net amount of variation and initial margin per round, in tUSD. Do CCPs net the two, or settle them separately, for example variation margin in cash and initial margin in securities? | Each member pays or receives one net amount of variation and initial margin per round, in tUSD. | open | |
| CVM-5 | Variation margin passes to the other member only when the round settles, after every member that owes has paid. How do CCPs pay variation margin out, and what happens when a member does not pay on time? | Variation margin passes to the other member only when the round settles, after every member that owes has paid. | open | |

### `task-sme-ccp-default`: the CCP's management of a member default and its waterfall

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| CDF-1 | BANK-C closes out all the defaulter's cleared repos at once at the feed price on its business date. Do repo CCPs instead hedge and auction the defaulter's positions over several days, and how is the close-out price set? | BANK-C closes out all the defaulter's cleared repos at once at the feed price on its business date. | open | |
| CDF-2 | The loss is covered by the defaulter's initial margin, its default fund contribution, the CCP's capital, then the other members' contributions pro rata. Is this order standard for repo CCPs, how much capital does a CCP put in before the members' contributions, and do the rulebooks also give an assessment power? | The loss is covered by the defaulter's initial margin, then its default fund contribution, the CCP's capital, then the other members' contributions pro rata. | open | |
| CDF-3 | The survivors' repos are closed out: each survivor keeps the securities or cash it holds and the residual is settled in cash. Do CCPs close the survivors' positions out, or keep them open and give them a new counterparty through the auction? | The survivors' repos are closed out: each survivor keeps the securities or cash it holds and the residual is settled in cash. | open | |
| CDF-4 | What is left of the defaulter's margin and contribution is paid to it at once. When and to whom is a defaulter's surplus returned (an insolvency practitioner, after the default management period)? | What is left of the defaulter's margin and contribution is paid to it at once. | open | |
| CDF-5 | The defaulter may rejoin at once by paying its share again. What process do CCPs apply to a member after its default, and when may it clear again? | The defaulter may rejoin at once by paying its share again. | open | |

### `task-sme-ccp-porting`: the admission of a member and the porting of a cleared repo

| ID | Question | Interim decision | Status | Answer |
|----|----------|------------------|--------|--------|
| CPT-1 | BANK-C admits a member to its rulebook in effect with a separate admission document, and the rulebook is unchanged. How do CCPs admit a member (an accession agreement, an amendment of the rulebook), and which checks come first? | BANK-C admits a member to its rulebook in effect with a separate admission document, and the rulebook is unchanged. | open | |
| CPT-2 | A member moves its leg of a cleared repo to another member when the two agree and the CCP approves. Do repo CCPs allow such member-to-member transfers, or is porting used only for client positions when a clearing member defaults? | A member moves its leg of a cleared repo to another member when the two agree and the CCP approves. | open | |
| CPT-3 | The receiving member pays the leaving member the leg's value at the feed price, with the variation margin paid. How is a transferred position priced and paid for: at market, at the original terms, or with no payment between the members? | The receiving member pays the leaving member the leg's value at the feed price; the variation margin already paid stays with the repo. | open | |
| CPT-4 | The variation margin paid stays with the repo, and the initial margin does not move: the next round calls the receiving member's and returns the leaving member's. Is margin transferred with a ported position? | The variation margin paid stays with the repo and the initial margin does not move; the next round calls the receiving member's and returns the leaving member's. | open | |
| CPT-5 | Either the receiving member or the CCP may refuse, and a leg may be ported only once. What criteria does a CCP apply to accept a transfer, and are repeated transfers limited? | Either the receiving member or the CCP may refuse, and a leg may be ported only once. | open | |
