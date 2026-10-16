# Blockchain and smart contracts: applicability to CDM-based collateral management

Output of `task-blockchain-smart-contracts-applicability` (goal `goal-architecture-design`). First pass, 2026-10-16.

**Sources read in full** (text extracted from the downloaded documents; links in [`../references.md`](../references.md)):

| Ref | Document |
|---|---|
| [GDF] | GDF and ISDA, *Unlocking Capital with U.S. Tokenized Money Market Funds for Collateral Mobility*, July 2026 (report PDF, 27,700 words) |
| [CSA] | ISDA, *Assessing Tokenized Money Market Funds as Eligible Collateral Under the ISDA CSA*, October 2026 (PDF) |
| [FCA] | ISDA and GDF, response to the FCA and Bank of England call for input on the future of tokenisation, July 2026 (PDF) |
| [WN] | ISDA Future Leaders in Derivatives, *Digital Assets and Derivatives: Where Next?*, June 2026 (PDF) |
| [TF] | ISDA press release, ISDA and Tokenovate taskforce on a smart contract framework within the CDM, 21 October 2025 |
| [IEI] | Intelligence Economy Institute, *Digital assets have standards* (article on its report *Standards for Digital Assets*, September 2026) |
| [DTCC] | DTCC, *Tokenization Service: Scope at Launch and What's Next*, one-page fact sheet, 2026-10-16 |

The ISDA category page and the two announcement pages add no content beyond the documents above.

## 1. Is ISDA pointing at Hyperledger Besu?

**Not as a choice of ledger.** Besu appears only in [GDF], three times:

1. in the list of working-group participants;
2. as the ledger of one test token — "MOCK Northern Institutional U.S. Government Portfolio", ticker MBNGXX, "Besu DTI: DTIA0018X";
3. in Simulation 3 (UMR initial-margin segregation): "FinP2P provided the common orchestration layer across Ethereum,
   Hedera, Ethereum Sepolia and Besu, settling each leg in a single end-to-end workflow". The Besu token was delivered
   by US Bank into State Street's triparty "Long Box".

The ISDA documents name no ledger. [TF] describes the smart contract work as "designed to be technology-agnostic". [FCA]
asks the Basel Committee to eliminate "the distinction between permissioned and permissionless ledgers for Group 1
classification", and expects assets "issued across many different layer 1 and layer 2 blockchains, … standards for
cross-chain interoperability will therefore be critical". [WN] points to "chain abstraction platforms that orchestrate
execution across multiple ledgers".

**What the sources do converge on** is a multi-ledger architecture: the CDM as the common data layer, an
interoperability/orchestration layer, and whatever ledgers the assets are issued on. In the sandbox those were
Ethereum (mainnet and Sepolia), Hedera and Besu; [GDF] also cites a tokenized fund "launched across Avalanche, BNB
Chain, Ethereum, and Solana".

**DTCC runs a private Besu network.** [DTCC] lists two networks live at launch for its tokenization service:
Canton Network (token standard CIP-56) and "Besu — DTCC's private network" (ERC-20), with Stellar (SEP-41) and Arc
(Circle, ERC-20) anticipated in 2027 and "additional L1s and L2s aligned with client and market demand". The service
tokenizes Russell 1000 equities, ETFs and US Treasuries, "1:1 backed by securities held at DTC", with the "same CUSIP
with the same rights and investor protections as book-entry securities", and "official books and records remain with
DTC". "Settlement and collateral, including on-chain netting and digital cash" is on the 2027-and-beyond roadmap.
Because DTC holds most US securities used as collateral, Besu is where tokenized DTC-eligible collateral will exist —
the Besu link comes from DTCC, not from ISDA.

**Where Besu fits** *(inference, from general knowledge of Besu, not from the sources)*: Besu is an Ethereum client
that can run private permissioned networks with deterministic-finality consensus (QBFT/IBFT 2.0) while staying
EVM-compatible. [WN] notes that deterministic finality is "largely achieved through permissioned blockchain networks",
which matches what margin settlement needs. Besu is therefore a reasonable choice for *a* permissioned EVM ledger in
this project — for example for a local or private test network — but the sources do not support making it *the*
ledger. DTCC itself is multi-ledger (Canton and Besu at launch), and its two launch ledgers use different token models
(CIP-56 on Canton, ERC-20 on Besu).

## 2. The architecture the sources describe

The [GDF] sandbox ran this stack end to end (margin call to on-chain settlement "in under two minutes"):

| Layer | Role | Sandbox example | CDM 7.6.0 today |
|---|---|---|---|
| Agreement and data | Agreement terms, eligibility, margin calls in machine-readable form | "the Common Domain Model (CDM) was used to define and align the terms of the underlying agreements, so that margin calls generated from CDM-based analytics fed directly into DLT actions" | Terms and eligibility: executable. Margin call: data types only (finding F2) |
| Margin management | Call issuance, affirmation, dispute, movement instruction | LSEG PTS (Acadia), CloudMargin | `MarginCallIssuance` / `MarginCallResponse` types, no lifecycle |
| Eligibility, haircuts, optimisation | Select and value eligible assets | Colline, Transcend rules engine; ratings from Moody's; prices from Kaiko and Redstone | Eligibility functions executable; concentration limits and rating order missing (M2, D8, TX3) |
| Orchestration / interoperability | Route instructions to custody and ledgers; cross-chain moves | Ownera FinP2P routers; LayerZero to move a token from Hedera to Ethereum Sepolia | — |
| Custody | Wallets and keys | Fireblocks and other digital-asset custodians | — |
| Smart contracts | Token contracts; code-enforced segregation of initial margin | Ownera "Collateral Control Contract" | Smart contracts not in CDM yet ([TF] taskforce) |
| Ledgers | Record token balances and transfers | Ethereum, Ethereum Sepolia, Hedera, Besu | — |
| Triparty agent (alternative) | Eligibility, allocation, substitution and segregation on the agent's books, with DLT as the settlement rail | State Street (Collateral+): "eligibility, disputes, substitutions and exception handling remained off-chain under State Street's control" | Triparty absent (O9) |

Two operating models for initial margin were shown side by side: segregation enforced by a smart contract, and
segregation on a triparty agent's books with the ledger used only for settlement.

## 3. Applicability by collateral lifecycle step

Steps as in [`../analysis/collateral-flows.md`](../analysis/collateral-flows.md) (ISDA CSA flow).

| Step | Fit for DLT / smart contracts | Evidence | Implication for this project |
|---|---|---|---|
| Agreement terms | **Off-chain.** The legal agreement stays the authoritative record; a smart contract can reference CDM terms | [CSA] proposes standardised amendments or supplements to the VM CSA, not on-chain agreements | Use CDM CSA elections as the source; extend when ISDA standardises TMMF amendments |
| Eligibility and haircuts | **Either.** Can be enforced by a token-level policy or by an off-chain engine | Sandbox: off-chain engines feed eligibility; [CSA]: "same type" may be identified "by reference to a particular blockchain …, a specific smart contract identifier, unique securities token" | Eligibility must recognise tokenized assets (§4) |
| Exposure and call amount | **Off-chain.** Risk engines and CDM calculations | "margin calls generated from CDM-based analytics fed directly into DLT actions" [GDF] | Keep calculation off-chain; output a CDM margin call |
| Margin call, response, dispute | **Off-chain messaging; on-chain only the agreed movement.** | Scenario 1a: "dispute handling is operationally separable from pledge execution"; the disputed US$1m "was cleanly flagged and excluded" | CDM has no margin-call lifecycle (F2); this project must build it, as the bridge into DLT actions |
| Collateral transfer and settlement | **Strongest fit.** Near-real-time, 24/7, multi-token, delivery-versus-delivery | Settlement in under two minutes; cross-custodian and cross-chain legs in one workflow [GDF] | Needs legal settlement finality: [FCA] asks that "a tokenised settlement system can obtain settlement finality protection", citing the UK Settlement Finality Regulations 1999 and the EU proposal |
| Substitution | **Strong fit** (atomic swap of old for new collateral) | Scenario 2d: "DvD Substitution at the CCP" [GDF] | CDM substitution exists only for repo and securities lending (row 14) |
| IM segregation and custody | **Fit, two models** | Code-enforced segregation contract vs triparty agent's books [GDF] | Decision needed (open item 3) |
| Interest and distributions | **Fit for TMMFs**: the yield accrues inside the fund token | "posted collateral continued to accrue yield" [GDF]; [CSA] reviews the Distributions clause | Collateral interest model must allow yield-bearing collateral |
| Default and close-out | **Fit**, with legal backing | Default simulation: TMMFs "seized and redeemed unilaterally by the collateral taker" under English-law title transfer [GDF] | Close-out netting is not modelled in CDM (rows 21–23, M5) |
| Reconciliation | **Reduced** by a shared ledger, not removed | [IEI]: legal, economic, operational and ledger records must still be mapped and reconciled | Keep a reconciliation capability |

Margin periods: [FCA] argues that near-instantaneous settlement "could support a lower MPOR" and asks regulators to
revisit MPOR floors.

## 4. Consequences for the CDM-based data design

- **B1 — CDM cannot identify a tokenized asset on a ledger.** CDM 7.6.0 has `DigitalAsset`, defined as an asset "that is
  not backed by other Assets; excludes the digital representation of other Assets, eg coins or Tokenised assets"
  (`rosetta/base-staticdata-asset-common-type.rosetta` line 163). There is no attribute for blockchain, token contract
  address, token standard or DTI (ISO 24165; see standards finding S2). [WN]: "the CDM must capture the on-chain reality.
  This includes blockchain protocol metadata, smart contract addresses, backing or peg mechanisms (for stablecoins) and
  custody arrangements." [CSA] relies on these identifiers for "same type" equivalence. The sandbox identified every
  test token by DTI; DTCC keeps the CUSIP for the token. The data model therefore needs the security identifier
  (ISIN/CUSIP), the DTI where one exists, and the network and token contract.
- **B2 — The margin-call lifecycle is the interface between CDM and the ledger.** The sandbox used CDM for terms and
  calls, with Acadia generating the movement instruction. CDM's own margin-call types are not processed by any
  function (F2). A CDM-based collateral system has to supply this layer itself.
- **B3 — Tokens do not replace messaging.** [IEI]: "Semantics must precede messaging, and messaging must remain
  distinguishable from execution." The ISO 20022 `colr` and FpML collateral messages (S1) remain the off-chain
  workflow; the ledger executes the agreed movement.
- **B4 — Smart contracts are entering the CDM.** [TF]: a FINOS taskforce is building "a smart contract model within
  the CDM to translate ISDA's legal and operational standards into executable form"; first use case interest rate
  resets. An ISDA event page (seen only through web search, not read) mentions extension to GMRA processes.
  Collateral is not yet in scope.
- **B5 — The token is not necessarily the asset.** [CSA] and [GDF] classify tokenization structures (bearer /
  digitally native, registered, claims or digital twin). [IEI]: "Two tokens can expose the same transfer function and
  confer radically different rights." The data model must record which record is legally authoritative for each
  tokenized collateral asset.

## 5. Limits and risks named in the sources

- Settlement finality protection for tokenised settlement systems is not yet in place in the UK [FCA].
- Probabilistic finality on public chains versus deterministic finality on permissioned networks [WN].
- Latency mismatch when 24/7 ledgers meet T+1 / T+2 traditional rails [WN].
- Fragmentation across chains; dependence on interoperability providers [FCA], [GDF].
- Capital treatment differences between permissioned and permissionless ledgers under Basel [FCA].
- Under English law a share "cannot at present be tokenised natively" [FCA].

## 6. Proposed architecturally significant requirements

Recorded in the project state as proposed ASRs (concepts, `subtype: asr`):

| ID | Requirement |
|---|---|
| `concept-asr-ledger-neutrality` | The collateral system must not depend on one ledger: on-chain actions go through a ledger-neutral interface that covers both EVM token models (ERC-20 on Besu) and non-EVM ones (CIP-56 on Canton). |
| `concept-asr-cdm-data-layer` | CDM is the canonical representation of agreement terms, eligibility and margin calls exchanged between off-chain systems and on-chain execution. |
| `concept-asr-onchain-asset-identity` | Every tokenized collateral asset carries its security identifier (ISIN or CUSIP), its DTI where one exists, its network and token contract, and the record that is legally authoritative (for DTCC tokens, DTC's books). |
| `concept-asr-settlement-finality` | A collateral movement counts as settled only at a defined, deterministic finality point on the ledger used. |
| `concept-asr-offchain-dispute` | Margin call negotiation and disputes run off-chain; only the agreed amount is executed on-chain. *Superseded on 2026-10-16 by `concept-asr-onchain-call-state` (§7).* |

## 7. Decisions

`wp-adr-prototype-ledgers` (accepted by the project owner on 2026-10-16): the prototype uses **Hyperledger Besu** as
its first ledger — EVM, DTCC's private network, and runnable locally as a development node — with **Canton** as the
second target behind the same ledger-neutral interface.

`wp-adr-im-segregation` (accepted by the project owner on 2026-10-16): the prototype segregates initial margin with a
**smart contract on Besu** that holds the pledged tokens (states: pledged, returned, enforced), following the GDF/ISDA
sandbox's code-enforced segregation model. Stated assumption `nw-assumption-contract-control`: control by the
contract satisfies the IM segregation requirement; this is not legally confirmed.

`wp-adr-margin-call-state-onchain` (accepted by the project owner on 2026-10-16): a **margin call contract** records each
call's state, amounts, deadline and the hash of its CDM content, each change signed by the acting party; the collateral
control contract accepts a pledge only against an agreed call. Negotiation content and dispute resolution stay
off-chain. This replaces `concept-asr-offchain-dispute` with `concept-asr-onchain-call-state`. Stated assumption
`nw-assumption-besu-visibility`: every Besu node can read this data (Besu 26.9.0 has no private transactions);
acceptable for the prototype, examined in `task-onchain-privacy`.
