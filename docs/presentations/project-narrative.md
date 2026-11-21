# CDM Collateral: how the project developed

This document tells the history of the project from 14 October to 4 November 2026. It is written from the konspekt
graph in `../../.konspekt/instance` (goals, tasks, decision records, notes, artifacts and the transitions log). Every claim
can be traced to a record there; record IDs are given in brackets where a reader may want to follow one up. The
records hold the detail and remain authoritative. This document gives the order of events and the reasons behind them.

## 1. Starting point

The repository began with a one-line purpose in its README: "a prototype of using CDM (rune dsl) as a data standard
in collateral management flows". The FINOS Common Domain Model (CDM) is the industry's machine-readable model of
trades, agreements and lifecycle events, written in the Rune DSL. The project's question was whether CDM can carry
the collateral workflow between two counterparties: margin calls, responses, proposals, settlement, return and
default.

From the first day the repository had a second role. It was set up as an adopter of the konspekt standard, so that
the project's goals, decisions and findings are recorded as a graph next to the code, and problems with the konspekt
setup kit are reported back to konspekt [`goal-test-konspekt-adoption`]. That is why the history can be reconstructed
here: almost every decision has a record with the date, the source of the human's acceptance and the reason.

On 15 October the project owner set four working goals under the root goal *App setup* [`node-app-setup`]:

- **Data: CDM, taxonomies, specs.** Establish the data foundation: CDM, the taxonomies that classify collateral data,
  and the standards that govern it.
- **Architecture design.** Design the system. Architecturally significant requirements (ASRs) and architecture
  decision records (ADRs) are attached to this goal.
- **End-to-end flow.** Make the parts connect into a working path, from a console action to an on-chain outcome.
- **Business case.** State the problem, who the project serves and what value justifies building it.

A fifth goal, *CDM development*, was added on 17 October, when the analysis showed that CDM itself would have to be
extended.

## 2. Analysis first: what CDM covers and what it does not

The first work was analysis, and it came before any design. The project owner approved a method on 15 October
[`task-cdm-current-state-analysis`]:

1. Build a reference map of collateral management capabilities independently of CDM: lifecycle capabilities against
   agreement families.
2. Score each cell on an evidence scale: 0 absent, 1 enumerations or descriptions only, 2 data types, 3 functions,
   4 business events or primitive instructions, 5 sample data or tests in the CDM repository.
3. Cite the file and the type or function at a pinned commit for every score.

The pinned source was CDM release 7.6.0, commit `f685b4b`. The first pass covered the ISDA credit support documents
(legacy CSA, VM CSA, IM CSA, Security Agreement). The resulting coverage matrix scored 20 capability rows and produced
the finding that determined the scope of the later work: **CDM defines margin call types, but no function, primitive
instruction or business event creates or processes a margin call, a response, a dispute, a transfer or a balance
update** (finding F2) [`artifact-cdm-csa-coverage-matrix`]. CDM describes the agreement terms and the eligibility of
collateral. It does not describe the workflow that moves collateral.

The same method was then applied to the other agreement families: repo (GMRA), securities lending (GMSLA), triparty
and CCP margin [`artifact-cdm-other-agreements-matrix`]. Coverage there was lower; CCP margin scored 0 to 2. Over the
next two days the analysis widened into four further inventories:

- a **conceptual model** of bilateral collateral management under the ISDA documents, with each box coloured by its
  CDM coverage score. No published model of this space was found, so the maintainer drew one
  [`artifact-collateral-conceptual-model`];
- **flow diagrams** for the other four families on the same layout [`artifact-collateral-flow-diagrams`];
- a **standards inventory** (ISO identifiers and codes, ISO 20022 `colr`, FpML collateral processes, legal
  documentation, regulation). Its main findings: CDM has no mapping to either collateral messaging standard (S1);
  DTI, FISN and other ISO identifiers are absent; the Financial Collateral Directive and SFTR are absent; and the ISDA
  Collateral Asset Definitions are cited at the 2003 edition [`artifact-collateral-standards-inventory`];
- a **taxonomy inventory**, which found that eligible collateral is classified by four taxonomies with no mapping
  between them (TX4), and that credit ratings in CDM have no scale or order, so a minimum-rating criterion cannot be
  evaluated (TX3) [`artifact-collateral-taxonomy-inventory`]. A mapping of 17 asset categories across the four
  taxonomies followed [`artifact-collateral-asset-taxonomy-mapping`].

Defects found along the way (D1 to D13: errors in CDM model content, sample data and documentation, each with file and
line) were collected in one register [`artifact-cdm-defects`]. The data goal was resolved on 16 October.

## 3. Where a ledger fits

The second analysis asked where blockchain and smart contracts apply to CDM-based collateral management
[`task-blockchain-smart-contracts-applicability`]. It drew on seven reference documents from ISDA, the Global Digital
Finance (GDF) and ISDA sandbox, and the Intelligence Economy Institute, later extended with DTCC's tokenization fact
sheet [`artifact-blockchain-applicability`]. Two facts from it determined the ledger choices:

- ISDA's documents do not prescribe a ledger. The GDF/ISDA sandbox settled margin calls across Ethereum, Hedera and
  Besu, and used CDM to define the agreement terms so that margin calls fed directly into ledger actions.
- DTCC's tokenization service launches on two ledgers: Canton, and DTCC's private Hyperledger Besu network.

From this analysis the project recorded five architecturally significant requirements on 16 October:

- **CDM as the canonical data layer** between off-chain systems and on-chain execution [`concept-asr-cdm-data-layer`];
- **ledger neutrality**: on-chain actions go through an interface that covers both ERC-20 tokens on Besu and CIP-56
  tokens on Canton [`concept-asr-ledger-neutrality`];
- **deterministic settlement finality**: a movement counts as settled only at a defined finality point
  [`concept-asr-settlement-finality`];
- **on-chain asset identity**: a tokenized asset carries its ISIN or CUSIP, its DTI, its network and contract, and
  states which record is legally authoritative. CDM has no attribute for this (B1) [`concept-asr-onchain-asset-identity`];
- **off-chain negotiation and dispute**, with only the agreed amount executed on-chain
  [`concept-asr-offchain-dispute`]. This was superseded the same day, as described below.

## 4. Architecture decisions

With the requirements in place, the architecture was decided in one day, 16 October, as a sequence of ADRs. A
constraint recorded first applied to all of them: **the project builds a prototype to illustrate the concept; stated
assumptions are acceptable in place of production-grade evidence** [`nw-prototype-scope`].

**Ledgers.** Besu first, Canton second, both behind the same ledger-neutral interface [`wp-adr-prototype-ledgers`].
Besu is EVM-compatible, runs a permissioned network with deterministic-finality consensus (QBFT) and runs locally.

**Segregation of initial margin.** Uncleared margin rules require initial margin to be segregated, bankruptcy-remote
and not reused. The GDF/ISDA sandbox showed two models: segregation enforced by a smart contract, and a triparty
agent's books with tokenized settlement. Because the prototype illustrates the concept, the project chose the model
that puts segregation on-chain: a contract holds the pledged tokens, return needs the secured party's consent, and
enforcement is possible only after a default [`wp-adr-im-segregation`]. The legal sufficiency of contract control is
recorded as an unconfirmed assumption [`nw-assumption-contract-control`].

**One stack per participant.** The first architecture sketch shared one workflow service among all parties, in the
manner of a margin utility. The project owner chose one stack per participant (console, workflow service, store,
ledger gateway, keystore), because each firm keeps its own books and signs its own transactions. A follow-up
instruction gave each participant its own Besu validator, so the network has four QBFT validators: a market operator
and three banks [`wp-adr-per-participant-services`].

**Margin call state on-chain.** The project owner asked whether the margin call messages should pass through smart
contracts. Full messages on-chain would expose all content to every node (Besu has no private transactions), put large
CDM objects in contract storage and could not carry legal notices. Fully off-chain messages would give no shared record
and no link between a call and the pledge that settles it. The project owner chose a hybrid: a margin call contract
records each call's state, amounts, deadline and the hash of its CDM content, and the collateral contract accepts a
pledge only against an agreed call, up to the agreed amount [`wp-adr-margin-call-state-onchain`]. The ASR for on-chain
call state replaced the earlier off-chain-dispute requirement [`concept-asr-onchain-call-state`]. A visibility
assumption was recorded with it: on the prototype network every participant can read every call, which is acceptable
for test data and not for production [`nw-assumption-besu-visibility`].

**Real flows.** On the same day the project owner set a constraint that the prototype's flows follow real collateral
operations (the same steps, parties, messages and approvals as ISO 20022 `colr` and FpML), with each simplification
stated [`nw-mimic-real-flows`]. This added a step that the first design lacked: the pledgor proposes specific
collateral, and the secured party accepts or rejects the proposal before anything is pledged.

**Two-way initial margin.** Under the uncleared margin rules both parties post initial margin to each other. The
decision was to keep contracts and data free of a one-direction assumption now and demonstrate one direction first
[`task-two-way-initial-margin`].

The architecture was written in CALM (FINOS's architecture-as-code notation) [`artifact-prototype-architecture`]. By
the end of 16 October it had 20 nodes, 26 relationships and five flows: initial margin call and pledge, oracle price
update, revaluation and top-up, return, and default and enforcement. A test plan with a traceability table from each
ASR and ADR to a test was written beside it [`artifact-test-framework-plan`].

**Development environment.** The project owner's Windows machine was not ready, and a Claude Code cloud session
cannot host a reachable demo. GitHub Codespaces was chosen as the primary environment, with the Windows install kept
as an alternative [`wp-adr-cloud-dev-environment`]. The Windows guide was later run end to end on the project owner's
machine and corrected where it failed [`task-windows-install`].

## 5. The user experience before the backend

Before any service or contract was built, the project designed the user experience [`task-clickable-ui`]. The open
question was whether to organise scenarios by agreement type or by flow. The answer was both: a grid with agreement
types down the side and flows across the top, where the same business step keeps the same name in every row, so a
column shows how one step differs between agreements [`wp-adr-ux-scenario-grid`].

A single-page clickable HTML prototype came first, with seven ISDA scenarios, consoles for each party side by side, a
step tracker and a timeline split into off-chain messages and on-chain transactions [`artifact-clickable-ui-html`].
After the project owner approved it, the React party console was built from it, with an in-browser rule engine
standing in for the contracts [`artifact-react-console`]. The scenarios are data files that also drive the end-to-end
tests. Each grid cell shows its CDM coverage score, which connects the user interface to the analysis.

## 6. Closing CDM's gaps

On 17 October the analysis was consolidated into a gap register: 36 gaps, each with its sources, its lowest CDM
score, the scenarios that need it, a priority and the kind of closure required. Fourteen were P1, meaning the ISDA
initial and variation margin scenarios already built in the console depend on them
[`artifact-cdm-gap-register`]. The register has since grown to 40.

Three decisions defined how the gaps would be closed:

- **Local extensions only.** Gaps are closed by extensions kept in this repository against a pinned CDM release.
  Defects in CDM functions are handled by corrected replacement functions under new names, because CDM's own
  functions cannot be edited without a fork [`wp-adr-cdm-local-extensions`].
- **In Rune, generated like CDM.** The options were Rune with code generation, Python code on top of the published
  CDM package, or a mix. The project owner chose Rune, because most P1 gaps are new types that every consumer needs in
  the same form [`wp-adr-cdm-extension-rune`].
- **CDM 7.7.0 as the base.** 7.7.0 changed only interest-rate reset files, so the analysis held unchanged
  [`nw-cdm-base-release-7-7-0`].

The closure order was agreed the same day: the margin call lifecycle first, then valuation, enforcement, and token
and ledger types [`task-cdm-gap-closure`]. The first extension recorded each margin call step as a `CollateralEvent`
shaped like CDM's `BusinessEvent`, and each settlement as CDM's own `TransferState`. CDM's business events are built
around trades, and a margin call has no trade, so the event type is the extension's own while the transfers remain
CDM's [`wp-adr-cdm-collateral-events`].

### The switch from Python to Java

The extension was first built on CDM's Python stack. It needed a layer of runtime workarounds and Rune written around
eleven generator defects, and CDM's full validation of collateral positions failed (D14, D15). On 17 October the
decision was to stay on Python and contact the stack's maintainers [`nw-cdm-stay-on-python`], who were added as
collaborators on the repository [`nw-repo-shared-with-cdm-maintainers`].

On 18 October, at the project owner's request, the same Rune was generated to Java with CDM's own toolchain. All 23
tests passed with no workarounds and with CDM's full validation. The spike also found that Python and Java serialise
CDM choice types differently, and that Python reads the documented form as empty (D16), so a Python service could not
exchange CDM's documented format with a counterparty. No service existed yet, so switching cost only the extension
build. The project owner decided the same day: **Java 21 for CDM and the services, with Javalin as the web framework;
the Python build retired** and kept at commit `e1a2e6f` as a reproduction for the Python maintainers
[`wp-adr-java-cdm-stack`].

## 7. Building the end-to-end path

The scope of the end-to-end build was set on 17 October as the full stack, all participants and all five flows
[`task-e2e-wiring`]. The layers, built in dependency order, were:

1. **Solidity contracts** (Hardhat 3): margin call, collateral control, ERC-20 test tokens with identifier metadata,
   and an oracle feed.
2. **Ledger gateway** (TypeScript, viem): one per participant, signing with that participant's Besu node key behind a
   `LedgerAdapter` interface that a second ledger would implement [`artifact-ledger-gateway`].
3. **Collateral workflow service** (Java, Javalin): one per participant, with a SQLite store, building CDM objects
   with the extension and submitting ledger instructions through its own gateway [`artifact-collateral-service`].
4. **Live console mode**: each party's console calls its own service [`artifact-live-console-wiring`].
5. **Live harness**: Playwright drives both consoles against the running stack and asserts on-chain state
   [`artifact-e2e-live-harness`].

On 24 October the project reached its first milestone: the initial margin flow ran from first step to last (secured
party issues, pledgor agrees and proposes, secured party accepts, pledgor pledges) through every layer, on the running
Besu network [`wp-first-e2e-cycle`].

### How the two parties share CDM documents

The first cycle raised a design question. To keep a cumulative, validated `MarginCallState`, each party needs the
other party's CDM document for every step. Putting documents on-chain fails on size, gas and confidentiality. Besu's
mechanism for confidential bilateral payloads (Tessera privacy groups) is deprecated and removed from mainline, and its
successor (Paladin) ties the payload transport to one ledger's privacy model, which conflicts with ledger neutrality.

The decision was a **CDM payload carrier**: each step's CDM document is stored off-chain in a content-addressed store
keyed by its keccak-256 hash, and the chain carries only the 32-byte hash and a step event. A party's gateway sees the
event, fetches the document by hash, checks that the hash matches, and passes it to the service, which folds it into
the call's `MarginCallState` [`wp-adr-cdm-payload-carrier`]. The chain provides ordering, notification,
non-repudiation and replay; the store provides the content. The project owner accepted the ADR on 3 November after it
had run in all flows. In the same period the gateway moved from polling to pushing events over Server-Sent Events, and
the store moved from an asserted party header to per-party bearer tokens that fail closed
[`nw-e2e-first-cycle-scope`, proposed].

By the end of October all seven paths of the ISDA lifecycle for both initial and variation margin (full agreement,
partial agreement, dispute, proposal rejection and re-proposal, pledge, title transfer, and return) folded to the same
`MarginCallState` on both sides.

### Running the stack outside the development session

Getting the stack to run reliably outside the developer's session took the next ten days, and each step produced a
decision.

- **Local first, driven by hand.** A GitHub-hosted CI runner discards its machine at the end of the job, so it cannot
  leave a stack running for a person to use. The live tests also failed at Playwright's 30-second limit, because a flow
  chains about six on-chain writes on 2-second blocks. On 29 October the project owner decided that the stack runs on
  the engineer's machine with one command (`scripts/live-e2e.sh up`), the flow is driven by hand in the console, and
  CI only builds, deploys and health-checks the stack [`wp-adr-live-stack-local-ui-driven`]. The first CI run of that
  job passed on 31 October [`nw-ci-live-stack-first-run`].
- **Dev container.** On 1 November the dev container was made to run the one-time build on creation and start the
  full stack on start, with ports published so a host browser can drive a flow [`task-devcontainer-stack-startup`]. A
  `check` subcommand runs the live tests against a running stack [`task-live-flow-checkout-script`].
- **Codespaces.** In a codespace each forwarded port has its own origin, so a browser calling the services directly
  would need derived URLs, authentication cookies on cross-origin requests and CORS. The decision was a same-origin
  proxy: the console calls `/svc/A` and `/svc/B` on its own origin and the Vite server forwards the requests, so only
  the console port is exposed [`wp-adr-console-same-origin-proxy`]. Debugging the codespace also found stale Docker
  bridges and iptables rules from earlier networks that dropped traffic between Besu validators; a cleanup script now
  runs before Besu starts. On 3 November the project owner issued and answered a margin call in the browser on a
  freshly created codespace [`task-codespaces-live-stack`].
- **Test data.** Repeated runs on a persistent chain drained the pledgor's test balances, so a variation margin
  transfer reverted. The project owner chose to size each test's amount to the pledgor's free balance; that task is
  open [`task-live-spec-balance-aware-amounts`].

### The remaining flows

On 1 November the four flows still without a live test were split between sessions [`task-e2e-remaining-flows`].
Return and default-with-enforcement were built in a separate cloud session and merged on 3 November
[`nw-return-default-flows-wired`]. Two more decisions came with the last two flows:

- **The oracle feed carries prices only, published on request.** The flow description said the oracle publishes
  prices and ratings, but the deployed contract stores prices and default status only. Ratings stay off-chain, and
  prices are published when the operator asks, which keeps the tests deterministic
  [`wp-adr-oracle-prices-on-request-ratings-offchain`].
- **Revaluation compares pledged value with the initial margin owed according to settled calls.** The prototype has no
  initial margin model (SIMM is out of scope), so the only record of how much is owed is the calls the parties agreed
  and settled [`wp-adr-revaluation-outstanding-im-from-calls`]. Whether a top-up is an ordinary margin call or a call
  type of its own is a business question; the project owner chose the ordinary margin call as the interim answer and
  opened a task for a subject-matter expert to confirm it [`task-revaluation-top-up-modelling`].

With all six live tests passing on a fresh chain, CI was changed to run them on every pull request that touches the
stack; the first full run took 3.4 minutes [`wp-adr-ci-runs-live-specs`].

On 3 November the project owner closed `task-e2e-wiring` with the words "we're done with the wiring as such, and need to
focus on the business side of things".

## 8. The business case and the FINOS collaboration

The business case was written on 24 October [`artifact-business-case`]. Its problem statement is that there is no
open, standards-based implementation of the collateral margin call lifecycle that connects CDM agreement terms to
collateral settlement, for traditional or tokenized collateral. Every problem it lists cites a finding from the analysis.

The same day the project owner stated that "this entire project is done in collaboration with FINOS"
[`nw-finos-collaboration`]. The local-extensions ADR had said nothing would be reported to FINOS; it was amended so
that findings and defects reach FINOS CDM through the collaboration, while the extension stays maintained in this
repository. The business case names FINOS CDM and the CDM Collateral Working Group as the first audience. Its first
value claim is observed and can be checked in this repository: the margin call lifecycle can be expressed in Rune on
top of CDM 7.7.0 without editing CDM. Most of its other value claims are labelled as hypotheses for the prototype to
test.

It defines completion in two parts: every P1 to P3 gap in the register closed (C1), and every flow step of all five
agreement families running through CDM objects built by the extension (C2).

## 9. From flows to the full workflow map

On 3 November, before any more flow work, the project owner asked for a single view of every CDM collateral workflow
and the task that implements it [`investigation-cdm-workflow-task-map`]. The resulting map has three sections: the
ISDA CSA margin cycle that the prototype runs, the CSA workflows with no prototype flow yet, and the four other
agreement families [`artifact-cdm-workflow-task-map`]. The order was set the same day:

- finish the core CSA cycle (the last two flows and the valuation gaps) before anything else
  [`nw-core-cycle-first`];
- then the CSA extensions, ordered by gap priority with workflows that extend running flows first: close-out netting,
  substitution, interest on cash collateral, amendment, cancellation, settlement netting, allocation and optimisation,
  and reconciliation if it returns to scope [`nw-csa-extension-order`];
- then the other families: repo, securities lending, triparty and CCP margin [`nw-agreement-family-order`].

The project owner left the two orderings to the maintainer ("your call") and accepted the result.

## 10. The gap-closure run of 3 and 4 November

With the order fixed, the extension work proceeded one gap at a time over two days. Each gap was closed with a Rune
module, tests and a short note recording how the business rule was read. The project owner reviewed and accepted each
note, and merged its pull request, before the next gap started; the notes for the last two items below are still
proposed.

- **Valuation (G7)** replaced CDM's posted-collateral valuation with a corrected function. While doing this the
  project found that CDM describes `haircutPercentage` as the ISDA Valuation Percentage but subtracts it as a haircut,
  so a caller who follows the description gets 2% of the value where 98% was meant (defect D17)
  [`nw-cdm-valuation-percentage-as-haircut`].
- **Balances (G5)**: one collateral portfolio per pair of parties, changed only by settlement, valued at the agreed
  value after haircuts [`nw-portfolio-per-pair-post-haircut`].
- **Concentration limits (G8)**, evaluated on held and proposed collateral together
  [`nw-concentration-held-and-proposed-after-haircuts`].
- **Variation margin amounts and exposure netting (G9, G10)** [`nw-vm-exposure-from-netting-set`].
- **Close-out netting (G15, partial)** under the ISDA 2002 Master Agreement: pledged collateral is applied after the
  Early Termination Amount, and title-transfer collateral is netted into it [`nw-closeout-collateral-by-arrangement`].
- **Enforcement against segregated initial margin (G14)**, gated by CDM's enforcement-event elections. CDM gives those
  elections two booleans and no definition, so the reading is the project's own interpretation, and five questions
  went to a subject-matter expert [`nw-enforcement-event-by-election`, `task-sme-enforcement-event-definition`].
- **Substitution (G16, partial)** as its own lifecycle with consent by election; it also corrects CDM's qualification
  of a substitution as a renegotiation (D5) [`nw-substitution-csa-lifecycle`].
- **Disputes (G3)** as a record next to the margin call, with any additional amount paid through a new call
  [`nw-dispute-record-beside-call`, proposed].
- **Token identity and ledger references (G24, G25)**: a tokenized asset beside CDM's `Asset`, and on-chain
  references attached to CDM records once a transaction is mined [`nw-ledger-reference-and-token-identity`,
  proposed].

By early 4 November the extension had 120 passing tests, the collateral service built against each new version, and
every P1 gap was closed or proposed as closed.

## 11. Where the project stands

As of 4 November 2026:

- **Built and running:** four Besu validators, Solidity contracts, two ledger gateways, two Java collateral services,
  an oracle service, a content-addressed CDM payload store and a React console. Six live flows (initial margin pledge,
  variation margin transfer, return, default and enforcement, oracle update, revaluation and top-up) pass end to end
  in CI on a fresh chain and locally after a chain reset. In Codespaces the browser path was verified with an initial
  margin call.
- **CDM extension:** the margin call lifecycle, events and transfers, valuation, balances, concentration, variation
  margin amounts, exposure netting, enforcement, partial close-out and substitution, disputes, and token and ledger
  identity, all in Rune on CDM 7.7.0, built with CDM's Java toolchain.
- **Analysis:** coverage matrices for five agreement families, standards and taxonomy inventories, 40 gaps and 30
  defects recorded for FINOS.

Open work, in the agreed order: the remaining CSA workflows (interest, amendment, cancellation, settlement netting,
allocation), then repo, securities lending, triparty and CCP. Also open: on-chain privacy (designed, not built), two-way
initial margin (designed, not built), unit tests for the collateral service, test amounts sized to available balances,
and two questions waiting for a subject-matter expert (how a top-up is modelled, and what an Enforcement Event means).

## 12. Patterns in how decisions were made

Four patterns recur across the records.

1. **Analysis before code.** No contract or service was written until the coverage matrices, inventories and gap
   register existed. Each later extension points back to a gap ID, and each gap points back to a scored cell with a
   file citation.
2. **The prototype scope is stated, and reductions are recorded.** Choices such as full visibility on-chain,
   contract control as legal segregation, a shared payload store with shared-secret authentication, and a mined
   receipt as finality are each recorded as an assumption or a scope reduction, with the condition under which it
   would be revisited.
3. **Decisions are reversed on evidence.** Python gave way to Java after a one-day spike showed full validation
   passing. The off-chain-dispute requirement gave way to on-chain call state when the project owner asked whether
   messages belong on-chain. The CI-only-health-check decision gave way to CI running every flow once the tests were
   stable on a fresh chain. In each case the superseded record stays in the graph with a pointer to its replacement.
4. **Business readings go to an expert.** Where CDM or the ISDA text leaves a rule undefined (top-up modelling, the
   Enforcement Event), the project implements an interim reading, labels it, and opens a task for a subject-matter
   expert, so that work continues without the interim answer being taken as settled.
