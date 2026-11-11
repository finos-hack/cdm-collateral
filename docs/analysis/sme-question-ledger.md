# SME question ledger

Every question to revisit with a business subject-matter expert (SME), one row per question. Each section is one
konspekt task, which holds the question's context and the project owner's interim decision. Add a row whenever a task
records a new assumption or question for an SME; set **Status** to `answered` and fill **Answer** when an SME replies.

Status of the ledger: 105 questions in 20 tasks, all open.

## Variation and initial margin rules

### `task-sme-enforcement-event-definition`: what an Enforcement Event is under the IM Security Agreement

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| ENF-1 | With no elections, is the Enforcement Event an Early Termination Date reached, or does a continuing Event of Default suffice? | open | |
| ENF-2 | What does `earlyTerminationDate = False` remove: the trigger, or a distinction between designated and deemed Early Termination Dates? | open | |
| ENF-3 | Does `failureToPay` mean the ISDA MA Section 5(a)(i) Event of Default from the notice, a failure under the security agreement itself, or something with its own grace period? | open | |
| ENF-4 | Under Automatic Early Termination no notice is given, but the model's `DefaultNotice` needs a notice date. How is that handled? | open | |
| ENF-5 | Are Specified Conditions (Termination Events treated as defaults) Enforcement Events? | open | |

### `task-sme-registered-asset-completion`: what completes settlement and enforcement of registered and claim-based tokens

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| REG-1 | For a Registered asset, is a pledge or title transfer complete at the on-chain transfer, or when the transfer agent updates the register? Is the on-chain transfer an instruction to the register or evidence of it? | open | |
| REG-2 | For a Claim asset, what must the intermediary confirm, and does the token holder have a proprietary claim or only a contractual one? | open | |
| REG-3 | What gives the secured party control for each record type (for example UCC Articles 8, 9 and 12, or the English law equivalent), and is the escrow contract enough? | open | |
| REG-4 | On enforcement, who must act for each record type, and can the secured party enforce without the record keeper? | open | |
| REG-5 | If the chain and the register disagree, which prevails, and how is the difference resolved? | open | |

### `task-sme-two-way-im-rules`: two-way initial margin and the pledgor's reclaim on default

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| IM2-1 | Which paragraph of the 2018 NY law IM CSA, and of the control agreement with the custodian, gives the pledgor its collateral back when the secured party is the Defaulting Party? Is it the Pledgor's Rights and Remedies paragraph? | open | |
| IM2-2 | The prototype lets the pledgor reclaim as soon as the oracle feed records the secured party's default. Does it need a notice, a waiting period, or a designated Early Termination Date first? | open | |
| IM2-3 | The prototype returns the whole leg at once. Can the custodian hold back part of it, for example for amounts the pledgor owes on the other leg, or does segregation forbid that? | open | |
| IM2-4 | The non-defaulting party enforces or closes out the defaulting party's leg and reclaims its own in separate steps. Is any order between them required? | open | |
| IM2-5 | In one IM CSA with both parties posting, is each party's Substitution election, Minimum Transfer Amount and eligibility schedule stated per party (Party1, Party2) as the prototype assumes? | open | |

### `task-revaluation-top-up-modelling`: how a revaluation shortfall is called

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| TOP-1 | Is a revaluation shortfall called by an ordinary IM margin call (the interim basis), or by a dedicated top-up call with its own CDM representation and on-chain record? | open | |

## Call lifecycle and settlement

### `task-sme-call-cancellation-rules`: cancelling a margin call

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| CAN-1 | Can the calling party withdraw an unanswered call alone? Is there a cut-off (for example the Notification Time, or once the called party has started to process the call)? | open | |
| CAN-2 | Once a call is agreed, partly agreed or disputed, does cancellation need the other party's acceptance? Can either party request it? What happens to a request neither accepted nor refused? | open | |
| CAN-3 | Can a call be cancelled while a proposal is pending, or after it is accepted but before settlement? Is the proposal then void, or must it be rejected or withdrawn first? Does the answer change once settlement instructions have been sent? | open | |
| CAN-4 | Is cancellation the right way to close a call disputed in full, or is it closed by the dispute resolution (Paragraph 5) and a new call? | open | |
| CAN-5 | Is a cancelled call usually replaced by a new call, and should the new call refer to the one it replaces? | open | |
| CAN-6 | Is a reason required for a cancellation or a refusal, and is there a standard list (ISO 20022 colr.005 and colr.006 reason codes)? | open | |
| CAN-7 | Is a settled call ever cancelled, or is the only way back a return call? | open | |

### `task-sme-settlement-netting-rules`: settlement netting of collateral movements

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| NET-1 | When do a VM delivery and a VM return between the same parties fall due on the same day, and should they net? | open | |
| NET-2 | Does `netInterestWithMarginCalls` cover netting an Interest Amount with a delivery and with a return? Does `netPostedAndHeldInterest` belong in the same netting? | open | |
| NET-3 | Is it enough that the party owing the net pays it, or do both parties first agree a netting statement (as under ISDA Master Agreement Section 2(c))? | open | |
| NET-4 | Only cash nets in the prototype. Do deliveries and returns of the same security net in practice? | open | |
| NET-5 | Which settlement date and cut-off define the movements that net together? | open | |
| NET-6 | Confirm that initial margin, segregated with a custodian, never nets with variation margin or interest. | open | |

### `task-sme-interest-daily-balances`: daily cash balances and rates of an Interest Period

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| INT-1 | Which balance counts for a day: the cash held at the end of the day, at a cut-off time, or the settled balance only? How are transfers in flight treated? | open | |
| INT-2 | Which rate applies on a non-business day, and on which day is the rate observed (same day, or with a lookback)? | open | |
| INT-3 | Who supplies the balances and rates for the statement, and can the pledgor dispute them? | open | |
| INT-4 | For tokenized cash on a ledger, does the on-chain balance at the end of a calendar day (by block time) serve as the day's balance? | open | |

## Allocation and reconciliation

### `task-sme-allocation-ranking`: ranking and rules for collateral allocation

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| ALR-1 | Which default ranking do pledgors use in practice: lowest haircut first, highest haircut first, funding cost, or another cheapest-to-deliver measure? | open | |
| ALR-2 | The last asset is rounded up to whole units. Is overshooting by less than one unit's value acceptable, or is a minimum transfer or rounding amount from the CSA applied? | open | |
| ALR-3 | Should a suggestion respect the schedule's concentration limits against the collateral already held? | open | |
| ALR-4 | Suggestions cover new IM and VM calls only. Does allocation apply to substitution or to returns chosen by the secured party? | open | |
| ALR-5 | The registry order puts tUSD (cash) last. Should cash come first, last, or be excluded from suggestions unless the pledgor ranks it? | open | |

### `task-sme-allocation-concentration`: concentration limits on a suggested basket

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| ALC-1 | Which concentration limits does a CSA eligibility schedule carry in practice: a share of the total collateral per asset, per issuer, per asset class, or an absolute amount? | open | |
| ALC-2 | Is a limit tested against the collateral already held plus the new basket, against the agreed amount of the call, or against the total credit support amount? | open | |
| ALC-3 | Is the limit applied to market value or to value after haircuts? | open | |
| ALC-4 | When the ranked inventory would breach a limit, does the allocation skip to the next asset, cap the asset at the limit, or reject the suggestion? Is an existing breach corrected by the next call? | open | |

### `task-sme-reconciliation-rules`: matching rules, tolerances and cadence for portfolio reconciliation

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| REC-1 | Which fields must match for a trade to reconcile, beyond product, notional and currency, dates, fixed rate, floating index, and payer and receiver? | open | |
| REC-2 | What difference in a trade's valuation counts as a break: an absolute amount, a percentage of the larger valuation, or both? Is the tolerance set per trade, per portfolio, or in the CSA? | open | |
| REC-3 | How often do counterparties reconcile in practice, and should the prototype reconcile on request only or on a schedule? | open | |
| REC-4 | Which breaks justify disputing a call? Is a dispute raised only when answering a call, or also against a call already agreed? | open | |
| REC-5 | Must both snapshots share one as-of time, and what happens when one party's snapshot is late? | open | |

## Repo under the GMRA

### `task-sme-repo-margin-exposure`: GMRA exposure and Net Margin rules

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| RPM-1 | Is Transaction Exposure the Repurchase Price accrued to the date times the Margin Ratio, less the market value of the securities? (Written from model memory of the GMRA; not checked against agreement text.) | open | |
| RPM-2 | Is Net Exposure the sum of the Transaction Exposures across the pair's repos in both directions, less the net margin held? | open | |
| RPM-3 | Interest on Cash Margin uses ACT/360 and one rate for the whole period, because `NetMarginInterest` has no day count attribute. Is that acceptable? | open | |

### `task-sme-repo-live-spec-returns`: returning amounts in a live spec

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| RLS-1 | The live spec `flow-repo-purchase-repurchase` leaves the 875 tUSD Price Differential with the buyer on every run. Should a live spec also return such amounts itself? | open | |

### `task-sme-repo-reprice-rules`: repricing a repo under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| RPR-1 | The prototype settles the Price Differential accrued to the reprice date in the cash difference. Is it settled then, or carried to the final Repurchase Price? | open | |
| RPR-2 | Is the new Purchase Price the market value of the securities divided by the Margin Ratio? | open | |
| RPR-3 | The prototype reprices every open repo of the pair, one settlement each. Does paragraph 4(i)(i) require all repos, and must they settle together? | open | |
| RPR-4 | The prototype offers a reprice under the same minimum transfer amount as a margin call. Does the minimum apply to a reprice? | open | |
| RPR-5 | Is a reprice agreed in place of a margin call, or is it a way of satisfying a call already made? | open | |
| RPR-6 | The prototype sets each repriced Transaction Exposure to about zero and leaves Net Margin already held unchanged, so after a reprice the other party can call that margin back. Should a reprice take the margin held into account? | open | |

### `task-sme-repo-adjustment-rules`: adjusting a repo under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| RAD-1 | The prototype has the Seller pay the Price Differential accrued to the adjustment date in cash. Is it settled then, carried to the final Repurchase Price, or added to the new Purchase Price? | open | |
| RAD-2 | Is the new quantity the Purchase Price times the Margin Ratio divided by the price, rounded up to whole units? | open | |
| RAD-3 | The prototype adjusts every open repo of the pair, one settlement each. Does paragraph 4(i)(ii) require all repos, and must they settle together? | open | |
| RAD-4 | The prototype offers an adjustment under the same minimum transfer amount as a margin call. Does the minimum apply to an adjustment? | open | |
| RAD-5 | Is an adjustment agreed in place of a margin call, or is it a way of satisfying a call already made? | open | |
| RAD-6 | The prototype leaves Net Margin held unchanged, so after an adjustment the other party can call that margin back. Should an adjustment take the margin held into account? | open | |

### `task-sme-repo-substitution-rules`: substituting repo securities under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| SUB-1 | Must the substitute's Market Value be at least that of the securities it replaces, on the substitution date, with quantity rounded up to whole units? | open | |
| SUB-2 | The prototype accepts any security with a feed price and relies on the Buyer's agreement. Does the GMRA or Annex I limit which securities may be substituted? | open | |
| SUB-3 | The prototype replaces all the securities of one repo. Is a partial substitution in scope? | open | |
| SUB-4 | The prototype moves no cash and keeps the Repurchase Price. Is that correct under paragraph 8? | open | |
| SUB-5 | May the Buyer refuse a substitution without a reason? | open | |
| SUB-6 | A rounded-up substitute may leave a small excess with the Buyer, and later price moves follow the new security. Is any margin step required at the substitution? | open | |

### `task-sme-repo-income-rules`: interim interest and manufactured income under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| INC-1 | The prototype pays the whole Price Differential accrued to the date, less earlier interim payments, and reduces the Repurchase Price by it. Is that correct, and are partial payments needed? | open | |
| INC-2 | The prototype lets the Seller start an interim payment and needs the Buyer's agreement. Can either party demand it? | open | |
| INC-3 | The prototype computes income per unit times the quantity, rounded to whole tUSD. Is it the amount paid by the issuer on the securities held, and is withholding tax taken into account? | open | |
| INC-4 | The prototype pays when the parties agree, with the income date as a stated field. Must payment be on the income date, and who holds the securities on the record date? | open | |
| INC-5 | Under paragraph 5, may income be set off against other amounts, or applied to reduce the Repurchase Price or the exposure? | open | |
| INC-6 | CDM's on-demand rate change is not built. Is an agreed change of the repo rate needed? | open | |

### `task-sme-repo-roll-rules`: a repo roll under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| ROL-1 | The prototype has the Seller pay the Price Differential on the roll date and keeps the Purchase Price. Is that correct, or is the interest added to the new Purchase Price, or the Transaction reset to the market value? | open | |
| ROL-2 | The prototype rolls only on the Repurchase Date. Can a Transaction be rolled earlier, or after a missed date? | open | |
| ROL-3 | The prototype keeps the securities and does not revalue them at the roll. Must the rolled Transaction be priced or margined again at the roll? | open | |
| ROL-4 | The proposing party enters the new repo rate and the other party agrees to it. Is there any constraint on the rate? | open | |
| ROL-5 | After a refusal the repo stays due for repurchase on the same date. Is any other consequence intended? | open | |
| ROL-6 | A settled repurchase clears a pending roll, and a repurchase instruction stops a roll from settling. Is that the right precedence? | open | |
| ROL-7 | CDM closes the trade and opens another with the same identifier. Under the GMRA, is a roll a new Transaction needing its own Confirmation? | open | |

### `task-sme-repo-pair-off-rules`: a repo pair-off under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| POF-1 | The prototype pairs off two repos only when they are between the same parties in opposite directions, with the same security, quantity, cash currency and Repurchase Date. Which of these must match in practice, and is a pair-off of repos with different Repurchase Dates possible? | open | |
| POF-2 | Only equal quantities pair off. Is a partial pair-off (the difference delivered) common, and how is the residual treated? | open | |
| POF-3 | The prototype nets the repurchase legs on the common Repurchase Date. Is pairing off the purchase legs (the repos never start) also in scope? | open | |
| POF-4 | The net cash is the difference of the two Repurchase Prices, paid by the Seller of the repo with the higher one. Are interim interest, income or margin also netted into it? | open | |
| POF-5 | Either party proposes and the other agrees or refuses. Is a pair-off agreed bilaterally like this, or instructed through a settlement system? | open | |
| POF-6 | The paired repos leave the pair's Net Exposure on settlement. Must the margin held be adjusted at the same time? | open | |
| POF-7 | CDM keeps both trades and adds a package reference; the prototype then marks both repurchased. Under the GMRA, are the two Transactions terminated, or settled by netting? | open | |

### `task-sme-repo-buy-sell-back-rules`: a buy/sell-back under the GMRA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| BSB-1 | The income lowers the sell-back price by the income amount plus interest at the repo rate (ACT/360) from the income date to the Repurchase Date. Is that the GMRA Buy/Sell Back Annex formula, and which rate applies? | open | |
| BSB-2 | The deduction is fixed when the Seller agrees it, to the Repurchase Date of that time. Is it recomputed if the Transaction is later repriced or adjusted? | open | |
| BSB-3 | The Buyer enters the income per unit and date and the Seller agrees. Is that how the income is agreed in practice? | open | |
| BSB-4 | A buy/sell-back's Transaction Exposure uses the accrued Repurchase Price less the full deduction. Should the interest part of the deduction accrue to the valuation date instead? | open | |
| BSB-5 | Margin maintenance, repricing, adjustment, substitution, roll and pair-off apply as for a repo; interim interest does not. Is that right for a buy/sell-back under the Annex, and for an undocumented one? | open | |
| BSB-6 | At a roll the Seller pays the Price Differential less the deduction, the Buyer pays any excess, and the deduction resets. Is that correct? | open | |
| BSB-7 | Only two trades of the same type pair off. Can a repo and a buy/sell-back be paired off? | open | |
| BSB-8 | The tokenized securities accrue no coupon, so the prototype quotes no accrued interest in the purchase and sell-back prices. For coupon securities, how are the clean price and accrued interest stated? | open | |

### `task-sme-repo-default-close-out-rules`: a GMRA default and close-out

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| DCO-1 | Each Transaction enters as the Repurchase Price accrued to the Early Termination Date, owed by the Seller, against the Default Market Value of the Equivalent Securities, owed by the Buyer. Is that paragraph 10(c)? | open | |
| DCO-2 | The prototype uses one market price at the Default Valuation Time. Under paragraph 10(e) the non-defaulting party may use the net proceeds of a sale or purchase, or quotations. Which method applies when? | open | |
| DCO-3 | The elections hold a Default Valuation Time and a business day calendar. Which day: the Early Termination Date, or a number of dealing days after it? | open | |
| DCO-4 | The oracle records a default without its kind, and with automatic early termination elected every default terminates without notice. Should only an Act of Insolvency do so? | open | |
| DCO-5 | Cash Margin is owed back at its amount and Margin Securities at their Default Market Value. Is accrued Net Margin interest also included? | open | |
| DCO-6 | Agreed income that was due and not paid enters the balance. Does interest on it apply? | open | |
| DCO-7 | A buy/sell-back enters at its Repurchase Price less the income deduction. Is that right under the Buy/Sell Back Annex when the income date falls after the Early Termination Date? | open | |
| DCO-8 | The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. Which apply? | open | |
