import json, sys
def iface(uid, **kw): return {"unique-id": uid, **kw}
def node(uid, typ, name, desc, interfaces=None, **kw):
    n = {"unique-id": uid, "node-type": typ, "name": name, "description": desc}
    if interfaces: n["interfaces"] = interfaces
    n.update(kw); return n
def connects(uid, desc, src, dst, src_if=None, dst_if=None, protocol=None, **kw):
    s = {"node": src}; d = {"node": dst}
    if src_if: s["interfaces"] = [src_if]
    if dst_if: d["interfaces"] = [dst_if]
    r = {"unique-id": uid, "description": desc, "relationship-type": {"connects": {"source": s, "destination": d}}}
    if protocol: r["protocol"] = protocol
    r.update(kw); return r
def rel(uid, desc, kind, container, nodes):
    return {"unique-id": uid, "description": desc, "relationship-type": {kind: {"container": container, "nodes": nodes}}}
def interacts(uid, desc, actor, nodes):
    return {"unique-id": uid, "description": desc, "relationship-type": {"interacts": {"actor": actor, "nodes": nodes}}}

nodes = [
 node("pledgor-ops", "actor", "Pledgor operations", "User acting for the party that posts initial margin: responds to margin calls (agree, partially agree, dispute) and approves returns."),
 node("market-operator", "actor", "Market data operator", "Simulation user who changes mock NAV, prices and ratings to trigger revaluation and top-up calls."),
 node("party-console", "webclient", "Party console", "Browser UI that drives the flows. One instance runs per simulated participant (party identity, role and wallet set by configuration); N instances run side by side to simulate several counterparties and the market operator.",
      interfaces=[iface("party-console-http", type="url", port="5173+n", path="/")],
      metadata={"language": "TypeScript", "framework": "React with Vite (assumption)", "instances": "N, one per participant; configured by PARTY_ID, ROLE and WALLET"}),
 node("e2e-test-harness", "service", "End-to-end test harness", "Test-only. Starts the stack, drives N party-console instances in parallel browser contexts with Playwright and asserts each CALM flow end to end, including on-chain state.",
      metadata={"language": "TypeScript", "framework": "Playwright (assumption)", "scope": "test only, not part of the runtime"}),
 node("secured-party-ops", "actor", "Secured party operations", "User acting for the party that receives initial margin: issues margin calls, approves returns, declares a default and requests enforcement."),
 node("windows-dev-host", "network", "Windows developer machine", "The developer's Windows machine. Python and Node.js services run natively or in WSL2; Besu runs in Docker Desktop (WSL2 backend).",
      metadata={"os": "Windows 11", "container-runtime": "Docker Desktop with WSL2 backend (assumption)"}),
 node("cdm-collateral-prototype", "system", "CDM collateral prototype", "Prototype that illustrates CDM-based initial-margin management with tokenized collateral segregated by a smart contract on a local Besu network. Nothing is deployed outside the developer machine."),
 node("collateral-service", "service", "Collateral workflow service", "Off-chain margin workflow (ASR concept-asr-offchain-dispute): holds CDM agreements (ISDA IM CSA / CTA-SA elections, eligibility schedule), checks eligibility and haircuts with CDM functions, runs the margin call lifecycle (issue, respond, dispute) that CDM 7.6.0 does not provide (finding F2), and sends movement instructions for agreed amounts to the ledger gateway.",
      interfaces=[iface("collateral-rest-api", type="rest-api", port=8000, path="/api/v1"), iface("ledger-events-webhook", type="rest-api", port=8000, path="/hooks/ledger-events")],
      metadata={"language": "Python", "framework": "FastAPI (assumption)", "cdm-binding": "CDM 7.6.0 Python distribution (assumption: availability to be confirmed)"}),
 node("cdm-object-model", "data-asset", "CDM 7.6.0 object model", "FINOS Common Domain Model release 7.6.0 (commit f685b4b) as the canonical data layer (ASR concept-asr-cdm-data-layer): LegalAgreement with CSA IM / CTA elections, EligibleCollateralSpecification, MarginCallIssuance / MarginCallResponse, CollateralPortfolio. Extended locally with on-chain asset identity (ASR concept-asr-onchain-asset-identity, finding B1)."),
 node("workflow-store", "database", "Workflow store", "SQLite file holding agreements, margin calls and responses, disputes, movement instructions, collateral balances and the asset registry that maps ISIN/CUSIP and DTI to network and token contract.",
      interfaces=[iface("workflow-store-file", type="file", path="./data/collateral.db")], metadata={"engine": "SQLite"}),
 node("oracle-service", "service", "Oracle service", "Off-chain oracle endpoints. Reads price / NAV and rating data from the mock market data source, serves it to the collateral service for valuation and eligibility, and publishes signed updates on-chain through the ledger gateway. Also relays a default notice from the secured party to the on-chain default feed.",
      interfaces=[iface("oracle-rest-api", type="rest-api", port=8100, path="/oracle/v1")],
      metadata={"language": "Python", "framework": "FastAPI (assumption)", "endpoints": ["GET /oracle/v1/prices/{assetId}", "GET /oracle/v1/ratings/{assetId}", "PUT /oracle/v1/market-data/{assetId}", "POST /oracle/v1/publish", "POST /oracle/v1/default-notices"]}),
 node("mock-market-data", "system", "Mock market data source", "Local JSON files standing in for NAV, price and rating providers (in the GDF/ISDA sandbox: Kaiko, Redstone, Moody's).",
      interfaces=[iface("mock-market-data-files", type="file", path="./mock-data/*.json")]),
 node("ledger-gateway", "service", "Ledger gateway", "Ledger-neutral interface (ASR concept-asr-ledger-neutrality, ADR wp-adr-prototype-ledgers): accepts movement instructions and oracle updates, signs and submits transactions to the ledger, waits for finality and reports ledger events back to the collateral service. Besu adapter first; a Canton adapter is the second target.",
      interfaces=[iface("ledger-gateway-api", type="rest-api", port=8200, path="/ledger/v1")],
      metadata={"language": "TypeScript (Node.js)", "libraries": ["ethers.js (assumption)"], "adapters": {"besu": "first", "canton": "planned"}}),
 node("dev-keystore", "data-asset", "Development keystore", "Private keys of the test accounts (pledgor, secured party, oracle publisher, contract admin) used by the ledger gateway to sign transactions. Development keys only."),
 node("besu-dev-network", "network", "Besu local network", "Single-node Hyperledger Besu network in Docker with QBFT consensus, giving deterministic finality per block (ASR concept-asr-settlement-finality). Stands in for a permissioned network such as DTCC's private Besu network.",
      interfaces=[iface("besu-json-rpc-http", type="json-rpc", port=8545), iface("besu-json-rpc-ws", type="json-rpc", port=8546)],
      metadata={"client": "Hyperledger Besu", "consensus": "QBFT, single validator", "runtime": "Docker container"}),
 node("tokenized-collateral", "service", "Tokenized collateral contracts", "ERC-20 test tokens with transfer restrictions standing in for a tokenized money market fund and a tokenized US Treasury. Each token records its ISIN/CUSIP and DTI as metadata (ASR concept-asr-onchain-asset-identity).",
      metadata={"language": "Solidity", "standard": "ERC-20 with allow-list transfer restriction"}),
 node("collateral-control-contract", "service", "Collateral control contract", "Smart contract that holds pledged initial margin (ADR wp-adr-im-segregation). States per pledge: pledged, returned, enforced. Pledge: pledgor transfers tokens in. Return: needs approval by both parties or by the secured party. Enforce: secured party only, after the default feed reports a default. No other movement is possible.",
      metadata={"language": "Solidity", "assumption": "nw-assumption-contract-control"}),
 node("oracle-feed-contract", "service", "Oracle feed contract", "On-chain store of the latest price / NAV, rating and default status per asset and counterparty, written only by the oracle publisher account and read by the collateral control contract.",
      metadata={"language": "Solidity"}),
]

R = []
R += [rel("host-deploys-prototype", "All prototype components run on the developer's Windows machine.", "deployed-in", "windows-dev-host",
          ["party-console", "collateral-service", "workflow-store", "oracle-service", "mock-market-data", "ledger-gateway", "dev-keystore", "besu-dev-network", "e2e-test-harness"]),
      rel("prototype-composition", "Components of the prototype system.", "composed-of", "cdm-collateral-prototype",
          ["party-console", "collateral-service", "cdm-object-model", "workflow-store", "oracle-service", "ledger-gateway", "dev-keystore", "besu-dev-network", "tokenized-collateral", "collateral-control-contract", "oracle-feed-contract"]),
      rel("collateral-service-uses-cdm", "The collateral service is built on the CDM object model.", "composed-of", "collateral-service", ["cdm-object-model"]),
      rel("contracts-deployed-on-besu", "Smart contracts deployed on the local Besu network.", "deployed-in", "besu-dev-network",
          ["tokenized-collateral", "collateral-control-contract", "oracle-feed-contract"]),
      interacts("pledgor-uses-console", "Pledgor operations responds to margin calls and approves returns in its party console instance.", "pledgor-ops", ["party-console"]),
      interacts("secured-party-uses-console", "Secured party operations issues margin calls, approves returns and declares defaults in its party console instance.", "secured-party-ops", ["party-console"]),
      interacts("operator-uses-console", "Market data operator changes mock NAV, prices and ratings in its party console instance.", "market-operator", ["party-console"]),
      connects("console-to-service", "Calls the workflow REST API for agreements, calls, responses, returns, defaults and balances; polls or subscribes for updates.", "party-console", "collateral-service", dst_if="collateral-rest-api", protocol="HTTP"),
      connects("console-to-oracle", "Market operator console edits mock market data through the oracle service.", "party-console", "oracle-service", dst_if="oracle-rest-api", protocol="HTTP"),
      connects("console-to-gateway", "Reads token balances and pledge state for display.", "party-console", "ledger-gateway", dst_if="ledger-gateway-api", protocol="HTTP"),
      connects("harness-to-console", "Drives N console instances in parallel browser contexts.", "e2e-test-harness", "party-console", dst_if="party-console-http", protocol="HTTP"),
      connects("harness-to-gateway", "Asserts on-chain state after each flow.", "e2e-test-harness", "ledger-gateway", dst_if="ledger-gateway-api", protocol="HTTP"),
      connects("service-to-store", "Reads and writes agreements, calls, instructions, balances and the asset registry.", "collateral-service", "workflow-store", dst_if="workflow-store-file"),
      connects("service-to-oracle", "Requests prices / NAV and ratings for valuation, haircuts and eligibility; forwards default notices.", "collateral-service", "oracle-service", dst_if="oracle-rest-api", protocol="HTTP"),
      connects("oracle-to-market-data", "Reads and, on operator request, updates mock NAV, price and rating data.", "oracle-service", "mock-market-data", dst_if="mock-market-data-files"),
      connects("service-to-gateway", "Submits movement instructions (pledge, return, enforce) for agreed amounts.", "collateral-service", "ledger-gateway", dst_if="ledger-gateway-api", protocol="HTTP"),
      connects("oracle-to-gateway", "Publishes price, rating and default updates for the on-chain feed.", "oracle-service", "ledger-gateway", dst_if="ledger-gateway-api", protocol="HTTP"),
      connects("gateway-to-keystore", "Loads signing keys of the test accounts.", "ledger-gateway", "dev-keystore"),
      connects("gateway-to-besu-rpc", "Submits signed transactions and reads state over JSON-RPC.", "ledger-gateway", "besu-dev-network", dst_if="besu-json-rpc-http", protocol="HTTP"),
      connects("gateway-to-besu-events", "Subscribes to contract events and new blocks.", "ledger-gateway", "besu-dev-network", dst_if="besu-json-rpc-ws", protocol="WebSocket"),
      connects("gateway-to-service-events", "Reports finalized ledger events (pledged, returned, enforced, transfers) back to the workflow.", "ledger-gateway", "collateral-service", dst_if="ledger-events-webhook", protocol="HTTP"),
      connects("control-to-tokens", "Moves pledged tokens with ERC-20 transferFrom / transfer (EVM call).", "collateral-control-contract", "tokenized-collateral"),
      connects("control-to-oracle-feed", "Reads default status (and, for valuation checks, price) before enforcement (EVM call).", "collateral-control-contract", "oracle-feed-contract"),
]

flows = [
 {"unique-id": "flow-im-margin-call-pledge", "name": "Initial margin call and on-chain pledge",
  "description": "The secured party calls initial margin; the pledgor agrees in full or in part off-chain; the agreed amount is pledged into the collateral control contract on Besu.",
  "transitions": [
   {"relationship-unique-id": "secured-party-uses-console", "sequence-number": 1, "description": "Secured party issues an IM call (CDM MarginCallIssuance) under the agreement in its console."},
   {"relationship-unique-id": "pledgor-uses-console", "sequence-number": 2, "description": "Pledgor responds in its console: agree, partially agree or dispute (CDM MarginCallResponse); a disputed part stays off-chain."},
   {"relationship-unique-id": "console-to-service", "sequence-number": 3, "description": "Consoles submit the call and the response to the workflow service."},
   {"relationship-unique-id": "service-to-oracle", "sequence-number": 4, "description": "Service fetches NAV / prices and ratings for the proposed tokens."},
   {"relationship-unique-id": "service-to-store", "sequence-number": 5, "description": "Service checks eligibility and haircuts against the CDM eligibility schedule and records the movement instruction."},
   {"relationship-unique-id": "service-to-gateway", "sequence-number": 6, "description": "Service sends a pledge instruction for the agreed amount."},
   {"relationship-unique-id": "gateway-to-besu-rpc", "sequence-number": 7, "description": "Gateway signs and submits pledge() to the collateral control contract."},
   {"relationship-unique-id": "control-to-tokens", "sequence-number": 8, "description": "Contract pulls the tokens from the pledgor's account."},
   {"relationship-unique-id": "gateway-to-besu-events", "sequence-number": 9, "description": "Gateway receives the Pledged event in a finalized block."},
   {"relationship-unique-id": "gateway-to-service-events", "sequence-number": 10, "description": "Service updates the collateral balance and closes the call."},
   {"relationship-unique-id": "console-to-service", "sequence-number": 11, "description": "Both consoles show the settled pledge and the new balance."}]},
 {"unique-id": "flow-oracle-update", "name": "Oracle price and rating update",
  "description": "The oracle service publishes current NAV / price and rating data to the on-chain feed.",
  "transitions": [
   {"relationship-unique-id": "oracle-to-market-data", "sequence-number": 1, "description": "Oracle reads mock NAV, price and rating data."},
   {"relationship-unique-id": "oracle-to-gateway", "sequence-number": 2, "description": "Oracle sends a signed update."},
   {"relationship-unique-id": "gateway-to-besu-rpc", "sequence-number": 3, "description": "Gateway writes the update to the oracle feed contract."}]},
 {"unique-id": "flow-revaluation-top-up", "name": "Collateral revaluation and top-up call",
  "description": "The market operator lowers the NAV or price of a pledged token; revaluation shows a shortfall and the secured party issues a top-up call, which then follows the IM call flow.",
  "transitions": [
   {"relationship-unique-id": "operator-uses-console", "sequence-number": 1, "description": "Market operator changes the NAV or price of a token."},
   {"relationship-unique-id": "console-to-oracle", "sequence-number": 2, "description": "Console sends the new mock value."},
   {"relationship-unique-id": "oracle-to-market-data", "sequence-number": 3, "description": "Oracle updates the mock market data."},
   {"relationship-unique-id": "oracle-to-gateway", "sequence-number": 4, "description": "Oracle publishes the new value on-chain."},
   {"relationship-unique-id": "service-to-oracle", "sequence-number": 5, "description": "Workflow service revalues pledged collateral after haircuts."},
   {"relationship-unique-id": "console-to-service", "sequence-number": 6, "description": "Secured party console shows the shortfall and the proposed top-up call."}]},
 {"unique-id": "flow-return", "name": "Return of initial margin",
  "description": "Excess or released initial margin goes back to the pledgor after the required approval.",
  "transitions": [
   {"relationship-unique-id": "pledgor-uses-console", "sequence-number": 1, "description": "Pledgor requests a return in its console."},
   {"relationship-unique-id": "secured-party-uses-console", "sequence-number": 2, "description": "Secured party approves the return in its console."},
   {"relationship-unique-id": "console-to-service", "sequence-number": 3, "description": "Consoles submit the request and the approval to the workflow service."},
   {"relationship-unique-id": "service-to-gateway", "sequence-number": 4, "description": "Service sends a return instruction carrying both approvals."},
   {"relationship-unique-id": "gateway-to-besu-rpc", "sequence-number": 5, "description": "Gateway submits returnPledge()."},
   {"relationship-unique-id": "control-to-tokens", "sequence-number": 6, "description": "Contract transfers the tokens back to the pledgor."},
   {"relationship-unique-id": "gateway-to-service-events", "sequence-number": 7, "description": "Service records the return and updates the balance."}]},
 {"unique-id": "flow-default-enforcement", "name": "Default and enforcement",
  "description": "After a pledgor default, the secured party enforces against the pledged initial margin.",
  "transitions": [
   {"relationship-unique-id": "secured-party-uses-console", "sequence-number": 1, "description": "Secured party declares a pledgor default in its console."},
   {"relationship-unique-id": "console-to-service", "sequence-number": 2, "description": "Console submits the default declaration to the workflow service."},
   {"relationship-unique-id": "service-to-oracle", "sequence-number": 3, "description": "Service forwards the default notice to the oracle service."},
   {"relationship-unique-id": "oracle-to-gateway", "sequence-number": 4, "description": "Oracle publishes the default status."},
   {"relationship-unique-id": "gateway-to-besu-rpc", "sequence-number": 5, "description": "Gateway writes the default to the feed and submits enforce()."},
   {"relationship-unique-id": "control-to-oracle-feed", "sequence-number": 6, "description": "Contract confirms the default status."},
   {"relationship-unique-id": "control-to-tokens", "sequence-number": 7, "description": "Contract transfers the pledged tokens to the secured party."},
   {"relationship-unique-id": "gateway-to-service-events", "sequence-number": 8, "description": "Service records the enforcement."}]},
]

doc = {
 "$schema": "https://calm.finos.org/release/1.2/meta/calm.json",
 "unique-id": "cdm-collateral-prototype-architecture",
 "name": "CDM collateral prototype",
 "description": "Local prototype architecture for CDM-based initial-margin management with tokenized collateral on Hyperledger Besu.",
 "metadata": {"status": "draft (sketch, not built)", "goal": "goal-architecture-design", "task": "task-local-environment-setup",
   "asrs": ["concept-asr-ledger-neutrality", "concept-asr-cdm-data-layer", "concept-asr-onchain-asset-identity", "concept-asr-settlement-finality", "concept-asr-offchain-dispute"],
   "constraint": "nw-prototype-scope"},
 "adrs": [".konspekt/instance/waypoints/wp-adr-prototype-ledgers.md", ".konspekt/instance/waypoints/wp-adr-im-segregation.md"],
 "nodes": nodes, "relationships": R, "flows": flows,
}
json.dump(doc, open(sys.argv[1], "w"), indent=2); open(sys.argv[1], "a").write("\n")
