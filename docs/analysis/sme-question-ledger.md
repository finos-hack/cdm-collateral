# SME question ledger

Every question to revisit with a business subject-matter expert (SME), one row per question. Each section is one
konspekt task, which holds the question's context and the project owner's interim decision. Add a row whenever a task
records a new assumption or question for an SME; set **Status** to `answered` and fill **Answer** when an SME replies.

Status of the ledger: 178 questions in 31 tasks, all open.

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
| DCO-9 | The close-out ends only Transactions whose purchase has settled; one booked and affirmed but not yet purchased stays open. Does the Event of Default terminate it too, and with what value? | open | |

## Securities lending under the GMSLA

### `task-sme-gmsla-terms-baseline`: the baseline GMSLA elections and their amendment

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| GST-1 | CDM's GMSLA elections hold one notification time. Which notices does it govern under GMSLA 2010 (margin calls, recall notices, both), and is 10:00 London a usual baseline? | open | |
| GST-2 | GMSLA 2010 has no standard minimum transfer amount. Is a per-party minimum transfer amount in the Schedule usual, and does it apply to the aggregated mark under paragraph 5.4? | open | |
| GST-3 | The prototype's agreement carries a default margin of 102% for loans that state none. Is margin always agreed per loan, or is an agreement-level default usual? | open | |
| GST-4 | The baseline has automatic early termination not applicable for both parties. Is that usual for an English law GMSLA 2010 between two banks? | open | |
| GST-5 | The baseline applies netting of deliveries (paragraph 5.6) and the failure-to-redeliver indemnity (paragraph 6.4). Are these the usual elections? | open | |
| GST-6 | An agreed amendment of the elections takes effect on its effective date. Does it apply to loans already outstanding, or only to new loans? | open | |

### `task-sme-gmsla-loan-delivery-return-rules`: securities loan delivery and return under the GMSLA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| LDR-1 | The initial collateral is the Market Value of the Loaned Securities at the booking date's price times the loan's margin, rounded up. Is that the Required Collateral Value under GMSLA 2010, and is it priced on the trade date or the settlement date? | open | |
| LDR-2 | On a partial return the lender redelivers collateral in proportion to the quantity returned, in the same settlement. Is that usual, or is the excess collateral returned only through the next mark? | open | |
| LDR-3 | Open loans may be returned on any business day, and the prototype settles a return when both parties instruct it. What notice of return does the borrower give, and what is the standard settlement period? | open | |
| LDR-4 | A cash-collateral loan states a rebate rate, and a loan against securities states a fee rate, both fixed at booking. Are both agreed per loan, and can a rate change during the loan? | open | |
| LDR-5 | Collateral passes to the lender by outright title transfer, as under GMSLA 2010. Should the prototype also support the GMSLA 2018 security interest (pledge) variant? | open | |
| LDR-6 | A full return is qualified as a full return and not as a termination. Is the end of a loan by full return treated differently from its early termination (for example on recall or default)? | open | |

### `task-sme-gmsla-marking-rules`: marking securities loans under the GMSLA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| MRK-1 | Loans are marked together per pair (GMSLA paragraph 5.4): each party's requirement as lender less the collateral it holds, the two directions netted to one figure. Is that how aggregated marking is computed, and is margin from earlier calls netted in the same figure? | open | |
| MRK-2 | Either party may call: a lender short of collateral calls for more, and a borrower over-collateralised calls for the excess back. Is that usual, and is the call made by notice to the other party? | open | |
| MRK-3 | A call is made only when the net figure exceeds the calling party's minimum transfer amount. Does the GMSLA minimum transfer amount apply this way, and is there also a rounding of the amount called? | open | |
| MRK-4 | Collateral is valued at its market price without a haircut, the loan's margin being the buffer. Is a haircut on non-cash collateral applied as well under GMSLA 2010? | open | |
| MRK-5 | The margin delivered on a call stays with the pair and is netted at the next mark; a return of a loan redelivers only that loan's own collateral. Is margin attributed to individual loans in practice? | open | |
| MRK-6 | Prices are the feed prices on the business date, and a call settles by the next business day. What are the usual valuation time and settlement period for a margin call under the GMSLA? | open | |

### `task-sme-gmsla-recall-rules`: recalling loaned securities under the GMSLA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| RCL-1 | The lender recalls all or part of a loan by notice, and the borrower must return the securities by the end of the standard settlement time for them. Is two business days after the notice the right date for the prototype's securities, and is the notice date the day the notice is given or the next business day after a cut-off time? | open | |
| RCL-2 | A recall is recorded as a notice and does not change the loan; the loan ends only when the securities are returned. Is that how a recall works under GMSLA 2010, or does the notice itself terminate the loan for the recalled quantity? | open | |
| RCL-3 | The lender may withdraw a recall before the securities are returned. Is a withdrawal usual, and does it need the borrower's agreement? | open | |
| RCL-4 | When the borrower misses the date, the prototype only shows the recall as overdue. What may the lender do, and from when: a buy-in, a default notice, or both (row 19)? | open | |
| RCL-5 | The collateral stays with the lender until the return, which redelivers it in proportion. Is that right, or is collateral released when the recall is made? | open | |
| RCL-6 | A borrower's own return of part of a recalled loan reduces the quantity still recalled. Is that how a partial return during a recall is treated? | open | |

### `task-sme-gmsla-substitution-rules`: substituting non-cash collateral of a loan under the GMSLA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| LSB-1 | The borrower may substitute the collateral of a loan with alternative collateral acceptable to the lender. Under GMSLA 2010, is the lender's agreement needed for each substitution, or only that the substitute be eligible under the agreed collateral schedule? | open | |
| LSB-2 | The substitute must be worth at least the loan's required collateral (the loaned value times the margin) at the substitution date's prices. Is that the right test, or must it equal the value of the collateral it replaces? | open | |
| LSB-3 | The substitute and the original collateral move in one transaction. In practice, must the borrower deliver the substitute first, with the lender returning the original afterwards, and by when? | open | |
| LSB-4 | A substitution replaces all the collateral of one loan. Are partial substitutions, giving a loan with mixed collateral, usual under the GMSLA? | open | |
| LSB-5 | The loan's fee is unchanged by a substitution. Is the fee repriced when the collateral changes, for example to a lower-grade security? | open | |
| LSB-6 | A substitution is allowed while a recall is pending. Is that right, or does a recall freeze the collateral until the return? | open | |

### `task-sme-gmsla-rebate-rules`: billing and paying the rebate on cash collateral under the GMSLA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| RBT-1 | The rebate is billed from the last billed date to the business date, at any time the borrower chooses. Under GMSLA 2010 practice, is the rebate settled monthly, and on which day (e.g. the first business days of the next month)? | open | |
| RBT-2 | The rebate accrues daily on the cash collateral actually held, ACT/360, the start day counted and the end day not. Is that the usual accrual convention for a USD cash rebate? | open | |
| RBT-3 | The borrower issues the invoice and the lender pays on agreement. In practice, who issues the rebate statement, and how is a disputed amount handled? | open | |
| RBT-4 | The invoice total is the sum of the daily accruals per sub-period, rounded half-up once (to whole tUSD in the prototype, whose cash token has no decimals). Is rounding per invoice the usual practice, or per day? | open | |
| RBT-5 | Negative rebate rates are refused. Are negative rebates (the borrower pays) used for USD cash collateral, and should the prototype support them? | open | |
| RBT-6 | A returned loan can still be billed for the period up to its return date. Is the final rebate usually settled with the return, or billed with the next periodic statement? | open | |

### `task-sme-gmsla-fee-rules`: billing and paying the lending fee under the GMSLA

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| FEE-1 | The lending fee accrues on the market value of the loaned securities, without the margin. CDM's billing function charges it on the market value times the margin (the collateral requirement). Under GMSLA 2010 practice, is the fee charged on the loan value or on the collateral value? | open | |
| FEE-2 | The prototype values the loaned securities at one price per invoice, the feed price on the billing date, because its feed keeps no history. In practice, is the fee accrued daily on each day's market value, and which price source and time are used? | open | |
| FEE-3 | The fee accrues ACT/360, the start day counted and the end day not, at a fixed rate agreed at booking. Is that the usual convention for a USD-denominated lending fee, and are fee rates renegotiated during an open loan? | open | |
| FEE-4 | The lender issues the fee invoice and the borrower pays on agreement, in USD cash. In practice, who issues the fee statement, how often, and how is a disputed amount handled? | open | |
| FEE-5 | A substitution of the collateral does not change the fee. Is that right, or does the fee depend on the type of collateral held? | open | |
| FEE-6 | A returned loan can still be billed for the period up to its return date. Is the final fee usually settled with the return, or billed with the next periodic statement? | open | |

### `task-sme-gmsla-default-rules`: a GMSLA default and close-out

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| DFL-1 | Each loan enters as the Default Market Value of the Equivalent Securities, owed to the lender, against the value of the Equivalent Collateral the lender holds, owed to the borrower. Is that GMSLA 2010 paragraph 11, and is cash collateral owed back at its amount? | open | |
| DFL-2 | The prototype values securities at one oracle price on the Early Termination Date. Under paragraph 11 the non-defaulting party may use the proceeds of a sale or purchase, or quotations, at the Default Valuation Time. Which method applies when, and on which day? | open | |
| DFL-3 | The fee or rebate accrued from the billed-through date to the Early Termination Date, and any invoice still unpaid, enter the balance. Is that right, and does interest run on unpaid amounts? | open | |
| DFL-4 | Margin held under the pair's GMSLA calls is set off at its value, cash at par and securities at their Default Market Value. With aggregated marking, is that margin treated as collateral of all the loans? | open | |
| DFL-5 | Automatic early termination follows the defaulting party's election, and the oracle does not record the kind of default. Should only an Act of Insolvency terminate without notice? | open | |
| DFL-6 | Loans booked and affirmed but not delivered stay open after the close-out. Does the Event of Default terminate them too, and at what value? | open | |
| DFL-7 | A returned loan with a period not yet billed is not in the close-out and can still be billed. Should its unpaid rate enter the balance? | open | |
| DFL-8 | The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. Which apply under paragraph 11? | open | |
| DFL-9 | The GMSLA and GMRA close-outs between the same pair are separate statements. Is cross-agreement set-off (for example under a master netting agreement) expected? | open | |

## Triparty repo

### `task-sme-triparty-terms-profile`: the triparty terms and the collateral profile

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| TPT-1 | A triparty repo has a triparty agreement between the giver, the receiver and the agent, beside the GMRA between the giver and the receiver. Which terms does the triparty agreement hold that the prototype's terms leave out (the agent's fees, its liability, the cut-off times, the accounts)? | open | |
| TPT-2 | The prototype's profile reuses the CSA schedule: US Treasuries at a 2% haircut and agency debt at 3%. Is that a usual triparty repo profile, or do agents' profiles usually state margin as a ratio per asset class? | open | |
| TPT-3 | The profile limits agency debt to 50% of the allocated value after haircuts. Are concentration limits in triparty profiles usually per asset class, per issuer, or both, and measured before or after haircuts? | open | |
| TPT-4 | Either the giver or the receiver may propose the terms, and the agent affirms them. Is the agent a party to the triparty agreement that consents to its terms, or only its operator? | open | |
| TPT-5 | The terms are set once and only terminated, not amended. How are changes to a profile agreed in practice, and do they apply to repos already allocated? | open | |
| TPT-6 | The giver or the receiver can terminate the triparty terms while nothing is allocated. What notice does termination take, and can the agent terminate? | open | |

### `task-sme-triparty-trade-start`: the triparty allocation and the purchase through the agent

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| TPS-1 | The profile's haircuts take the place of the GMRA margin ratio: the allocated value after haircuts covers the Purchase Price. Is that how triparty repo margin is applied, or is a margin ratio applied on top of the haircuts? | open | |
| TPS-2 | The agent allocates in the giver's own ranking of its assets. Do agents allocate in the giver's ranking, by their own optimisation (cheapest to deliver), or by a rule in the triparty agreement? | open | |
| TPS-3 | A concentration limit is measured as a share of the Purchase Price the allocation covers. Do agents measure limits against the exposure, the total allocated value, or the giver's whole allocation across repos? | open | |
| TPS-4 | When the giver's deposit cannot cover the Purchase Price within the profile, the agent allocates nothing. Do agents allocate partially and report a shortfall, or hold the trade unsettled? | open | |
| TPS-5 | The allocated collateral stays in the agent's books in an account per repo, held by the receiver by title. Is the receiver's account at the agent per repo, or one account per giver and receiver? | open | |
| TPS-6 | The receiver affirms the agent's allocation before the purchase settles. Does the receiver confirm allocations in practice, or is the agent's allocation binding on both parties? | open | |
| TPS-7 | The agent values the collateral at the oracle feed price. Which price sources and times do agents use for the allocation? | open | |

### `task-sme-triparty-revaluation`: the triparty agent's daily revaluation, top-up and release

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| TPR-1 | The agent's required value is the Purchase Price plus the repo interest accrued to the day. Do agents use the accrued Repurchase Price, the Purchase Price, or a value the parties report (the "exposure")? | open | |
| TPR-2 | There is no threshold: any shortfall is topped up and any excess released. Do agents apply a minimum movement, a tolerance band, or a percentage of the exposure? | open | |
| TPR-3 | A top-up comes from the giver's free collateral in the giver's ranking. Do agents top up by the same rule as the initial allocation, or by a separate one? | open | |
| TPR-4 | An excess is released from the asset the giver ranked last. Do agents release from a particular asset, pro rata, or by the giver's instruction? | open | |
| TPR-5 | When the giver's free collateral cannot cover a shortfall, nothing moves and the shortfall is recorded. Do agents move what they can, notify the parties, or treat it as a margin call between them? | open | |
| TPR-6 | A concentration breach caused by price moves alone is recorded and left to substitution. Do agents rebalance during the daily revaluation? | open | |
| TPR-7 | The agent revalues on request in the prototype. When and how often do agents revalue, and at which prices (closing, intraday)? | open | |
| TPR-8 | The revaluation moves collateral without either party's affirmation. Is the agent's daily reallocation binding on both parties under the triparty agreement? | open | |
