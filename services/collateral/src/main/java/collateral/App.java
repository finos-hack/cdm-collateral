package collateral;

import cdmx.collateral.margincall.MarginCallState;
import cdmx.collateral.triparty.TripartyAllocation;
import cdmx.collateral.triparty.TripartyRepoRequest;
import cdmx.collateral.triparty.TripartyTerms;
import com.fasterxml.jackson.databind.JsonNode;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.sse.SseClient;

import java.math.BigInteger;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Optional;
import cdm.event.common.TradeState;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Collateral workflow service for one participant (architecture node collateral-service). Exposes the margin-call
 * lifecycle REST API the party console calls (/api/v1), builds CDM message content, records it in the SQLite store,
 * and submits ledger instructions to this participant's gateway. Call and pledge state live on-chain and are read
 * back through the gateway (the chain is the shared source between the two parties' services in this first cycle).
 */
public final class App {
    private static final Map<String, Integer> CALL_KIND = Map.of("IM", 0, "VM", 1, "Return", 2);
    private static final String[] CALL_KIND_NAME = {"IM", "VM", "Return"};
    private static final String ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
    private static final Map<String, Integer> RESPONSE = Map.of("full", 0, "partial", 1, "dispute", 2);
    private static final String[] CALL_STATE = {"none", "issued", "agreed", "partially agreed", "disputed", "settled", "settled (agreed part)", "cancelled"};
    private static final String[] PROPOSAL_STATE = {"none", "proposed", "accepted", "rejected", "cancelled"};

    private final Config cfg;
    private final Store store;
    private final Gateway gw;
    private final Gateway oracle; // the shared oracle service (service-to-oracle), same JSON conventions
    private final PayloadStore payloads;
    private final List<String> callParties; // reader allowlist for stored docs: both counterparties (A, B)
    private final Map<String, String> symbolByAddress; // lowercase address -> symbol
    private final Map<String, FoldCache> foldCache = new ConcurrentHashMap<>();
    private final Set<SseClient> sseClients = ConcurrentHashMap.newKeySet(); // console clients subscribed to live events
    private final Gateway peer; // the counterparty's collateral service (flow-reconciliation: trade snapshots)
    // Folds a call after each of its lifecycle steps, off the relay thread, so the stored MarginCallState that the ledger
    // reconciliation compares with the contract is current without delaying the relay to the console.
    /** Parallel gateway reads within one request (task-live-read-latency): independent per-item lookups, no store access. */
    private final java.util.concurrent.ExecutorService reads = java.util.concurrent.Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "gateway-reads");
        t.setDaemon(true);
        return t;
    });

    /** Verified interest statement summaries by CDM hash and on-chain amount: a statement is immutable once anchored. */
    private final Map<String, Map<String, Object>> interestVerified = new ConcurrentHashMap<>();

    private final java.util.concurrent.ExecutorService folds = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "step-fold");
        t.setDaemon(true);
        return t;
    });

    /** A folded MarginCallState cached against the on-chain step signature, so a steady call is not refolded each poll. */
    private record FoldCache(String sig, Map<String, Object> result) {}

    private App(Config cfg) {
        this.cfg = cfg;
        this.store = new Store(cfg.dbPath);
        this.gw = new Gateway(cfg.gatewayUrl);
        this.oracle = new Gateway(cfg.oracleUrl, "/oracle/v1");
        this.payloads = new PayloadStore(cfg.storeUrl, cfg.storeToken);
        this.callParties = List.of(cfg.partyAddress("A"), cfg.partyAddress("B"));
        this.symbolByAddress = cfg.tokenSymbols();
        this.peer = new Gateway(cfg.counterpartyServiceUrl, "/api/v1");
    }

    /** Record a produced CDM document in the local store and publish it to the shared payload carrier. */
    private void record(String callId, String type, Cdm cdm) {
        store.recordMessage(callId, type, "out", cdm);
        payloads.put(cdm.hash, cdm.json, callParties);
    }

    public static void main(String[] args) {
        // Node's HTTP servers (gateway, payload store) close an idle keep-alive connection after 5 s. Java's HttpClient
        // keeps pooled connections longer and can send a request on one the server has just closed ("header parser
        // received no bytes", CI run 43061438276). Drop idle connections after 3 s, before any client is built.
        System.setProperty("jdk.httpclient.keepalive.timeout", "3");
        Config cfg = Config.fromEnv();
        new App(cfg).start();
    }

    private void start() {
        Javalin app = Javalin.create(c -> c.showJavalinBanner = false);
        app.before(ctx -> {
            ctx.header("Access-Control-Allow-Origin", "*");
            ctx.header("Access-Control-Allow-Headers", "Content-Type");
            ctx.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        });
        app.options("/*", ctx -> ctx.status(204));
        app.exception(Exception.class, (e, ctx) -> ctx.status(400).json(Map.of("error", String.valueOf(e.getMessage()))));

        app.get("/api/v1/health", ctx -> ctx.json(Map.of("party", cfg.partyId, "role", cfg.role, "address", cfg.myAddress, "ok", true)));
        if (!cfg.isCcp()) tripartyRoutes(app);
        ccpRoutes(app);
        if (cfg.isAgent() || cfg.isCcp()) {
            // The triparty agent BANK-T (wp-adr-triparty-terms-profile) runs only the triparty routes and the console
            // event stream; the bilateral CSA, repo and lending workflows stay on A and B.
            app.sse("/api/v1/events", client -> {
                client.keepAlive();
                client.sendComment("connected");
                sseClients.add(client);
                client.onClose(() -> sseClients.remove(client));
            });
            // The agent's business date is the revaluation date (wp-adr-triparty-revaluation). The CCP BANK-C
            // (wp-adr-ccp-membership) runs only the CCP routes and the event stream in the same way.
            app.get("/api/v1/business-date", ctx -> ctx.json(Map.of("businessDate", businessDate.toString())));
            app.post("/api/v1/business-date", this::setBusinessDate);
            app.start(cfg.port);
            startEventRelay();
            System.out.printf("collateral service: %s %s (%s) %s on http://localhost:%d/api/v1 -> gateway %s%n",
                    cfg.isCcp() ? "CCP" : "triparty agent", cfg.bankName(cfg.partyId), cfg.role, cfg.myAddress, cfg.port, cfg.gatewayUrl);
            return;
        }
        app.get("/api/v1/context", this::context);
        app.get("/api/v1/state", this::state);
        app.get("/api/v1/revaluation", this::revaluation);
        app.get("/api/v1/calls/{id}/cdm-state", ctx -> ctx.json(cdmStateFor(ctx.pathParam("id"))));
        app.post("/api/v1/calls", this::issueCall);
        app.post("/api/v1/calls/{id}/response", this::respond);
        app.post("/api/v1/calls/{id}/proposal", this::propose);
        app.post("/api/v1/calls/{id}/allocation", this::allocation);
        app.post("/api/v1/calls/{id}/decision", this::decide);
        app.post("/api/v1/calls/{id}/pledge", this::pledge);
        app.post("/api/v1/calls/{id}/transfer", this::transfer);
        app.post("/api/v1/calls/{id}/return", this::returnCollateral);
        app.post("/api/v1/calls/{id}/enforce", this::enforce);
        app.get("/api/v1/calls/{id}/enforcement", ctx -> ctx.json(enforcementStateFor(ctx.pathParam("id"))));
        app.get("/api/v1/register/breaks", this::registerBreaks);
        app.get("/api/v1/provenance", this::provenanceAll);
        app.get("/api/v1/provenance/{symbol}", this::provenanceOf);
        app.post("/api/v1/provenance/seed", this::provenanceSeed);
        app.post("/api/v1/calls/{id}/withdraw", this::withdrawCall);
        app.post("/api/v1/calls/{id}/cancellation", this::requestCancellation);
        app.post("/api/v1/calls/{id}/cancellation/decision", this::decideCancellation);
        app.post("/api/v1/reclaims", this::reclaim);
        app.get("/api/v1/close-outs", this::closeOuts);
        app.post("/api/v1/close-outs", this::closeOut);
        app.get("/api/v1/interest", this::interestStatements);
        app.post("/api/v1/interest", this::stateInterest);
        app.post("/api/v1/interest/{id}/pay", this::payInterest);
        app.get("/api/v1/netting/candidates", this::nettingCandidates);
        app.get("/api/v1/nettings", this::nettings);
        app.post("/api/v1/nettings", this::settleNetting);
        app.get("/api/v1/agreement", this::agreement);
        app.post("/api/v1/amendments", this::proposeAmendment);
        app.post("/api/v1/amendments/{id}/decision", this::decideAmendment);
        app.get("/api/v1/gmra/terms", this::gmraTerms);
        app.post("/api/v1/gmra/amendments", this::proposeGmraAmendment);
        app.post("/api/v1/gmra/amendments/{id}/decision", this::decideGmraAmendment);
        app.get("/api/v1/gmsla/terms", this::gmslaTerms);
        app.post("/api/v1/gmsla/amendments", this::proposeGmslaAmendment);
        app.post("/api/v1/gmsla/amendments/{id}/decision", this::decideGmslaAmendment);
        app.get("/api/v1/business-date", ctx -> ctx.json(Map.of("businessDate", businessDate.toString())));
        app.post("/api/v1/business-date", this::setBusinessDate);
        app.get("/api/v1/loans", this::loans);
        app.post("/api/v1/loans", this::bookLoan);
        app.post("/api/v1/loans/{id}/affirm", this::affirmLoan);
        app.post("/api/v1/loans/{id}/deliver", this::deliverLoan);
        app.post("/api/v1/loans/{id}/return", this::returnLoan);
        app.post("/api/v1/loans/{id}/recall", this::recallLoan);
        app.post("/api/v1/loans/{id}/recall/withdraw", this::withdrawLoanRecall);
        app.post("/api/v1/loans/{id}/substitute", this::requestLoanSubstitution);
        app.post("/api/v1/loans/{id}/substitute/agree", this::agreeLoanSubstitution);
        app.post("/api/v1/loans/{id}/substitute/refuse", this::refuseLoanSubstitution);
        app.post("/api/v1/loans/{id}/bill", this::billLoan);
        app.post("/api/v1/loans/{id}/bill/pay", this::payLoanBill);
        app.post("/api/v1/loans/{id}/bill/refuse", this::refuseLoanBill);
        app.get("/api/v1/gmsla-marking", this::gmslaMarking);
        app.post("/api/v1/gmsla-marking/calls", this::issueGmslaMarginCall);
        app.get("/api/v1/repos", this::repos);
        app.post("/api/v1/repos", this::bookRepo);
        app.post("/api/v1/repos/{id}/affirm", this::affirmRepo);
        app.post("/api/v1/repos/{id}/settle", this::settleRepo);
        app.get("/api/v1/repo-margin", this::repoMargin);
        app.post("/api/v1/repo-margin/calls", this::issueRepoMarginCall);
        app.post("/api/v1/repo-margin/interest", this::stateRepoMarginInterest);
        app.post("/api/v1/repo-margin/reprice", ctx -> proposeReplacement(ctx, this::repriceLeg));
        app.post("/api/v1/repo-margin/reprice/agree", ctx -> agreeReplacement(ctx, "reprice", this::repriceLeg));
        app.post("/api/v1/repo-margin/adjust", ctx -> proposeReplacement(ctx, this::adjustmentLeg));
        app.post("/api/v1/repo-margin/adjust/agree", ctx -> agreeReplacement(ctx, "adjustment", this::adjustmentLeg));
        app.post("/api/v1/repos/{id}/substitute", this::requestRepoSubstitution);
        app.post("/api/v1/repos/{id}/substitute/agree", this::agreeRepoSubstitution);
        app.post("/api/v1/repos/{id}/substitute/refuse", this::refuseRepoSubstitution);
        app.post("/api/v1/repos/{id}/interim-interest", this::payInterimInterest);
        app.post("/api/v1/repos/{id}/interim-interest/agree", this::agreeInterimInterest);
        app.post("/api/v1/repos/{id}/interim-interest/refuse", ctx -> refuseRepoPayment(ctx, "interimInterest", "buyer"));
        app.post("/api/v1/repos/{id}/income", this::payIncome);
        app.post("/api/v1/repos/{id}/income/agree", this::agreeIncome);
        app.post("/api/v1/repos/{id}/income/refuse", ctx -> refuseRepoPayment(ctx, "income", "seller"));
        app.post("/api/v1/repos/{id}/roll", this::proposeRoll);
        app.post("/api/v1/repos/{id}/roll/agree", this::agreeRoll);
        app.post("/api/v1/repos/{id}/roll/refuse", this::refuseRoll);
        app.post("/api/v1/repos/{id}/pair-off", this::proposePairOff);
        app.post("/api/v1/repos/{id}/pair-off/agree", this::agreePairOff);
        app.post("/api/v1/repos/{id}/pair-off/refuse", this::refusePairOff);
        app.get("/api/v1/repos/{id}/trade", this::repoTrade);
        app.get("/api/v1/repo-default", this::repoDefault);
        app.get("/api/v1/loan-default", this::loanDefault);
        app.post("/api/v1/loan-default/close-out", this::closeOutLoanDefault);
        app.post("/api/v1/loan-default/close-outs/{id}/pay", this::payLoanCloseOut);
        app.post("/api/v1/repo-default/close-out", this::closeOutRepoDefault);
        app.post("/api/v1/repo-default/close-outs/{id}/pay", this::payRepoCloseOut);
        app.get("/api/v1/substitutions", this::substitutions);
        app.post("/api/v1/substitutions", this::requestSubstitution);
        app.post("/api/v1/substitutions/{id}/decision", this::decideSubstitution);
        app.post("/api/v1/substitutions/{id}/settle", this::settleSubstitution);
        app.get("/api/v1/substitutions/{id}/cdm-state", ctx -> ctx.json(substitutionStateFor(ctx.pathParam("id"))));
        app.get("/api/v1/reconciliation/portfolio", this::reconciliations);
        app.post("/api/v1/reconciliation/portfolio", this::reconcilePortfolio);
        app.post("/api/v1/reconciliation/exchange", this::exchangeSnapshot);
        app.post("/api/v1/reconciliation/ledger", this::reconcileWithLedger);
        app.sse("/api/v1/events", client -> { // the console subscribes here (EventSource sends Accept: text/event-stream)
            client.keepAlive();
            client.sendComment("connected");
            sseClients.add(client);
            client.onClose(() -> sseClients.remove(client));
        });

        app.start(cfg.port);
        startEventRelay();
        System.out.printf("collateral service: party %s (%s) %s on http://localhost:%d/api/v1 -> gateway %s%n",
                cfg.partyId, cfg.role, cfg.myAddress, cfg.port, cfg.gatewayUrl);
    }

    /**
     * Relay the gateway's chain-event stream to the console (event push, not polling). A daemon thread holds one SSE
     * connection to this party's gateway (Besu ws -> gateway -> here) and fans each change signal out to the console
     * clients; it reconnects if the gateway restarts or the stream drops.
     */
    private void startEventRelay() {
        Thread t = new Thread(() -> {
            HttpClient http = HttpClient.newHttpClient();
            HttpRequest req = HttpRequest.newBuilder(URI.create(cfg.gatewayUrl + "/ledger/v1/events")).GET().build();
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    HttpResponse<java.util.stream.Stream<String>> resp = http.send(req, HttpResponse.BodyHandlers.ofLines());
                    resp.body().forEach(line -> {
                        if (line.startsWith("data:")) {
                            String data = line.substring(5).trim();
                            // Record first (cheap), relay at once, and fold afterwards on the fold executor; a fold that
                            // changes what the console shows signals it again when done (task-live-read-latency).
                            if (!cfg.isAgent() && !cfg.isCcp()) onLedgerEvent(data);
                            signalConsoles(data);
                        }
                    });
                } catch (Exception e) {
                    // gateway not up yet or the stream dropped; pause and reconnect
                }
                try { Thread.sleep(2000); } catch (InterruptedException ie) { return; }
            }
        }, "gateway-event-relay");
        t.setDaemon(true);
        t.start();
    }

    /** Tell every console to refresh (an SSE "step" signal; the console reads the state it needs). */
    private void signalConsoles(String data) {
        for (SseClient c : sseClients) {
            try { c.sendEvent("step", data); } catch (Exception ignored) { }
        }
    }

    /**
     * Act on one pushed chain event before relaying it; slow folds are queued, not run here. Returned, Enforced and DefaultPublished are recorded in this
     * party's store (flow-return transition 14, flow-default-enforcement transition 8: the pledgor's service records the
     * default and each service records the enforcement). A SettleCall step is folded on the fold executor right after the relay (retried until the fold includes it), so each service holds the
     * settled MarginCallState without waiting for a console to ask. A failure here never stops the relay.
     */
    private void onLedgerEvent(String data) {
        try {
            JsonNode e = Config.MAPPER.readTree(data);
            String block = e.path("block").asText("");
            long logIndex = e.path("logIndex").asLong(0);
            if (e.has("event")) {
                String event = e.get("event").asText();
                String callId = e.hasNonNull("callId") ? e.get("callId").asText() : null;
                String party = e.hasNonNull("party") ? e.get("party").asText() : null;
                if (event.equals("RegisterConfirmed")) {
                    signalConsoles(data); // a step or enforcement may now be complete (task-authoritative-record-settlement-enforcement)
                } else if (event.equals("ClosedOut")) {
                    onClosedOut(e, party, block, logIndex, data);
                } else if (event.equals("Reclaimed")) {
                    String id = e.get("reclaimId").asText();
                    if (party != null && (party.equalsIgnoreCase(cfg.myAddress) || party.equalsIgnoreCase(cfg.partyAddress(counterparty())))) store.recordEvent(event, id, party, block, logIndex, data);
                } else if (event.equals("InterestStated")) {
                    onInterestStated(e, party, block, logIndex, data);
                } else if (event.equals("InterestSettled")) {
                    String id = e.get("interestId").asText();
                    if (party != null && (party.equalsIgnoreCase(cfg.myAddress) || party.equalsIgnoreCase(cfg.partyAddress(counterparty())))) store.recordEvent(event, id, party, block, logIndex, data);
                } else if (event.equals("AmendmentProposed") || event.equals("AmendmentDecided")) {
                    onAmendmentEvent(event, e, block, logIndex, data);
                } else if (event.equals("TermsAmendmentProposed") || event.equals("TermsAmendmentDecided")) {
                    onGmraAmendmentEvent(event, e, block, logIndex, data);
                } else if (event.startsWith("Repo") && e.hasNonNull("repoId")) {
                    String id = e.get("repoId").asText();
                    JsonNode r = gw.get("/repos/" + id);
                    if (r.get("seller").asText().equalsIgnoreCase(cfg.myAddress) || r.get("buyer").asText().equalsIgnoreCase(cfg.myAddress))
                        store.recordEvent(event, id, party, block, logIndex, data);
                } else if (event.startsWith("Substitution")) {
                    String id = e.get("substitutionId").asText();
                    if (substitutionInvolvesMe(id)) {
                        store.recordEvent(event, id, party, block, logIndex, data);
                        if (event.equals("SubstitutionSettled")) folds.submit(() -> { substitutionStateFor(id); signalConsoles(data); });
                    }
                } else if (event.equals("DefaultPublished") || involvesMe(callId)) {
                    store.recordEvent(event, callId, party, block, logIndex, data);
                }
            } else if ("SettleCall".equals(e.path("step").asText()) && involvesMe(e.path("callId").asText(null))) {
                String id = e.get("callId").asText();
                // Retried until the fold includes the step: the pushed step can precede the gateway's log index.
                folds.submit(() -> { foldIncluding(id, "SettleCall"); signalConsoles(data); });
            } else if (e.has("step") && involvesMe(e.path("callId").asText(null))) {
                String id = e.get("callId").asText();
                String step = e.get("step").asText();
                folds.submit(() -> foldIncluding(id, step));
            }
        } catch (Exception ex) {
            System.err.println("event relay: could not process " + data + ": " + ex.getMessage());
        }
    }

    /**
     * A ClosedOut event (flow-close-out-netting transition 8): the pledgor's service fetches the CDM CloseOutStatement by
     * the hash the contract recorded, checks it and keeps it; each service records the event.
     */
    private void onClosedOut(JsonNode e, String pledgor, String block, long logIndex, String data) {
        boolean iAmPledgor = pledgor != null && pledgor.equalsIgnoreCase(cfg.myAddress);
        boolean withCounterparty = pledgor != null && pledgor.equalsIgnoreCase(cfg.partyAddress(counterparty()));
        if (!iAmPledgor && !withCounterparty) return;
        String id = e.get("closeOutId").asText();
        store.recordEvent("ClosedOut", id, pledgor, block, logIndex, data);
        if (iAmPledgor) {
            String hash = e.get("cdmHash").asText();
            String doc = payloads.get(hash);
            if (doc != null && Cdm.keccakHex(doc).equalsIgnoreCase(hash)) {
                CdmCloseOut.verify(doc);
                store.recordDocument(id, "CloseOutStatement", "in", hash, doc);
            }
        }
    }

    /**
     * An InterestStated event (flow-interest-on-cash transition 9): the pledgor's service fetches the CDM
     * CollateralInterestStatement by the hash the contract recorded, checks it and keeps it; each service records the event.
     */
    private void onInterestStated(JsonNode e, String pledgor, String block, long logIndex, String data) {
        boolean iAmPledgor = pledgor != null && pledgor.equalsIgnoreCase(cfg.myAddress);
        boolean withCounterparty = pledgor != null && pledgor.equalsIgnoreCase(cfg.partyAddress(counterparty()));
        if (!iAmPledgor && !withCounterparty) return;
        String id = e.get("interestId").asText();
        store.recordEvent("InterestStated", id, pledgor, block, logIndex, data);
        if (iAmPledgor) {
            String hash = e.get("cdmHash").asText();
            String doc = payloads.get(hash);
            if (doc != null && Cdm.keccakHex(doc).equalsIgnoreCase(hash) && !CdmRepoMargin.isStatement(doc)) {
                CdmInterest.verify(doc);
                store.recordDocument(id, "CollateralInterestStatement", "in", hash, doc);
            }
        }
    }

    private String counterparty() {
        return cfg.partyId.equals("B") ? "A" : "B";
    }

    // --- triparty terms (task-triparty-terms-profile, wp-adr-triparty-terms-profile) ---
    // The giver (A or B) builds the cdm-ext TripartyTerms with the other party as the receiver and BANK-T as the agent,
    // stores the document for the three parties and proposes its hash on TripartySettlement. The receiver and the agent
    // each check the document against the terms they build themselves before affirming the hash; the receiver also
    // checks the GMRA terms hash against its own GMRA terms in force. The terms take effect when both have affirmed.

    /** Triparty documents that checked, by hash and this party's role; a failed check is not kept, so it is retried. */
    private final Set<String> tripartyChecked = ConcurrentHashMap.newKeySet();

    private void tripartyRoutes(Javalin app) {
        app.get("/api/v1/triparty", this::triparty);
        app.post("/api/v1/triparty/terms", this::proposeTripartyTerms);
        app.post("/api/v1/triparty/terms/{id}/affirm", this::affirmTripartyTerms);
        app.post("/api/v1/triparty/terms/{id}/refuse", ctx -> ctx.json(tripartyStep(ctx.pathParam("id"), "refuse")));
        app.post("/api/v1/triparty/terms/{id}/terminate", ctx -> ctx.json(tripartyStep(ctx.pathParam("id"), "terminate")));
        app.post("/api/v1/triparty/terms/{id}/deposit", this::depositTriparty);
        app.post("/api/v1/triparty/terms/{id}/withdraw", this::withdrawTriparty);
        app.post("/api/v1/triparty/terms/{id}/repos", this::requestTripartyRepo);
        app.post("/api/v1/triparty/repos/{id}/affirm", this::affirmTripartyRequest);
        app.post("/api/v1/triparty/repos/{id}/allocate", this::allocateTripartyRepo);
        app.post("/api/v1/triparty/repos/{id}/refuse-allocation", ctx -> ctx.json(tripartyRepoStep(ctx.pathParam("id"), "refuse-allocation")));
        app.post("/api/v1/triparty/repos/{id}/settle", this::settleTripartyPurchase);
        app.post("/api/v1/triparty/repos/{id}/cancel", ctx -> ctx.json(tripartyRepoStep(ctx.pathParam("id"), "cancel")));
        app.post("/api/v1/triparty/repos/{id}/revalue", this::revalueTripartyRepo);
        app.post("/api/v1/triparty/repos/{id}/substitution", this::requestTripartySubstitution);
        app.post("/api/v1/triparty/repos/{id}/substitution/withdraw", this::withdrawTripartySubstitution);
        app.post("/api/v1/triparty/repos/{id}/substitute", this::substituteTripartyRepo);
        app.post("/api/v1/triparty/repos/{id}/rebalance", this::rebalanceTripartyRepo);
        app.post("/api/v1/triparty/repos/{id}/trade-end", this::prepareTripartyTradeEnd);
        app.post("/api/v1/triparty/terms/{id}/report", this::sendTripartyReport);
        app.post("/api/v1/triparty/repos/{id}/repurchase", this::settleTripartyRepurchase);
    }

    private List<String> tripartyParties() {
        return List.of(cfg.partyAddress("A"), cfg.partyAddress("B"), cfg.partyAddress("T"));
    }

    /** The hash of the GMRA terms in force between A and B (cdm-ext GmraTerms), which the triparty terms name. */
    private String gmraTermsHashInForce() {
        return Cdm.keccakHex(CdmRuntime.toJson(gmraFold().terms().terms()));
    }

    private String bankOf(String address) {
        return cfg.bankName(partyIdOf(address));
    }

    /** Check a proposed document against this party's own build; the receiver also checks the GMRA terms hash. */
    private Optional<String> tripartyProblem(JsonNode t) {
        String hash = t.get("termsHash").asText();
        String role = t.get("receiver").asText().equalsIgnoreCase(cfg.myAddress) ? "receiver" : "";
        if (tripartyChecked.contains(hash + role)) return Optional.empty();
        Optional<String> problem = checkTriparty(t, hash, role);
        if (problem.isEmpty()) tripartyChecked.add(hash + role);
        return problem;
    }

    private Optional<String> checkTriparty(JsonNode t, String hash, String role) {
        try {
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) return Optional.of("the terms are not in the payload store or their hash differs");
            CdmTriparty.Terms v = CdmTriparty.verify(doc, bankOf(t.get("giver").asText()), bankOf(t.get("receiver").asText()),
                    bankOf(t.get("agent").asText()), cfg.isin("tUST"), cfg.isin("tAGY"));
            if (!role.isEmpty() && !v.terms().getGmraTermsHash().equalsIgnoreCase(gmraTermsHashInForce()))
                return Optional.of("the terms name GMRA terms other than those in force");
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    private JsonNode tripartyOnChain(String termsId) {
        JsonNode t = gw.get("/triparty/terms/" + termsId);
        if (t.get("state").asText().equals("none")) throw new IllegalArgumentException("no triparty terms " + termsId);
        return t;
    }

    /** The triparty terms this party is named in, newest first, with the document checked and the steps open to it. */
    private void triparty(Context ctx) {
        JsonNode all = gw.getQuery("/triparty/terms", Map.of("party", cfg.myAddress));
        Map<String, Map<String, Object>> completion = movementCompletion("triparty");
        List<Map<String, Object>> terms = new ArrayList<>();
        boolean open = false;
        for (int i = all.size() - 1; i >= 0; i--) {
            JsonNode t = all.get(i);
            String state = t.get("state").asText();
            boolean giver = t.get("giver").asText().equalsIgnoreCase(cfg.myAddress);
            boolean receiver = t.get("receiver").asText().equalsIgnoreCase(cfg.myAddress);
            boolean agent = t.get("agent").asText().equalsIgnoreCase(cfg.myAddress);
            if (giver && (state.equals("proposed") || state.equals("effective"))) open = true;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("termsId", t.get("termsId").asText());
            m.put("state", state);
            m.put("giver", partyIdOf(t.get("giver").asText()));
            m.put("receiver", partyIdOf(t.get("receiver").asText()));
            m.put("agent", partyIdOf(t.get("agent").asText()));
            m.put("termsHash", t.get("termsHash").asText());
            m.put("receiverAffirmed", t.get("receiverAffirmed").asBoolean());
            m.put("agentAffirmed", t.get("agentAffirmed").asBoolean());
            Optional<String> problem = tripartyProblem(t);
            m.put("verified", problem.isEmpty());
            m.put("problem", problem.orElse(null));
            String doc = payloads.get(t.get("termsHash").asText());
            if (doc != null) {
                try {
                    Map<String, Object> v = CdmTriparty.view(CdmTriparty.parse(doc));
                    @SuppressWarnings("unchecked") List<Map<String, Object>> profile = (List<Map<String, Object>>) v.get("profile");
                    for (Map<String, Object> e : profile) e.put("token", symbolOfIsin(String.valueOf(e.get("isin"))));
                    m.put("terms", v);
                } catch (Exception ignored) {
                    // shown without the document's fields
                }
            }
            boolean proposed = state.equals("proposed");
            m.put("canAffirm", proposed && ((receiver && !t.get("receiverAffirmed").asBoolean()) || (agent && !t.get("agentAffirmed").asBoolean())) && problem.isEmpty());
            m.put("canRefuse", proposed && (giver || receiver || agent));
            m.put("canTerminate", state.equals("effective") && (giver || receiver));
            boolean effective = state.equals("effective");
            m.put("canDeposit", effective && giver && problem.isEmpty());
            m.put("canRequest", effective && giver && problem.isEmpty());
            withMovementCompletion(m, t.get("termsId").asText(), completion); // deposits and withdrawals
            if (effective) {
                m.put("free", tripartyFreeView(t.get("termsId").asText()));
                List<Map<String, Object>> repos = tripartyRepos(t, problem.isEmpty());
                for (Map<String, Object> r : repos) withMovementCompletion(r, String.valueOf(r.get("repoId")), completion);
                m.put("repos", repos);
                tripartyReportView(m, t, agent);
                m.put("canSendReport", agent && problem.isEmpty());
            }
            terms.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("party", cfg.partyId);
        out.put("bank", cfg.bankName(cfg.partyId));
        out.put("agent", cfg.isAgent());
        out.put("canPropose", !cfg.isAgent() && !open);
        out.put("terms", terms);
        ctx.json(out);
    }

    /** The giver proposes the baseline triparty terms with the counterparty as the receiver and BANK-T as the agent. */
    private void proposeTripartyTerms(Context ctx) {
        if (cfg.isAgent()) throw new IllegalArgumentException("the agent does not propose triparty terms");
        GmraFold f = gmraFold();
        if (!f.verified()) throw new IllegalStateException("the GMRA terms do not verify: " + f.problem());
        String receiver = counterparty();
        CdmTriparty.Terms t = CdmTriparty.build(cfg.bankName(cfg.partyId), cfg.bankName(receiver), CdmTriparty.AGENT,
                gmraTermsHashInForce(), LocalDate.now(), cfg.isin("tUST"), cfg.isin("tAGY"));
        payloads.put(t.hash(), t.json(), tripartyParties());
        JsonNode r = gw.post("/triparty/terms", Map.of("receiver", cfg.partyAddress(receiver), "agent", cfg.partyAddress("T"), "termsHash", t.hash()));
        ctx.json(Map.of("termsId", r.get("termsId").asText(), "termsHash", t.hash(), "txHash", r.get("txHash").asText()));
    }

    /** The receiver or the agent affirms proposed terms after checking the document against its own build. */
    private void affirmTripartyTerms(Context ctx) {
        JsonNode t = tripartyOnChain(ctx.pathParam("id"));
        if (!t.get("state").asText().equals("proposed")) throw new IllegalStateException("the triparty terms are not proposed");
        if (!t.get("receiver").asText().equalsIgnoreCase(cfg.myAddress) && !t.get("agent").asText().equalsIgnoreCase(cfg.myAddress))
            throw new IllegalArgumentException("only the receiver or the agent affirms triparty terms");
        Optional<String> problem = tripartyProblem(t);
        if (problem.isPresent()) throw new IllegalStateException("the triparty terms do not check: " + problem.get());
        ctx.json(gw.post("/triparty/terms/" + ctx.pathParam("id") + "/affirm", Map.of("termsHash", t.get("termsHash").asText())));
    }

    // --- CCP membership (task-ccp-membership, wp-adr-ccp-membership) ---
    // The CCP BANK-C builds the cdm-ext CcpRulebook naming BANK-A and BANK-B, stores it for the three parties and
    // publishes its hash on CcpClearing with its capital. Each member rebuilds the rulebook from the parties and the
    // effective date it states, and affirms the hash with its default fund share only when the documents are identical.
    // A paid member that clears no repo may leave and get its share back, and rejoin.

    /** Rulebooks that checked, by hash; a failed check is not kept, so it is retried. */
    private final Set<String> ccpChecked = ConcurrentHashMap.newKeySet();

    private void ccpRoutes(Javalin app) {
        app.get("/api/v1/ccp", this::ccp);
        app.post("/api/v1/ccp/rulebook", this::publishCcpRulebook);
        app.post("/api/v1/ccp/join", ctx -> ctx.json(ccpMemberStep("join")));
        app.post("/api/v1/ccp/leave", ctx -> ctx.json(ccpMemberStep("leave")));
        app.get("/api/v1/ccp/clearings", this::ccpClearings);
        app.post("/api/v1/ccp/clearings", this::submitCcpClearing);
        app.post("/api/v1/ccp/clearings/{id}/affirm", this::affirmCcpClearing);
        app.post("/api/v1/ccp/clearings/{id}/accept", this::acceptCcpClearing);
        app.post("/api/v1/ccp/clearings/{id}/refuse", this::refuseCcpClearing);
        app.post("/api/v1/ccp/clearings/{id}/instruct", this::instructCcpCleared);
        app.get("/api/v1/ccp/margin", this::ccpMargin);
        app.post("/api/v1/ccp/margin", this::issueCcpMargin);
        app.post("/api/v1/ccp/margin/{id}/pay", this::payCcpMargin);
        app.post("/api/v1/ccp/margin/{id}/cancel", this::cancelCcpMargin);
        app.get("/api/v1/ccp/defaults", this::ccpDefaults);
        app.post("/api/v1/ccp/defaults", this::declareCcpDefault);
        app.post("/api/v1/ccp/defaults/{hash}/pay", this::payCcpDefaultDue);
        app.post("/api/v1/ccp/members", this::admitCcpMember);
        app.post("/api/v1/ccp/clearings/{id}/porting", this::requestCcpPorting);
        app.post("/api/v1/ccp/clearings/{id}/porting/accept", this::acceptCcpPorting);
        app.post("/api/v1/ccp/clearings/{id}/porting/approve", this::approveCcpPorting);
        app.post("/api/v1/ccp/clearings/{id}/porting/refuse", this::refuseCcpPorting);
    }

    /** The CCP's documents go to the CCP, the rulebook's members and BANK-T, which the CCP may admit (wp-adr-ccp-porting). */
    private List<String> ccpParties() {
        return List.of(cfg.partyAddress("C"), cfg.partyAddress("A"), cfg.partyAddress("B"), cfg.partyAddress("T"));
    }

    private List<String> ccpMemberNames() {
        return List.of(cfg.bankName("A"), cfg.bankName("B"));
    }

    /** The CCP's rulebook on CcpClearing, or null when it has published none. */
    private JsonNode ccpRulebookOnChain() {
        JsonNode r = gw.getQuery("/ccp/rulebook", Map.of("ccp", cfg.partyAddress("C"))).get("rulebook");
        return r == null || r.isNull() ? null : r;
    }

    /** Check the published document against this party's own build. */
    private Optional<String> ccpProblem(JsonNode r) {
        String hash = r.get("rulebookHash").asText();
        // Keyed by the number of members too: an admission (wp-adr-ccp-porting) adds one, which is checked in turn.
        String key = hash + ":" + r.get("members").size();
        if (ccpChecked.contains(key)) return Optional.empty();
        try {
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) return Optional.of("the rulebook is not in the payload store or its hash differs");
            CdmCcp.Rulebook v = CdmCcp.verify(doc, bankOf(r.get("ccp").asText()), ccpMemberNames());
            if (!r.get("token").asText().equalsIgnoreCase(cfg.tokenAddress("tUSD"))) return Optional.of("the default fund is not paid in tUSD");
            if (new BigInteger(r.get("capital").asText()).longValueExact() != v.capital()) return Optional.of("the capital paid differs from the rulebook");
            int named = 0;
            for (JsonNode m : r.get("members")) {
                String admission = m.path("admissionHash").asText(ZERO_HASH);
                if (!admission.equals(ZERO_HASH)) {
                    String adoc = payloads.get(admission);
                    if (adoc == null || !Cdm.keccakHex(adoc).equalsIgnoreCase(admission))
                        return Optional.of("an admission is not in the payload store or its hash differs");
                    CdmCcp.Admission a = CdmCcp.verifyAdmission(adoc, hash, bankOf(r.get("ccp").asText()), bankOf(m.get("member").asText()));
                    if (new BigInteger(m.get("share").asText()).longValueExact() != a.share()) return Optional.of("an admitted member's share on chain differs from its admission");
                    continue;
                }
                named++;
                Long share = v.shares().get(bankOf(m.get("member").asText()));
                if (share == null || new BigInteger(m.get("share").asText()).longValueExact() != share)
                    return Optional.of("the members or shares on chain differ from the rulebook");
            }
            if (named != v.shares().size()) return Optional.of("the members on chain differ from the rulebook");
            ccpChecked.add(key);
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    /** The CCP's rulebook with the document checked, the members' payments and the steps open to this party. */
    private void ccp(Context ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("party", cfg.partyId);
        out.put("bank", cfg.bankName(cfg.partyId));
        out.put("ccp", cfg.isCcp());
        JsonNode r = cfg.registry.get("parties").has("ccp") ? ccpRulebookOnChain() : null;
        out.put("canPublish", cfg.isCcp() && r == null);
        if (r == null) {
            out.put("rulebook", null);
            ctx.json(out);
            return;
        }
        Optional<String> problem = ccpProblem(r);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rulebookHash", r.get("rulebookHash").asText());
        m.put("state", r.get("state").asText());
        m.put("capital", new BigInteger(r.get("capital").asText()).longValueExact());
        m.put("fund", new BigInteger(r.get("fund").asText()).longValueExact());
        m.put("verified", problem.isEmpty());
        m.put("problem", problem.orElse(null));
        List<Map<String, Object>> members = new ArrayList<>();
        Map<String, Object> mine = null;
        for (JsonNode x : r.get("members")) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("party", partyIdOf(x.get("member").asText()));
            e.put("bank", bankOf(x.get("member").asText()));
            e.put("share", new BigInteger(x.get("share").asText()).longValueExact());
            e.put("paid", x.get("paid").asBoolean());
            e.put("contributed", new BigInteger(x.path("contributed").asText("0")).longValueExact());
            e.put("imHeld", new BigInteger(x.path("imHeld").asText("0")).longValueExact());
            e.put("admitted", !x.path("admissionHash").asText(ZERO_HASH).equals(ZERO_HASH));
            members.add(e);
            if (x.get("member").asText().equalsIgnoreCase(cfg.myAddress)) mine = e;
        }
        m.put("members", members);
        String doc = payloads.get(r.get("rulebookHash").asText());
        if (doc != null) {
            try {
                m.put("rulebook", CdmCcp.view(CdmCcp.parse(doc)));
            } catch (Exception ignored) {
                // shown without the document's fields
            }
        }
        m.put("canJoin", mine != null && !Boolean.TRUE.equals(mine.get("paid")) && problem.isEmpty());
        m.put("canLeave", mine != null && Boolean.TRUE.equals(mine.get("paid")));
        // The CCP may admit BANK-T (wp-adr-ccp-porting) once the rulebook is in effect.
        boolean tNamed = members.stream().anyMatch(x -> "T".equals(x.get("party")));
        m.put("canAdmit", cfg.isCcp() && r.get("state").asText().equals("Effective") && !tNamed ? List.of("T") : List.of());
        out.put("rulebook", m);
        ctx.json(out);
    }

    /** The CCP publishes the baseline rulebook naming BANK-A and BANK-B and pays its capital. */
    private void publishCcpRulebook(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP publishes the rulebook");
        if (ccpRulebookOnChain() != null) throw new IllegalStateException("the CCP has published its rulebook");
        CdmCcp.Rulebook rb = CdmCcp.build(cfg.bankName("C"), ccpMemberNames(), LocalDate.now());
        payloads.put(rb.hash(), rb.json(), ccpParties());
        List<String> members = List.of(cfg.partyAddress("A"), cfg.partyAddress("B"));
        List<String> shares = rb.shares().values().stream().map(String::valueOf).toList();
        JsonNode tx = gw.post("/ccp/rulebook", Map.of("rulebookHash", rb.hash(), "token", cfg.tokenAddress("tUSD"),
                "members", members, "shares", shares, "capital", String.valueOf(rb.capital())));
        ctx.json(Map.of("rulebookHash", rb.hash(), "txHash", tx.get("txHash").asText()));
    }

    /** A member joins (after checking the rulebook) or leaves. */
    private JsonNode ccpMemberStep(String step) {
        if (cfg.isCcp()) throw new IllegalArgumentException("the CCP is not a member");
        JsonNode r = ccpRulebookOnChain();
        if (r == null) throw new IllegalStateException("the CCP has published no rulebook");
        if (step.equals("join")) {
            Optional<String> problem = ccpProblem(r);
            if (problem.isPresent()) throw new IllegalStateException("the rulebook does not check: " + problem.get());
        }
        JsonNode tx = gw.post("/ccp/rulebook/" + r.get("rulebookHash").asText() + "/" + step, Map.of());
        return tx;
    }

    // --- CCP clearing (task-ccp-clearing, wp-adr-ccp-clearing) ---
    // The seller of an affirmed repo builds the cdm-ext CcpNovation (CDM's clearing split into a leg with the CCP for
    // each member) under the CCP's rulebook, stores it for the three parties and submits its hash. The buyer rebuilds it
    // from its own booking and affirms; the CCP rebuilds it from the bilateral trade the event carries, checks it against
    // the repo on chain, the rulebook and its eligible securities, and accepts or refuses. Each member then instructs the
    // settlement document of its own leg for the purchase and, on the Repurchase Date, the repurchase.

    /** Novations that checked, by hash; a failed check is not kept, so it is retried. */
    private final Map<String, CdmCcp.Novation> ccpNovations = new ConcurrentHashMap<>();

    /** The bilateral trade this party checks a novation against: its own booking for a member, the carried trade for the CCP. */
    private TradeState ccpBilateralTrade(JsonNode repo, String novationJson) {
        boolean party = repo.get("seller").asText().equalsIgnoreCase(cfg.myAddress) || repo.get("buyer").asText().equalsIgnoreCase(cfg.myAddress);
        // The CCP, and a member a leg was ported to (wp-adr-ccp-porting), check the trade the clearing event carries.
        if (cfg.isCcp() || !party) return CdmCcp.bilateralOf(CdmCcp.parseNovation(novationJson));
        CdmRepo.Booking b = repoBooking(repo);
        if (b == null) throw new IllegalStateException("the booked document is not in the payload store");
        return b.trade();
    }

    /** What is wrong between the bilateral repo on chain and the trade the novation clears, or null. */
    private String ccpTradeProblem(JsonNode repo, TradeState trade) {
        CdmRepo.Terms t = CdmRepo.terms(trade);
        if (!repo.get("repoId").asText().equalsIgnoreCase(t.tradeId())) return "the trade identifier is not the repo id";
        if (!bankOf(repo.get("seller").asText()).equals(t.seller()) || !bankOf(repo.get("buyer").asText()).equals(t.buyer())) return "the parties are not the repo's";
        String sym = symbolByAddress.get(repo.get("security").asText().toLowerCase());
        if (sym == null || !cfg.isin(sym).equals(t.isin())) return "the security token is not the trade's security";
        if (!"tUSD".equals(symbolByAddress.get(repo.get("cash").asText().toLowerCase()))) return "the cash token is not tUSD";
        if (repo.get("quantity").asLong() != t.quantity() || repo.get("purchasePrice").asLong() != t.purchasePrice()) return "the on-chain amounts are not the trade's";
        long rp = CdmRuntime.fn(cdmx.collateral.repo.functions.RepoRepurchasePrice.class).evaluate(trade, CdmRepo.CASH_PRECISION).getValue().longValueExact();
        if (repo.get("repurchasePrice").asLong() != rp) return "the on-chain Repurchase Price is not RepoRepurchasePrice over the trade";
        if (repo.path("buySellBack").asBoolean(false)) return "a buy/sell-back is not cleared";
        return null;
    }

    /** Check a clearing's novation against this party's own build; returns the novation, or throws with the reason. */
    private CdmCcp.Novation ccpNovation(JsonNode c) {
        String hash = c.get("novationHash").asText();
        CdmCcp.Novation cached = ccpNovations.get(hash);
        if (cached != null) return cached;
        String doc = payloads.get(hash);
        if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the novation is not in the payload store or its hash differs");
        JsonNode repo = gw.get("/repos/" + c.get("repoId").asText());
        TradeState bilateral = ccpBilateralTrade(repo, doc);
        String problem = ccpTradeProblem(repo, bilateral);
        if (problem != null) throw new IllegalStateException(problem);
        JsonNode rb = gw.get("/ccp/rulebook/" + c.get("rulebookHash").asText()).get("rulebook");
        if (rb == null || rb.isNull()) throw new IllegalStateException("the rulebook is not on chain");
        Optional<String> rbProblem = ccpProblem(rb);
        if (rbProblem.isPresent()) throw new IllegalStateException("the rulebook does not check: " + rbProblem.get());
        CdmCcp.Novation n = CdmCcp.verifyNovation(doc, bilateral, c.get("rulebookHash").asText(), repo.get("tradeHash").asText(), bankOf(c.get("ccp").asText()));
        ccpNovations.put(hash, n);
        return n;
    }

    private JsonNode ccpClearingOnChain(String repoId) {
        JsonNode c = gw.get("/ccp/clearings/" + repoId).get("clearing");
        if (c == null || c.isNull()) throw new IllegalArgumentException("repo " + repoId + " is not submitted for clearing");
        return c;
    }

    /** The clearings this party is named in, newest first, with the novation checked and the steps open to it. */
    private void ccpClearings(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode all = cfg.registry.get("parties").has("ccp") ? gw.getQuery("/ccp/clearings", Map.of("party", cfg.myAddress)) : null;
        if (all != null) for (JsonNode c : all) out.add(0, ccpClearingView(c));
        ctx.json(Map.of("businessDate", businessDate.toString(), "clearings", out));
    }

    private Map<String, Object> ccpClearingView(JsonNode c) {
        Map<String, Object> m = new LinkedHashMap<>();
        String state = c.get("state").asText();
        boolean seller = c.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        boolean buyer = c.get("buyer").asText().equalsIgnoreCase(cfg.myAddress);
        boolean ccp = c.get("ccp").asText().equalsIgnoreCase(cfg.myAddress);
        m.put("repoId", c.get("repoId").asText());
        m.put("state", state);
        m.put("role", seller ? "seller" : buyer ? "buyer" : ccp ? "ccp" : "");
        m.put("seller", partyIdOf(c.get("seller").asText()));
        m.put("buyer", partyIdOf(c.get("buyer").asText()));
        m.put("ccp", partyIdOf(c.get("ccp").asText()));
        m.put("security", symbolByAddress.get(c.get("security").asText().toLowerCase()));
        m.put("quantity", c.get("quantity").asLong());
        m.put("purchasePrice", c.get("purchasePrice").asLong());
        m.put("repurchasePrice", c.get("repurchasePrice").asLong());
        m.put("novationHash", c.get("novationHash").asText());
        boolean sellerInstructed = !c.get("sellerLegHash").asText().equals(ZERO_HASH), buyerInstructed = !c.get("buyerLegHash").asText().equals(ZERO_HASH);
        m.put("sellerInstructed", sellerInstructed);
        m.put("buyerInstructed", buyerInstructed);
        String problem = null;
        CdmCcp.Novation n = null;
        try {
            n = ccpNovation(c);
            if (ccp) {
                String isin = CdmRepo.terms(n.sellerLeg()).isin();
                if (!CdmCcp.eligible(cfg.isin("tUST"), cfg.isin("tAGY")).contains(isin)) problem = "the security is not eligible at the CCP";
            }
        } catch (Exception e) {
            problem = String.valueOf(e.getMessage());
        }
        m.put("verified", problem == null);
        m.put("problem", problem);
        m.put("vmBalance", new BigInteger(c.path("vmBalance").asText("0")).longValueExact());
        Map<String, Object> pv = null;
        JsonNode p = c.path("porting");
        if (!p.isMissingNode() && !p.isNull()) {
            pv = new LinkedHashMap<>();
            pv.put("from", partyIdOf(p.get("from").asText()));
            pv.put("to", partyIdOf(p.get("to").asText()));
            pv.put("payment", new BigInteger(p.get("payment").asText()).longValueExact());
            pv.put("state", p.get("state").asText());
            pv.put("portingHash", p.get("portingHash").asText());
            String pp = null;
            if (n != null) {
                try {
                    ccpPortingCheck(c, n);
                } catch (Exception e) {
                    pp = String.valueOf(e.getMessage());
                }
            } else {
                pp = "the novation does not check";
            }
            pv.put("verified", pp == null);
            pv.put("problem", pp);
        }
        m.put("porting", pv);
        TradeState[] current = null;
        if (n != null) {
            try {
                current = ccpLegs(c, n);
            } catch (Exception e) {
                if (problem == null) problem = String.valueOf(e.getMessage());
                m.put("verified", false);
                m.put("problem", problem);
            }
        }
        if (n != null && current != null) {
            CdmRepo.Terms s = CdmRepo.terms(current[0]), b = CdmRepo.terms(current[1]);
            m.put("legs", List.of(
                    Map.of("tradeId", s.tradeId(), "seller", s.seller(), "buyer", s.buyer()),
                    Map.of("tradeId", b.tradeId(), "seller", b.seller(), "buyer", b.buyer())));
            m.put("repurchaseDate", s.repurchaseDate().toString());
            m.put("repurchaseDue", !businessDate.isBefore(s.repurchaseDate()));
            m.put("cleared", CdmRuntime.fn(cdm.event.qualification.functions.Qualify_ClearedTrade.class).evaluate(n.novation().getClearing()));
        }
        boolean ok = problem == null;
        m.put("canAffirm", buyer && state.equals("submitted") && ok);
        m.put("canAccept", ccp && state.equals("affirmed") && ok);
        m.put("canRefuse", ccp && (state.equals("submitted") || state.equals("affirmed")));
        boolean mineInstructed = seller ? sellerInstructed : buyerInstructed;
        boolean due = state.equals("cleared") || (state.equals("purchased") && Boolean.TRUE.equals(m.get("repurchaseDue")));
        String pstate = pv == null ? "none" : String.valueOf(pv.get("state"));
        boolean portingOpen = pstate.equals("requested") || pstate.equals("accepted");
        m.put("canInstruct", (seller || buyer) && due && !mineInstructed && ok && !portingOpen);
        m.put("phase", state.equals("purchased") ? "repurchase" : "purchase");
        // Porting (wp-adr-ccp-porting): a party to a purchased repo may move its leg to another paid member, once.
        List<String> targets = new ArrayList<>();
        if ((seller || buyer) && ok && state.equals("purchased") && (pstate.equals("none") || pstate.equals("refused")) && !sellerInstructed && !buyerInstructed) {
            JsonNode rb = ccpRulebookOnChain();
            if (rb != null) for (JsonNode x : rb.get("members")) {
                String a = x.get("member").asText();
                if (x.get("paid").asBoolean() && !a.equalsIgnoreCase(c.get("seller").asText()) && !a.equalsIgnoreCase(c.get("buyer").asText())) targets.add(partyIdOf(a));
            }
        }
        m.put("canPortTo", targets);
        boolean pok = pv != null && Boolean.TRUE.equals(pv.get("verified"));
        boolean to = pv != null && p.get("to").asText().equalsIgnoreCase(cfg.myAddress);
        m.put("canAcceptPorting", to && pstate.equals("requested") && pok);
        m.put("canApprovePorting", ccp && pstate.equals("accepted") && pok);
        m.put("canRefusePorting", (ccp || to) && portingOpen);
        return m;
    }

    /** The seller submits its affirmed repo to the CCP BANK-C under the CCP's rulebook in effect. */
    private void submitCcpClearing(Context ctx) {
        String id = String.valueOf(body(ctx).get("repoId"));
        JsonNode repo = gw.get("/repos/" + id);
        if (!repo.get("seller").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the seller submits repo " + id);
        if (!repo.get("state").asText().equals("affirmed")) throw new IllegalStateException("repo " + id + " is not affirmed");
        JsonNode rb = ccpRulebookOnChain();
        if (rb == null || !rb.get("state").asText().equals("Effective")) throw new IllegalStateException("the CCP's rulebook is not in effect");
        Optional<String> rbProblem = ccpProblem(rb);
        if (rbProblem.isPresent()) throw new IllegalStateException("the rulebook does not check: " + rbProblem.get());
        CdmRepo.Booking b = repoBooking(repo);
        if (b == null) throw new IllegalStateException("the booked document is not in the payload store");
        String problem = ccpTradeProblem(repo, b.trade());
        if (problem != null) throw new IllegalStateException(problem);
        CdmCcp.Novation n = CdmCcp.novation(rb.get("rulebookHash").asText(), b.trade(), b.hash(), cfg.bankName("C"));
        store.recordDocument(id, "CcpNovation", "out", n.hash(), n.json());
        payloads.put(n.hash(), n.json(), ccpParties());
        ccpNovations.put(n.hash(), n);
        JsonNode tx = gw.post("/ccp/clearings", Map.of("repoId", id, "ccp", cfg.partyAddress("C"), "novationHash", n.hash()));
        ctx.json(Map.of("repoId", id, "novationHash", n.hash(), "txHash", tx.path("txHash").asText()));
    }

    /** The buyer affirms the seller's submission after rebuilding the novation from its own booking. */
    private void affirmCcpClearing(Context ctx) {
        JsonNode c = ccpClearingOnChain(ctx.pathParam("id"));
        if (!c.get("buyer").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the buyer affirms the submission");
        if (!c.get("state").asText().equals("submitted")) throw new IllegalStateException("the clearing is not submitted");
        CdmCcp.Novation n = ccpNovation(c);
        ctx.json(gw.post("/ccp/clearings/" + ctx.pathParam("id") + "/affirm", Map.of("novationHash", n.hash())));
    }

    /** The CCP accepts an affirmed submission after its checks. */
    private void acceptCcpClearing(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP accepts a clearing");
        JsonNode c = ccpClearingOnChain(ctx.pathParam("id"));
        Map<String, Object> v = ccpClearingView(c);
        if (!Boolean.TRUE.equals(v.get("canAccept"))) throw new IllegalStateException("the clearing cannot be accepted: " + (v.get("problem") != null ? v.get("problem") : "it is " + v.get("state")));
        ctx.json(gw.post("/ccp/clearings/" + ctx.pathParam("id") + "/accept", Map.of()));
    }

    /** The CCP refuses a submission with a reason, stored for the three parties; the repo stays bilateral. */
    private void refuseCcpClearing(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP refuses a clearing");
        String id = ctx.pathParam("id");
        ccpClearingOnChain(id);
        String reason = String.valueOf(body(ctx).getOrDefault("reason", "refused by the CCP"));
        String json = CdmRuntime.toJson(Map.of("repoId", id, "reason", reason));
        String hash = Cdm.keccakHex(json);
        payloads.put(hash, json, ccpParties());
        ctx.json(gw.post("/ccp/clearings/" + id + "/refuse", Map.of("reasonHash", hash)));
    }

    /** A member instructs its own leg: the purchase once cleared, the repurchase on or after the Repurchase Date. */
    private void instructCcpCleared(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode c = ccpClearingOnChain(id);
        Map<String, Object> v = ccpClearingView(c);
        if (!Boolean.TRUE.equals(v.get("canInstruct")))
            throw new IllegalStateException("leg not open to instruct: " + (v.get("problem") != null ? v.get("problem") : "the clearing is " + v.get("state")));
        CdmCcp.Novation n = ccpNovation(c);
        TradeState[] legs = ccpLegs(c, n);
        TradeState leg = c.get("seller").asText().equalsIgnoreCase(cfg.myAddress) ? legs[0] : legs[1];
        CdmRepo.Settlement s = v.get("phase").equals("purchase") ? CdmRepo.purchase(leg) : CdmRepo.repurchase(leg);
        store.recordDocument(id, "RepoSettlement", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), ccpParties());
        JsonNode tx = gw.post("/ccp/clearings/" + id + "/instruct", Map.of("legHash", s.hash()));
        ctx.json(Map.of("repoId", id, "phase", v.get("phase"), "legHash", s.hash(), "txHash", tx.path("txHash").asText()));
    }

    // --- CCP legs after porting (task-ccp-porting, wp-adr-ccp-porting) ---

    /** Portings that checked, by hash and state; a failed check is not kept, so it is retried. */
    private final Map<String, CdmCcp.Porting> ccpPortings = new ConcurrentHashMap<>();

    /** Check a cleared repo's porting against this party's own build from the novation's leg. While it is pending, the
     *  variation margin it states must be the chain's and its price the feed's. Returns the porting or throws. */
    private CdmCcp.Porting ccpPortingCheck(JsonNode c, CdmCcp.Novation n) {
        JsonNode p = c.get("porting");
        String hash = p.get("portingHash").asText(), state = p.get("state").asText();
        boolean pending = state.equals("requested") || state.equals("accepted");
        String key = hash + ":" + (pending ? "pending" : "final");
        CdmCcp.Porting cached = ccpPortings.get(key);
        if (cached != null) return cached;
        String doc = payloads.get(hash);
        if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the porting is not in the payload store or its hash differs");
        var parsed = CdmCcp.parsePorting(doc);
        boolean seller = parsed.getSeller();
        long vm = parsed.getVariationMarginPaid().longValueExact();
        if (pending) {
            if (vm != new BigInteger(c.path("vmBalance").asText("0")).longValueExact()) throw new IllegalStateException("the porting's variation margin is not the chain's");
            String leaving = seller ? c.get("seller").asText() : c.get("buyer").asText();
            if (!leaving.equalsIgnoreCase(p.get("from").asText())) throw new IllegalStateException("the leaving member is not on the leg the porting moves");
            if (parsed.getPrice().compareTo(feedPrice(c.get("security").asText())) != 0) throw new IllegalStateException("the porting's price is not the feed price");
        }
        CdmCcp.Porting again = CdmCcp.verifyPorting(doc, c.get("rulebookHash").asText(), c.get("repoId").asText(), bankOf(c.get("ccp").asText()),
                bankOf(p.get("from").asText()), bankOf(p.get("to").asText()), seller, seller ? n.sellerLeg() : n.buyerLeg(), vm);
        if (again.payment() != new BigInteger(p.get("payment").asText()).longValueExact()) throw new IllegalStateException("the payment on chain differs from the porting");
        ccpPortings.put(key, again);
        return again;
    }

    /** A cleared repo's current legs, the seller's then the buyer's: the novation's, with a leg an executed porting moved
     *  replaced by the porting's new leg. */
    private TradeState[] ccpLegs(JsonNode c, CdmCcp.Novation n) {
        TradeState s = n.sellerLeg(), b = n.buyerLeg();
        JsonNode p = c.path("porting");
        if (!p.isMissingNode() && !p.isNull() && p.path("state").asText().equals("executed")) {
            CdmCcp.Porting po = ccpPortingCheck(c, n);
            if (po.porting().getSeller()) s = po.newLeg();
            else b = po.newLeg();
        }
        return new TradeState[] {s, b};
    }

    /** An ordered map of key, value pairs, values may be null. */
    private static Map<String, Object> o(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    // --- CCP margin (task-ccp-margin, wp-adr-ccp-margin) ---
    // On its business date the CCP builds each paid member's cdm-ext CcpMarginStatement: a variation margin line for each
    // cleared repo, purchased or repurchased with variation margin still paid, at the feed price, and the initial margin
    // at the rulebook's rate of the member's open cleared repos' Purchase Prices less what it holds. It stores them for
    // the parties and issues the round on CcpClearing. Each member rebuilds its own statement from the chain and the
    // stated prices, which must be the feed's while the round is open, and pays its net.

    /** Margin statements that checked, by hash. */
    private final Set<String> ccpMarginChecked = ConcurrentHashMap.newKeySet();

    private List<JsonNode> ccpAllClearings() {
        List<JsonNode> out = new ArrayList<>();
        if (!cfg.registry.get("parties").has("ccp")) return out;
        for (JsonNode c : gw.getQuery("/ccp/clearings", Map.of("party", cfg.partyAddress("C")))) out.add(c);
        return out;
    }

    private static boolean involves(JsonNode c, String address) {
        return c.get("seller").asText().equalsIgnoreCase(address) || c.get("buyer").asText().equalsIgnoreCase(address);
    }

    private static long vmOf(JsonNode c) {
        return new BigInteger(c.path("vmBalance").asText("0")).longValueExact();
    }

    /** Whether a round counts the repo: purchased, or repurchased with variation margin still to return. */
    private static boolean countsForMargin(JsonNode c) {
        String st = c.get("state").asText();
        return st.equals("purchased") || (st.equals("repurchased") && vmOf(c) != 0);
    }

    private CdmCcp.MarginLine marginLine(JsonNode c, BigDecimal price) {
        CdmCcp.Novation n = ccpNovation(c);
        return new CdmCcp.MarginLine(c.get("repoId").asText(), bankOf(c.get("seller").asText()), bankOf(c.get("buyer").asText()),
                c.get("state").asText().equals("repurchased"), n.sellerLeg(), price, vmOf(c));
    }

    private long imBaseOf(List<JsonNode> all, String address) {
        long base = 0;
        for (JsonNode c : all) {
            String st = c.get("state").asText();
            if ((st.equals("cleared") || st.equals("purchased")) && involves(c, address)) base += c.get("purchasePrice").asLong();
        }
        return base;
    }

    private BigDecimal ccpRate(JsonNode rb) {
        String doc = payloads.get(rb.get("rulebookHash").asText());
        return doc == null ? CdmCcp.IM_RATE : CdmCcp.parse(doc).getInitialMarginRate();
    }

    /** The statements the CCP would issue on its business date, by member address, for members with something to state. */
    private Map<String, CdmCcp.MarginStatement> ccpMarginBuild(JsonNode rb) {
        List<JsonNode> all = ccpAllClearings();
        Map<String, CdmCcp.MarginStatement> out = new LinkedHashMap<>();
        for (JsonNode m : rb.get("members")) {
            if (!m.get("paid").asBoolean()) continue;
            String addr = m.get("member").asText();
            List<CdmCcp.MarginLine> lines = new ArrayList<>();
            for (JsonNode c : all) if (countsForMargin(c) && involves(c, addr)) lines.add(marginLine(c, feedPrice(c.get("security").asText())));
            long held = new BigInteger(m.path("imHeld").asText("0")).longValueExact();
            long base = imBaseOf(all, addr);
            if (lines.isEmpty() && held == 0 && base == 0) continue;
            out.put(addr, CdmCcp.marginStatement(rb.get("rulebookHash").asText(), cfg.bankName("C"), bankOf(addr), businessDate, ccpRate(rb), lines, base, held));
        }
        return out;
    }

    private static Map<String, Object> statementView(CdmCcp.MarginStatement st) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("member", st.statement().getMember());
        v.put("vm", st.vm());
        v.put("im", st.im());
        v.put("net", st.net());
        v.put("imRequired", st.statement().getInitialMarginRequired().longValueExact());
        v.put("imHeld", st.statement().getInitialMarginHeld().longValueExact());
        List<Map<String, Object>> lines = new ArrayList<>();
        for (var l : CdmCcp.lines(st.statement()))
            lines.add(o("repoId", l.getRepoId(), "seller", l.getSeller(), "buyer", l.getBuyer(), "price", l.getPrice().toPlainString(),
                    "exposure", l.getExposure().longValueExact(), "previous", l.getPreviousVariationMargin().longValueExact(),
                    "change", l.getVariationMargin().longValueExact(), "repurchased", l.getRepurchased()));
        v.put("lines", lines);
        v.put("calls", st.statement().getCall() == null ? List.of() : st.statement().getCall().stream().map(x -> String.valueOf(x.getRegMarginType())).toList());
        return v;
    }

    /** Check this member's statement in an issued round: rebuilt from the chain's repos and margin and the stated prices,
     *  which must be the feed's; the chain's amounts must be the statement's. Returns the statement or throws. */
    private CdmCcp.MarginStatement ccpMyStatement(JsonNode round, JsonNode mine, JsonNode rb) {
        String hash = mine.get("statementHash").asText();
        String doc = payloads.get(hash);
        if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the statement is not in the payload store or its hash differs");
        var stated = CdmCcp.parseMargin(doc);
        if (ccpMarginChecked.contains(hash)) return new CdmCcp.MarginStatement(stated, doc, hash);
        if (!round.get("state").asText().equals("issued")) throw new IllegalStateException("the round is " + round.get("state").asText() + "; this service did not check it");
        LocalDate date = CdmCcp.dateOfKey(round.get("businessDate").asText());
        Map<String, Long> onChainVm = new HashMap<>();
        for (JsonNode r : round.get("repos")) onChainVm.put(r.get("repoId").asText().toLowerCase(), new BigInteger(r.get("vm").asText()).longValueExact());
        List<JsonNode> all = ccpAllClearings();
        List<CdmCcp.MarginLine> lines = new ArrayList<>();
        for (JsonNode c : all) {
            if (!countsForMargin(c) || !involves(c, cfg.myAddress)) continue;
            String id = c.get("repoId").asText();
            if (!onChainVm.containsKey(id.toLowerCase())) throw new IllegalStateException("the round leaves out repo " + id);
            BigDecimal price = CdmCcp.statedPrice(stated, id);
            if (price == null) throw new IllegalStateException("the statement has no line for repo " + id);
            if (price.compareTo(feedPrice(c.get("security").asText())) != 0) throw new IllegalStateException("the statement's price for repo " + id + " is not the feed price");
            lines.add(marginLine(c, price));
        }
        long held = 0;
        for (JsonNode m : rb.get("members"))
            if (m.get("member").asText().equalsIgnoreCase(cfg.myAddress)) held = new BigInteger(m.path("imHeld").asText("0")).longValueExact();
        CdmCcp.MarginStatement again = CdmCcp.marginStatement(rb.get("rulebookHash").asText(), bankOf(round.get("ccp").asText()), myBankName(), date,
                ccpRate(rb), lines, imBaseOf(all, cfg.myAddress), held);
        if (!again.json().equals(doc)) throw new IllegalStateException("the statement differs from the statement this member builds");
        if (again.vm() != new BigInteger(mine.get("vm").asText()).longValueExact() || again.im() != new BigInteger(mine.get("im").asText()).longValueExact())
            throw new IllegalStateException("the amounts on chain differ from the statement");
        for (var l : CdmCcp.lines(again.statement()))
            if (onChainVm.get(l.getRepoId().toLowerCase()) != l.getVariationMargin().longValueExact()) throw new IllegalStateException("repo " + l.getRepoId() + "'s change on chain differs from the statement");
        ccpMarginChecked.add(hash);
        return again;
    }

    private String myBankName() {
        return cfg.bankName(cfg.partyId);
    }

    private void ccpMargin(Context ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("businessDate", businessDate.toString());
        out.put("ccp", cfg.isCcp());
        JsonNode rb = cfg.registry.get("parties").has("ccp") ? ccpRulebookOnChain() : null;
        List<Map<String, Object>> rounds = new ArrayList<>();
        boolean open = false;
        if (rb != null) {
            JsonNode all = gw.getQuery("/ccp/margin", Map.of("ccp", cfg.partyAddress("C")));
            for (JsonNode r : all) {
                Map<String, Object> v = new LinkedHashMap<>();
                String state = r.get("state").asText();
                open |= state.equals("issued");
                v.put("roundId", r.get("roundId").asText());
                v.put("businessDate", CdmCcp.dateOfKey(r.get("businessDate").asText()).toString());
                v.put("state", state);
                List<Map<String, Object>> ms = new ArrayList<>();
                JsonNode mine = null;
                for (JsonNode m : r.get("members")) {
                    long vm = new BigInteger(m.get("vm").asText()).longValueExact(), im = new BigInteger(m.get("im").asText()).longValueExact();
                    ms.add(o("party", partyIdOf(m.get("member").asText()), "vm", vm, "im", im, "net", vm + im, "paid", m.get("paid").asBoolean()));
                    if (m.get("member").asText().equalsIgnoreCase(cfg.myAddress)) mine = m;
                }
                v.put("members", ms);
                List<Map<String, Object>> repos = new ArrayList<>();
                for (JsonNode x : r.get("repos")) repos.add(o("repoId", x.get("repoId").asText(), "vm", new BigInteger(x.get("vm").asText()).longValueExact()));
                v.put("repos", repos);
                if (mine != null) {
                    Map<String, Object> mv = new LinkedHashMap<>();
                    try {
                        mv.putAll(statementView(ccpMyStatement(r, mine, rb)));
                        mv.put("verified", true);
                        mv.put("problem", null);
                    } catch (Exception e) {
                        mv.put("verified", false);
                        mv.put("problem", String.valueOf(e.getMessage()));
                    }
                    long net = new BigInteger(mine.get("vm").asText()).add(new BigInteger(mine.get("im").asText())).longValueExact();
                    mv.put("net", net);
                    mv.put("paid", mine.get("paid").asBoolean());
                    mv.put("canPay", state.equals("issued") && net > 0 && !mine.get("paid").asBoolean() && Boolean.TRUE.equals(mv.get("verified")));
                    v.put("mine", mv);
                }
                v.put("canCancel", cfg.isCcp() && state.equals("issued"));
                rounds.add(0, v);
            }
            if (cfg.isCcp() && !open && rb.get("state").asText().equals("Effective")) {
                try {
                    List<Map<String, Object>> preview = new ArrayList<>();
                    for (var e : ccpMarginBuild(rb).entrySet()) {
                        Map<String, Object> pv = statementView(e.getValue());
                        pv.put("party", partyIdOf(e.getKey()));
                        preview.add(pv);
                    }
                    out.put("preview", preview);
                } catch (Exception e) {
                    out.put("previewProblem", String.valueOf(e.getMessage()));
                }
            }
        }
        out.put("canIssue", cfg.isCcp() && rb != null && !open && out.get("preview") instanceof List<?> l && !l.isEmpty());
        out.put("rounds", rounds);
        ctx.json(out);
    }

    /** The CCP issues the round of its business date. */
    private void issueCcpMargin(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP issues margin");
        JsonNode rb = ccpRulebookOnChain();
        if (rb == null || !rb.get("state").asText().equals("Effective")) throw new IllegalStateException("the CCP's rulebook is not in effect");
        Map<String, CdmCcp.MarginStatement> sts = ccpMarginBuild(rb);
        if (sts.isEmpty()) throw new IllegalStateException("no member has margin to state");
        List<String> repoIds = new ArrayList<>(), repoVm = new ArrayList<>(), members = new ArrayList<>(), im = new ArrayList<>(), hashes = new ArrayList<>();
        for (var e : sts.entrySet()) {
            CdmCcp.MarginStatement st = e.getValue();
            store.recordDocument(st.hash(), "CcpMarginStatement", "out", st.hash(), st.json());
            payloads.put(st.hash(), st.json(), ccpParties());
            members.add(e.getKey());
            im.add(String.valueOf(st.im()));
            hashes.add(st.hash());
            for (var l : CdmCcp.lines(st.statement()))
                if (l.getSeller().equals(st.statement().getMember())) {
                    repoIds.add(l.getRepoId());
                    repoVm.add(String.valueOf(l.getVariationMargin().longValueExact()));
                }
        }
        JsonNode tx = gw.post("/ccp/margin", Map.of("businessDate", String.valueOf(CdmCcp.dateKey(businessDate)), "repoIds", repoIds, "repoVm", repoVm,
                "members", members, "im", im, "statementHashes", hashes));
        ctx.json(Map.of("businessDate", businessDate.toString(), "members", members.size(), "txHash", tx.path("txHash").asText()));
    }

    private JsonNode ccpRoundOnChain(String id) {
        JsonNode r = gw.get("/ccp/margin/" + id).get("round");
        if (r == null || r.isNull()) throw new IllegalArgumentException("no margin round " + id);
        return r;
    }

    /** A member pays its net on a round after checking its statement. */
    private void payCcpMargin(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode r = ccpRoundOnChain(id);
        JsonNode mine = null;
        for (JsonNode m : r.get("members")) if (m.get("member").asText().equalsIgnoreCase(cfg.myAddress)) mine = m;
        if (mine == null) throw new IllegalArgumentException("this member is not in round " + id);
        ccpMyStatement(r, mine, ccpRulebookOnChain());
        ctx.json(gw.post("/ccp/margin/" + id + "/pay", Map.of()));
    }

    private void cancelCcpMargin(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP cancels a round");
        ctx.json(gw.post("/ccp/margin/" + ctx.pathParam("id") + "/cancel", Map.of()));
    }

    // --- CCP default (task-ccp-default, wp-adr-ccp-default) ---
    // The CCP declares a paid member's default: the oracle service records it when the feed does not show it, an open
    // margin round is cancelled, and the CCP builds the cdm-ext CcpDefaultManagement: each of the member's cleared repos
    // closed out at the feed price on its business date (both legs terminated with CDM's termination event), the residual
    // after the variation margin paid, and the waterfall. It records the close-out on CcpClearing, which pays the
    // survivors and returns what is left to the defaulter. Each member rebuilds the document from the novations, the
    // stated prices and resources, and compares the chain's amounts.

    /** Default management documents that checked, by hash. */
    private final Set<String> ccpDefaultChecked = ConcurrentHashMap.newKeySet();

    private boolean inDefault(String address) {
        return gw.get("/defaults/" + address).get("inDefault").asBoolean();
    }

    private CdmCcp.Management ccpManagementBuild(JsonNode rb, String defaulter, LocalDate date, Map<String, BigDecimal> prices, CdmCcp.Resources res) {
        List<CdmCcp.DefaultInput> txs = new ArrayList<>();
        for (JsonNode c : ccpAllClearings()) {
            String st = c.get("state").asText();
            if (!involves(c, defaulter) || !(st.equals("cleared") || st.equals("purchased"))) continue;
            txs.add(defaultInput(c, defaulter, prices == null ? feedPrice(c.get("security").asText()) : prices.get(c.get("repoId").asText().toLowerCase())));
        }
        return CdmCcp.defaultManagement(rb.get("rulebookHash").asText(), cfg.bankName("C"), bankOf(defaulter), date, date, txs, res);
    }

    private CdmCcp.DefaultInput defaultInput(JsonNode c, String defaulter, BigDecimal price) {
        CdmCcp.Novation n = ccpNovation(c);
        TradeState[] legs = ccpLegs(c, n);
        boolean seller = c.get("seller").asText().equalsIgnoreCase(defaulter);
        String survivor = bankOf(seller ? c.get("buyer").asText() : c.get("seller").asText());
        boolean purchased = c.get("state").asText().equals("purchased");
        return new CdmCcp.DefaultInput(c.get("repoId").asText(), purchased, seller ? legs[0] : legs[1], seller ? legs[1] : legs[0], survivor,
                purchased ? vmOf(c) : 0, price);
    }

    private CdmCcp.Resources resourcesOf(JsonNode rb, String defaulter) {
        long im = 0, contribution = 0, members = 0;
        for (JsonNode m : rb.get("members")) {
            long c = new BigInteger(m.path("contributed").asText("0")).longValueExact();
            if (m.get("member").asText().equalsIgnoreCase(defaulter)) {
                im = new BigInteger(m.path("imHeld").asText("0")).longValueExact();
                contribution = c;
            } else if (m.get("paid").asBoolean()) {
                members += c;
            }
        }
        return new CdmCcp.Resources(im, contribution, new BigInteger(rb.get("capital").asText()).longValueExact(), members);
    }

    private void ccpDefaults(Context ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("businessDate", businessDate.toString());
        JsonNode rb = cfg.registry.get("parties").has("ccp") ? ccpRulebookOnChain() : null;
        List<Map<String, Object>> members = new ArrayList<>();
        List<Map<String, Object>> defaults = new ArrayList<>();
        if (rb != null) {
            for (JsonNode m : rb.get("members")) {
                if (!m.get("paid").asBoolean()) continue;
                String a = m.get("member").asText();
                members.add(o("party", partyIdOf(a), "inDefault", inDefault(a), "canDeclare", cfg.isCcp()));
            }
            for (JsonNode d : gw.getQuery("/ccp/defaults", Map.of("ccp", cfg.partyAddress("C")))) defaults.add(0, ccpDefaultView(d));
        }
        out.put("members", members);
        out.put("defaults", defaults);
        ctx.json(out);
    }

    private Map<String, Object> ccpDefaultView(JsonNode d) {
        Map<String, Object> v = new LinkedHashMap<>();
        String hash = d.get("closeOutHash").asText();
        v.put("closeOutHash", hash);
        v.put("defaulter", partyIdOf(d.get("defaulter").asText()));
        for (String f : List.of("loss", "fromInitialMargin", "fromDefaulterFund", "fromCapital", "fromMembersFund", "returned", "dueOutstanding"))
            v.put(f, new BigInteger(d.get(f).asText()).longValueExact());
        List<Map<String, Object>> due = new ArrayList<>();
        long mineDue = 0;
        for (JsonNode x : d.get("due")) {
            long a = new BigInteger(x.get("amount").asText()).longValueExact();
            due.add(o("party", partyIdOf(x.get("member").asText()), "amount", a));
            if (x.get("member").asText().equalsIgnoreCase(cfg.myAddress)) mineDue = a;
        }
        v.put("due", due);
        v.put("mineDue", mineDue);
        String problem = null;
        try {
            CdmCcp.Management m = ccpDefaultCheck(d);
            List<Map<String, Object>> txs = new ArrayList<>();
            for (var t : m.management().getTransaction())
                txs.add(o("repoId", t.getRepoId(), "survivor", t.getSurvivor(), "price", t.getSurvivorLeg().getPrice().toPlainString(),
                        "repurchasePrice", t.getSurvivorLeg().getRepurchasePrice().longValueExact(), "defaultMarketValue", t.getSurvivorLeg().getDefaultMarketValue().longValueExact(),
                        "variationMarginPaid", t.getVariationMarginPaid().longValueExact(), "residual", t.getResidual().longValueExact(),
                        "survivorAmount", t.getSurvivorAmount().longValueExact()));
            v.put("transactions", txs);
            v.put("closeOutDate", m.management().getCloseOutDate().toString());
        } catch (Exception e) {
            problem = String.valueOf(e.getMessage());
        }
        v.put("verified", problem == null);
        v.put("problem", problem);
        v.put("canPayDue", mineDue > 0 && problem == null);
        return v;
    }

    /** Check a default management document: it validates and equals the one this party builds from the novations, the
     *  chain's variation margin, and the prices, dates and resources it states; the chain's waterfall must be its own. */
    private CdmCcp.Management ccpDefaultCheck(JsonNode d) {
        String hash = d.get("closeOutHash").asText();
        String doc = payloads.get(hash);
        if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the close-out is not in the payload store or its hash differs");
        var stated = CdmCcp.parseManagement(doc);
        if (ccpDefaultChecked.contains(hash)) return new CdmCcp.Management(stated, doc, hash);
        var failures = CdmRuntime.failures(stated);
        if (!failures.isEmpty()) throw new IllegalStateException("the close-out fails CDM validation: " + failures.get(0));
        String defaulter = d.get("defaulter").asText();
        List<String> onChain = new ArrayList<>();
        for (JsonNode x : d.get("repoIds")) onChain.add(x.asText().toLowerCase());
        List<CdmCcp.DefaultInput> txs = new ArrayList<>();
        for (var t : stated.getTransaction()) {
            if (!onChain.contains(t.getRepoId().toLowerCase())) throw new IllegalStateException("repo " + t.getRepoId() + " is not in the close-out on chain");
            JsonNode c = ccpClearingOnChain(t.getRepoId());
            CdmCcp.DefaultInput in = defaultInputClosed(c, defaulter, t.getSurvivorLeg().getPrice(), t.getPurchased());
            txs.add(in);
        }
        if (txs.size() != onChain.size()) throw new IllegalStateException("the close-out on chain has other repos");
        var w = stated.getWaterfall();
        CdmCcp.Resources res = new CdmCcp.Resources(w.getDefaulterInitialMargin().longValueExact(), w.getDefaulterContribution().longValueExact(),
                w.getCcpCapital().longValueExact(), w.getMembersContribution().longValueExact());
        JsonNode rb = gw.get("/ccp/rulebook/" + stated.getRulebookHash()).get("rulebook");
        CdmCcp.Management again = CdmCcp.defaultManagement(stated.getRulebookHash(), bankOf(d.get("ccp").asText()), bankOf(defaulter),
                stated.getEventOfDefaultDate().toLocalDate(), stated.getCloseOutDate().toLocalDate(), txs, res);
        if (!again.json().equals(doc)) throw new IllegalStateException("the close-out differs from the close-out this party builds");
        if (rb == null || rb.isNull()) throw new IllegalStateException("the rulebook is not on chain");
        long[] chain = {new BigInteger(d.get("loss").asText()).longValueExact(), new BigInteger(d.get("fromInitialMargin").asText()).longValueExact(),
                new BigInteger(d.get("fromDefaulterFund").asText()).longValueExact(), new BigInteger(d.get("fromCapital").asText()).longValueExact(),
                new BigInteger(d.get("fromMembersFund").asText()).longValueExact(), new BigInteger(d.get("returned").asText()).longValueExact()};
        long[] mine = {w.getLoss().longValueExact(), w.getFromDefaulterInitialMargin().longValueExact(), w.getFromDefaulterContribution().longValueExact(),
                w.getFromCcpCapital().longValueExact(), w.getFromMembersContribution().longValueExact(), w.getReturnedToDefaulter().longValueExact()};
        if (!java.util.Arrays.equals(chain, mine)) throw new IllegalStateException("the waterfall on chain differs from the close-out");
        ccpDefaultChecked.add(hash);
        return again;
    }

    /** The input of a closed-out repo, rebuilt from the chain: the parties and variation margin are unchanged by the close-out. */
    private CdmCcp.DefaultInput defaultInputClosed(JsonNode c, String defaulter, BigDecimal price, boolean purchased) {
        CdmCcp.DefaultInput in = defaultInput(c, defaulter, price);
        return new CdmCcp.DefaultInput(in.repoId(), purchased, in.defaulterLeg(), in.survivorLeg(), in.survivor(), purchased ? vmOf(c) : 0, price);
    }

    /** The CCP declares a member's default and closes out its cleared repos. */
    private void declareCcpDefault(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP manages a member's default");
        String member = cfg.partyAddress(String.valueOf(body(ctx).get("member")));
        JsonNode rb = ccpRulebookOnChain();
        if (rb == null) throw new IllegalStateException("the CCP has published no rulebook");
        String defaultTx = null;
        if (!inDefault(member)) {
            JsonNode notified = oracle.post("/defaults", Map.of("party", member, "inDefault", true, "notifiedBy", cfg.bankName("C")));
            defaultTx = notified.path("tx").path("txHash").asText(null);
        }
        for (JsonNode r : gw.getQuery("/ccp/margin", Map.of("ccp", cfg.myAddress)))
            if (r.get("state").asText().equals("issued")) gw.post("/ccp/margin/" + r.get("roundId").asText() + "/cancel", Map.of());
        rb = ccpRulebookOnChain();
        CdmCcp.Management m = ccpManagementBuild(rb, member, businessDate, null, resourcesOf(rb, member));
        store.recordDocument(m.hash(), "CcpDefaultManagement", "out", m.hash(), m.json());
        payloads.put(m.hash(), m.json(), ccpParties());
        List<String> ids = new ArrayList<>(), residuals = new ArrayList<>();
        for (var e : m.residuals().entrySet()) {
            ids.add(e.getKey());
            residuals.add(String.valueOf(e.getValue()));
        }
        JsonNode tx = gw.post("/ccp/defaults", Map.of("defaulter", member, "closeOutHash", m.hash(), "repoIds", ids, "residuals", residuals));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("closeOutHash", m.hash());
        out.put("loss", m.waterfall().getLoss().longValueExact());
        out.put("defaultTx", defaultTx);
        out.put("txHash", tx.path("txHash").asText());
        ctx.json(out);
    }

    private void payCcpDefaultDue(Context ctx) {
        String hash = ctx.pathParam("hash");
        for (JsonNode d : gw.getQuery("/ccp/defaults", Map.of("ccp", cfg.partyAddress("C"))))
            if (d.get("closeOutHash").asText().equalsIgnoreCase(hash)) ccpDefaultCheck(d);
        ctx.json(gw.post("/ccp/defaults/" + hash + "/pay", Map.of()));
    }

    // --- CCP admission and porting (task-ccp-porting, wp-adr-ccp-porting) ---
    // The CCP admits BANK-T with a cdm-ext CcpAdmission naming the rulebook; BANK-T checks it and joins by paying its
    // share. A party to a purchased cleared repo builds the cdm-ext CcpPorting of its leg to another paid member at the
    // feed price (CDM's party change, intent Novation); the receiving member and the CCP each rebuild it, the receiving
    // member accepts and the CCP approves, which moves the payment, and a buyer's securities, on CcpClearing.

    private void admitCcpMember(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP admits a member");
        String party = String.valueOf(body(ctx).getOrDefault("member", "T"));
        JsonNode rb = ccpRulebookOnChain();
        if (rb == null || !rb.get("state").asText().equals("Effective")) throw new IllegalStateException("the CCP's rulebook is not in effect");
        CdmCcp.Admission a = CdmCcp.admission(rb.get("rulebookHash").asText(), cfg.bankName("C"), cfg.bankName(party), businessDate);
        store.recordDocument(a.hash(), "CcpAdmission", "out", a.hash(), a.json());
        payloads.put(a.hash(), a.json(), ccpParties());
        JsonNode tx = gw.post("/ccp/members", Map.of("member", cfg.partyAddress(party), "share", String.valueOf(a.share()), "admissionHash", a.hash()));
        ctx.json(Map.of("admissionHash", a.hash(), "txHash", tx.path("txHash").asText()));
    }

    private void requestCcpPorting(Context ctx) {
        String id = ctx.pathParam("id");
        String to = String.valueOf(body(ctx).get("to"));
        JsonNode c = ccpClearingOnChain(id);
        Map<String, Object> v = ccpClearingView(c);
        @SuppressWarnings("unchecked") List<String> targets = (List<String>) v.get("canPortTo");
        if (!targets.contains(to)) throw new IllegalStateException("the leg cannot be ported to " + to + (v.get("problem") != null ? ": " + v.get("problem") : ""));
        CdmCcp.Novation n = ccpNovation(c);
        boolean seller = c.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        CdmCcp.Porting po = CdmCcp.porting(c.get("rulebookHash").asText(), id, bankOf(c.get("ccp").asText()), myBankName(), cfg.bankName(to), seller,
                businessDate, seller ? n.sellerLeg() : n.buyerLeg(), feedPrice(c.get("security").asText()), vmOf(c));
        store.recordDocument(id, "CcpPorting", "out", po.hash(), po.json());
        payloads.put(po.hash(), po.json(), ccpParties());
        // The receiving member reads the novation to check the leg it takes.
        String nov = payloads.get(c.get("novationHash").asText());
        if (nov != null) payloads.put(c.get("novationHash").asText(), nov, ccpParties());
        JsonNode tx = gw.post("/ccp/clearings/" + id + "/porting", Map.of("to", cfg.partyAddress(to), "portingHash", po.hash(), "payment", String.valueOf(po.payment())));
        ctx.json(Map.of("repoId", id, "portingHash", po.hash(), "payment", po.payment(), "txHash", tx.path("txHash").asText()));
    }

    private void acceptCcpPorting(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode c = ccpClearingOnChain(id);
        Map<String, Object> v = ccpClearingView(c);
        if (!Boolean.TRUE.equals(v.get("canAcceptPorting"))) throw new IllegalStateException("the porting cannot be accepted: " + porting(v));
        ctx.json(gw.post("/ccp/clearings/" + id + "/porting/accept", Map.of("portingHash", c.get("porting").get("portingHash").asText())));
    }

    private void approveCcpPorting(Context ctx) {
        if (!cfg.isCcp()) throw new IllegalArgumentException("only the CCP approves a porting");
        String id = ctx.pathParam("id");
        Map<String, Object> v = ccpClearingView(ccpClearingOnChain(id));
        if (!Boolean.TRUE.equals(v.get("canApprovePorting"))) throw new IllegalStateException("the porting cannot be approved: " + porting(v));
        ctx.json(gw.post("/ccp/clearings/" + id + "/porting/approve", Map.of()));
    }

    private void refuseCcpPorting(Context ctx) {
        String id = ctx.pathParam("id");
        Map<String, Object> v = ccpClearingView(ccpClearingOnChain(id));
        if (!Boolean.TRUE.equals(v.get("canRefusePorting"))) throw new IllegalStateException("the porting cannot be refused: " + porting(v));
        ctx.json(gw.post("/ccp/clearings/" + id + "/porting/refuse", Map.of()));
    }

    @SuppressWarnings("unchecked")
    private static String porting(Map<String, Object> v) {
        Map<String, Object> p = (Map<String, Object>) v.get("porting");
        if (p == null) return "no porting is requested";
        return p.get("problem") != null ? String.valueOf(p.get("problem")) : "it is " + p.get("state");
    }


    // --- triparty trade start (task-triparty-trade-start, wp-adr-triparty-trade-start) ---
    // The giver deposits tokens with TripartySettlement under terms in effect, with its rank for each, and requests a
    // repo with a cdm-ext TripartyRepoRequest; the receiver checks the request and affirms its hash. The agent allocates
    // the free deposit in the giver's ranking within the profile (cdm-ext AllocateTriparty) and books the CDM repo with
    // the allocation as its collateral; nothing is allocated on-chain when the deposit cannot cover the Purchase Price.
    // The giver and the receiver each recompute the allocation from the terms, the request, the free account and the
    // feed prices; the receiver settles the purchase against the allocation's hash.

    /** Allocation documents that checked, by hash and this party; a failed check is not kept, so it is retried. */
    private final Set<String> allocationChecked = ConcurrentHashMap.newKeySet();
    /** The agent's last allocation that could not cover the Purchase Price, by repo id, for its console. */
    private final Map<String, Map<String, Object>> tripartyShortfalls = new ConcurrentHashMap<>();

    private TripartyTerms tripartyTermsDoc(JsonNode t) {
        Optional<String> problem = tripartyProblem(t);
        if (problem.isPresent()) throw new IllegalStateException("the triparty terms do not check: " + problem.get());
        return CdmTriparty.parse(payloads.get(t.get("termsHash").asText()));
    }

    /** The giver's free account under the terms, priced at the feed: the agent's input to the allocation. */
    private List<CdmTriparty.Deposit> tripartyDeposits(String termsId) {
        List<CdmTriparty.Deposit> out = new ArrayList<>();
        for (JsonNode h : gw.get("/triparty/terms/" + termsId + "/free")) {
            long amount = new BigInteger(h.get("amount").asText()).longValueExact();
            if (amount == 0) continue;
            String sym = symbolOf(h.get("token").asText());
            if (sym == null) throw new IllegalStateException("a deposited token is not in the registry: " + h.get("token").asText());
            out.add(new CdmTriparty.Deposit(Integer.parseInt(h.get("rank").asText()), cfg.isin(sym), amount,
                    feedPrice(h.get("token").asText()).stripTrailingZeros()));
        }
        return out;
    }

    private List<Map<String, Object>> tripartyFreeView(String termsId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode h : gw.get("/triparty/terms/" + termsId + "/free")) {
            out.add(new LinkedHashMap<>(Map.of("token", String.valueOf(symbolOf(h.get("token").asText())),
                    "amount", new BigInteger(h.get("amount").asText()).longValueExact(), "rank", Integer.parseInt(h.get("rank").asText()))));
        }
        return out;
    }

    private JsonNode tripartyRepoOnChain(String repoId) {
        JsonNode r = gw.get("/triparty/repos/" + repoId);
        if (r.get("state").asText().equals("none")) throw new IllegalArgumentException("no triparty repo " + repoId);
        return r;
    }

    /** The receiver's check of the giver's request against the chain: the terms, the Purchase Price and the cash token. */
    private Optional<String> tripartyRequestProblem(JsonNode terms, JsonNode r) {
        try {
            String doc = payloads.get(r.get("requestHash").asText());
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(r.get("requestHash").asText()))
                return Optional.of("the request is not in the payload store or its hash differs");
            if (!r.get("cash").asText().equalsIgnoreCase(cfg.tokenAddress("tUSD"))) return Optional.of("the repo is not paid in tUSD");
            CdmTriparty.verifyRequest(doc, terms.get("termsHash").asText(), new BigInteger(r.get("purchasePrice").asText()).longValueExact());
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    /** The on-chain allocation by ISIN. */
    private Map<String, Long> onChainAllocation(JsonNode r) {
        Map<String, Long> m = new LinkedHashMap<>();
        for (JsonNode a : r.get("allocation")) m.put(cfg.isin(symbolOf(a.get("token").asText())), new BigInteger(a.get("amount").asText()).longValueExact());
        return m;
    }

    /** The giver's or the receiver's check of the agent's allocation. While it is proposed the party recomputes it from
     *  the terms, the request, the free account and the feed prices; once settled the free account has moved, so the
     *  document is checked on its own: it validates, answers this request, matches the chain and is within the limits. */
    private Optional<String> tripartyAllocationProblem(JsonNode terms, JsonNode r) {
        String hash = r.get("allocationHash").asText();
        if (allocationChecked.contains(hash)) return Optional.empty();
        try {
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) return Optional.of("the allocation is not in the payload store or its hash differs");
            TripartyTerms tt = tripartyTermsDoc(terms);
            String requestHash = r.get("requestHash").asText();
            TripartyRepoRequest request = CdmTriparty.parseRequest(payloads.get(requestHash));
            TripartyAllocation a = CdmTriparty.parseAllocation(doc);
            var failures = CdmRuntime.failures(a);
            if (!failures.isEmpty()) return Optional.of("the allocation fails CDM validation: " + failures.get(0));
            if (!requestHash.equalsIgnoreCase(a.getRequestHash())) return Optional.of("the allocation answers another request");
            Map<String, Long> units = new LinkedHashMap<>();
            for (var pos : a.getPositions()) units.put(pos.getIsin(), pos.getUnits().longValueExact());
            if (!units.equals(onChainAllocation(r))) return Optional.of("the allocation differs from the tokens allocated on-chain");
            if (!units.equals(CdmRepo.collateralPositions(a.getTrade()))) return Optional.of("the CDM repo's collateral differs from the allocation");
            if (r.get("state").asText().equals("allocated")) {
                CdmTriparty.verifyAllocation(doc, tt, request, requestHash, tripartyDeposits(r.get("termsId").asText()));
            } else if (!CdmRuntime.fn(cdmx.collateral.triparty.functions.TripartyConcentrationBreaches.class)
                    .evaluate(tt.getProfile(), new ArrayList<>(a.getPositions()), a.getRequiredValue()).isEmpty()) {
                return Optional.of("the allocation breaches the profile's limits");
            }
            allocationChecked.add(hash);
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    private Map<String, Object> withSymbols(Map<String, Object> allocationView) {
        @SuppressWarnings("unchecked") List<Map<String, Object>> ps = (List<Map<String, Object>>) allocationView.get("positions");
        for (Map<String, Object> e : ps) e.put("token", symbolOfIsin(String.valueOf(e.get("isin"))));
        return allocationView;
    }

    /** The repos under a set of terms, newest first, with the documents checked and the steps open to this party. */
    private List<Map<String, Object>> tripartyRepos(JsonNode terms, boolean termsChecked) {
        boolean giver = terms.get("giver").asText().equalsIgnoreCase(cfg.myAddress);
        boolean receiver = terms.get("receiver").asText().equalsIgnoreCase(cfg.myAddress);
        boolean agent = terms.get("agent").asText().equalsIgnoreCase(cfg.myAddress);
        JsonNode all = gw.get("/triparty/terms/" + terms.get("termsId").asText() + "/repos");
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = all.size() - 1; i >= 0; i--) {
            JsonNode r = all.get(i);
            String state = r.get("state").asText();
            String repoId = r.get("repoId").asText();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("repoId", repoId);
            m.put("state", state);
            m.put("purchasePrice", new BigInteger(r.get("purchasePrice").asText()).longValueExact());
            m.put("requestHash", r.get("requestHash").asText());
            String reqDoc = payloads.get(r.get("requestHash").asText());
            if (reqDoc != null) {
                try {
                    TripartyRepoRequest q = CdmTriparty.parseRequest(reqDoc);
                    m.put("tradeId", q.getTradeId());
                    m.put("ratePercent", q.getRepoRate().movePointRight(2).stripTrailingZeros().toPlainString());
                    m.put("purchaseDate", q.getPurchaseDate().toString());
                    m.put("repurchaseDate", q.getRepurchaseDate().toString());
                } catch (Exception ignored) {
                    // shown without the request's fields
                }
            }
            Optional<String> requestProblem = termsChecked ? tripartyRequestProblem(terms, r) : Optional.of("the triparty terms do not check");
            m.put("requestVerified", requestProblem.isEmpty());
            m.put("requestProblem", requestProblem.orElse(null));
            boolean allocated = state.equals("allocated") || state.equals("settled");
            Optional<String> allocationProblem = Optional.empty();
            if (allocated) {
                m.put("allocationHash", r.get("allocationHash").asText());
                String doc = payloads.get(r.get("allocationHash").asText());
                if (doc != null) {
                    try {
                        m.put("allocation", withSymbols(CdmTriparty.allocationView(CdmTriparty.parseAllocation(doc))));
                    } catch (Exception ignored) {
                        // shown without the allocation's fields
                    }
                }
                allocationProblem = agent ? Optional.empty() : tripartyAllocationProblem(terms, r);
                m.put("allocationVerified", allocationProblem.isEmpty());
                m.put("allocationProblem", allocationProblem.orElse(null));
            } else if (tripartyShortfalls.containsKey(repoId) && state.equals("affirmed")) {
                m.put("allocation", tripartyShortfalls.get(repoId));
            }
            if (state.equals("settled") || state.equals("repurchased")) {
                tripartyChangesView(m, terms, r, giver, agent);
                tripartyTradeEndView(m, terms, r, giver, agent);
            }
            if (!state.equals("settled") || m.containsKey("tradeEnd")) {
                m.put("canRequestSubstitution", false);
                m.put("canSubstitute", m.containsKey("pendingSubstitution") && agent && state.equals("settled"));
                m.put("excess", List.of());
            }
            m.put("canRevalue", agent && state.equals("settled") && allocationProblem.isEmpty() && !m.containsKey("tradeEnd"));
            m.put("canAffirm", receiver && state.equals("requested") && requestProblem.isEmpty());
            m.put("canAllocate", agent && state.equals("affirmed") && requestProblem.isEmpty());
            m.put("canRefuseAllocation", receiver && state.equals("allocated"));
            m.put("canSettle", receiver && state.equals("allocated") && allocationProblem.isEmpty());
            m.put("canCancel", (giver || receiver || agent) && (state.equals("requested") || state.equals("affirmed") || state.equals("allocated")));
            out.add(m);
        }
        return out;
    }

    private JsonNode tripartyTermsAsGiver(String termsId) {
        JsonNode t = tripartyOnChain(termsId);
        if (!t.get("giver").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the giver deposits, withdraws or requests a repo");
        return t;
    }

    /** The giver deposits a token with the agent, with its rank for the allocation. */
    private void depositTriparty(Context ctx) {
        JsonNode t = tripartyTermsAsGiver(ctx.pathParam("id"));
        if (!t.get("state").asText().equals("effective")) throw new IllegalStateException("the triparty terms are not in effect");
        Map<String, Object> b = body(ctx);
        String sym = String.valueOf(b.get("token"));
        if (sym.equals("tUSD") || !cfg.registry.get("tokens").has(sym)) throw new IllegalArgumentException("not a security token: " + sym);
        requireUnderControl(sym);
        long amount = Long.parseLong(String.valueOf(b.get("amount")));
        int rank = Integer.parseInt(String.valueOf(b.get("rank")));
        if (amount <= 0 || rank <= 0) throw new IllegalArgumentException("the amount and the rank are positive");
        ctx.json(gw.post("/triparty/terms/" + ctx.pathParam("id") + "/deposit", Map.of("token", cfg.tokenAddress(sym),
                "amount", String.valueOf(amount), "rank", String.valueOf(rank))));
    }

    /** The giver withdraws free collateral; the amount defaults to all that is free. */
    private void withdrawTriparty(Context ctx) {
        tripartyTermsAsGiver(ctx.pathParam("id"));
        Map<String, Object> b = body(ctx);
        String sym = String.valueOf(b.get("token"));
        String token = cfg.tokenAddress(sym);
        long amount;
        Object a = b.get("amount");
        if (a == null || String.valueOf(a).isBlank()) {
            amount = 0;
            for (Map<String, Object> h : tripartyFreeView(ctx.pathParam("id"))) if (sym.equals(h.get("token"))) amount = (Long) h.get("amount");
        } else amount = Long.parseLong(String.valueOf(a));
        if (amount <= 0) throw new IllegalArgumentException("no free " + sym + " to withdraw");
        ctx.json(gw.post("/triparty/terms/" + ctx.pathParam("id") + "/withdraw", Map.of("token", token, "amount", String.valueOf(amount))));
    }

    /** The giver requests a repo: the cdm-ext TripartyRepoRequest for the Purchase Price, rate and term. */
    private void requestTripartyRepo(Context ctx) {
        JsonNode t = tripartyTermsAsGiver(ctx.pathParam("id"));
        if (!t.get("state").asText().equals("effective")) throw new IllegalStateException("the triparty terms are not in effect");
        tripartyTermsDoc(t);
        Map<String, Object> b = body(ctx);
        long purchasePrice = Long.parseLong(String.valueOf(b.get("purchasePrice")));
        BigDecimal rate = new BigDecimal(String.valueOf(b.getOrDefault("ratePercent", "5"))).movePointLeft(2);
        int termDays = Integer.parseInt(String.valueOf(b.getOrDefault("termDays", "7")));
        if (termDays < 1) throw new IllegalArgumentException("the term is at least one day");
        CdmTriparty.Request r = CdmTriparty.request(t.get("termsHash").asText(), "TP-" + cfg.partyId + "-" + System.nanoTime(), purchasePrice, rate,
                businessDate, businessDate.plusDays(termDays));
        payloads.put(r.hash(), r.json(), tripartyParties());
        JsonNode tx = gw.post("/triparty/terms/" + ctx.pathParam("id") + "/repos", Map.of("requestHash", r.hash(),
                "cash", cfg.tokenAddress("tUSD"), "purchasePrice", String.valueOf(purchasePrice)));
        ctx.json(Map.of("repoId", tx.get("repoId").asText(), "requestHash", r.hash(), "tradeId", r.request().getTradeId(), "txHash", tx.get("txHash").asText()));
    }

    /** The receiver affirms the giver's request after checking it against the chain. */
    private void affirmTripartyRequest(Context ctx) {
        JsonNode r = tripartyRepoOnChain(ctx.pathParam("id"));
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        if (!t.get("receiver").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the receiver affirms a triparty repo request");
        if (!r.get("state").asText().equals("requested")) throw new IllegalStateException("the triparty repo is not requested");
        tripartyTermsDoc(t);
        Optional<String> problem = tripartyRequestProblem(t, r);
        if (problem.isPresent()) throw new IllegalStateException("the request does not check: " + problem.get());
        ctx.json(gw.post("/triparty/repos/" + ctx.pathParam("id") + "/affirm", Map.of("requestHash", r.get("requestHash").asText())));
    }

    /** The agent allocates the giver's free deposit to the repo. When the deposit cannot cover the Purchase Price within
     *  the profile nothing is allocated on-chain and the shortfall is shown in the agent's console. */
    private void allocateTripartyRepo(Context ctx) {
        String repoId = ctx.pathParam("id");
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        if (!t.get("agent").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the agent allocates");
        if (!r.get("state").asText().equals("affirmed")) throw new IllegalStateException("the triparty repo request is not affirmed");
        TripartyTerms tt = tripartyTermsDoc(t);
        Optional<String> problem = tripartyRequestProblem(t, r);
        if (problem.isPresent()) throw new IllegalStateException("the request does not check: " + problem.get());
        String requestHash = r.get("requestHash").asText();
        CdmTriparty.Allocation a = CdmTriparty.allocate(tt, CdmTriparty.parseRequest(payloads.get(requestHash)), requestHash,
                tripartyDeposits(r.get("termsId").asText()));
        Map<String, Object> view = withSymbols(CdmTriparty.allocationView(a.allocation()));
        if (!a.covers()) {
            tripartyShortfalls.put(repoId, view);
            signalConsoles("triparty");
            ctx.json(Map.of("covers", false, "allocation", view));
            return;
        }
        tripartyShortfalls.remove(repoId);
        payloads.put(a.hash(), a.json(), tripartyParties());
        List<String> tokens = new ArrayList<>();
        List<String> amounts = new ArrayList<>();
        a.units().forEach((isin, n) -> {
            tokens.add(cfg.tokenAddress(symbolOfIsin(isin)));
            amounts.add(String.valueOf(n));
        });
        JsonNode tx = gw.post("/triparty/repos/" + repoId + "/allocate", Map.of("allocationHash", a.hash(), "tokens", tokens, "amounts", amounts));
        ctx.json(Map.of("covers", true, "allocationHash", a.hash(), "allocation", view, "txHash", tx.get("txHash").asText()));
    }

    /** The receiver settles the purchase against the agent's allocation after recomputing it. */
    private void settleTripartyPurchase(Context ctx) {
        JsonNode r = tripartyRepoOnChain(ctx.pathParam("id"));
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        if (!t.get("receiver").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the receiver settles the purchase");
        if (!r.get("state").asText().equals("allocated")) throw new IllegalStateException("the triparty repo is not allocated");
        Optional<String> problem = tripartyAllocationProblem(t, r);
        if (problem.isPresent()) throw new IllegalStateException("the allocation does not check: " + problem.get());
        ctx.json(gw.post("/triparty/repos/" + ctx.pathParam("id") + "/settle", Map.of("allocationHash", r.get("allocationHash").asText())));
    }

    // --- triparty revaluation (task-triparty-revaluation, wp-adr-triparty-revaluation) ---
    // The agent revalues a settled repo at the feed prices against the Repurchase Price accrued to its business date
    // (cdm-ext RevalueTriparty) and replaces the repo's holding on TripartySettlement with the hash of the document. The
    // giver and the receiver recompute each revaluation from the chain at the block before it: the repo's holding, the
    // free account with its ranks and the feed prices, through the gateway.


    /** The document a holding change follows, and the repo as that document left it. */
    private record RevaluationBasis(String hash, cdm.event.common.TradeState trade) {}

    /** The basis of the repo's change number {@code index} in its history: the last change before it that is not a
     *  declined substitution, or the allocation. */
    private RevaluationBasis tripartyBasis(JsonNode r, JsonNode changes, int index) {
        for (int j = index - 1; j >= 0; j--) {
            String kind = changes.get(j).get("kind").asText();
            if (kind.equals("declined")) continue;
            String hash = changes.get(j).get("hash").asText();
            String doc = payloads.get(hash);
            if (doc == null) throw new IllegalStateException("the previous " + kind + " is not in the payload store");
            return new RevaluationBasis(hash, kind.equals("revaluation")
                    ? CdmTriparty.tradeAfter(CdmTriparty.parseRevaluation(doc))
                    : CdmTriparty.tradeAfter(CdmTriparty.parseSubstitution(doc)));
        }
        String hash = r.get("allocationHash").asText();
        String doc = payloads.get(hash);
        if (doc == null) throw new IllegalStateException("the allocation is not in the payload store");
        return new RevaluationBasis(hash, CdmTriparty.parseAllocation(doc).getTrade());
    }

    /** The held and free assets as the revaluation reads them, ranked and priced: from the holding, the free account
     *  (assets with free units) and the scaled feed prices, as the chain gives them now or at a block. */
    private record RevaluationInputs(List<CdmTriparty.Deposit> held, List<CdmTriparty.Deposit> free) {}

    private RevaluationInputs revaluationInputs(JsonNode allocation, JsonNode free, Map<String, BigInteger> scaledPrices) {
        Map<String, Integer> ranks = new HashMap<>();
        for (JsonNode h : free) ranks.put(h.get("token").asText().toLowerCase(), Integer.parseInt(h.get("rank").asText()));
        java.util.function.Function<String, BigDecimal> price = token -> {
            BigInteger p = scaledPrices.get(token.toLowerCase());
            if (p == null) throw new IllegalStateException("no feed price for " + token);
            return new BigDecimal(p).divide(new BigDecimal(cfg.priceScale)).stripTrailingZeros();
        };
        List<CdmTriparty.Deposit> held = new ArrayList<>();
        for (JsonNode a : allocation) {
            String token = a.get("token").asText();
            Integer rank = ranks.get(token.toLowerCase());
            if (rank == null) throw new IllegalStateException("a held token has no rank: " + token);
            held.add(new CdmTriparty.Deposit(rank, cfg.isin(symbolOf(token)), new BigInteger(a.get("amount").asText()).longValueExact(), price.apply(token)));
        }
        List<CdmTriparty.Deposit> out = new ArrayList<>();
        for (JsonNode h : free) {
            long amount = new BigInteger(h.get("amount").asText()).longValueExact();
            if (amount == 0) continue;
            String token = h.get("token").asText();
            out.add(new CdmTriparty.Deposit(Integer.parseInt(h.get("rank").asText()), cfg.isin(symbolOf(token)), amount, price.apply(token)));
        }
        return new RevaluationInputs(held, out);
    }

    /** The agent's inputs now: the repo's holding, the free account and the latest feed prices. */
    private RevaluationInputs currentInputs(JsonNode r) {
        Map<String, BigInteger> prices = new HashMap<>();
        feedPrices().forEach((k, v) -> prices.put(k.toLowerCase(), v));
        return revaluationInputs(r.get("allocation"), gw.get("/triparty/terms/" + r.get("termsId").asText() + "/free"), prices);
    }

    /** The checker's inputs: the chain at the end of a block (the block before a change). */
    private RevaluationInputs inputsAt(String repoId, long block) {
        JsonNode at = gw.get("/triparty/repos/" + repoId + "/at?block=" + block);
        Map<String, BigInteger> prices = new HashMap<>();
        for (JsonNode p : at.get("prices")) if (!p.get("price").isNull()) prices.put(p.get("token").asText().toLowerCase(), new BigInteger(p.get("price").asText()));
        return revaluationInputs(at.get("allocation"), at.get("free"), prices);
    }

    private JsonNode tripartyChanges(String repoId) {
        return gw.get("/triparty/repos/" + repoId + "/changes");
    }

    private void agentsSettledRepo(JsonNode r, JsonNode t) {
        if (!t.get("agent").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the agent revalues or substitutes");
        if (!r.get("state").asText().equals("settled")) throw new IllegalStateException("the triparty repo is not settled");
    }

    private List<String>[] holdingArgs(Map<String, Long> units) {
        List<String> tokens = new ArrayList<>();
        List<String> amounts = new ArrayList<>();
        units.forEach((isin, n) -> {
            tokens.add(cfg.tokenAddress(symbolOfIsin(isin)));
            amounts.add(String.valueOf(n));
        });
        @SuppressWarnings("unchecked") List<String>[] out = new List[] { tokens, amounts };
        return out;
    }

    /** The agent revalues a settled repo at its business date and records the new holding on-chain. */
    private void revalueTripartyRepo(Context ctx) {
        String repoId = ctx.pathParam("id");
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        agentsSettledRepo(r, t);
        JsonNode changes = tripartyChanges(repoId);
        RevaluationBasis basis = tripartyBasis(r, changes, changes.size());
        RevaluationInputs in = currentInputs(r);
        CdmTriparty.Revaluation rv = CdmTriparty.revalue(tripartyTermsDoc(t), basis.trade(), basis.hash(), businessDate, in.held(), in.free());
        payloads.put(rv.hash(), rv.json(), tripartyParties());
        var args = holdingArgs(rv.units());
        JsonNode tx = gw.post("/triparty/repos/" + repoId + "/revalue", Map.of("revaluationHash", rv.hash(), "tokens", args[0], "amounts", args[1]));
        changeChecked.add(rv.hash());
        signalConsoles("triparty");
        ctx.json(Map.of("outcome", CdmTriparty.revaluationView(rv.revaluation()).get("outcome"), "revaluationHash", rv.hash(),
                "revaluation", withTokens(CdmTriparty.revaluationView(rv.revaluation())), "txHash", tx.get("txHash").asText()));
    }

    // --- triparty substitution (task-triparty-substitution, wp-adr-triparty-substitution) ---

    /** The giver recalls units of an asset of a settled repo: records the request's hash for the agent. */
    private void requestTripartySubstitution(Context ctx) throws Exception {
        String repoId = ctx.pathParam("id");
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        if (!t.get("giver").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the giver recalls collateral");
        if (!r.get("state").asText().equals("settled")) throw new IllegalStateException("the triparty repo is not settled");
        JsonNode body = CdmRuntime.JSON.readTree(ctx.body());
        String symbol = body.get("token").asText();
        long units = body.get("units").asLong();
        String json = recordSubstitutionRequest(r, cfg.isin(symbol), units, false);
        signalConsoles("triparty");
        ctx.json(Map.of("requestHash", Cdm.keccakHex(json)));
    }

    private String recordSubstitutionRequest(JsonNode r, String isin, long units, boolean byAgent) {
        String reqDoc = payloads.get(r.get("requestHash").asText());
        if (reqDoc == null) throw new IllegalStateException("the repo request is not in the payload store");
        CdmTriparty.SubstitutionRequest q = CdmTriparty.substitutionRequest(CdmTriparty.parseRequest(reqDoc).getTradeId(), isin, units, byAgent, businessDate);
        payloads.put(q.hash(), q.json(), tripartyParties());
        gw.post("/triparty/repos/" + r.get("repoId").asText() + "/substitution", Map.of("requestHash", q.hash()));
        return q.json();
    }

    /** The requester withdraws its pending substitution request. */
    private void withdrawTripartySubstitution(Context ctx) {
        JsonNode tx = gw.post("/triparty/repos/" + ctx.pathParam("id") + "/substitution/withdraw", Map.of());
        signalConsoles("triparty");
        ctx.json(Map.of("txHash", tx.get("txHash").asText()));
    }

    /** The agent substitutes the pending request, or declines it, and records the outcome on-chain. */
    private void substituteTripartyRepo(Context ctx) {
        ctx.json(substitutePending(ctx.pathParam("id")));
    }

    private Map<String, Object> substitutePending(String repoId) {
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        agentsSettledRepo(r, t);
        JsonNode pending = gw.get("/triparty/repos/" + repoId + "/substitution").get("pending");
        if (pending == null || pending.isNull()) throw new IllegalStateException("no substitution request is pending");
        String requestHash = pending.get("requestHash").asText();
        String reqJson = payloads.get(requestHash);
        if (reqJson == null || !Cdm.keccakHex(reqJson).equalsIgnoreCase(requestHash)) throw new IllegalStateException("the substitution request is not in the payload store or its hash differs");
        var request = CdmTriparty.parseSubstitutionRequest(reqJson);
        boolean byAgent = request.getRequestedBy() == cdmx.collateral.triparty.TripartyRequesterEnum.AGENT;
        String requester = pending.get("requester").asText();
        if (!requester.equalsIgnoreCase(t.get(byAgent ? "agent" : "giver").asText())) throw new IllegalStateException("the request names another requester");
        JsonNode changes = tripartyChanges(repoId);
        RevaluationBasis basis = tripartyBasis(r, changes, changes.size());
        RevaluationInputs in = currentInputs(r);
        CdmTriparty.Substitution sub = CdmTriparty.substitute(tripartyTermsDoc(t), basis.trade(), basis.hash(), requestHash, request,
                bankOf(t.get("giver").asText()), businessDate, in.held(), in.free());
        payloads.put(sub.hash(), sub.json(), tripartyParties());
        JsonNode tx;
        if (sub.substituted()) {
            var args = holdingArgs(sub.units());
            tx = gw.post("/triparty/repos/" + repoId + "/substitute", Map.of("substitutionHash", sub.hash(), "tokens", args[0], "amounts", args[1]));
        } else {
            tx = gw.post("/triparty/repos/" + repoId + "/substitution/decline", Map.of("substitutionHash", sub.hash()));
        }
        changeChecked.add(sub.hash());
        signalConsoles("triparty");
        Map<String, Object> view = withTokens(CdmTriparty.substitutionView(sub.substitution()));
        return Map.of("outcome", view.get("outcome"), "substitutionHash", sub.hash(), "substitution", view, "txHash", tx.get("txHash").asText());
    }

    /** The latest change's (or the allocation's) recorded breaches, as excess units per ISIN, for the agent's own request. */
    private Map<String, Long> latestExcess(JsonNode r, JsonNode changes) {
        for (int j = changes.size() - 1; j >= 0; j--) {
            String kind = changes.get(j).get("kind").asText();
            if (kind.equals("declined")) continue;
            String doc = payloads.get(changes.get(j).get("hash").asText());
            if (doc == null) return Map.of();
            if (kind.equals("revaluation")) {
                var x = CdmTriparty.parseRevaluation(doc);
                return CdmTriparty.excessUnits(x.getHeldAfter(), x.getBreaches(), x.getRequiredValue().getValue());
            }
            var x = CdmTriparty.parseSubstitution(doc);
            return CdmTriparty.excessUnits(x.getHeldAfter(), x.getBreaches(), x.getRequiredValue().getValue());
        }
        return Map.of();
    }

    /** The agent asks back the units of an asset over its limit (from the latest recorded breach) and substitutes them. */
    private void rebalanceTripartyRepo(Context ctx) throws Exception {
        String repoId = ctx.pathParam("id");
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        agentsSettledRepo(r, t);
        String isin = cfg.isin(CdmRuntime.JSON.readTree(ctx.body()).get("token").asText());
        Long units = latestExcess(r, tripartyChanges(repoId)).get(isin);
        if (units == null || units <= 0) throw new IllegalStateException("the repo's latest holding has no breach in this asset");
        recordSubstitutionRequest(r, isin, units, true);
        ctx.json(substitutePending(repoId));
    }

    // --- triparty trade end (task-triparty-trade-end, wp-adr-triparty-trade-end) ---

    /** The Repurchase Date of a repo, from its request document. */
    private LocalDate repurchaseDateOf(JsonNode r) {
        String reqDoc = payloads.get(r.get("requestHash").asText());
        if (reqDoc == null) throw new IllegalStateException("the repo request is not in the payload store");
        return CdmTriparty.parseRequest(reqDoc).getRepurchaseDate().toLocalDate();
    }

    /** The agent prepares the trade end on the repo's Repurchase Date and records its hash and the Repurchase Price. */
    private void prepareTripartyTradeEnd(Context ctx) {
        String repoId = ctx.pathParam("id");
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        agentsSettledRepo(r, t);
        LocalDate repurchaseDate = repurchaseDateOf(r);
        if (!businessDate.equals(repurchaseDate)) throw new IllegalStateException("the trade end is on the Repurchase Date " + repurchaseDate + "; the business date is " + businessDate);
        JsonNode pending = gw.get("/triparty/repos/" + repoId + "/substitution").get("pending");
        if (pending != null && !pending.isNull()) throw new IllegalStateException("a substitution request is pending");
        JsonNode changes = tripartyChanges(repoId);
        RevaluationBasis basis = tripartyBasis(r, changes, changes.size());
        CdmTriparty.TradeEnd e = CdmTriparty.tradeEnd(basis.trade(), basis.hash(), onChainAllocation(r), bankOf(t.get("giver").asText()), bankOf(t.get("receiver").asText()));
        payloads.put(e.hash(), e.json(), tripartyParties());
        JsonNode tx = gw.post("/triparty/repos/" + repoId + "/trade-end", Map.of("tradeEndHash", e.hash(), "repurchasePrice", String.valueOf(e.repurchasePrice())));
        tradeEndChecked.add(e.hash());
        signalConsoles("triparty");
        ctx.json(Map.of("tradeEndHash", e.hash(), "repurchasePrice", e.repurchasePrice(), "txHash", tx.get("txHash").asText()));
    }

    /** The giver pays the Repurchase Price against the release, once it has rebuilt the agent's trade end. */
    private void settleTripartyRepurchase(Context ctx) {
        String repoId = ctx.pathParam("id");
        JsonNode r = tripartyRepoOnChain(repoId);
        JsonNode t = tripartyOnChain(r.get("termsId").asText());
        if (!t.get("giver").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the giver repurchases");
        JsonNode te = gw.get("/triparty/repos/" + repoId + "/trade-end").get("tradeEnd");
        if (te == null || te.isNull()) throw new IllegalStateException("the agent has not prepared the trade end");
        Optional<String> problem = tripartyTradeEndProblem(t, r, te);
        if (problem.isPresent()) throw new IllegalStateException("the trade end does not check: " + problem.get());
        JsonNode tx = gw.post("/triparty/repos/" + repoId + "/repurchase", Map.of("tradeEndHash", te.get("tradeEndHash").asText()));
        signalConsoles("triparty");
        ctx.json(Map.of("txHash", tx.get("txHash").asText()));
    }

    private final Set<String> tradeEndChecked = ConcurrentHashMap.newKeySet();

    /** The giver's or the receiver's check of a prepared trade end: rebuilt from the basis document and the holding on-chain
     *  at the block before the preparation. */
    private Optional<String> tripartyTradeEndProblem(JsonNode terms, JsonNode r, JsonNode te) {
        String hash = te.get("tradeEndHash").asText();
        if (tradeEndChecked.contains(hash)) return Optional.empty();
        try {
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) return Optional.of("the trade end is not in the payload store or its hash differs");
            String repoId = r.get("repoId").asText();
            JsonNode changes = tripartyChanges(repoId);
            RevaluationBasis basis = tripartyBasis(r, changes, changes.size());
            long block = Long.parseLong(te.get("block").asText());
            JsonNode at = gw.get("/triparty/repos/" + repoId + "/at?block=" + (block - 1));
            CdmTriparty.TradeEnd e = CdmTriparty.verifyTradeEnd(doc, basis.trade(), basis.hash(), onChainAllocation(at),
                    bankOf(terms.get("giver").asText()), bankOf(terms.get("receiver").asText()));
            if (e.repurchasePrice() != new BigInteger(te.get("repurchasePrice").asText()).longValueExact()) return Optional.of("the Repurchase Price on-chain differs");
            tradeEndChecked.add(hash);
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    /** A settled or repurchased repo's trade end, if prepared, with this party's check and the next step. */
    private void tripartyTradeEndView(Map<String, Object> m, JsonNode terms, JsonNode r, boolean giver, boolean agent) {
        String state = r.get("state").asText();
        JsonNode te = gw.get("/triparty/repos/" + r.get("repoId").asText() + "/trade-end").get("tradeEnd");
        boolean prepared = te != null && !te.isNull();
        if (prepared) {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("tradeEndHash", te.get("tradeEndHash").asText());
            v.put("repurchasePrice", new BigInteger(te.get("repurchasePrice").asText()).longValueExact());
            String doc = payloads.get(te.get("tradeEndHash").asText());
            if (doc != null) {
                try {
                    Map<String, Object> view = CdmTriparty.tradeEndView(CdmTriparty.parseTradeEnd(doc));
                    @SuppressWarnings("unchecked") List<Map<String, Object>> rs = (List<Map<String, Object>>) view.get("releases");
                    for (Map<String, Object> x : rs) x.put("token", symbolOfIsin(String.valueOf(x.get("isin"))));
                    v.put("releases", rs);
                    v.put("repurchaseDate", view.get("repurchaseDate"));
                } catch (Exception ignored) {
                    // shown without the document's fields
                }
            }
            Optional<String> problem = agent || state.equals("repurchased") ? Optional.empty() : tripartyTradeEndProblem(terms, r, te);
            v.put("verified", problem.isEmpty());
            v.put("problem", problem.orElse(null));
            m.put("tradeEnd", v);
            m.put("canSettleRepurchase", giver && state.equals("settled") && problem.isEmpty());
        } else {
            m.put("canSettleRepurchase", false);
        }
        boolean pending = m.containsKey("pendingSubstitution");
        boolean onDate;
        try {
            onDate = businessDate.equals(repurchaseDateOf(r));
        } catch (Exception e) {
            onDate = false;
        }
        m.put("canPrepareTradeEnd", agent && state.equals("settled") && !prepared && !pending && onDate);
    }

    // --- triparty reporting (task-triparty-reporting, wp-adr-triparty-reporting) ---

    /** The settled repos of the terms as a report reads them: from each repo's state and holding (now, or at a block),
     *  its basis document as of that block, and the feed prices. */
    private List<CdmTriparty.ReportedRepo> reportedRepos(JsonNode repos, Map<String, BigInteger> prices, JsonNode free, long beforeBlock) {
        List<CdmTriparty.ReportedRepo> out = new ArrayList<>();
        for (JsonNode at : repos) {
            if (!at.get("state").asText().equals("settled")) continue;
            String repoId = at.get("repoId").asText();
            JsonNode r = tripartyRepoOnChain(repoId);
            JsonNode changes = tripartyChanges(repoId);
            int index = 0;
            while (index < changes.size() && Long.parseLong(changes.get(index).get("block").asText()) < beforeBlock) index++;
            RevaluationBasis basis = tripartyBasis(r, changes, index);
            String reqDoc = payloads.get(r.get("requestHash").asText());
            if (reqDoc == null) throw new IllegalStateException("the repo request is not in the payload store");
            out.add(new CdmTriparty.ReportedRepo(repoId, CdmTriparty.parseRequest(reqDoc).getTradeId(), basis.trade(),
                    revaluationInputs(at.get("allocation"), free, prices).held()));
        }
        return out;
    }

    /** The agent reports the settled repos and the giver's free collateral under the terms on its business date. */
    private void sendTripartyReport(Context ctx) {
        String termsId = ctx.pathParam("id");
        JsonNode t = tripartyOnChain(termsId);
        if (!t.get("agent").asText().equalsIgnoreCase(cfg.myAddress)) throw new IllegalArgumentException("only the agent reports");
        if (!t.get("state").asText().equals("effective")) throw new IllegalStateException("the triparty terms are not in effect");
        Map<String, BigInteger> prices = new HashMap<>();
        feedPrices().forEach((k, v) -> prices.put(k.toLowerCase(), v));
        JsonNode free = gw.get("/triparty/terms/" + termsId + "/free");
        JsonNode repos = gw.get("/triparty/terms/" + termsId + "/repos");
        CdmTriparty.Report rep = CdmTriparty.report(tripartyTermsDoc(t), t.get("termsHash").asText(), businessDate,
                reportedRepos(repos, prices, free, Long.MAX_VALUE), revaluationInputs(CdmRuntime.JSON.createArrayNode(), free, prices).free(),
                bankOf(t.get("giver").asText()), bankOf(t.get("receiver").asText()));
        payloads.put(rep.hash(), rep.json(), tripartyParties());
        JsonNode tx = gw.post("/triparty/terms/" + termsId + "/report", Map.of("reportHash", rep.hash()));
        reportChecked.add(rep.hash());
        signalConsoles("triparty");
        ctx.json(Map.of("reportHash", rep.hash(), "txHash", tx.get("txHash").asText()));
    }

    private final Set<String> reportChecked = ConcurrentHashMap.newKeySet();

    /** The giver's or the receiver's check of a report: rebuilt from the terms as the chain held them at the block before
     *  it and the repo documents in this party's payload store, on the report's date. */
    private Optional<String> tripartyReportProblem(JsonNode t, String hash, long block) {
        if (reportChecked.contains(hash)) return Optional.empty();
        try {
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) return Optional.of("the report is not in the payload store or its hash differs");
            var stated = CdmTriparty.parseReport(doc);
            String termsId = t.get("termsId").asText();
            JsonNode at = gw.get("/triparty/terms/" + termsId + "/at?block=" + (block - 1));
            Map<String, BigInteger> prices = new HashMap<>();
            for (JsonNode p : at.get("prices")) if (!p.get("price").isNull()) prices.put(p.get("token").asText().toLowerCase(), new BigInteger(p.get("price").asText()));
            CdmTriparty.verifyReport(doc, tripartyTermsDoc(t), t.get("termsHash").asText(), stated.getReportDate().toLocalDate(),
                    reportedRepos(at.get("repos"), prices, at.get("free"), block), revaluationInputs(CdmRuntime.JSON.createArrayNode(), at.get("free"), prices).free(),
                    bankOf(t.get("giver").asText()), bankOf(t.get("receiver").asText()));
            reportChecked.add(hash);
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    /** The terms' latest report with this party's check. */
    private void tripartyReportView(Map<String, Object> m, JsonNode t, boolean agent) {
        JsonNode reports = gw.get("/triparty/terms/" + t.get("termsId").asText() + "/reports");
        if (reports.size() == 0) return;
        JsonNode last = reports.get(reports.size() - 1);
        String hash = last.get("reportHash").asText();
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("reportHash", hash);
        v.put("block", last.get("block").asText());
        v.put("count", reports.size());
        String doc = payloads.get(hash);
        if (doc != null) {
            try {
                Map<String, Object> view = CdmTriparty.reportView(CdmTriparty.parseReport(doc));
                @SuppressWarnings("unchecked") List<Map<String, Object>> rs = (List<Map<String, Object>>) view.get("repos");
                for (Map<String, Object> r : rs) {
                    @SuppressWarnings("unchecked") List<Map<String, Object>> hs = (List<Map<String, Object>>) r.get("held");
                    for (Map<String, Object> h : hs) h.put("token", symbolOfIsin(String.valueOf(h.get("isin"))));
                }
                @SuppressWarnings("unchecked") List<Map<String, Object>> fs = (List<Map<String, Object>>) view.get("free");
                for (Map<String, Object> f : fs) f.put("token", symbolOfIsin(String.valueOf(f.get("isin"))));
                v.put("report", view);
            } catch (Exception ignored) {
                // shown without the document's fields
            }
        }
        Optional<String> problem = agent ? Optional.empty() : tripartyReportProblem(t, hash, Long.parseLong(last.get("block").asText()));
        v.put("verified", problem.isEmpty());
        v.put("problem", problem.orElse(null));
        m.put("report", v);
    }

    /** Holding-change documents that checked, by hash; a failed check is not kept, so it is retried. */
    private final Set<String> changeChecked = ConcurrentHashMap.newKeySet();

    /** The giver's or the receiver's check of change number {@code index}: recomputed from the chain at the block before
     *  it, from its basis document and its stated date; the latest one also matches the repo's holding now. */
    private Optional<String> tripartyChangeProblem(JsonNode terms, JsonNode r, JsonNode changes, int index) {
        String hash = changes.get(index).get("hash").asText();
        String kind = changes.get(index).get("kind").asText();
        if (changeChecked.contains(hash)) return Optional.empty();
        try {
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) return Optional.of("the document is not in the payload store or its hash differs");
            RevaluationBasis basis = tripartyBasis(r, changes, index);
            long block = Long.parseLong(changes.get(index).get("block").asText());
            RevaluationInputs in = inputsAt(r.get("repoId").asText(), block - 1);
            Map<String, Long> units;
            if (kind.equals("revaluation")) {
                var stated = CdmTriparty.parseRevaluation(doc);
                if (!basis.hash().equalsIgnoreCase(stated.getBasisHash())) return Optional.of("the revaluation follows another document");
                units = CdmTriparty.verifyRevaluation(doc, tripartyTermsDoc(terms), basis.trade(), basis.hash(),
                        stated.getRevaluationDate().toLocalDate(), in.held(), in.free()).units();
            } else {
                var stated = CdmTriparty.parseSubstitution(doc);
                if (!basis.hash().equalsIgnoreCase(stated.getBasisHash())) return Optional.of("the substitution follows another document");
                String reqJson = payloads.get(stated.getRequestHash());
                if (reqJson == null || !Cdm.keccakHex(reqJson).equalsIgnoreCase(stated.getRequestHash())) return Optional.of("the substitution request is not in the payload store");
                var sub = CdmTriparty.verifySubstitution(doc, tripartyTermsDoc(terms), basis.trade(), basis.hash(), stated.getRequestHash(),
                        CdmTriparty.parseSubstitutionRequest(reqJson), bankOf(terms.get("giver").asText()), stated.getSubstitutionDate().toLocalDate(), in.held(), in.free());
                if (sub.substituted() != kind.equals("substitution")) return Optional.of("the substitution is recorded with another outcome");
                units = sub.units();
            }
            boolean latest = true;
            for (int j = index + 1; j < changes.size(); j++) if (!changes.get(j).get("kind").asText().equals("declined")) latest = false;
            if (latest && !units.equals(onChainAllocation(r))) return Optional.of("the document differs from the tokens held on-chain");
            changeChecked.add(hash);
            return Optional.empty();
        } catch (Exception e) {
            return Optional.of(String.valueOf(e.getMessage()));
        }
    }

    private Map<String, Object> withTokens(Map<String, Object> view) {
        for (String key : List.of("movements", "heldBefore", "heldAfter", "breaches")) {
            @SuppressWarnings("unchecked") List<Map<String, Object>> xs = (List<Map<String, Object>>) view.get(key);
            for (Map<String, Object> e : xs) e.put("token", symbolOfIsin(String.valueOf(e.get("isin"))));
        }
        if (view.containsKey("isin")) view.put("token", symbolOfIsin(String.valueOf(view.get("isin"))));
        return view;
    }

    /** A settled repo's revaluations and substitutions, oldest first, each with its document and, for the giver and the
     *  receiver, its check; the pending substitution request; and the agent's possible own requests. */
    private void tripartyChangesView(Map<String, Object> m, JsonNode terms, JsonNode r, boolean giver, boolean agent) {
        String repoId = r.get("repoId").asText();
        JsonNode changes = tripartyChanges(repoId);
        List<Map<String, Object>> revaluations = new ArrayList<>();
        List<Map<String, Object>> substitutions = new ArrayList<>();
        for (int i = 0; i < changes.size(); i++) {
            String hash = changes.get(i).get("hash").asText();
            String kind = changes.get(i).get("kind").asText();
            Map<String, Object> e = new LinkedHashMap<>();
            e.put(kind.equals("revaluation") ? "revaluationHash" : "substitutionHash", hash);
            e.put("block", changes.get(i).get("block").asText());
            String doc = payloads.get(hash);
            if (doc != null) {
                try {
                    if (kind.equals("revaluation")) e.put("revaluation", withTokens(CdmTriparty.revaluationView(CdmTriparty.parseRevaluation(doc))));
                    else e.put("substitution", withTokens(CdmTriparty.substitutionView(CdmTriparty.parseSubstitution(doc))));
                } catch (Exception ignored) {
                    // shown without the document's fields
                }
            }
            Optional<String> problem = agent ? Optional.empty() : tripartyChangeProblem(terms, r, changes, i);
            e.put("verified", problem.isEmpty());
            e.put("problem", problem.orElse(null));
            (kind.equals("revaluation") ? revaluations : substitutions).add(e);
        }
        m.put("revaluations", revaluations);
        m.put("substitutions", substitutions);
        JsonNode pending = gw.get("/triparty/repos/" + repoId + "/substitution").get("pending");
        boolean isPending = pending != null && !pending.isNull();
        if (isPending) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("requestHash", pending.get("requestHash").asText());
            String reqJson = payloads.get(pending.get("requestHash").asText());
            if (reqJson != null) {
                var q = CdmTriparty.parseSubstitutionRequest(reqJson);
                p.put("token", symbolOfIsin(q.getIsin()));
                p.put("units", q.getUnits().longValueExact());
                p.put("requestedBy", q.getRequestedBy() == cdmx.collateral.triparty.TripartyRequesterEnum.AGENT ? "Agent" : "Giver");
            }
            p.put("mine", pending.get("requester").asText().equalsIgnoreCase(cfg.myAddress));
            m.put("pendingSubstitution", p);
        }
        m.put("canRequestSubstitution", giver && !isPending);
        m.put("canSubstitute", agent && isPending);
        List<Map<String, Object>> excess = new ArrayList<>();
        if (agent && !isPending) latestExcess(r, changes).forEach((isin, n) -> excess.add(new LinkedHashMap<>(Map.of("token", symbolOfIsin(isin), "units", n))));
        m.put("excess", excess);
    }

    /** The receiver refuses an allocation, or any of the three cancels a repo before it settles. */
    private JsonNode tripartyRepoStep(String repoId, String step) {
        tripartyRepoOnChain(repoId);
        tripartyShortfalls.remove(repoId);
        return gw.post("/triparty/repos/" + repoId + "/" + step, Map.of());
    }

    /** Refuse proposed terms (any of the three) or terminate terms in effect (the giver or the receiver). */
    private JsonNode tripartyStep(String termsId, String step) {
        tripartyOnChain(termsId);
        return gw.post("/triparty/terms/" + termsId + "/" + step, Map.of());
    }

    // --- amendment of agreement terms (flow-agreement-amendment, task-csa-amendment) ---

    private static final String[] AMENDMENT_STATE = {"none", "proposed", "agreed", "refused"};
    // Per leg, keyed by legKey (wp-adr-two-way-im): the contract keeps agreement terms per (pledgor, secured party).
    private final Map<String, CdmAgreement.Terms> baselineTerms = new HashMap<>();
    private final Map<String, String> termsFoldKey = new HashMap<>();
    private final Map<String, Fold> termsFold = new HashMap<>();
    private final Map<String, Map<String, Integer>> pairHaircuts = new HashMap<>();
    private final Map<String, Long> pairHaircutsAt = new HashMap<>();

    /** The terms after folding the pair's agreed amendments, whether every step verified, and the first problem. */
    private record Fold(CdmAgreement.Terms terms, boolean verified, String problem, JsonNode amendments) {}

    /** The baseline IM CSA of a leg: the CDM sample with Party1 the leg's secured party, Party2 its pledgor, and the
     *  registry's haircuts (the deployed global schedule). A token deployed as not CSA-eligible ("csa": false, e.g.
     *  tAGY, loan collateral only: wp-adr-gmsla-substitution) is not in the schedule. */
    private synchronized CdmAgreement.Terms baselineTerms(String[] ps) {
        return baselineTerms.computeIfAbsent(legKey(ps), k -> {
            Map<String, Integer> h = new LinkedHashMap<>();
            cfg.registry.get("tokens").fieldNames().forEachRemaining(sym -> {
                JsonNode t = cfg.registry.get("tokens").get(sym);
                // REG-3 (task-authoritative-record-settlement-enforcement): a Registered or Claim token without a
                // control agreement with its record keeper is not eligible (EligibleUnderControl).
                if (t.path("csa").asBoolean(true) && CdmRecordKeeper.eligible(CdmRecordKeeper.tokens(cfg.registry).get(sym)))
                    h.put(cfg.isin(sym), t.get("haircutBps").asInt());
            });
            return CdmAgreement.baselineTerms(cfg.bankName(partyIdOf(ps[1])), cfg.bankName(partyIdOf(ps[0])), h);
        });
    }

    /** The amendments of one leg, in chain order. */
    private List<JsonNode> pairAmendments(JsonNode all, String[] ps) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode r : all) {
            JsonNode a = r.get("amendment");
            if (a.get("pledgor").asText().equalsIgnoreCase(ps[0]) && a.get("securedParty").asText().equalsIgnoreCase(ps[1])) out.add(r);
        }
        return out;
    }

    /**
     * Fold the pair's agreed amendments, in chain order, from the baseline (flow-agreement-amendment transition 8):
     * fetch each CollateralAgreementAmendment by the hash the contract recorded, check the hash, that it chains from
     * the terms before (beforeHash), and that it verifies against them (CdmAgreement.verify), then apply it. Both
     * services fold the same documents to the same terms. Cached on the list of agreed amendment ids.
     */
    private synchronized Fold fold(String[] leg) {
        JsonNode all = gw.getQuery("/amendments", Map.of("party", cfg.myAddress));
        List<JsonNode> pair = pairAmendments(all, leg);
        String lk = legKey(leg);
        Fold cached = termsFold.get(lk);
        StringBuilder key = new StringBuilder();
        for (JsonNode r : pair) if (r.get("amendment").get("state").asInt() == 2) key.append(r.get("amendmentId").asText()).append(',');
        if (cached != null && key.toString().equals(termsFoldKey.get(lk))) return new Fold(cached.terms(), cached.verified(), cached.problem(), all);
        CdmAgreement.Terms t = baselineTerms(leg);
        boolean ok = true;
        String problem = null;
        for (JsonNode r : pair) {
            JsonNode a = r.get("amendment");
            if (a.get("state").asInt() != 2) continue;
            String id = r.get("amendmentId").asText();
            try {
                if (!a.get("beforeHash").asText().equalsIgnoreCase(t.hash())) throw new IllegalStateException("does not chain from the terms before");
                String hash = a.get("proposeCdmHash").asText();
                String doc = payloads.get(hash);
                if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("document not in the payload store or hash mismatch");
                t = CdmAgreement.apply(t, CdmAgreement.verify(doc, t), hash);
            } catch (Exception ex) {
                ok = false;
                problem = "amendment " + id + ": " + ex.getMessage();
                break;
            }
        }
        Fold f = new Fold(t, ok, problem, all);
        termsFoldKey.put(lk, key.toString());
        termsFold.put(lk, f);
        return f;
    }

    /** Each registry token's haircut between the pair as the contract applies it (10000 when ineligible). */
    private synchronized Map<String, Integer> pairHaircuts(String[] ps) {
        String lk = legKey(ps);
        if (pairHaircuts.containsKey(lk) && System.currentTimeMillis() - pairHaircutsAt.get(lk) < 3000) return pairHaircuts.get(lk);
        JsonNode pt = gw.getQuery("/pair-terms", Map.of("pledgor", ps[0], "securedParty", ps[1]));
        Map<String, Integer> out = new HashMap<>();
        for (JsonNode e : pt.get("eligibility")) {
            String sym = symbolOf(e.get("token").asText());
            if (sym != null) out.put(sym, e.get("eligible").asBoolean() ? e.get("haircutBps").asInt() : 10_000);
        }
        pairHaircuts.put(lk, out);
        pairHaircutsAt.put(lk, System.currentTimeMillis());
        return out;
    }

    private synchronized void invalidateTerms() {
        pairHaircuts.clear();
    }

    private String symbolOf(String tokenAddress) {
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            if (cfg.tokenAddress(sym).equalsIgnoreCase(tokenAddress)) return sym;
        }
        return null;
    }

    private String symbolOfIsin(String isin) {
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            if (cfg.isin(sym).equals(isin)) return sym;
        }
        return null;
    }

    /** The agreement terms in force, the on-chain agreement hash and haircuts beside them, and the pair's amendments. */
    private void agreement(Context ctx) {
        String[] ps = legParam(ctx.queryParam("pledgor"));
        Fold f = fold(ps);
        JsonNode pt = gw.getQuery("/pair-terms", Map.of("pledgor", ps[0], "securedParty", ps[1]));
        Map<String, Integer> onChain = pairHaircuts(ps);
        List<Map<String, Object>> haircuts = new ArrayList<>();
        cfg.registry.get("tokens").fieldNames().forEachRemaining(sym -> {
            Integer cdm = CdmAgreement.haircutBps(f.terms().schedule(), cfg.isin(sym));
            Integer chain = onChain.get(sym);
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("token", sym);
            h.put("isin", cfg.isin(sym));
            h.put("eligible", cdm != null);
            h.put("haircutBps", cdm == null ? 10_000 : cdm);
            h.put("onChainHaircutBps", chain);
            h.put("matches", chain != null && chain.equals(cdm == null ? 10_000 : cdm));
            haircuts.add(h);
        });
        List<Map<String, Object>> amendments = new ArrayList<>();
        for (JsonNode r : pairAmendments(f.amendments(), ps)) amendments.add(amendmentSummary(r));
        String chainHash = pt.get("agreementHash").asText();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("agreement", "2018 ISDA IM Credit Support Annex (Security Interest, New York law), CDM sample 01-2018-NY-Law-IM-CSA");
        out.put("securedParty", cfg.bankName(partyIdOf(ps[1])));
        out.put("pledgor", cfg.bankName(partyIdOf(ps[0])));
        out.put("mtaUsd", String.valueOf(CdmAgreement.pledgorMtaUsd(f.terms().agreement())));
        out.put("roundingUsd", String.valueOf(CdmAgreement.roundingUsd(f.terms().agreement())));
        out.put("haircuts", haircuts);
        out.put("agreementHash", f.terms().hash());
        out.put("onChainAgreementHash", chainHash);
        out.put("agreedAmendments", f.terms().amendments());
        out.put("verified", f.verified() && chainHash.equalsIgnoreCase(f.terms().hash()) && haircuts.stream().allMatch(h -> (Boolean) h.get("matches")));
        out.put("problem", f.problem());
        String pending = pt.get("pendingAmendment").asText();
        out.put("pendingAmendment", pending.equals(CdmAgreement.NO_HASH) ? null : pending);
        out.put("amendments", amendments);
        ctx.json(out);
    }

    private Map<String, Object> amendmentSummary(JsonNode r) {
        JsonNode a = r.get("amendment");
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("amendmentId", r.get("amendmentId").asText());
        m.put("block", r.get("block").asText());
        m.put("proposer", partyIdOf(a.get("proposer").asText()));
        m.put("mine", a.get("proposer").asText().equalsIgnoreCase(cfg.myAddress));
        m.put("state", AMENDMENT_STATE[a.get("state").asInt()]);
        m.put("cdmHash", a.get("proposeCdmHash").asText());
        List<Map<String, Object>> terms = new ArrayList<>();
        for (JsonNode t : a.get("terms"))
            terms.add(new LinkedHashMap<>(Map.of("token", String.valueOf(symbolOf(t.get("token").asText())),
                    "eligible", t.get("eligible").asBoolean(), "haircutBps", t.get("haircutBps").asInt())));
        m.put("haircuts", terms);
        String doc = payloads.get(a.get("proposeCdmHash").asText());
        m.put("mtaUsd", null);
        if (doc != null) {
            try {
                var am = CdmRuntime.JSON.readValue(doc, cdmx.collateral.amendment.CollateralAgreementAmendment.class);
                if (am.getAgreementEvent() != null)
                    m.put("mtaUsd", String.valueOf(CdmAgreement.pledgorMtaUsd(am.getAgreementEvent().getAfter().get(0))));
                m.put("effectiveDate", am.getEffectiveDate().toString());
            } catch (Exception ignored) {
                // shown without the document's fields
            }
        }
        return m;
    }

    /**
     * Propose an amendment of the agreement terms (flow-agreement-amendment transitions 1-4): build the CDM
     * CollateralAgreementAmendment over the terms in force (a new pledgor MTA and haircut changes), publish it, and
     * record it on-chain chained from the pair's agreement hash. Either party proposes.
     */
    @SuppressWarnings("unchecked")
    private void proposeAmendment(Context ctx) {
        Map<String, Object> b = body(ctx);
        String[] ps = legParam((String) b.get("pledgor"));
        Fold f = fold(ps);
        if (!f.verified()) throw new RuntimeException("the agreed amendments do not verify: " + f.problem());
        JsonNode pt = gw.getQuery("/pair-terms", Map.of("pledgor", ps[0], "securedParty", ps[1]));
        if (!pt.get("pendingAmendment").asText().equals(CdmAgreement.NO_HASH)) throw new RuntimeException("an amendment is already pending");
        if (!pt.get("agreementHash").asText().equalsIgnoreCase(f.terms().hash())) throw new RuntimeException("the on-chain agreement hash does not match the folded terms");
        Long mta = b.get("mtaUsd") == null || String.valueOf(b.get("mtaUsd")).isBlank() ? null : Long.parseLong(String.valueOf(b.get("mtaUsd")));
        List<CdmAgreement.Haircut> haircuts = new ArrayList<>();
        List<Map<String, Object>> terms = new ArrayList<>();
        for (Map<String, Object> h : (List<Map<String, Object>>) b.getOrDefault("haircuts", List.of())) {
            String sym = String.valueOf(h.get("token"));
            boolean eligible = Boolean.TRUE.equals(h.get("eligible"));
            int bps = eligible ? ((Number) h.get("haircutBps")).intValue() : 0;
            haircuts.add(new CdmAgreement.Haircut(cfg.isin(sym), eligible, bps));
            terms.add(new LinkedHashMap<>(Map.of("token", cfg.tokenAddress(sym), "eligible", eligible, "haircutBps", bps)));
        }
        CdmAgreement.Proposal p = CdmAgreement.propose(f.terms(), mta, haircuts, LocalDate.now());
        String amendmentId = Cdm.onChainId("amendment-" + cfg.partyId + "-" + System.nanoTime());
        store.recordDocument(amendmentId, "CollateralAgreementAmendment", "out", p.hash(), p.json());
        payloads.put(p.hash(), p.json(), callParties);
        JsonNode tx = gw.post("/amendments", Map.of("amendmentId", amendmentId, "pledgor", ps[0], "securedParty", ps[1],
                "terms", terms, "beforeHash", f.terms().hash(), "cdmHash", p.hash()));
        ctx.json(Map.of("amendmentId", amendmentId, "cdmHash", p.hash(), "proposeTx", tx.path("txHash").asText()));
    }

    /**
     * Consent to or refuse a proposed amendment (flow-agreement-amendment transitions 5-7; the other party only).
     * Before consenting the service checks the CDM document against the terms in force and that the on-chain haircut
     * terms are the document's haircut changes. The decision is published as a small JSON document and its hash
     * recorded on-chain.
     */
    private void decideAmendment(Context ctx) {
        String id = ctx.pathParam("id");
        boolean consent = Boolean.TRUE.equals(body(ctx).get("consent"));
        JsonNode a = gw.get("/amendments/" + id);
        if (a.get("state").asInt() != 1) throw new RuntimeException("amendment " + id + " is not pending");
        if (a.get("proposer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("the proposer cannot decide its own amendment");
        if (consent) {
            Fold f = fold(new String[]{a.get("pledgor").asText(), a.get("securedParty").asText()});
            if (!f.verified()) throw new RuntimeException("the agreed amendments do not verify: " + f.problem());
            if (!a.get("beforeHash").asText().equalsIgnoreCase(f.terms().hash())) throw new RuntimeException("the amendment does not chain from the terms in force");
            String hash = a.get("proposeCdmHash").asText();
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new RuntimeException("amendment document not in the payload store or hash mismatch");
            var m = CdmAgreement.verify(doc, f.terms());
            var changes = m.getHaircutChange() == null ? List.<cdmx.collateral.amendment.HaircutChange>of() : m.getHaircutChange();
            if (changes.size() != a.get("terms").size()) throw new RuntimeException("the on-chain haircut terms are not the document's haircut changes");
            for (var c : changes) {
                String sym = symbolOfIsin(c.getAsset().getIdentifier().getValue());
                boolean found = false;
                for (JsonNode t : a.get("terms")) {
                    if (sym == null || !t.get("token").asText().equalsIgnoreCase(cfg.tokenAddress(sym))) continue;
                    found = t.get("eligible").asBoolean() == c.getIsIncluded()
                            && (!c.getIsIncluded() || t.get("haircutBps").asInt() == c.getHaircutPercentage().movePointRight(4).intValueExact());
                }
                if (!found) throw new RuntimeException("the on-chain haircut terms are not the document's haircut changes");
            }
            store.recordDocument(id, "CollateralAgreementAmendment", "in", hash, doc);
        }
        String decision = CdmRuntime.toJson(new LinkedHashMap<>(Map.of("amendmentId", id, "proposeCdmHash", a.get("proposeCdmHash").asText(),
                "consent", consent, "party", cfg.bankName(cfg.partyId), "date", LocalDate.now().toString())));
        String dHash = Cdm.keccakHex(decision);
        store.recordDocument(id, "AmendmentDecision", "out", dHash, decision);
        payloads.put(dHash, decision, callParties);
        JsonNode tx = gw.post("/amendments/" + id + "/decision", Map.of("consent", consent, "cdmHash", dHash));
        invalidateTerms();
        ctx.json(Map.of("amendmentId", id, "consent", consent, "decisionHash", dHash, "decisionTx", tx.path("txHash").asText()));
    }

    /** AmendmentProposed and AmendmentDecided: each service records the pair's events; a decision invalidates the
     *  cached pair haircuts so valuation reads the new terms. */
    private void onAmendmentEvent(String event, JsonNode e, String block, long logIndex, String data) {
        String id = e.get("amendmentId").asText();
        JsonNode a = gw.get("/amendments/" + id);
        if (legOfPair(a.get("pledgor").asText(), a.get("securedParty").asText()) == null) return;
        store.recordEvent(event, id, a.get("proposer").asText(), block, logIndex, data);
        if (event.equals("AmendmentDecided")) invalidateTerms();
    }

    // --- GMRA terms and their amendment (task-repo-gmra-terms, wp-adr-repo-gmra-terms) ---
    // One GMRA per pair, Party1 BANK-A and Party2 BANK-B on both services. The contract keeps one terms hash chain per
    // agreement kind and unordered pair; the elections travel in the GmraTermsAmendment documents.

    private CdmGmra.Terms gmraBaseline;
    private String gmraFoldKey;
    private GmraFold gmraFold;

    private record GmraFold(CdmGmra.Terms terms, boolean verified, String problem, List<JsonNode> amendments) {}

    private synchronized CdmGmra.Terms gmraBaseline() {
        if (gmraBaseline == null) gmraBaseline = CdmGmra.baseline(cfg.bankName("A"), cfg.bankName("B"));
        return gmraBaseline;
    }

    /** The GMRA amendments between this party and its counterparty, in chain order. */
    private List<JsonNode> gmraAmendments() {
        return masterAmendments(CdmGmra.KIND);
    }

    /** The master agreement amendments of a kind ("GMRA", "GMSLA") between this party and its counterparty, in chain order. */
    private List<JsonNode> masterAmendments(String kind) {
        JsonNode all = gw.getQuery("/terms-amendments", Map.of("kind", kind, "party", cfg.myAddress));
        String other = cfg.partyAddress(counterparty());
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode r : all) {
            JsonNode a = r.get("amendment");
            String x = a.get("pledgor").asText(), y = a.get("securedParty").asText();
            if ((x.equalsIgnoreCase(cfg.myAddress) && y.equalsIgnoreCase(other)) || (x.equalsIgnoreCase(other) && y.equalsIgnoreCase(cfg.myAddress))) out.add(r);
        }
        return out;
    }

    /** Fold the agreed GMRA amendments from the baseline, as for the CSA (fold): each document fetched by its on-chain
     *  hash, chained from the terms before, and verified against them. Cached on the list of agreed amendment ids. */
    private synchronized GmraFold gmraFold() {
        List<JsonNode> pair = gmraAmendments();
        StringBuilder key = new StringBuilder();
        for (JsonNode r : pair) if (r.get("amendment").get("state").asInt() == 2) key.append(r.get("amendmentId").asText()).append(',');
        if (gmraFold != null && key.toString().equals(gmraFoldKey)) return new GmraFold(gmraFold.terms(), gmraFold.verified(), gmraFold.problem(), pair);
        CdmGmra.Terms t = gmraBaseline();
        boolean ok = true;
        String problem = null;
        for (JsonNode r : pair) {
            JsonNode a = r.get("amendment");
            if (a.get("state").asInt() != 2) continue;
            try {
                if (!a.get("beforeHash").asText().equalsIgnoreCase(t.hash())) throw new IllegalStateException("does not chain from the terms before");
                String hash = a.get("proposeCdmHash").asText();
                String doc = payloads.get(hash);
                if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("document not in the payload store or hash mismatch");
                t = CdmGmra.apply(t, CdmGmra.verify(doc, t), hash);
            } catch (Exception ex) {
                ok = false;
                problem = "amendment " + r.get("amendmentId").asText() + ": " + ex.getMessage();
                break;
            }
        }
        gmraFold = new GmraFold(t, ok, problem, pair);
        gmraFoldKey = key.toString();
        return gmraFold;
    }

    private JsonNode gmraOnChain() {
        return gw.getQuery("/master-terms", Map.of("kind", CdmGmra.KIND, "a", cfg.partyAddress("A"), "b", cfg.partyAddress("B")));
    }

    /** The GMRA terms in force, the on-chain terms hash beside them, and the pair's amendments. */
    private void gmraTerms(Context ctx) {
        GmraFold f = gmraFold();
        JsonNode chain = gmraOnChain();
        List<Map<String, Object>> amendments = new ArrayList<>();
        for (JsonNode r : f.amendments()) {
            JsonNode a = r.get("amendment");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("amendmentId", r.get("amendmentId").asText());
            m.put("block", r.get("block").asText());
            m.put("proposer", partyIdOf(a.get("proposer").asText()));
            m.put("mine", a.get("proposer").asText().equalsIgnoreCase(cfg.myAddress));
            m.put("state", AMENDMENT_STATE[a.get("state").asInt()]);
            m.put("cdmHash", a.get("proposeCdmHash").asText());
            String doc = payloads.get(a.get("proposeCdmHash").asText());
            if (doc != null) {
                try {
                    var am = CdmRuntime.JSON.readValue(doc, cdmx.collateral.gmra.GmraTermsAmendment.class);
                    m.put("changed", CdmGmra.changed(am));
                    m.put("after", CdmGmra.view(am.getAfter().getElections()));
                    m.put("effectiveDate", am.getEffectiveDate().toString());
                } catch (Exception ignored) {
                    // shown without the document's fields
                }
            }
            amendments.add(m);
        }
        String chainHash = chain.get("termsHash").asText();
        String pending = chain.get("pendingAmendment").asText();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("agreement", "ICMA GMRA 2011 (English law), cdm-ext GmraTerms");
        out.put("party1", cfg.bankName("A"));
        out.put("party2", cfg.bankName("B"));
        out.put("elections", CdmGmra.view(f.terms().terms().getElections()));
        out.put("termsHash", f.terms().hash());
        out.put("onChainTermsHash", chainHash);
        out.put("agreedAmendments", f.terms().amendments());
        out.put("verified", f.verified() && chainHash.equalsIgnoreCase(f.terms().hash()));
        out.put("problem", f.problem());
        out.put("pendingAmendment", pending.equals(CdmAgreement.NO_HASH) ? null : pending);
        out.put("amendments", amendments);
        ctx.json(out);
    }

    /** Propose a change of the GMRA elections: one party's MTA (party "A" or "B", mtaUsd) and/or the default Margin
     *  Ratio. The GmraTermsAmendment is published and recorded on-chain chained from the pair's terms hash. */
    private void proposeGmraAmendment(Context ctx) {
        Map<String, Object> b = body(ctx);
        GmraFold f = gmraFold();
        if (!f.verified()) throw new RuntimeException("the agreed GMRA amendments do not verify: " + f.problem());
        JsonNode chain = gmraOnChain();
        if (!chain.get("pendingAmendment").asText().equals(CdmAgreement.NO_HASH)) throw new RuntimeException("a GMRA amendment is already pending");
        if (!chain.get("termsHash").asText().equalsIgnoreCase(f.terms().hash())) throw new RuntimeException("the on-chain terms hash does not match the folded terms");
        String party = String.valueOf(b.getOrDefault("party", "A"));
        var role = party.equals("B") ? cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_2 : cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_1;
        Long mta = b.get("mtaUsd") == null || String.valueOf(b.get("mtaUsd")).isBlank() ? null : Long.parseLong(String.valueOf(b.get("mtaUsd")));
        BigDecimal ratio = b.get("defaultMarginRatio") == null || String.valueOf(b.get("defaultMarginRatio")).isBlank() ? null : new BigDecimal(String.valueOf(b.get("defaultMarginRatio")));
        CdmGmra.Proposal p = CdmGmra.propose(f.terms(), role, mta, ratio, LocalDate.now());
        String amendmentId = Cdm.onChainId("gmra-amendment-" + cfg.partyId + "-" + System.nanoTime());
        store.recordDocument(amendmentId, "GmraTermsAmendment", "out", p.hash(), p.json());
        payloads.put(p.hash(), p.json(), callParties);
        JsonNode tx = gw.post("/terms-amendments", Map.of("amendmentId", amendmentId, "kind", CdmGmra.KIND,
                "counterparty", cfg.partyAddress(counterparty()), "beforeHash", f.terms().hash(), "cdmHash", p.hash()));
        ctx.json(Map.of("amendmentId", amendmentId, "cdmHash", p.hash(), "changed", CdmGmra.changed(p.amendment()), "proposeTx", tx.path("txHash").asText()));
    }

    /** Consent to or refuse a proposed GMRA amendment (the counterparty only). Before consenting the service checks
     *  the document against the terms in force. The decision is a small JSON document anchored by its hash. */
    private void decideGmraAmendment(Context ctx) {
        String id = ctx.pathParam("id");
        boolean consent = Boolean.TRUE.equals(body(ctx).get("consent"));
        JsonNode a = gw.get("/amendments/" + id);
        if (a.get("state").asInt() != 1) throw new RuntimeException("amendment " + id + " is not pending");
        if (!a.get("securedParty").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the counterparty decides a GMRA amendment");
        if (consent) {
            GmraFold f = gmraFold();
            if (!f.verified()) throw new RuntimeException("the agreed GMRA amendments do not verify: " + f.problem());
            if (!a.get("beforeHash").asText().equalsIgnoreCase(f.terms().hash())) throw new RuntimeException("the amendment does not chain from the terms in force");
            String hash = a.get("proposeCdmHash").asText();
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new RuntimeException("amendment document not in the payload store or hash mismatch");
            CdmGmra.verify(doc, f.terms());
            store.recordDocument(id, "GmraTermsAmendment", "in", hash, doc);
        }
        String decision = CdmRuntime.toJson(new LinkedHashMap<>(Map.of("amendmentId", id, "proposeCdmHash", a.get("proposeCdmHash").asText(),
                "consent", consent, "party", cfg.bankName(cfg.partyId), "date", LocalDate.now().toString())));
        String dHash = Cdm.keccakHex(decision);
        store.recordDocument(id, "AmendmentDecision", "out", dHash, decision);
        payloads.put(dHash, decision, callParties);
        JsonNode tx = gw.post("/terms-amendments/" + id + "/decision", Map.of("consent", consent, "cdmHash", dHash));
        ctx.json(Map.of("amendmentId", id, "consent", consent, "decisionHash", dHash, "decisionTx", tx.path("txHash").asText()));
    }

    /** TermsAmendmentProposed and TermsAmendmentDecided between this party and its counterparty are recorded. */
    private void onGmraAmendmentEvent(String event, JsonNode e, String block, long logIndex, String data) {
        String id = e.get("amendmentId").asText();
        JsonNode a = gw.get("/amendments/" + id);
        String other = cfg.partyAddress(counterparty());
        String x = a.get("pledgor").asText(), y = a.get("securedParty").asText();
        boolean ours = (x.equalsIgnoreCase(cfg.myAddress) && y.equalsIgnoreCase(other)) || (x.equalsIgnoreCase(other) && y.equalsIgnoreCase(cfg.myAddress));
        if (ours) store.recordEvent(event, id, a.get("proposer").asText(), block, logIndex, data);
    }

    // --- GMSLA terms and their amendment (task-gmsla-terms, wp-adr-gmsla-terms) ---
    // One GMSLA per pair, Party1 BANK-A and Party2 BANK-B on both services: CDM's LegalAgreement with its GMSLA
    // elections and the cdm-ext elections CDM lacks. The amendments use the contract's terms hash chain under kind GMSLA.

    private CdmGmsla.Terms gmslaBaseline;
    private String gmslaFoldKey;
    private GmslaFold gmslaFold;

    private record GmslaFold(CdmGmsla.Terms terms, boolean verified, String problem, List<JsonNode> amendments) {}

    private synchronized CdmGmsla.Terms gmslaBaseline() {
        if (gmslaBaseline == null) gmslaBaseline = CdmGmsla.baseline(cfg.bankName("A"), cfg.bankName("B"));
        return gmslaBaseline;
    }

    /** Fold the agreed GMSLA amendments from the baseline, as for the GMRA. Cached on the list of agreed amendment ids. */
    private synchronized GmslaFold gmslaFold() {
        List<JsonNode> pair = masterAmendments(CdmGmsla.KIND);
        StringBuilder key = new StringBuilder();
        for (JsonNode r : pair) if (r.get("amendment").get("state").asInt() == 2) key.append(r.get("amendmentId").asText()).append(',');
        if (gmslaFold != null && key.toString().equals(gmslaFoldKey)) return new GmslaFold(gmslaFold.terms(), gmslaFold.verified(), gmslaFold.problem(), pair);
        CdmGmsla.Terms t = gmslaBaseline();
        boolean ok = true;
        String problem = null;
        for (JsonNode r : pair) {
            JsonNode a = r.get("amendment");
            if (a.get("state").asInt() != 2) continue;
            try {
                if (!a.get("beforeHash").asText().equalsIgnoreCase(t.hash())) throw new IllegalStateException("does not chain from the terms before");
                String hash = a.get("proposeCdmHash").asText();
                String doc = payloads.get(hash);
                if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("document not in the payload store or hash mismatch");
                t = CdmGmsla.apply(t, CdmGmsla.verify(doc, t), hash);
            } catch (Exception ex) {
                ok = false;
                problem = "amendment " + r.get("amendmentId").asText() + ": " + ex.getMessage();
                break;
            }
        }
        gmslaFold = new GmslaFold(t, ok, problem, pair);
        gmslaFoldKey = key.toString();
        return gmslaFold;
    }

    private JsonNode gmslaOnChain() {
        return gw.getQuery("/master-terms", Map.of("kind", CdmGmsla.KIND, "a", cfg.partyAddress("A"), "b", cfg.partyAddress("B")));
    }

    /** The GMSLA terms in force, the on-chain terms hash beside them, and the pair's amendments. */
    private void gmslaTerms(Context ctx) {
        GmslaFold f = gmslaFold();
        JsonNode chain = gmslaOnChain();
        List<Map<String, Object>> amendments = new ArrayList<>();
        for (JsonNode r : f.amendments()) {
            JsonNode a = r.get("amendment");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("amendmentId", r.get("amendmentId").asText());
            m.put("block", r.get("block").asText());
            m.put("proposer", partyIdOf(a.get("proposer").asText()));
            m.put("mine", a.get("proposer").asText().equalsIgnoreCase(cfg.myAddress));
            m.put("state", AMENDMENT_STATE[a.get("state").asInt()]);
            m.put("cdmHash", a.get("proposeCdmHash").asText());
            String doc = payloads.get(a.get("proposeCdmHash").asText());
            if (doc != null) {
                try {
                    var am = CdmRuntime.JSON.readValue(doc, cdmx.collateral.gmsla.GmslaTermsAmendment.class);
                    m.put("changed", CdmGmsla.changed(am));
                    m.put("after", CdmGmsla.view(am.getAfter()));
                    m.put("effectiveDate", am.getEffectiveDate().toString());
                } catch (Exception ignored) {
                    // shown without the document's fields
                }
            }
            amendments.add(m);
        }
        String chainHash = chain.get("termsHash").asText();
        String pending = chain.get("pendingAmendment").asText();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("agreement", "ISLA GMSLA 2010 (English law), CDM LegalAgreement in cdm-ext GmslaTerms");
        out.put("party1", cfg.bankName("A"));
        out.put("party2", cfg.bankName("B"));
        out.put("elections", CdmGmsla.view(f.terms().terms()));
        out.put("termsHash", f.terms().hash());
        out.put("onChainTermsHash", chainHash);
        out.put("agreedAmendments", f.terms().amendments());
        out.put("verified", f.verified() && chainHash.equalsIgnoreCase(f.terms().hash()));
        out.put("problem", f.problem());
        out.put("pendingAmendment", pending.equals(CdmAgreement.NO_HASH) ? null : pending);
        out.put("amendments", amendments);
        ctx.json(out);
    }

    private static String optional(Map<String, Object> b, String key) {
        Object v = b.get(key);
        return v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v);
    }

    /** Propose a change of the GMSLA elections: the notification time ("HH:mm"), one party's MTA (party "A" or "B",
     *  mtaUsd) and/or the default margin. The GmslaTermsAmendment is published and recorded on-chain chained from the
     *  pair's GMSLA terms hash. */
    private void proposeGmslaAmendment(Context ctx) {
        Map<String, Object> b = body(ctx);
        GmslaFold f = gmslaFold();
        if (!f.verified()) throw new RuntimeException("the agreed GMSLA amendments do not verify: " + f.problem());
        JsonNode chain = gmslaOnChain();
        if (!chain.get("pendingAmendment").asText().equals(CdmAgreement.NO_HASH)) throw new RuntimeException("a GMSLA amendment is already pending");
        if (!chain.get("termsHash").asText().equalsIgnoreCase(f.terms().hash())) throw new RuntimeException("the on-chain terms hash does not match the folded terms");
        var role = "B".equals(optional(b, "party")) ? cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_2 : cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_1;
        String mta = optional(b, "mtaUsd"), margin = optional(b, "defaultMargin");
        CdmGmsla.Proposal p = CdmGmsla.propose(f.terms(), optional(b, "notificationTime"), role, mta == null ? null : Long.parseLong(mta),
                margin == null ? null : new BigDecimal(margin), LocalDate.now());
        String amendmentId = Cdm.onChainId("gmsla-amendment-" + cfg.partyId + "-" + System.nanoTime());
        store.recordDocument(amendmentId, "GmslaTermsAmendment", "out", p.hash(), p.json());
        payloads.put(p.hash(), p.json(), callParties);
        JsonNode tx = gw.post("/terms-amendments", Map.of("amendmentId", amendmentId, "kind", CdmGmsla.KIND,
                "counterparty", cfg.partyAddress(counterparty()), "beforeHash", f.terms().hash(), "cdmHash", p.hash()));
        ctx.json(Map.of("amendmentId", amendmentId, "cdmHash", p.hash(), "changed", CdmGmsla.changed(p.amendment()), "proposeTx", tx.path("txHash").asText()));
    }

    /** Consent to or refuse a proposed GMSLA amendment (the counterparty only), after checking the document against
     *  the terms in force, as for the GMRA. */
    private void decideGmslaAmendment(Context ctx) {
        String id = ctx.pathParam("id");
        boolean consent = Boolean.TRUE.equals(body(ctx).get("consent"));
        JsonNode a = gw.get("/amendments/" + id);
        if (a.get("state").asInt() != 1) throw new RuntimeException("amendment " + id + " is not pending");
        if (!a.get("securedParty").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the counterparty decides a GMSLA amendment");
        if (consent) {
            GmslaFold f = gmslaFold();
            if (!f.verified()) throw new RuntimeException("the agreed GMSLA amendments do not verify: " + f.problem());
            if (!a.get("beforeHash").asText().equalsIgnoreCase(f.terms().hash())) throw new RuntimeException("the amendment does not chain from the terms in force");
            String hash = a.get("proposeCdmHash").asText();
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new RuntimeException("amendment document not in the payload store or hash mismatch");
            CdmGmsla.verify(doc, f.terms());
            store.recordDocument(id, "GmslaTermsAmendment", "in", hash, doc);
        }
        String decision = CdmRuntime.toJson(new LinkedHashMap<>(Map.of("amendmentId", id, "proposeCdmHash", a.get("proposeCdmHash").asText(),
                "consent", consent, "party", cfg.bankName(cfg.partyId), "date", LocalDate.now().toString())));
        String dHash = Cdm.keccakHex(decision);
        store.recordDocument(id, "AmendmentDecision", "out", dHash, decision);
        payloads.put(dHash, decision, callParties);
        JsonNode tx = gw.post("/terms-amendments/" + id + "/decision", Map.of("consent", consent, "cdmHash", dHash));
        ctx.json(Map.of("amendmentId", id, "consent", consent, "decisionHash", dHash, "decisionTx", tx.path("txHash").asText()));
    }

    // --- securities loans under the GMSLA (task-gmsla-loan-delivery-return, wp-adr-gmsla-loan-delivery-return) ---
    // The booked document is a cdm-ext GmslaLoan (CDM's execution event and the loan's terms), published by the lender and
    // anchored on-chain by its hash; the borrower rebuilds and checks it before affirming. The delivery and each return are
    // a cdm-ext GmslaLoanSettlement both services build; a return's hash becomes the on-chain trade hash, so the document at
    // the trade hash is the booking until the first return and the last return after it.

    /** A loan's trade in force: the trade state, the loan's terms, and the booking, the last return or the last
     *  substitution it comes from. */
    private record LoanCurrent(cdm.event.common.TradeState trade, cdmx.collateral.gmsla.GmslaLoanTerms terms, CdmLoan.Booking booking,
                               CdmLoan.Settlement lastReturn, CdmLoanSubstitution.Substitution lastSubstitution) {}

    /** Loan documents checked by this service, by hash (a document never changes). */
    private final Map<String, LoanCurrent> loanDocs = new ConcurrentHashMap<>();

    /** The document at a loan's trade hash, checked by this service; null if not in the store. */
    private LoanCurrent loanCurrent(JsonNode l) {
        return loanDocAt(l.get("tradeHash").asText());
    }

    /** The loan document with this hash (a booking or a return), checked by this service; null if not in the store. */
    private LoanCurrent loanDocAt(String hash) {
        LoanCurrent c = loanDocs.get(hash);
        if (c != null) return c;
        String doc = payloads.get(hash);
        if (doc == null) return null;
        if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the loan document does not hash to the on-chain trade hash");
        if (doc.contains("\"substitutionEvent\"")) {
            CdmLoanSubstitution.Substitution sub = CdmLoanSubstitution.verify(doc);
            c = new LoanCurrent(sub.after(), sub.doc().getTerms(), null, null, sub);
        } else if (doc.contains("\"returnEvent\"")) {
            CdmLoan.Settlement s = CdmLoan.verifyReturn(doc);
            c = new LoanCurrent(s.after(), s.settlement().getTerms(), null, s, null);
        } else {
            CdmLoan.Booking b = CdmLoan.verify(doc);
            c = new LoanCurrent(b.trade(), b.loan().getTerms(), b, null, null);
        }
        loanDocs.put(hash, c);
        return c;
    }

    /** What is wrong between an on-chain loan and its trade, or null. */
    private String loanProblem(JsonNode l, LoanCurrent c) {
        CdmLoan.Terms t = CdmLoan.terms(c.trade(), c.terms());
        String sec = symbolByAddress.get(l.get("security").asText().toLowerCase());
        String col = symbolByAddress.get(l.get("collateral").asText().toLowerCase());
        if (!l.get("loanId").asText().equalsIgnoreCase(t.loanId())) return "the trade identifier is not the loan id";
        if (!cfg.bankName(partyIdOf(l.get("lender").asText())).equals(t.lender())) return "the lender is not Party1 of the trade";
        if (!cfg.bankName(partyIdOf(l.get("borrower").asText())).equals(t.borrower())) return "the borrower is not Party2 of the trade";
        if (sec == null || !cfg.isin(sec).equals(t.isin())) return "the loaned token is not the trade's security";
        if (t.cash() ? !"tUSD".equals(col) : col == null || !cfg.isin(col).equals(t.collateralIsin())) return "the collateral token is not the trade's collateral";
        if (l.get("quantity").asLong() != t.quantity()) return "the on-chain quantity is not the trade's loaned quantity";
        if (l.get("collateralAmount").asLong() != t.collateralAmount()) return "the on-chain collateral is not the trade's collateral position";
        return null;
    }

    /** The feed price of a token, by symbol. */
    private BigDecimal loanFeedPrice(String sym) {
        return feedPrice(cfg.tokenAddress(sym)).stripTrailingZeros();
    }

    private Map<String, Object> loanView(JsonNode l) {
        Map<String, Object> m = new LinkedHashMap<>();
        boolean lender = l.get("lender").asText().equalsIgnoreCase(cfg.myAddress);
        String state = l.get("state").asText();
        m.put("loanId", l.get("loanId").asText());
        m.put("role", lender ? "lender" : "borrower");
        m.put("counterparty", partyIdOf(lender ? l.get("borrower").asText() : l.get("lender").asText()));
        m.put("state", state);
        m.put("security", symbolByAddress.get(l.get("security").asText().toLowerCase()));
        m.put("quantity", l.get("quantity").asText());
        m.put("collateral", symbolByAddress.get(l.get("collateral").asText().toLowerCase()));
        m.put("collateralAmount", l.get("collateralAmount").asText());
        m.put("tradeHash", l.get("tradeHash").asText());
        JsonNode d = l.get("delivery");
        m.put("deliveryInstructedByMe", !d.get(lender ? "lender" : "borrower").asText().equals(ZERO_HASH));
        m.put("deliveryInstructedByCounterparty", !d.get(lender ? "borrower" : "lender").asText().equals(ZERO_HASH));
        JsonNode r = l.get("pendingReturn");
        boolean mine = !r.get(lender ? "lender" : "borrower").asText().equals(ZERO_HASH);
        boolean theirs = !r.get(lender ? "borrower" : "lender").asText().equals(ZERO_HASH);
        if (mine || theirs) {
            m.put("pendingReturn", Map.of("quantity", r.get("quantity").asText(), "collateralAmount", r.get("collateralAmount").asText(),
                    "instructedByMe", mine, "instructedByCounterparty", theirs));
        }
        JsonNode rc = l.path("recall");
        if (rc.path("quantity").asLong(0) > 0) m.put("recall", recallView(l, rc));
        JsonNode sb = l.path("substitution");
        if (!sb.path("cdmHash").asText(ZERO_HASH).equals(ZERO_HASH)) m.put("substitution", substitutionView(l, sb, lender));
        if (state.equals("closedOut")) m.put("closeOutId", l.path("closeOutId").asText());
        else if (!state.equals("booked") && !state.equals("affirmed")) {
            try {
                m.put("billing", billingView(l, lender));
            } catch (Exception ex) {
                m.put("billing", Map.of("verified", false, "problem", String.valueOf(ex.getMessage())));
            }
        }
        try {
            LoanCurrent c = loanCurrent(l);
            if (c == null) {
                m.put("verified", false);
                m.put("problem", "the loan document is not in the payload store");
                return m;
            }
            CdmLoan.Terms t = CdmLoan.terms(c.trade(), c.terms());
            m.put("price", t.price().stripTrailingZeros().toPlainString());
            m.put("marginPercent", t.margin().movePointRight(2).stripTrailingZeros().toPlainString());
            if (c.terms().getRebateRate() != null) m.put("rebateRatePercent", c.terms().getRebateRate().movePointRight(2).stripTrailingZeros().toPlainString());
            if (c.terms().getFeeRate() != null) m.put("feeRatePercent", c.terms().getFeeRate().movePointRight(2).stripTrailingZeros().toPlainString());
            m.put("termDate", c.terms().getTermDate() == null ? null : c.terms().getTermDate().toString());
            m.put("tradeStateHash", CdmRepo.tradeHash(c.trade()));
            if (c.lastReturn() != null) {
                m.put("lastReturn", CdmLoan.view(c.lastReturn()));
            }
            if (c.lastSubstitution() != null) m.put("lastSubstitution", CdmLoanSubstitution.view(c.lastSubstitution()));
            String problem = loanProblem(l, c);
            m.put("verified", problem == null);
            m.put("problem", problem);
        } catch (Exception ex) {
            m.put("verified", false);
            m.put("problem", ex.getMessage());
        }
        return m;
    }

    // ---- recall of loaned securities (task-gmsla-recall, wp-adr-gmsla-recall) ----
    // The lender's cdm-ext GmslaRecallNotice is published and its hash anchored on SecuritiesLoan with the quantity and
    // the intended settlement date; the borrower settles it through the return. Rules to confirm in
    // task-sme-gmsla-recall-rules.

    /** Recall notices this service has checked, by hash (a notice never changes). */
    private final Map<String, CdmRecall.Notice> recallNotices = new ConcurrentHashMap<>();

    /** The pending recall's notice, checked: it hashes to the on-chain notice hash, rebuilds from the trade at its trade
     *  hash, and states the on-chain intended settlement date. */
    private CdmRecall.Notice recallNotice(JsonNode l, JsonNode rc) {
        String hash = rc.get("noticeHash").asText();
        CdmRecall.Notice known = recallNotices.get(hash);
        if (known != null) return known;
        String doc = payloads.get(hash);
        if (doc == null) throw new IllegalStateException("the recall notice is not in the payload store");
        if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the recall notice does not hash to the on-chain notice hash");
        var parsed = CdmRecall.parse(doc);
        if (!parsed.getLoanId().equalsIgnoreCase(l.get("loanId").asText())) throw new IllegalStateException("the recall notice is for another loan");
        LoanCurrent at = loanDocAt(parsed.getTradeHash());
        if (at == null) throw new IllegalStateException("the loan document the notice recalls is not in the payload store");
        CdmRecall.Notice n = CdmRecall.verify(doc, at.trade());
        if (n.settlementDate() != rc.get("settlementDate").asInt()) throw new IllegalStateException("the on-chain settlement date is not the notice's");
        boolean lender = l.get("lender").asText().equalsIgnoreCase(cfg.myAddress);
        if (!lender) store.recordDocument(l.get("loanId").asText(), "GmslaRecallNotice", "in", hash, doc);
        recallNotices.put(hash, n);
        return n;
    }

    private Map<String, Object> recallView(JsonNode l, JsonNode rc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("quantity", rc.get("quantity").asText());
        LocalDate due = CdmRecall.fromYyyymmdd(rc.get("settlementDate").asInt());
        m.put("intendedSettlementDate", due.toString());
        m.put("overdue", CdmRecall.overdue(due, businessDate));
        m.put("noticeHash", rc.get("noticeHash").asText());
        try {
            CdmRecall.Notice n = recallNotice(l, rc);
            m.put("recalledQuantity", n.notice().getQuantity().toPlainString());
            m.put("noticeDate", n.notice().getNoticeDate().toString());
            m.put("verified", true);
        } catch (Exception e) {
            m.put("verified", false);
            m.put("problem", e.getMessage());
        }
        return m;
    }

    /** The lender recalls all or part of an open loan on the business date (body `quantity`, default: all outstanding). */
    private void recallLoan(Context ctx) {
        String id = ctx.pathParam("id");
        Map<String, Object> b = ctx.body().isBlank() ? Map.of() : body(ctx);
        JsonNode l = gw.get("/loans/" + id);
        if (!l.get("lender").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the lender recalls a loan");
        if (!l.get("state").asText().equals("open")) throw new RuntimeException("loan " + id + " is not open");
        if (l.path("recall").path("quantity").asLong(0) > 0) throw new RuntimeException("a recall of loan " + id + " is already pending");
        LoanCurrent c = loanCurrent(l);
        if (c == null) throw new RuntimeException("the loan document is not in the payload store");
        String problem = loanProblem(l, c);
        if (problem != null) throw new RuntimeException(problem);
        Object q = b.get("quantity");
        long quantity = q == null || String.valueOf(q).isBlank() ? l.get("quantity").asLong() : Long.parseLong(String.valueOf(q));
        CdmRecall.Notice n = CdmRecall.notice(c.trade(), l.get("tradeHash").asText(), quantity, businessDate);
        store.recordDocument(id, "GmslaRecallNotice", "out", n.hash(), n.json());
        payloads.put(n.hash(), n.json(), callParties);
        recallNotices.put(n.hash(), n);
        JsonNode tx = gw.post("/loans/" + id + "/recall", Map.of("quantity", String.valueOf(quantity), "settlementDate", n.settlementDate(), "noticeHash", n.hash()));
        ctx.json(Map.of("loanId", id, "noticeHash", n.hash(), "quantity", quantity,
                "intendedSettlementDate", n.notice().getIntendedSettlementDate().toString(), "recallTx", tx.path("txHash").asText()));
    }

    /** The lender withdraws the pending recall before the return settles it. */
    private void withdrawLoanRecall(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        if (!l.get("lender").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the lender withdraws a recall");
        JsonNode rc = l.path("recall");
        if (rc.path("quantity").asLong(0) == 0) throw new RuntimeException("no recall of loan " + id + " is pending");
        CdmRecall.Notice n = recallNotice(l, rc);
        CdmRecall.Withdrawal w = CdmRecall.withdrawal(n.notice(), n.hash(), businessDate);
        store.recordDocument(id, "GmslaRecallWithdrawal", "out", w.hash(), w.json());
        payloads.put(w.hash(), w.json(), callParties);
        JsonNode tx = gw.post("/loans/" + id + "/recall/withdraw", Map.of("withdrawalHash", w.hash()));
        ctx.json(Map.of("loanId", id, "withdrawalHash", w.hash(), "withdrawTx", tx.path("txHash").asText()));
    }

    // ---- substitution of non-cash collateral (task-gmsla-substitution, wp-adr-gmsla-substitution) ----
    // The borrower's cdm-ext GmslaLoanSubstitution is published and its hash anchored on SecuritiesLoan with the
    // substitute token and quantity. The lender's service rebuilds it from the chain, the loan's trade in force, the feed
    // and its business date, and agrees with the same hash, which becomes the trade hash; or refuses. The rules are
    // assumptions listed in task-sme-gmsla-substitution-rules.

    /** Substitution documents this service has checked, by hash (a document never changes). */
    private final Map<String, CdmLoanSubstitution.Substitution> loanSubstitutions = new ConcurrentHashMap<>();

    /** The pending substitution's document, checked: it hashes to the on-chain hash, rebuilds to the same document, is
     *  over the loan's trade in force, and names the on-chain substitute token and quantity. */
    private CdmLoanSubstitution.Substitution pendingSubstitution(JsonNode l, JsonNode sb) {
        String hash = sb.get("cdmHash").asText();
        CdmLoanSubstitution.Substitution known = loanSubstitutions.get(hash);
        if (known == null) {
            String doc = payloads.get(hash);
            if (doc == null) throw new IllegalStateException("the substitution document is not in the payload store");
            if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the substitution document does not hash to the on-chain hash");
            known = CdmLoanSubstitution.verify(doc);
            loanSubstitutions.put(hash, known);
        }
        LoanCurrent c = loanCurrent(l);
        if (c == null) throw new IllegalStateException("the loan document is not in the payload store");
        if (!CdmRepo.tradeHash(c.trade()).equals(CdmRepo.tradeHash(known.doc().getTrade())))
            throw new IllegalStateException("the substitution is not over the loan's trade in force");
        String sym = symbolByAddress.get(sb.get("collateral").asText().toLowerCase());
        if (sym == null || !cfg.isin(sym).equals(known.isin())) throw new IllegalStateException("the on-chain substitute is not the document's");
        if (sb.get("collateralAmount").asLong() != known.quantity()) throw new IllegalStateException("the on-chain substitute quantity is not the document's");
        return known;
    }

    private Map<String, Object> substitutionView(JsonNode l, JsonNode sb, boolean lender) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("collateral", symbolByAddress.get(sb.get("collateral").asText().toLowerCase()));
        m.put("collateralAmount", sb.get("collateralAmount").asText());
        m.put("requestedByMe", !lender);
        try {
            CdmLoanSubstitution.Substitution s = pendingSubstitution(l, sb);
            m.putAll(CdmLoanSubstitution.view(s));
            m.put("verified", true);
        } catch (Exception ex) {
            m.put("verified", false);
            m.put("problem", ex.getMessage());
        }
        return m;
    }

    /** The borrower asks to substitute all the collateral of an open loan against securities with another security
     *  (body `collateral`, a token symbol), at the required collateral at the feed prices on the business date. */
    private void requestLoanSubstitution(Context ctx) {
        String id = ctx.pathParam("id");
        Object col = body(ctx).get("collateral");
        if (col == null || String.valueOf(col).isBlank()) throw new RuntimeException("name the substitute token (collateral)");
        String sym = String.valueOf(col);
        JsonNode l = gw.get("/loans/" + id);
        if (!l.get("borrower").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the borrower substitutes the collateral");
        if (!l.get("state").asText().equals("open")) throw new RuntimeException("loan " + id + " is not open");
        if (!l.path("substitution").path("cdmHash").asText(ZERO_HASH).equals(ZERO_HASH)) throw new RuntimeException("a substitution of loan " + id + " is already pending");
        JsonNode r = l.get("pendingReturn");
        if (!r.get("lender").asText().equals(ZERO_HASH) || !r.get("borrower").asText().equals(ZERO_HASH)) throw new RuntimeException("a return of loan " + id + " is pending");
        if ("tUSD".equals(sym)) throw new RuntimeException("cash is not a substitute: only non-cash collateral is substituted");
        requireUnderControl(sym);
        LoanCurrent c = loanCurrent(l);
        if (c == null) throw new RuntimeException("the loan document is not in the payload store");
        String problem = loanProblem(l, c);
        if (problem != null) throw new RuntimeException(problem);
        String sec = symbolByAddress.get(l.get("security").asText().toLowerCase());
        CdmLoanSubstitution.Substitution s = CdmLoanSubstitution.substitute(c.trade(), c.terms(), cfg.isin(sym),
                loanFeedPrice(sec), loanFeedPrice(sym), businessDate);
        store.recordDocument(id, "GmslaLoanSubstitution", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), callParties);
        loanSubstitutions.put(s.hash(), s);
        JsonNode tx = gw.post("/loans/" + id + "/substitute", Map.of("collateral", cfg.tokenAddress(sym),
                "collateralAmount", String.valueOf(s.quantity()), "cdmHash", s.hash()));
        Map<String, Object> out = new LinkedHashMap<>(CdmLoanSubstitution.view(s));
        out.put("loanId", id);
        out.put("cdmHash", s.hash());
        out.put("requestTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    /** The lender agrees to the pending substitution: the document must rebuild, be over the trade in force, use the
     *  feed prices on this service's business date and be dated it; the agreement approves the collateral redelivered. */
    private void agreeLoanSubstitution(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        if (!l.get("lender").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the lender agrees to a substitution");
        JsonNode sb = l.path("substitution");
        if (sb.path("cdmHash").asText(ZERO_HASH).equals(ZERO_HASH)) throw new RuntimeException("no substitution of loan " + id + " is pending");
        LoanCurrent c = loanCurrent(l);
        if (c == null) throw new RuntimeException("the loan document is not in the payload store");
        String problem = loanProblem(l, c);
        if (problem != null) throw new RuntimeException(problem);
        CdmLoanSubstitution.Substitution s = pendingSubstitution(l, sb);
        String sec = symbolByAddress.get(l.get("security").asText().toLowerCase());
        String sym = symbolByAddress.get(sb.get("collateral").asText().toLowerCase());
        CdmLoanSubstitution.Substitution mine = CdmLoanSubstitution.substitute(c.trade(), c.terms(), cfg.isin(sym),
                loanFeedPrice(sec), loanFeedPrice(sym), businessDate);
        if (!mine.hash().equalsIgnoreCase(s.hash()))
            throw new RuntimeException("the substitution is not the one this service builds (feed prices and business date " + businessDate + ")");
        store.recordDocument(id, "GmslaLoanSubstitution", "in", s.hash(), s.json());
        loanDocs.put(s.hash(), new LoanCurrent(s.after(), s.doc().getTerms(), null, null, s));
        JsonNode tx = gw.post("/loans/" + id + "/substitute/agree", Map.of("cdmHash", s.hash(),
                "token", l.get("collateral").asText(), "amount", l.get("collateralAmount").asText()));
        Map<String, Object> out = new LinkedHashMap<>(CdmLoanSubstitution.view(s));
        out.put("loanId", id);
        out.put("cdmHash", s.hash());
        out.put("agreeTx", tx.path("txHash").asText());
        ctx.json(out);
    }


    // ---- billing the loan's rate (task-gmsla-rebate, wp-adr-gmsla-rebate; task-gmsla-lending-fee, wp-adr-gmsla-lending-fee) ----
    // The lending fee on non-cash collateral uses the same billing: the lender bills it on the loaned quantity outstanding
    // at the loaned security's feed price on its business date, and the borrower's service checks that price against its
    // own feed.
    // The party receiving the rate (the borrower for a rebate on cash collateral) builds the cdm-ext GmslaLoanInvoice for
    // the period from the billed-through date (or the delivery) to its business date (or the return date of a returned
    // loan), and bills on SecuritiesLoan with its hash; the payer's service rebuilds it over its own loan documents and
    // pays in tUSD, or refuses. The rules are assumptions listed in task-sme-gmsla-rebate-rules.

    /** The loan's timeline: the trade in force from the delivery date, then from each settled return or substitution,
     *  found by walking back from the on-chain trade hash through the documents' trades before. */
    private List<CdmLoanInvoice.Change> loanTimeline(JsonNode l) {
        String id = l.get("loanId").asText();
        // The loan's documents this service holds, by the hash of the trade each one leaves in force.
        Map<String, LoanCurrent> byAfter = new HashMap<>();
        for (Map<String, Object> msg : store.messagesFor(id)) {
            String type = String.valueOf(msg.get("msgType"));
            if (!type.equals("GmslaLoanSettlement") && !type.equals("GmslaLoanSubstitution")) continue;
            String json = String.valueOf(msg.get("cdmJson"));
            if (type.equals("GmslaLoanSettlement") && !json.contains("\"returnEvent\"")) continue;
            String hash = String.valueOf(msg.get("cdmHash"));
            if (payloads.get(hash) == null) payloads.put(hash, json, callParties);
            LoanCurrent c = loanDocAt(hash);
            if (c != null) byAfter.put(CdmRepo.tradeHash(c.trade()), c);
        }
        LinkedList<CdmLoanInvoice.Change> out = new LinkedList<>();
        LoanCurrent cur = loanCurrent(l);
        if (cur == null) throw new IllegalStateException("the loan document is not in the payload store");
        while (cur.booking() == null) {
            cdm.event.common.TradeState before;
            LocalDate date;
            if (cur.lastReturn() != null) {
                before = cur.lastReturn().settlement().getTrade();
                date = cur.lastReturn().settlement().getReturnEvent().getEventDate().toLocalDate();
            } else if (cur.lastSubstitution() != null) {
                before = cur.lastSubstitution().doc().getTrade();
                date = cur.lastSubstitution().doc().getSubstitutionEvent().getEventDate().toLocalDate();
            } else throw new IllegalStateException("the loan document is neither a booking, a return nor a substitution");
            out.addFirst(new CdmLoanInvoice.Change(date, cur.trade()));
            LoanCurrent prev = byAfter.get(CdmRepo.tradeHash(before));
            if (prev == null) {
                // The first change: the trade before it is the booked trade.
                out.addFirst(new CdmLoanInvoice.Change(deliveryDate(l), before));
                return out;
            }
            cur = prev;
        }
        out.addFirst(new CdmLoanInvoice.Change(deliveryDate(l), cur.trade()));
        return out;
    }

    /** The delivery date: the settlement date of the delivery document anchored on-chain. */
    private LocalDate deliveryDate(JsonNode l) {
        String hash = l.get("deliveryHash").asText();
        String doc = payloads.get(hash);
        if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the delivery document is not in the payload store");
        try {
            JsonNode d = CdmRuntime.JSON.readTree(doc);
            return LocalDate.parse(d.path("securityTransfer").path("settlementDate").path("adjustedDate").path("@data").asText(
                    d.path("securityTransfer").path("settlementDate").path("adjustedDate").asText()));
        } catch (Exception e) {
            throw new IllegalStateException("the delivery document has no settlement date: " + e.getMessage(), e);
        }
    }

    /** The period this service would bill: from the billed-through date (or the delivery) to its business date, or to
     *  the return date of a returned loan. Null when nothing is billable. */
    private LocalDate[] billablePeriod(JsonNode l, List<CdmLoanInvoice.Change> timeline) {
        int through = l.path("bill").path("billedThrough").asInt(0);
        LocalDate start = through == 0 ? timeline.get(0).date() : CdmRecall.fromYyyymmdd(through);
        LocalDate end = l.get("state").asText().equals("returned") ? timeline.get(timeline.size() - 1).date() : businessDate;
        return end.isAfter(start) ? new LocalDate[]{start, end} : null;
    }

    /** Invoice documents this service has checked, by hash (a document never changes). */
    private final Map<String, CdmLoanInvoice.Invoice> loanInvoices = new ConcurrentHashMap<>();

    private Map<String, Object> billingView(JsonNode l, boolean lender) {
        Map<String, Object> m = new LinkedHashMap<>();
        JsonNode b = l.path("bill");
        int through = b.path("billedThrough").asInt(0);
        m.put("billedThrough", through == 0 ? null : CdmRecall.fromYyyymmdd(through).toString());
        LoanCurrent c = loanCurrent(l);
        boolean cash = c != null && c.terms().getRebateRate() != null;
        m.put("rateType", cash ? "Rebate" : "Fee");
        m.put("billedByMe", cash ? !lender : lender); // the party receiving the rate bills
        String hash = b.path("invoiceHash").asText(ZERO_HASH);
        if (!hash.equals(ZERO_HASH)) {
            Map<String, Object> pending = new LinkedHashMap<>();
            pending.put("amount", b.get("amount").asText());
            pending.put("periodEnd", CdmRecall.fromYyyymmdd(b.get("periodEnd").asInt()).toString());
            pending.put("billedByMe", b.get("biller").asText().equalsIgnoreCase(cfg.myAddress));
            try {
                CdmLoanInvoice.Invoice inv = pendingInvoice(l, b);
                pending.putAll(CdmLoanInvoice.view(inv));
                pending.put("verified", true);
            } catch (Exception ex) {
                pending.put("verified", false);
                pending.put("problem", ex.getMessage());
            }
            m.put("pending", pending);
        } else {
            LocalDate[] period = billablePeriod(l, loanTimeline(l));
            if (period != null) m.put("billable", Map.of("periodStart", period[0].toString(), "periodEnd", period[1].toString()));
        }
        m.put("verified", true);
        return m;
    }

    /** The pending invoice, checked: it hashes to the on-chain hash, rebuilds over this service's loan documents, starts
     *  at the billed-through date (or the delivery), and its total and period end are the on-chain ones. */
    private CdmLoanInvoice.Invoice pendingInvoice(JsonNode l, JsonNode b) {
        String hash = b.get("invoiceHash").asText();
        CdmLoanInvoice.Invoice known = loanInvoices.get(hash);
        if (known == null) {
            String doc = payloads.get(hash);
            if (doc == null) throw new IllegalStateException("the invoice is not in the payload store");
            if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the invoice does not hash to the on-chain hash");
            LoanCurrent c = loanCurrent(l);
            if (c == null) throw new IllegalStateException("the loan document is not in the payload store");
            known = CdmLoanInvoice.verify(doc, loanTimeline(l), c.terms());
            loanInvoices.put(hash, known);
        }
        if (!known.doc().getLoanId().equalsIgnoreCase(l.get("loanId").asText())) throw new IllegalStateException("the invoice is for another loan");
        int through = b.get("billedThrough").asInt(0);
        LocalDate start = through == 0 ? loanTimeline(l).get(0).date() : CdmRecall.fromYyyymmdd(through);
        if (!known.doc().getPeriodStart().toLocalDate().equals(start)) throw new IllegalStateException("the invoice does not start at " + start);
        if (known.onChainAmount() != b.get("amount").asLong()) throw new IllegalStateException("the on-chain amount is not the invoice total");
        if (CdmRecall.yyyymmdd(known.periodEnd()) != b.get("periodEnd").asInt()) throw new IllegalStateException("the on-chain period end is not the invoice's");
        if (known.doc().getPrice() != null) {
            BigDecimal mine = loanFeedPrice(symbolByAddress.get(l.get("security").asText().toLowerCase()));
            if (known.doc().getPrice().compareTo(mine) != 0)
                throw new IllegalStateException("the invoice prices the loaned security at " + known.doc().getPrice().toPlainString() + ", this service's feed at " + mine.toPlainString());
        }
        if (!b.get("cashToken").asText().equalsIgnoreCase(cfg.tokenAddress("tUSD"))) throw new IllegalStateException("the invoice is not payable in tUSD");
        return known;
    }

    /** The party receiving the loan's rate bills it for the period to its business date (or the return date): the
     *  borrower the rebate of a cash loan, the lender the fee of a loan against securities. */
    private void billLoan(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        boolean lender = l.get("lender").asText().equalsIgnoreCase(cfg.myAddress);
        if (!lender && !l.get("borrower").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("not a party to loan " + id);
        String state = l.get("state").asText();
        if (!state.equals("open") && !state.equals("returned")) throw new RuntimeException("loan " + id + " is not delivered");
        if (!l.path("bill").path("invoiceHash").asText(ZERO_HASH).equals(ZERO_HASH)) throw new RuntimeException("an invoice of loan " + id + " is already pending");
        LoanCurrent c = loanCurrent(l);
        if (c == null) throw new RuntimeException("the loan document is not in the payload store");
        boolean cash = c.terms().getRebateRate() != null;
        if (cash && lender) throw new RuntimeException("the borrower bills the rebate");
        if (!cash && !lender) throw new RuntimeException("the lender bills the fee");
        var timeline = loanTimeline(l);
        LocalDate[] period = billablePeriod(l, timeline);
        if (period == null) throw new RuntimeException("nothing to bill: loan " + id + " is billed through " + businessDate);
        CdmLoanInvoice.Invoice inv = cash ? CdmLoanInvoice.rebate(timeline, c.terms(), period[0], period[1])
                : CdmLoanInvoice.fee(timeline, c.terms(), period[0], period[1], loanFeedPrice(symbolByAddress.get(l.get("security").asText().toLowerCase())));
        store.recordDocument(id, "GmslaLoanInvoice", "out", inv.hash(), inv.json());
        payloads.put(inv.hash(), inv.json(), callParties);
        loanInvoices.put(inv.hash(), inv);
        JsonNode tx = gw.post("/loans/" + id + "/bill", Map.of("cashToken", cfg.tokenAddress("tUSD"), "periodEnd", CdmRecall.yyyymmdd(inv.periodEnd()),
                "amount", String.valueOf(inv.onChainAmount()), "invoiceHash", inv.hash()));
        Map<String, Object> out = new LinkedHashMap<>(CdmLoanInvoice.view(inv));
        out.put("loanId", id);
        out.put("invoiceHash", inv.hash());
        out.put("billTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    /** The payer pays the pending invoice once it rebuilds over its own documents and ends no later than its business date. */
    private void payLoanBill(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        JsonNode b = l.path("bill");
        if (b.path("invoiceHash").asText(ZERO_HASH).equals(ZERO_HASH)) throw new RuntimeException("no invoice of loan " + id + " is pending");
        if (b.get("biller").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("the biller does not pay its own invoice");
        if (!l.get("lender").asText().equalsIgnoreCase(cfg.myAddress) && !l.get("borrower").asText().equalsIgnoreCase(cfg.myAddress))
            throw new RuntimeException("not a party to loan " + id);
        CdmLoanInvoice.Invoice inv = pendingInvoice(l, b);
        if (inv.periodEnd().isAfter(businessDate)) throw new RuntimeException("the invoice ends after this service's business date " + businessDate);
        store.recordDocument(id, "GmslaLoanInvoice", "in", inv.hash(), inv.json());
        JsonNode tx = gw.post("/loans/" + id + "/bill/pay", Map.of("invoiceHash", inv.hash(), "token", b.get("cashToken").asText(), "amount", b.get("amount").asText()));
        Map<String, Object> out = new LinkedHashMap<>(CdmLoanInvoice.view(inv));
        out.put("loanId", id);
        out.put("invoiceHash", inv.hash());
        out.put("payTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    /** The payer refuses the pending invoice, which clears it; nothing moves. */
    private void refuseLoanBill(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        JsonNode b = l.path("bill");
        if (b.path("invoiceHash").asText(ZERO_HASH).equals(ZERO_HASH)) throw new RuntimeException("no invoice of loan " + id + " is pending");
        if (b.get("biller").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the payer refuses an invoice");
        JsonNode tx = gw.post("/loans/" + id + "/bill/refuse", Map.of());
        ctx.json(Map.of("loanId", id, "refuseTx", tx.path("txHash").asText()));
    }

    /** The lender refuses the pending substitution, which clears it; nothing moves. */
    private void refuseLoanSubstitution(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        if (!l.get("lender").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the lender refuses a substitution");
        if (l.path("substitution").path("cdmHash").asText(ZERO_HASH).equals(ZERO_HASH)) throw new RuntimeException("no substitution of loan " + id + " is pending");
        JsonNode tx = gw.post("/loans/" + id + "/substitute/refuse", Map.of());
        ctx.json(Map.of("loanId", id, "refuseTx", tx.path("txHash").asText()));
    }

    /** This party's loans, newest first, with the business date. */
    private void loans(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Map<String, Object>> completion = movementCompletion("loan");
        for (JsonNode l : gw.getQuery("/loans", Map.of("party", cfg.myAddress))) {
            Map<String, Object> v = loanView(l);
            withMovementCompletion(v, l.get("loanId").asText(), completion);
            out.add(0, v);
        }
        ctx.json(Map.of("businessDate", businessDate.toString(), "loans", out));
    }

    /** The lender books a loan to the counterparty: the loaned security (tMMF or tUST) and quantity, the collateral (tUSD
     *  or tUST, not the loaned security), the rate in percent per annum (the rebate rate against tUSD, the fee rate
     *  against tUST), optionally the margin (default: the GMSLA default margin) and a term in days (default: open). The
     *  collateral follows from the feed prices: cdm-ext GmslaRequiredCollateral. */
    private void bookLoan(Context ctx) {
        Map<String, Object> b = body(ctx);
        String sym = String.valueOf(b.getOrDefault("security", "tMMF"));
        String col = String.valueOf(b.getOrDefault("collateral", "tUSD"));
        if (sym.equals("tUSD") || !cfg.registry.get("tokens").has(sym)) throw new RuntimeException("not a security token: " + sym);
        if (col.equals(sym) || !cfg.registry.get("tokens").has(col)) throw new RuntimeException("not a collateral token for " + sym + ": " + col);
        requireUnderControl(col); // the collateral, not the loaned security
        long quantity = Long.parseLong(String.valueOf(b.get("quantity")));
        if (quantity < 1) throw new RuntimeException("the quantity is at least one");
        BigDecimal rate = new BigDecimal(String.valueOf(b.get("ratePercent"))).movePointLeft(2);
        Object mg = b.get("margin");
        BigDecimal margin = mg == null || String.valueOf(mg).isBlank()
                ? gmslaFold().terms().terms().getElections().getDefaultMargin() : new BigDecimal(String.valueOf(mg));
        Object term = b.get("termDays");
        LocalDate termDate = term == null || String.valueOf(term).isBlank() ? null : businessDate.plusDays(Integer.parseInt(String.valueOf(term)));
        boolean cash = col.equals("tUSD");
        BigDecimal price = loanFeedPrice(sym);
        long collateralAmount = CdmLoan.requiredCollateral(quantity, price, margin, cash ? BigDecimal.ONE : loanFeedPrice(col));
        String loanId = Cdm.onChainId("loan-" + cfg.partyId + "-" + System.nanoTime());
        CdmLoan.Terms t = new CdmLoan.Terms(loanId, cfg.bankName(cfg.partyId), cfg.bankName(counterparty()), cfg.isin(sym), quantity, price,
                cash ? null : cfg.isin(col), collateralAmount, margin, cash ? rate : null, cash ? null : rate, businessDate, termDate);
        CdmLoan.Booking booking = CdmLoan.book(t);
        store.recordDocument(loanId, "GmslaLoan", "out", booking.hash(), booking.json());
        payloads.put(booking.hash(), booking.json(), callParties);
        loanDocs.put(booking.hash(), new LoanCurrent(booking.trade(), booking.loan().getTerms(), booking, null, null));
        JsonNode tx = gw.post("/loans", Map.of("loanId", loanId, "borrower", cfg.partyAddress(counterparty()), "security", cfg.tokenAddress(sym),
                "quantity", String.valueOf(quantity), "collateral", cfg.tokenAddress(col), "collateralAmount", String.valueOf(collateralAmount),
                "tradeHash", booking.hash()));
        ctx.json(Map.of("loanId", loanId, "tradeHash", booking.hash(), "collateralAmount", collateralAmount, "bookTx", tx.path("txHash").asText()));
    }

    /** The borrower affirms: the booked loan rebuilds, matches the on-chain amounts, its price is the feed price, and the
     *  collateral is GmslaRequiredCollateral at the feed prices. */
    private void affirmLoan(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        if (!l.get("state").asText().equals("booked")) throw new RuntimeException("loan " + id + " is not booked");
        if (!l.get("borrower").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the borrower affirms a loan");
        LoanCurrent c = loanCurrent(l);
        if (c == null || c.booking() == null) throw new RuntimeException("the booked document is not in the payload store");
        String problem = loanProblem(l, c);
        if (problem != null) throw new RuntimeException(problem);
        CdmLoan.Terms t = CdmLoan.terms(c.trade(), c.terms());
        String sym = symbolByAddress.get(l.get("security").asText().toLowerCase());
        String col = symbolByAddress.get(l.get("collateral").asText().toLowerCase());
        if (loanFeedPrice(sym).compareTo(t.price()) != 0) throw new RuntimeException("the trade's price is not the feed price");
        long required = CdmLoan.requiredCollateral(t.quantity(), t.price(), t.margin(), t.cash() ? BigDecimal.ONE : loanFeedPrice(col));
        if (required != t.collateralAmount()) throw new RuntimeException("the collateral is not GmslaRequiredCollateral at the feed prices: " + required);
        store.recordDocument(id, "GmslaLoan", "in", c.booking().hash(), c.booking().json());
        JsonNode tx = gw.post("/loans/" + id + "/affirm", Map.of("tradeHash", c.booking().hash()));
        ctx.json(Map.of("loanId", id, "tradeHash", c.booking().hash(), "affirmTx", tx.path("txHash").asText()));
    }

    /** Instruct the delivery of an affirmed loan: build the GmslaLoanSettlement, approve what this party delivers (the
     *  lender the securities, the borrower the collateral) and instruct with its hash. */
    private void deliverLoan(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode l = gw.get("/loans/" + id);
        boolean lender = l.get("lender").asText().equalsIgnoreCase(cfg.myAddress);
        if (!lender && !l.get("borrower").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("not a party to loan " + id);
        if (!l.get("state").asText().equals("affirmed")) throw new RuntimeException("loan " + id + " is not affirmed");
        if (!l.get("delivery").get(lender ? "lender" : "borrower").asText().equals(ZERO_HASH)) throw new RuntimeException("already instructed");
        LoanCurrent c = loanCurrent(l);
        if (c == null || c.booking() == null) throw new RuntimeException("the booked document is not in the payload store");
        String problem = loanProblem(l, c);
        if (problem != null) throw new RuntimeException(problem);
        CdmLoan.Settlement s = CdmLoan.delivery(c.booking(), businessDate);
        store.recordDocument(id, "GmslaLoanSettlement", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), callParties);
        String token = lender ? l.get("security").asText() : l.get("collateral").asText();
        long amount = lender ? s.quantity() : s.collateralAmount();
        JsonNode tx = gw.post("/loans/" + id + "/deliver", Map.of("cdmHash", s.hash(), "token", token, "amount", String.valueOf(amount)));
        ctx.json(Map.of("loanId", id, "cdmHash", s.hash(), "instructTx", tx.path("txHash").asText()));
    }

    /** Instruct a return of an open loan on the business date: the quantity is the pending return's when the other party
     *  has instructed one, otherwise the body's. Builds the GmslaLoanSettlement (CDM's return event with the collateral
     *  reduced, Qualify_GmslaReturn), approves what this party delivers (the borrower the securities, the lender the
     *  collateral it redelivers) and instructs with its hash. */
    private void returnLoan(Context ctx) {
        String id = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        JsonNode l = gw.get("/loans/" + id);
        boolean lender = l.get("lender").asText().equalsIgnoreCase(cfg.myAddress);
        if (!lender && !l.get("borrower").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("not a party to loan " + id);
        if (!l.get("state").asText().equals("open")) throw new RuntimeException("loan " + id + " is not open");
        if (!l.path("substitution").path("cdmHash").asText(ZERO_HASH).equals(ZERO_HASH))
            throw new RuntimeException("a substitution of loan " + id + " is pending");
        JsonNode r = l.get("pendingReturn");
        if (!r.get(lender ? "lender" : "borrower").asText().equals(ZERO_HASH)) throw new RuntimeException("already instructed");
        boolean pending = !r.get(lender ? "borrower" : "lender").asText().equals(ZERO_HASH);
        long quantity;
        if (pending) {
            quantity = r.get("quantity").asLong();
            Object q = b.get("quantity");
            if (q != null && !String.valueOf(q).isBlank() && Long.parseLong(String.valueOf(q)) != quantity)
                throw new RuntimeException("the counterparty instructed a return of " + quantity);
        } else {
            Object q = b.get("quantity");
            quantity = q == null || String.valueOf(q).isBlank() ? l.get("quantity").asLong() : Long.parseLong(String.valueOf(q));
        }
        LoanCurrent c = loanCurrent(l);
        if (c == null) throw new RuntimeException("the loan document is not in the payload store");
        String problem = loanProblem(l, c);
        if (problem != null) throw new RuntimeException(problem);
        CdmLoan.Settlement s = CdmLoan.returnOf(c.trade(), c.terms(), quantity, businessDate);
        if (pending && !s.hash().equalsIgnoreCase(r.get(lender ? "borrower" : "lender").asText()))
            throw new RuntimeException("the counterparty's return is not the one this service builds (business date " + businessDate + ")");
        store.recordDocument(id, "GmslaLoanSettlement", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), callParties);
        loanDocs.put(s.hash(), new LoanCurrent(s.after(), s.settlement().getTerms(), null, s, null));
        String token = lender ? l.get("collateral").asText() : l.get("security").asText();
        long amount = lender ? s.collateralAmount() : s.quantity();
        JsonNode tx = gw.post("/loans/" + id + "/return", Map.of("quantity", String.valueOf(s.quantity()), "collateralAmount", String.valueOf(s.collateralAmount()),
                "cdmHash", s.hash(), "token", token, "amount", String.valueOf(amount)));
        Map<String, Object> out = new LinkedHashMap<>(CdmLoan.view(s));
        out.put("loanId", id);
        out.put("cdmHash", s.hash());
        out.put("instructTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    // --- repo purchase and repurchase (task-repo-purchase-repurchase, wp-adr-repo-purchase-repurchase) ---
    // The trade is CDM's TradeState in an execution BusinessEvent, published to the payload store by the seller and
    // anchored on-chain by its hash; the buyer rebuilds and checks it before affirming. Each party instructs the
    // purchase and the repurchase with the hash of the same cdm-ext RepoSettlement document.

    /** The service's business date (wp-adr-repo-purchase-repurchase: the operator can move it in the prototype). */
    private volatile LocalDate businessDate = LocalDate.now();

    /** Bookings checked by this service, by the hash of the booked document (a booked document never changes). */
    private final Map<String, CdmRepo.Booking> repoBookings = new ConcurrentHashMap<>();

    private void setBusinessDate(Context ctx) {
        businessDate = LocalDate.parse(String.valueOf(body(ctx).get("businessDate")));
        ctx.json(Map.of("businessDate", businessDate.toString()));
    }

    /** The booked document behind an on-chain repo, rebuilt and checked by this service; null if not in the store. */
    private CdmRepo.Booking repoBooking(JsonNode r) {
        String hash = r.get("tradeHash").asText();
        CdmRepo.Booking b = repoBookings.get(hash);
        if (b != null) return b;
        String doc = payloads.get(hash);
        if (doc == null) return null;
        if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the booked document does not hash to the on-chain trade hash");
        b = CdmRepo.verify(doc);
        repoBookings.put(hash, b);
        return b;
    }

    /** What is wrong between an on-chain repo and its trade, or null. */
    private String repoProblem(JsonNode r, CdmRepo.Booking b) {
        CdmRepo.Terms t = CdmRepo.terms(b.trade());
        String sym = symbolByAddress.get(r.get("security").asText().toLowerCase());
        if (!r.get("repoId").asText().equalsIgnoreCase(t.tradeId())) return "the trade identifier is not the repo id";
        if (!cfg.bankName(partyIdOf(r.get("seller").asText())).equals(t.seller())) return "the seller is not Party1 of the trade";
        if (!cfg.bankName(partyIdOf(r.get("buyer").asText())).equals(t.buyer())) return "the buyer is not Party2 of the trade";
        if (sym == null || !cfg.isin(sym).equals(t.isin())) return "the security token is not the trade's security";
        if (!"tUSD".equals(symbolByAddress.get(r.get("cash").asText().toLowerCase()))) return "the cash token is not tUSD";
        if (r.get("quantity").asLong() != t.quantity()) return "the on-chain quantity is not the trade's";
        // A replaced trade keeps a quantity or a Purchase Price from earlier, so only a first booking derives one from the other.
        if (!CdmRepo.isReplacement(b) && CdmRepo.quantity(t.purchasePrice(), t.marginRatio(), t.price()) != t.quantity()) return "the quantity does not follow from the Purchase Price, Margin Ratio and price";
        if (r.get("purchasePrice").asLong() != t.purchasePrice()) return "the on-chain Purchase Price is not the trade's";
        if (r.get("repurchasePrice").asLong() != b.repurchasePrice()) return "the on-chain Repurchase Price is not RepoRepurchasePrice over the trade";
        if (r.path("buySellBack").asBoolean(false) != t.buySellBack()) return "the on-chain trade type is not the trade's";
        return null;
    }

    /** A buy/sell-back's agreed income deductions in the current term, from the chain; zero for a repo (wp-adr-repo-buy-sell-back). */
    private static long deductionOf(JsonNode r) {
        return r.path("incomeDeduction").asLong(0);
    }

    private Map<String, Object> repoView(JsonNode r) {
        Map<String, Object> m = new LinkedHashMap<>();
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        String state = r.get("state").asText();
        m.put("repoId", r.get("repoId").asText());
        m.put("role", seller ? "seller" : "buyer");
        m.put("counterparty", partyIdOf(seller ? r.get("buyer").asText() : r.get("seller").asText()));
        m.put("state", state);
        m.put("security", symbolByAddress.get(r.get("security").asText().toLowerCase()));
        m.put("quantity", r.get("quantity").asText());
        m.put("purchasePrice", r.get("purchasePrice").asText());
        m.put("repurchasePrice", r.get("repurchasePrice").asText());
        m.put("buySellBack", r.path("buySellBack").asBoolean(false));
        m.put("incomeDeduction", String.valueOf(deductionOf(r)));
        m.put("sellBackPrice", String.valueOf(r.get("repurchasePrice").asLong() - deductionOf(r)));
        m.put("tradeHash", r.get("tradeHash").asText());
        m.put("purchaseHash", r.get("purchaseHash").asText().equals(ZERO_HASH) ? null : r.get("purchaseHash").asText());
        m.put("repurchaseHash", r.get("repurchaseHash").asText().equals(ZERO_HASH) ? null : r.get("repurchaseHash").asText());
        JsonNode ins = r.get("instructed");
        m.put("instructedByMe", !ins.get(seller ? "seller" : "buyer").asText().equals(ZERO_HASH));
        m.put("instructedByCounterparty", !ins.get(seller ? "buyer" : "seller").asText().equals(ZERO_HASH));
        String substitution = r.get("substitution").get("seller").asText();
        if (!substitution.equals(ZERO_HASH) && state.equals("purchased")) {
            m.put("substitutionPending", seller ? "requested" : "toDecide");
            try {
                CdmRepo.Terms offered = CdmRepo.terms(CdmRepo.verify(payloads.get(substitution)).trade());
                m.put("substituteSecurity", symbolOfIsin(offered.isin()));
                m.put("substituteQuantity", String.valueOf(offered.quantity()));
            } catch (RuntimeException ex) {
                m.put("substituteProblem", String.valueOf(ex.getMessage()));
            }
        }
        addPendingPayments(m, r, seller, state);
        addPendingRoll(m, r, seller, state);
        addPendingPairOff(m, r, seller, state);
        try {
            CdmRepo.Booking b = repoBooking(r);
            if (b == null) {
                m.put("verified", false);
                m.put("problem", "the booked document is not in the payload store");
                return m;
            }
            CdmRepo.Terms t = CdmRepo.terms(b.trade());
            m.put("price", t.price().stripTrailingZeros().toPlainString());
            m.put("ratePercent", t.rate().movePointRight(2).stripTrailingZeros().toPlainString());
            m.put("marginRatio", t.marginRatio().stripTrailingZeros().toPlainString());
            m.put("purchaseDate", t.purchaseDate().toString());
            m.put("repurchaseDate", t.repurchaseDate().toString());
            m.put("tradeStateHash", CdmRepo.tradeHash(b.trade()));
            String problem = repoProblem(r, b);
            m.put("verified", problem == null);
            m.put("problem", problem);
            m.put("repurchaseDue", !businessDate.isBefore(t.repurchaseDate()));
        } catch (Exception ex) {
            m.put("verified", false);
            m.put("problem", ex.getMessage());
        }
        return m;
    }

    /** This party's repos, newest first, with the business date. */
    private void repos(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Map<String, Object>> completion = movementCompletion("repo");
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            Map<String, Object> v = repoView(r);
            withMovementCompletion(v, r.get("repoId").asText(), completion);
            out.add(0, v);
        }
        ctx.json(Map.of("businessDate", businessDate.toString(), "repos", out));
    }

    /** The seller books a term repo with the counterparty: security (tUST or tMMF), Purchase Price (whole tUSD), repo
     *  rate in percent per annum, term in days from the business date, and optionally the Margin Ratio (default: the
     *  GMRA's default Margin Ratio). The quantity follows from the feed price. buySellBack: true books a buy/sell-back
     *  (wp-adr-repo-buy-sell-back), the same terms with CDM's trade type BuySellBack. */
    private void bookRepo(Context ctx) {
        Map<String, Object> b = body(ctx);
        String sym = String.valueOf(b.getOrDefault("security", "tUST"));
        if (sym.equals("tUSD") || !cfg.registry.get("tokens").has(sym)) throw new RuntimeException("not a security token: " + sym);
        requireUnderControl(sym);
        long purchasePrice = Long.parseLong(String.valueOf(b.get("purchasePrice")));
        BigDecimal rate = new BigDecimal(String.valueOf(b.get("ratePercent"))).movePointLeft(2);
        int termDays = Integer.parseInt(String.valueOf(b.getOrDefault("termDays", "7")));
        if (termDays < 1) throw new RuntimeException("the term is at least one day");
        Object mr = b.get("marginRatio");
        BigDecimal marginRatio = mr == null || String.valueOf(mr).isBlank()
                ? gmraFold().terms().terms().getElections().getDefaultMarginRatio() : new BigDecimal(String.valueOf(mr));
        BigInteger scaled = feedPrices().get(cfg.tokenAddress(sym).toLowerCase());
        if (scaled == null) throw new RuntimeException("no feed price for " + sym);
        BigDecimal price = new BigDecimal(scaled).divide(new BigDecimal(cfg.priceScale)).stripTrailingZeros();
        String repoId = Cdm.onChainId("repo-" + cfg.partyId + "-" + System.nanoTime());
        long qty = CdmRepo.quantity(purchasePrice, marginRatio, price);
        CdmRepo.Terms t = new CdmRepo.Terms(repoId, cfg.bankName(cfg.partyId), cfg.bankName(counterparty()), cfg.isin(sym), qty, price,
                purchasePrice, rate, marginRatio, businessDate, businessDate, businessDate.plusDays(termDays),
                Boolean.parseBoolean(String.valueOf(b.getOrDefault("buySellBack", "false"))));
        CdmRepo.Booking booking = CdmRepo.book(t);
        store.recordDocument(repoId, "BusinessEvent", "out", booking.hash(), booking.json());
        payloads.put(booking.hash(), booking.json(), callParties);
        repoBookings.put(booking.hash(), booking);
        JsonNode tx = gw.post("/repos", Map.of("repoId", repoId, "buyer", cfg.partyAddress(counterparty()), "security", cfg.tokenAddress(sym),
                "quantity", String.valueOf(qty), "cash", cfg.tokenAddress("tUSD"), "purchasePrice", String.valueOf(purchasePrice),
                "repurchasePrice", String.valueOf(booking.repurchasePrice()), "tradeHash", booking.hash(), "buySellBack", t.buySellBack()));
        ctx.json(Map.of("repoId", repoId, "tradeHash", booking.hash(), "quantity", qty, "repurchasePrice", booking.repurchasePrice(),
                "bookTx", tx.path("txHash").asText()));
    }

    /** The buyer affirms: the booked trade rebuilds, matches the on-chain amounts, and its price is the feed price. */
    private void affirmRepo(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode r = gw.get("/repos/" + id);
        if (!r.get("state").asText().equals("booked")) throw new RuntimeException("repo " + id + " is not booked");
        if (!r.get("buyer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the buyer affirms a repo");
        CdmRepo.Booking b = repoBooking(r);
        if (b == null) throw new RuntimeException("the booked document is not in the payload store");
        String problem = repoProblem(r, b);
        if (problem != null) throw new RuntimeException(problem);
        BigInteger scaled = feedPrices().get(r.get("security").asText().toLowerCase());
        BigDecimal feed = scaled == null ? null : new BigDecimal(scaled).divide(new BigDecimal(cfg.priceScale));
        if (feed == null || feed.compareTo(CdmRepo.terms(b.trade()).price()) != 0) throw new RuntimeException("the trade's price is not the feed price");
        store.recordDocument(id, "BusinessEvent", "in", b.hash(), b.json());
        JsonNode tx = gw.post("/repos/" + id + "/affirm", Map.of("tradeHash", b.hash()));
        ctx.json(Map.of("repoId", id, "tradeHash", b.hash(), "affirmTx", tx.path("txHash").asText()));
    }

    /** Instruct the purchase or the repurchase: build the RepoSettlement document, approve this party's leg and
     *  instruct with its hash. The repurchase only on or after the Repurchase Date by this service's business date. */
    private void settleRepo(Context ctx) {
        String id = ctx.pathParam("id");
        String phase = String.valueOf(body(ctx).getOrDefault("phase", "purchase"));
        JsonNode r = gw.get("/repos/" + id);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        if (!seller && !r.get("buyer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("not a party to repo " + id);
        if (!ins(r, seller).equals(ZERO_HASH)) throw new RuntimeException("already instructed");
        CdmRepo.Booking b = repoBooking(r);
        if (b == null) throw new RuntimeException("the booked document is not in the payload store");
        String problem = repoProblem(r, b);
        if (problem != null) throw new RuntimeException(problem);
        CdmRepo.Terms t = CdmRepo.terms(b.trade());
        CdmRepo.Settlement s;
        String token;
        long amount;
        if (phase.equals("purchase")) {
            if (!r.get("state").asText().equals("affirmed")) throw new RuntimeException("repo " + id + " is not affirmed");
            s = CdmRepo.purchase(b.trade());
            token = seller ? r.get("security").asText() : r.get("cash").asText();
            amount = seller ? t.quantity() : t.purchasePrice();
        } else if (phase.equals("repurchase")) {
            if (!r.get("state").asText().equals("purchased")) throw new RuntimeException("repo " + id + " is not purchased");
            if (businessDate.isBefore(t.repurchaseDate())) throw new RuntimeException("the business date " + businessDate + " is before the Repurchase Date " + t.repurchaseDate());
            s = CdmRepo.repurchase(b.trade(), deductionOf(r));
            token = seller ? r.get("cash").asText() : r.get("security").asText();
            amount = seller ? CdmRepo.sellBackPrice(b.trade(), deductionOf(r)) : t.quantity();
        } else {
            throw new RuntimeException("unknown phase " + phase);
        }
        store.recordDocument(id, "RepoSettlement", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), callParties);
        JsonNode tx = gw.post("/repos/" + id + "/instruct", Map.of("phase", phase, "cdmHash", s.hash(), "token", token, "amount", String.valueOf(amount)));
        ctx.json(Map.of("repoId", id, "phase", phase, "cdmHash", s.hash(), "instructTx", tx.path("txHash").asText()));
    }

    private static String ins(JsonNode r, boolean seller) {
        return r.get("instructed").get(seller ? "seller" : "buyer").asText();
    }

    /** The TradeState this service holds for a repo and, once repurchased, the closed TradeState from the anchored
     *  repurchase document, which must be the one this service builds. */
    private void repoTrade(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode r = gw.get("/repos/" + id);
        CdmRepo.Booking b = repoBooking(r);
        if (b == null) throw new RuntimeException("the booked document is not in the payload store");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("repoId", id);
        out.put("state", r.get("state").asText());
        out.put("tradeHash", b.hash());
        out.put("tradeStateHash", CdmRepo.tradeHash(b.trade()));
        String rh = r.get("repurchaseHash").asText();
        if (!rh.equals(ZERO_HASH)) {
            var closed = pairedOffClosedTrade(id, rh);
            if (closed == null) {
                CdmRepo.Settlement s = CdmRepo.repurchase(b.trade(), deductionOf(r));
                if (!s.hash().equalsIgnoreCase(rh)) throw new RuntimeException("the anchored repurchase is not the one this service builds");
                closed = s.settlement().getRepurchase().getAfter().get(0);
            }
            out.put("closedTradeStateHash", CdmRepo.tradeHash(closed));
            out.put("closedState", closed.getState().getClosedState().getState().toString());
        }
        ctx.json(out);
    }

    // ---- repo margin maintenance (task-repo-margin-maintenance, wp-adr-repo-margin-maintenance) ----
    // A GMRA call is a CallKind.VM call settled by title transfer whose CDM issuance names the GMRA. Rules to confirm in
    // task-sme-repo-margin-exposure.

    /** The anchored IssueCall document of each call, by call id (a known answer is kept: a call's issuance never changes). */
    private final Map<String, String> issueDocs = new ConcurrentHashMap<>();

    /** A call's anchored IssueCall document; null when it is not yet in the payload store. */
    private String issueDoc(String callId) {
        String known = issueDocs.get(callId.toLowerCase());
        if (known != null) return known;
        // The gateway's log scan and the payload store can lag the mined issuance by a moment.
        for (int attempt = 0; attempt < 5; attempt++) {
            JsonNode steps = gw.get("/calls/" + callId + "/steps");
            String hash = steps.isEmpty() ? null : steps.get(0).get("cdmHash").asText();
            String doc = hash == null ? null : payloads.get(hash);
            if (doc != null && Cdm.keccakHex(doc).equalsIgnoreCase(hash)) {
                issueDocs.put(callId.toLowerCase(), doc);
                return doc;
            }
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return null;
    }

    /** The master agreement a call's issuance names (GMRA, GMSLA), or null for a CSA call or an issuance not yet stored. */
    private String callAgreement(String callId) {
        String doc = issueDoc(callId);
        return doc == null ? null : CdmGmslaMark.agreementOf(doc);
    }

    /** Whether a call's anchored issuance names the GMRA. */
    private boolean isGmraCall(String callId) {
        return "GMRA".equals(callAgreement(callId));
    }

    /** Whether a call's anchored issuance names the GMSLA (wp-adr-gmsla-marking). */
    private boolean isGmslaCall(String callId) {
        return "GMSLA".equals(callAgreement(callId));
    }

    private record RepoMarginState(List<Map<String, Object>> rows, BigDecimal held, long cashHeld, BigDecimal net) {}

    private BigDecimal feedPrice(String tokenAddress) {
        BigInteger scaled = feedPrices().get(tokenAddress.toLowerCase());
        if (scaled == null) throw new RuntimeException("no feed price for " + tokenAddress);
        return new BigDecimal(scaled).divide(new BigDecimal(cfg.priceScale));
    }

    /** Net Exposure at this service's business date: every purchased repo's exposure from this party's side, less the
     *  margin this party holds net, from the settled GMRA calls' accepted proposals at the current feed prices. */
    private RepoMarginState repoMarginState() {
        Set<String> closedOutCalls = repoCloseOutSettledCalls();
        var elections = gmraFold().terms().terms().getElections();
        List<Map<String, Object>> rows = new ArrayList<>();
        List<BigDecimal> exposures = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            if (!r.get("state").asText().equals("purchased")) continue;
            CdmRepo.Booking b = repoBooking(r);
            if (b == null) throw new RuntimeException("the booked document of repo " + r.get("repoId").asText() + " is not in the payload store");
            boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
            BigDecimal price = feedPrice(r.get("security").asText());
            BigDecimal e = CdmRepoMargin.exposure(b.trade(), elections, businessDate, CdmRepo.terms(b.trade()).quantity(), price, seller, deductionOf(r));
            exposures.add(e);
            rows.add(new LinkedHashMap<>(Map.of("repoId", r.get("repoId").asText(), "role", seller ? "seller" : "buyer",
                    "price", price.stripTrailingZeros().toPlainString(), "exposureUsd", e.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString())));
        }
        BigDecimal held = BigDecimal.ZERO;
        long cashHeld = 0;
        String tUsd = cfg.tokenAddress("tUSD");
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int state = c.get("state").asInt();
            String callId = entry.get("callId").asText();
            if (c.get("kind").asInt() != 1 || (state != 5 && state != 6) || !isGmraCall(callId)) continue;
            if (closedOutCalls.contains(callId.toLowerCase())) continue; // settled in a default close-out
            boolean received = c.get("from").asText().equalsIgnoreCase(cfg.myAddress);
            long pid = c.get("activeProposal").asLong() - 1;
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + pid + "/assets")) {
                long qty = a.get("qty").asLong();
                BigDecimal v = CdmRepoMargin.value(qty, feedPrice(a.get("token").asText()));
                held = received ? held.add(v) : held.subtract(v);
                if (a.get("token").asText().equalsIgnoreCase(tUsd)) cashHeld += received ? qty : -qty;
            }
        }
        return new RepoMarginState(rows, held, cashHeld, CdmRepoMargin.netExposure(exposures, held));
    }

    private long gmraMta(String partyId) {
        var role = partyId.equals("A") ? cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_1 : cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_2;
        return CdmGmra.mtaUsd(gmraFold().terms().terms().getElections(), role);
    }

    /** Whether a GMRA call between the pair is still open: its amount is not yet in the margin held. */
    private boolean gmraCallOpen() {
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int state = c.get("state").asInt();
            if (c.get("kind").asInt() == 1 && state >= 1 && state <= 3 && isGmraCall(entry.get("callId").asText())) return true;
        }
        return false;
    }

    private void repoMargin(Context ctx) {
        RepoMarginState s = repoMarginState();
        long mta = gmraMta(cfg.partyId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("businessDate", businessDate.toString());
        m.put("exposures", s.rows());
        m.put("netMarginHeldUsd", s.held().setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
        m.put("cashMarginHeldUsd", String.valueOf(s.cashHeld()));
        m.put("netExposureUsd", s.net().setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
        m.put("minimumTransferAmountUsd", String.valueOf(mta));
        m.put("callableUsd", String.valueOf(CdmRepoMargin.callAmount(s.net(), mta)));
        m.put("callOpen", gmraCallOpen());
        List<JsonNode> purchased = purchasedRepos();
        m.put("repriceOffered", replacementPending(purchased, "reprice", true));
        m.put("repriceToAgree", replacementPending(purchased, "reprice", false));
        m.put("adjustOffered", replacementPending(purchased, "adjustment", true));
        m.put("adjustToAgree", replacementPending(purchased, "adjustment", false));
        m.put("substitutionsPending", substitutionsPending(purchased));
        m.put("paymentsPending", paymentsPending(purchased));
        List<Map<String, Object>> interest = new ArrayList<>();
        var elections = gmraFold().terms().terms().getElections();
        for (JsonNode r : gw.getQuery("/interest", Map.of("party", cfg.myAddress))) {
            String hash = r.get("cdmHash").asText();
            String doc = payloads.get(hash);
            if (doc == null || !CdmRepoMargin.isStatement(doc)) continue;
            Map<String, Object> i = new LinkedHashMap<>(Map.of("interestId", r.get("interestId").asText(), "cdmHash", hash, "amountUsd", r.get("amount").asText()));
            try {
                var st = CdmRepoMargin.verify(doc, elections);
                boolean ok = Cdm.keccakHex(doc).equalsIgnoreCase(hash) && String.valueOf(CdmRepoMargin.amount(st)).equals(r.get("amount").asText());
                i.put("verified", ok);
                i.put("payer", st.getPayer());
                i.put("receiver", st.getReceiver());
                i.put("days", st.getDays());
            } catch (RuntimeException e) {
                i.put("verified", false);
                i.put("error", String.valueOf(e.getMessage()));
            }
            interest.add(i);
        }
        m.put("interest", interest);
        ctx.json(m);
    }

    /** The party with the Net Exposure calls it, when it exceeds this party's minimum transfer amount. */
    private void issueRepoMarginCall(Context ctx) {
        if (gmraCallOpen()) throw new RuntimeException("a GMRA margin call between the parties is still open");
        if (replacementsPending(purchasedRepos()) > 0) throw new RuntimeException("a reprice, adjustment, substitution or payment between the parties is still pending");
        RepoMarginState s = repoMarginState();
        long amountUsd = CdmRepoMargin.callAmount(s.net(), gmraMta(cfg.partyId));
        if (amountUsd == 0) throw new RuntimeException("the Net Exposure " + s.net().toPlainString() + " does not exceed the minimum transfer amount");
        long deadline = System.currentTimeMillis() / 1000 + 86400L * Math.max(1, gmraFold().terms().terms().getElections().getMarginTransfer().getTransferBusinessDays());
        String callId = Cdm.onChainId(cfg.partyId + "-gmra-" + System.nanoTime());
        Cdm cdm = Cdm.issue(Cdm.cdmCallId(callId), cfg.bankName(cfg.partyId), amountUsd, "Delivery", null, "VM", true);
        record(callId, "IssueCall", cdm);
        issueDocs.put(callId.toLowerCase(), cdm.json);
        gw.post("/calls", new LinkedHashMap<>(Map.of("callId", callId, "kind", CALL_KIND.get("VM"), "to", cfg.partyAddress(counterparty()),
                "amount", BigInteger.valueOf(amountUsd).multiply(cfg.priceScale).toString(), "deadline", deadline, "cdmHash", cdm.hash)));
        ctx.json(Map.of("callId", callId, "cdmHash", cdm.hash, "amountUsd", amountUsd, "settlementMethod", "TitleTransfer"));
    }

    // ---- securities lending marks (task-gmsla-marking, wp-adr-gmsla-marking) ----
    // The pair's open loans are marked together (GMSLA paragraph 5.4) at the feed prices on the business date. The party
    // whose net figure exceeds its minimum transfer amount calls it as a VM call by title transfer whose IssueCall step
    // names the GMSLA and carries the hash of the cdm-ext GmslaMarkStatement. Rules to confirm in
    // task-sme-gmsla-marking-rules.

    private long gmslaMta(String partyId) {
        var role = partyId.equals("A") ? cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_1 : cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_2;
        return CdmGmsla.mtaUsd(gmslaFold().terms().terms(), role);
    }

    /** The margin this party holds net from the pair's settled GMSLA calls, at the feed prices, and the calls. */
    private record GmslaMarginHeld(BigDecimal value, List<String> calls) {}

    private GmslaMarginHeld gmslaMarginHeld() {
        BigDecimal held = BigDecimal.ZERO;
        List<String> calls = new ArrayList<>();
        Set<String> closedOut = loanCloseOutSettledCalls();
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int state = c.get("state").asInt();
            String callId = entry.get("callId").asText();
            if (c.get("kind").asInt() != 1 || (state != 5 && state != 6) || !isGmslaCall(callId)) continue;
            if (closedOut.contains(callId.toLowerCase())) continue;
            boolean received = c.get("from").asText().equalsIgnoreCase(cfg.myAddress);
            long pid = c.get("activeProposal").asLong() - 1;
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + pid + "/assets")) {
                BigDecimal v = CdmRepoMargin.value(a.get("qty").asLong(), feedPrice(a.get("token").asText()));
                held = received ? held.add(v) : held.subtract(v);
            }
            calls.add(callId);
        }
        return new GmslaMarginHeld(held, calls);
    }

    /** The mark stated for a party ("A" or "B"): the pair's open loans from the chain, checked against their trades,
     *  at the feed prices on this service's business date. */
    private CdmGmslaMark.Statement gmslaMark(String statedFor) {
        List<CdmGmslaMark.LoanInput> loans = new ArrayList<>();
        for (JsonNode l : gw.getQuery("/loans", Map.of("party", cfg.myAddress))) {
            if (!l.get("state").asText().equals("open")) continue;
            String id = l.get("loanId").asText();
            LoanCurrent c = loanCurrent(l);
            if (c == null) throw new RuntimeException("the document of loan " + id + " is not in the payload store");
            String problem = loanProblem(l, c);
            if (problem != null) throw new RuntimeException("loan " + id + ": " + problem);
            CdmLoan.Terms t = CdmLoan.terms(c.trade(), c.terms());
            String sec = symbolByAddress.get(l.get("security").asText().toLowerCase());
            String col = symbolByAddress.get(l.get("collateral").asText().toLowerCase());
            loans.add(new CdmGmslaMark.LoanInput(id, l.get("tradeHash").asText(), t.lender(), t.borrower(), t.isin(), l.get("quantity").asLong(),
                    loanFeedPrice(sec), t.margin(), t.cash() ? "USD" : t.collateralIsin(), l.get("collateralAmount").asLong(),
                    t.cash() ? BigDecimal.ONE : loanFeedPrice(col)));
        }
        BigDecimal held = gmslaMarginHeld().value();
        boolean mine = statedFor.equals(cfg.partyId);
        String other = statedFor.equals("A") ? "B" : "A";
        return CdmGmslaMark.build(cfg.bankName(statedFor), cfg.bankName(other), businessDate, "USD", loans,
                mine ? held : held.negate(), gmslaMta(statedFor));
    }

    /** Whether a GMSLA call between the pair is still open: its amount is not yet in the margin held. */
    private boolean gmslaCallOpen() {
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int state = c.get("state").asInt();
            if (c.get("kind").asInt() == 1 && state >= 1 && state <= 3 && isGmslaCall(entry.get("callId").asText())) return true;
        }
        return false;
    }

    private void gmslaMarking(Context ctx) {
        CdmGmslaMark.Statement s = gmslaMark(cfg.partyId);
        Map<String, Object> m = new LinkedHashMap<>(CdmGmslaMark.view(s.statement()));
        m.put("statementHash", s.hash());
        m.put("callOpen", gmslaCallOpen());
        m.put("settledCalls", gmslaMarginHeld().calls());
        ctx.json(m);
    }

    /** The party whose net figure exceeds its minimum transfer amount calls it: the statement is published and its
     *  hash rides in the call's IssueCall step. */
    private void issueGmslaMarginCall(Context ctx) {
        if (gmslaCallOpen()) throw new RuntimeException("a GMSLA margin call between the parties is still open");
        CdmGmslaMark.Statement s = gmslaMark(cfg.partyId);
        long amountUsd = CdmGmslaMark.callAmount(s.statement());
        if (amountUsd == 0) throw new RuntimeException("the net figure " + s.statement().getNetExposure().toPlainString() + " does not exceed the minimum transfer amount");
        String callId = Cdm.onChainId(cfg.partyId + "-gmsla-" + System.nanoTime());
        store.recordDocument(callId, "GmslaMarkStatement", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), callParties);
        Cdm cdm = Cdm.issueGmsla(Cdm.cdmCallId(callId), cfg.bankName(cfg.partyId), amountUsd, s.hash());
        record(callId, "IssueCall", cdm);
        issueDocs.put(callId.toLowerCase(), cdm.json);
        long deadline = System.currentTimeMillis() / 1000 + 86400L;
        gw.post("/calls", new LinkedHashMap<>(Map.of("callId", callId, "kind", CALL_KIND.get("VM"), "to", cfg.partyAddress(counterparty()),
                "amount", BigInteger.valueOf(amountUsd).multiply(cfg.priceScale).toString(), "deadline", deadline, "cdmHash", cdm.hash)));
        ctx.json(Map.of("callId", callId, "cdmHash", cdm.hash, "statementHash", s.hash(), "amountUsd", amountUsd, "settlementMethod", "TitleTransfer"));
    }

    /** The called party agrees a GMSLA call in full only if it builds the same mark for the caller: the hash in the
     *  IssueCall step, and the amount called. */
    private void checkGmslaCall(String callId, JsonNode c) {
        if (!c.get("to").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the called party responds to a call");
        String doc = issueDoc(callId);
        String stated = doc == null ? null : CdmGmslaMark.markStatementOf(doc);
        if (stated == null) throw new RuntimeException("the call's IssueCall step carries no mark statement");
        CdmGmslaMark.Statement again = gmslaMark(partyIdOf(c.get("from").asText()));
        long called = new BigInteger(c.get("amount").asText()).divide(cfg.priceScale).longValue();
        if (!again.hash().equalsIgnoreCase(stated))
            throw new RuntimeException("the call's mark statement is not the one this service builds at the feed prices and business date " + businessDate
                    + " (net figure " + again.statement().getNetExposure().toPlainString() + ")");
        if (CdmGmslaMark.callAmount(again.statement()) != called) throw new RuntimeException("the call amount " + called + " is not the mark's call amount");
        String published = payloads.get(stated);
        if (published != null) store.recordDocument(callId, "GmslaMarkStatement", "in", stated, published);
    }

    /** GMSLA margin is cash (tUSD) or tUST, and its value at the feed prices, without a haircut, covers the amount. */
    private void checkGmslaCoverage(List<Map.Entry<String, Long>> assets, long agreedUsd) {
        BigDecimal value = BigDecimal.ZERO;
        for (Map.Entry<String, Long> a : assets) {
            if (!"tUSD".equals(a.getKey()) && !"tUST".equals(a.getKey())) throw new RuntimeException("GMSLA margin is tUSD or tUST, not " + a.getKey());
            value = value.add(CdmRepoMargin.value(a.getValue(), feedPrice(cfg.tokenAddress(a.getKey()))));
        }
        if (value.compareTo(BigDecimal.valueOf(agreedUsd)) < 0) throw new RuntimeException("the assets' value " + value.toPlainString() + " does not cover the agreed amount " + agreedUsd);
    }

    // ---- repo reprice and adjustment (wp-adr-repo-reprice, wp-adr-repo-adjustment) ----
    // Alternatives to a GMRA call. One CDM event and one on-chain settlement per purchased repo. Both parties build the same
    // event, so the agreeing party's hash matches only for the same feed prices and business date. Rules to confirm in
    // task-sme-repo-reprice-rules and task-sme-repo-adjustment-rules.

    /** One purchased repo's reprice or adjustment: the new trade, the gateway path and amounts, and what this party
     *  delivers to settle it, by token. */
    private record Replacement(JsonNode repo, CdmRepo.Booking next, String path, Map<String, Object> amounts, Map<String, Long> myPayments) {
        String id() { return repo.get("repoId").asText(); }
    }

    private interface ReplacementBuilder {
        Replacement build(JsonNode repo, cdmx.collateral.gmra.GmraElections elections);
    }

    private static String pendingHash(JsonNode r, String kind, boolean seller) {
        return r.get(kind).get(seller ? "seller" : "buyer").asText();
    }

    /** This party's purchased repos, fetched once per request: the gateway's /repos reads every repo this party was ever
     *  in, so its cost grows with the chain's history, and the pending counts below each need the same list. */
    private List<JsonNode> purchasedRepos() {
        List<JsonNode> purchased = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            if (r.get("state").asText().equals("purchased")) purchased.add(r);
        }
        return purchased;
    }

    /** The purchased repos with a pending instruction of this kind ("reprice" or "adjustment") from this party (mine) or
     *  from the counterparty. */
    private int replacementPending(List<JsonNode> purchased, String kind, boolean mine) {
        int n = 0;
        for (JsonNode r : purchased) {
            boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
            if (!pendingHash(r, kind, mine ? seller : !seller).equals(ZERO_HASH)) n++;
        }
        return n;
    }

    private int replacementsPending(List<JsonNode> purchased) {
        return replacementPending(purchased, "reprice", true) + replacementPending(purchased, "reprice", false)
                + replacementPending(purchased, "adjustment", true) + replacementPending(purchased, "adjustment", false)
                + substitutionsPending(purchased) + paymentsPending(purchased);
    }

    private int paymentsPending(List<JsonNode> purchased) {
        return replacementPending(purchased, "interimInterest", true) + replacementPending(purchased, "interimInterest", false)
                + replacementPending(purchased, "income", true) + replacementPending(purchased, "income", false)
                + replacementPending(purchased, "roll", true) + replacementPending(purchased, "roll", false);
    }

    private int substitutionsPending(List<JsonNode> purchased) {
        return replacementPending(purchased, "substitution", true) + replacementPending(purchased, "substitution", false);
    }

    /** The checked booking of a purchased repo; null when it is due for repurchase and cannot be replaced. */
    private CdmRepo.Booking replaceable(JsonNode r) {
        CdmRepo.Booking b = repoBooking(r);
        if (b == null) throw new RuntimeException("the booked document of repo " + r.get("repoId").asText() + " is not in the payload store");
        String problem = repoProblem(r, b);
        if (problem != null) throw new RuntimeException(problem);
        return businessDate.isBefore(CdmRepo.terms(b.trade()).repurchaseDate()) ? b : null;
    }

    /** The reprice of one purchased repo at the feed price and business date; null when none applies. */
    private Replacement repriceLeg(JsonNode r, cdmx.collateral.gmra.GmraElections elections) {
        CdmRepo.Booking b = replaceable(r);
        if (b == null) return null;
        CdmRepo.Repriced next = CdmRepo.reprice(b.trade(), feedPrice(r.get("security").asText()), CdmRepoMargin.marginRatio(b.trade(), elections), businessDate);
        long newPurchasePrice = CdmRepo.terms(next.booking().trade()).purchasePrice();
        if (newPurchasePrice == CdmRepo.terms(b.trade()).purchasePrice()) return null;
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        long fromSeller = next.cashFromSeller();
        Map<String, Object> amounts = new LinkedHashMap<>(Map.of("newPurchasePrice", String.valueOf(newPurchasePrice),
                "newRepurchasePrice", String.valueOf(next.booking().repurchasePrice()), "cashFromSeller", String.valueOf(fromSeller)));
        return new Replacement(r, next.booking(), "reprice", amounts, Map.of(r.get("cash").asText(), Math.max(0, seller ? fromSeller : -fromSeller)));
    }

    /** The adjustment of one purchased repo at the feed price and business date; null when none applies. */
    private Replacement adjustmentLeg(JsonNode r, cdmx.collateral.gmra.GmraElections elections) {
        CdmRepo.Booking b = replaceable(r);
        if (b == null) return null;
        CdmRepo.Adjusted next = CdmRepo.adjust(b.trade(), feedPrice(r.get("security").asText()), CdmRepoMargin.marginRatio(b.trade(), elections), businessDate);
        long oldQuantity = CdmRepo.terms(b.trade()).quantity();
        if (next.newQuantity() == oldQuantity) return null;
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        long fromSeller = next.newQuantity() - oldQuantity;
        Map<String, Long> pays = new LinkedHashMap<>();
        pays.put(r.get("security").asText(), Math.max(0, seller ? fromSeller : -fromSeller));
        pays.put(r.get("cash").asText(), seller ? next.accruedFromSeller() : 0L);
        Map<String, Object> amounts = new LinkedHashMap<>(Map.of("newQuantity", String.valueOf(next.newQuantity()),
                "newRepurchasePrice", String.valueOf(next.booking().repurchasePrice()), "accruedFromSeller", String.valueOf(next.accruedFromSeller())));
        return new Replacement(r, next.booking(), "adjust", amounts, pays);
    }

    /** Instructs one replacement. The approvals cover every delivery of this party still to settle, by token, because
     *  each approval replaces the last one and a proposer's deliveries are collected only when the other party agrees. */
    private String instructReplacement(Replacement leg, Map<String, Long> remaining) {
        store.recordDocument(leg.id(), "BusinessEvent", "out", leg.next().hash(), leg.next().json());
        payloads.put(leg.next().hash(), leg.next().json(), callParties);
        repoBookings.put(leg.next().hash(), leg.next());
        List<Map<String, String>> approvals = new ArrayList<>();
        remaining.forEach((token, amount) -> { if (amount > 0) approvals.add(Map.of("token", token, "amount", String.valueOf(amount))); });
        Map<String, Object> m = new LinkedHashMap<>(leg.amounts());
        m.put("cdmHash", leg.next().hash());
        m.put("approvals", approvals);
        return gw.post("/repos/" + leg.id() + "/" + leg.path(), m).path("txHash").asText();
    }

    private static Map<String, Long> totalPayments(List<Replacement> legs) {
        Map<String, Long> total = new LinkedHashMap<>();
        for (Replacement leg : legs) leg.myPayments().forEach((token, amount) -> total.merge(token, amount, Long::sum));
        return total;
    }

    private static Map<String, Object> replacementRow(Replacement leg, String tx) {
        return new LinkedHashMap<>(Map.of("repoId", leg.id(), "cdmHash", leg.next().hash(), "instructTx", tx));
    }

    /** The party with the Net Exposure above its minimum transfer amount offers to replace every purchased repo. */
    private void proposeReplacement(Context ctx, ReplacementBuilder builder) {
        if (gmraCallOpen()) throw new RuntimeException("a GMRA margin call between the parties is still open");
        List<JsonNode> purchased = purchasedRepos();
        if (replacementPending(purchased, "reprice", false) + replacementPending(purchased, "adjustment", false) > 0) throw new RuntimeException("the counterparty has made an offer: agree to it");
        if (substitutionsPending(purchased) + paymentsPending(purchased) > 0) throw new RuntimeException("a substitution or payment between the parties is still pending");
        RepoMarginState s = repoMarginState();
        if (CdmRepoMargin.callAmount(s.net(), gmraMta(cfg.partyId)) == 0) throw new RuntimeException("the Net Exposure " + s.net().toPlainString() + " does not exceed the minimum transfer amount");
        var elections = gmraFold().terms().terms().getElections();
        List<Replacement> legs = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            if (!r.get("state").asText().equals("purchased")) continue;
            Replacement leg = builder.build(r, elections);
            if (leg != null) legs.add(leg);
        }
        if (legs.isEmpty()) throw new RuntimeException("no purchased repo can be changed");
        Map<String, Long> total = totalPayments(legs);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Replacement leg : legs) out.add(replacementRow(leg, instructReplacement(leg, total)));
        ctx.json(Map.of("repos", out));
    }

    // ---- repo substitution (wp-adr-repo-substitution) ----
    // The Seller replaces all the securities of one purchased repo; the Buyer agrees or refuses. No cash moves. Rules to
    // confirm in task-sme-repo-substitution-rules.

    /** The substitution of one purchased repo at the feed prices and business date. */
    private Replacement substitutionLeg(JsonNode r, String symbol) {
        CdmRepo.Booking b = replaceable(r);
        if (b == null) throw new RuntimeException("repo " + r.get("repoId").asText() + " is due for repurchase");
        requireUnderControl(symbol);
        String newSecurity = cfg.tokenAddress(symbol);
        CdmRepo.Substituted next = CdmRepo.substitute(b.trade(), cfg.isin(symbol), feedPrice(r.get("security").asText()), feedPrice(newSecurity), businessDate);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        Map<String, Long> pays = seller ? Map.of(newSecurity, next.newQuantity()) : Map.of(r.get("security").asText(), r.get("quantity").asLong());
        Map<String, Object> amounts = new LinkedHashMap<>(Map.of("newSecurity", newSecurity, "newQuantity", String.valueOf(next.newQuantity())));
        return new Replacement(r, next.booking(), "substitute", amounts, pays);
    }

    private JsonNode purchasedRepo(Context ctx) {
        JsonNode r = gw.get("/repos/" + ctx.pathParam("id"));
        if (!r.get("state").asText().equals("purchased")) throw new RuntimeException("the repo is not purchased");
        return r;
    }

    /** The Seller requests the substitution of a purchased repo by another security on the feed. */
    private void requestRepoSubstitution(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        if (!r.get("seller").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the Seller can request a substitution");
        Replacement leg = substitutionLeg(r, String.valueOf(body(ctx).get("security")));
        Map<String, Object> row = replacementRow(leg, instructReplacement(leg, totalPayments(List.of(leg))));
        row.put("newQuantity", leg.amounts().get("newQuantity"));
        ctx.json(row);
    }

    /** The Buyer agrees only if this service builds the same event from the offered security, the feed and its business date. */
    private void agreeRepoSubstitution(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        if (!r.get("buyer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the Buyer can agree a substitution");
        String offered = r.get("substitution").get("seller").asText();
        if (offered.equals(ZERO_HASH)) throw new RuntimeException("no substitution is requested");
        String doc = payloads.get(offered);
        if (doc == null) throw new RuntimeException("the requested substitution is not in the payload store");
        Replacement leg = substitutionLeg(r, symbolOfIsin(CdmRepo.terms(CdmRepo.verify(doc).trade()).isin()));
        if (!leg.next().hash().equalsIgnoreCase(offered))
            throw new RuntimeException("the substitution requested for repo " + leg.id() + " is not the one this service builds at the feed prices and business date " + businessDate);
        ctx.json(replacementRow(leg, instructReplacement(leg, totalPayments(List.of(leg)))));
    }

    /** The Buyer refuses the Seller's request. */
    private void refuseRepoSubstitution(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        if (!r.get("buyer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the Buyer can refuse a substitution");
        ctx.json(Map.of("refuseTx", gw.post("/repos/" + ctx.pathParam("id") + "/substitute/refuse", Map.of()).path("txHash").asText()));
    }

    // ---- repo interim interest and manufactured income (wp-adr-repo-income) ----
    // The payer instructs and the receiver agrees or refuses. Rules to confirm in task-sme-repo-income-rules.

    private void addPendingPayments(Map<String, Object> m, JsonNode r, boolean seller, String state) {
        if (!state.equals("purchased")) return;
        String interim = r.get("interimInterest").get("seller").asText();
        if (!interim.equals(ZERO_HASH)) {
            m.put("interimPending", seller ? "requested" : "toDecide");
            try {
                var ev = CdmRepo.verify(payloads.get(interim));
                var history = ev.trade().getTransferHistory();
                m.put("interimAmount", history.get(history.size() - 1).getTransfer().getScheduledTransfer().getQuantity().getValue().toPlainString());
            } catch (RuntimeException ex) {
                m.put("paymentProblem", String.valueOf(ex.getMessage()));
            }
        }
        String income = r.get("income").get("buyer").asText();
        if (!income.equals(ZERO_HASH)) {
            m.put("incomePending", seller ? "toDecide" : "requested");
            try {
                if (r.path("buySellBack").asBoolean(false)) {
                    var doc = CdmRuntime.JSON.readValue(payloads.get(income), cdmx.collateral.repo.BuySellBackIncome.class);
                    m.put("incomeAmount", doc.getIncomeAmount().toPlainString());
                    m.put("incomeSellBackDeduction", doc.getDeduction().toPlainString());
                    m.put("incomePerUnit", doc.getIncomePerUnit().stripTrailingZeros().toPlainString());
                    m.put("incomeDate", doc.getIncomeDate().toLocalDate().toString());
                } else {
                    var doc = CdmRuntime.JSON.readValue(payloads.get(income), cdmx.collateral.repo.RepoManufacturedIncome.class);
                    m.put("incomeAmount", doc.getAmount().toPlainString());
                    m.put("incomePerUnit", doc.getIncomePerUnit().stripTrailingZeros().toPlainString());
                    m.put("incomeDate", doc.getIncomeDate().toLocalDate().toString());
                }
            } catch (Exception ex) {
                m.put("paymentProblem", String.valueOf(ex.getMessage()));
            }
        }
    }

    private void requireRole(JsonNode r, String role, String action) {
        if (!r.get(role).asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the " + (role.equals("seller") ? "Seller" : "Buyer") + " can " + action);
    }

    private Replacement interimLeg(JsonNode r) {
        CdmRepo.Booking b = replaceable(r);
        if (b == null) throw new RuntimeException("repo " + r.get("repoId").asText() + " is due for repurchase");
        CdmRepo.InterimPaid next = CdmRepo.interimInterest(b.trade(), businessDate);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        Map<String, Object> amounts = new LinkedHashMap<>(Map.of("amount", String.valueOf(next.amount()), "newRepurchasePrice", String.valueOf(next.booking().repurchasePrice())));
        Map<String, Long> pays = seller ? Map.of(r.get("cash").asText(), next.amount()) : Map.of();
        return new Replacement(r, next.booking(), "interim-interest", amounts, pays);
    }

    /** The Seller pays the Price Differential accrued to the business date, less earlier interim payments. */
    private void payInterimInterest(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        requireRole(r, "seller", "pay interim interest");
        Replacement leg = interimLeg(r);
        Map<String, Object> row = replacementRow(leg, instructReplacement(leg, totalPayments(List.of(leg))));
        row.put("amount", leg.amounts().get("amount"));
        ctx.json(row);
    }

    /** The Buyer agrees only if this service builds the same event at its business date. */
    private void agreeInterimInterest(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        requireRole(r, "buyer", "agree interim interest");
        String offered = r.get("interimInterest").get("seller").asText();
        if (offered.equals(ZERO_HASH)) throw new RuntimeException("no interim interest is offered");
        Replacement leg = interimLeg(r);
        if (!leg.next().hash().equalsIgnoreCase(offered))
            throw new RuntimeException("the interim interest offered for repo " + leg.id() + " is not the one this service builds at the business date " + businessDate);
        ctx.json(replacementRow(leg, instructReplacement(leg, Map.of())));
    }

    private String instructIncome(JsonNode r, CdmRepo.Income income, List<Map<String, String>> approvals) {
        return instructIncome(r, "RepoManufacturedIncome", income.hash(), income.json(), income.income().getAmount().toPlainString(), approvals);
    }

    private String instructIncome(JsonNode r, String type, String hash, String json, String amount, List<Map<String, String>> approvals) {
        String id = r.get("repoId").asText();
        store.recordDocument(id, type, "out", hash, json);
        payloads.put(hash, json, callParties);
        return gw.post("/repos/" + id + "/income", Map.of("cdmHash", hash, "amount", amount, "approvals", approvals)).path("txHash").asText();
    }

    /** The Buyer pays income on the purchased securities, entered by hand. On a buy/sell-back the Buyer keeps it and
     *  the Sell Back Price falls by the income plus interest to the Repurchase Date (wp-adr-repo-buy-sell-back). */
    private void payIncome(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        requireRole(r, "buyer", "pay manufactured income");
        CdmRepo.Booking b = replaceable(r);
        if (b == null) throw new RuntimeException("repo " + r.get("repoId").asText() + " is due for repurchase");
        Map<String, Object> in = body(ctx);
        BigDecimal perUnit = new BigDecimal(String.valueOf(in.get("incomePerUnit")));
        LocalDate incomeDate = LocalDate.parse(String.valueOf(in.get("incomeDate")));
        if (CdmRepo.isBuySellBack(b.trade())) {
            CdmRepo.BuySellBackIncomeRecord bsb = CdmRepo.buySellBackIncome(r.get("repoId").asText(), r.get("tradeHash").asText(), b.trade(), perUnit, incomeDate);
            String deduction = String.valueOf(bsb.deduction());
            String tx = instructIncome(r, "BuySellBackIncome", bsb.hash(), bsb.json(), deduction, List.of());
            ctx.json(Map.of("repoId", r.get("repoId").asText(), "cdmHash", bsb.hash(), "amount", bsb.income().getIncomeAmount().toPlainString(),
                    "sellBackDeduction", deduction, "instructTx", tx));
            return;
        }
        CdmRepo.Income income = CdmRepo.income(r.get("repoId").asText(), r.get("tradeHash").asText(), b.trade(), perUnit, incomeDate);
        String tx = instructIncome(r, income, List.of(Map.of("token", r.get("cash").asText(), "amount", income.income().getAmount().toPlainString())));
        ctx.json(Map.of("repoId", r.get("repoId").asText(), "cdmHash", income.hash(), "amount", income.income().getAmount().toPlainString(), "instructTx", tx));
    }

    /** The Seller agrees only if the document follows from its inputs over the trade this service holds. */
    private void agreeIncome(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        requireRole(r, "seller", "agree manufactured income");
        String offered = r.get("income").get("buyer").asText();
        if (offered.equals(ZERO_HASH)) throw new RuntimeException("no income is offered");
        String doc = payloads.get(offered);
        if (doc == null) throw new RuntimeException("the income document is not in the payload store");
        CdmRepo.Booking b = replaceable(r);
        if (b == null) throw new RuntimeException("repo " + r.get("repoId").asText() + " is due for repurchase");
        if (CdmRepo.isBuySellBack(b.trade())) {
            CdmRepo.BuySellBackIncomeRecord bsb = CdmRepo.verifyBuySellBackIncome(doc, r.get("repoId").asText(), r.get("tradeHash").asText(), b.trade());
            ctx.json(Map.of("repoId", r.get("repoId").asText(), "instructTx",
                    instructIncome(r, "BuySellBackIncome", bsb.hash(), bsb.json(), String.valueOf(bsb.deduction()), List.of())));
            return;
        }
        CdmRepo.Income income = CdmRepo.verifyIncome(doc, r.get("repoId").asText(), r.get("tradeHash").asText(), b.trade());
        ctx.json(Map.of("repoId", r.get("repoId").asText(), "instructTx", instructIncome(r, income, List.of())));
    }

    private void refuseRepoPayment(Context ctx, String phase, String role) {
        JsonNode r = purchasedRepo(ctx);
        requireRole(r, role, "refuse this payment");
        ctx.json(Map.of("refuseTx", gw.post("/repos/" + ctx.pathParam("id") + "/refuse-payment", Map.of("phase", phase)).path("txHash").asText()));
    }

    // ---- repo pair-off (wp-adr-repo-pair-off) ----
    // Either party proposes the pair-off of two offsetting purchased repos on their common Repurchase Date; the other agrees
    // or refuses. Only the party paying the net cash approves an amount. Rules to confirm in task-sme-repo-pair-off-rules.

    private void addPendingPairOff(Map<String, Object> m, JsonNode r, boolean seller, String state) {
        if (!state.equals("purchased")) return;
        String with = r.path("pairOffWith").asText(ZERO_HASH);
        if (with.equals(ZERO_HASH)) return;
        String mine = pendingHash(r, "pairOff", seller), theirs = pendingHash(r, "pairOff", !seller);
        m.put("pairOffPending", mine.equals(ZERO_HASH) ? "toDecide" : "requested");
        m.put("pairOffWith", with);
        try {
            JsonNode other = gw.get("/repos/" + with);
            CdmRepo.PairedOff p = pairOffOf(r, other);
            long pay = myPairOffPayment(p, r, other);
            m.put("pairOffNet", String.valueOf(pay > 0 ? -pay : Math.abs(p.netAmount())));
            if (!p.hash().equalsIgnoreCase(mine.equals(ZERO_HASH) ? theirs : mine))
                m.put("pairOffProblem", "the proposed pair-off is not the one this service builds at the business date " + businessDate);
        } catch (RuntimeException ex) {
            m.put("pairOffProblem", String.valueOf(ex.getMessage()));
        }
    }

    /** The pair-off of two purchased repos at this service's business date, from the bookings it holds and has checked. */
    private CdmRepo.PairedOff pairOffOf(JsonNode r, JsonNode other) {
        List<CdmRepo.Booking> bookings = new ArrayList<>();
        for (JsonNode x : List.of(r, other)) {
            String id = x.get("repoId").asText();
            if (!x.get("state").asText().equals("purchased")) throw new RuntimeException("repo " + id + " is not purchased");
            CdmRepo.Booking b = repoBooking(x);
            if (b == null) throw new RuntimeException("the booked document of repo " + id + " is not in the payload store");
            String problem = repoProblem(x, b);
            if (problem != null) throw new RuntimeException("repo " + id + ": " + problem);
            bookings.add(b);
        }
        return CdmRepo.pairOff(bookings.get(0).trade(), bookings.get(1).trade(), businessDate, deductionOf(r), deductionOf(other));
    }

    /** What this party pays in a pair-off: the net amount if it is the Seller of the repo with the higher Repurchase Price. */
    private long myPairOffPayment(CdmRepo.PairedOff p, JsonNode r, JsonNode other) {
        if (p.netAmount() == 0) return 0;
        String payingRepo = p.netAmount() > 0 ? p.first() : p.second();
        JsonNode paying = r.get("repoId").asText().equalsIgnoreCase(payingRepo) ? r : other;
        return paying.get("seller").asText().equalsIgnoreCase(cfg.myAddress) ? Math.abs(p.netAmount()) : 0;
    }

    private Map<String, Object> instructPairOff(JsonNode r, JsonNode other, CdmRepo.PairedOff p) {
        String id = r.get("repoId").asText(), otherId = other.get("repoId").asText();
        store.recordDocument(id, "RepoPairOffSettlement", "out", p.hash(), p.json());
        store.recordDocument(otherId, "RepoPairOffSettlement", "out", p.hash(), p.json());
        payloads.put(p.hash(), p.json(), callParties);
        long pay = myPairOffPayment(p, r, other);
        List<Map<String, String>> approvals = pay > 0 ? List.of(Map.of("token", r.get("cash").asText(), "amount", String.valueOf(pay))) : List.of();
        JsonNode tx = gw.post("/repos/" + id + "/pair-off", Map.of("otherRepoId", otherId, "cdmHash", p.hash(), "approvals", approvals));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("repoId", id);
        out.put("otherRepoId", otherId);
        out.put("cdmHash", p.hash());
        out.put("netAmount", String.valueOf(p.netAmount()));
        out.put("myPayment", String.valueOf(pay));
        out.put("instructTx", tx.path("txHash").asText());
        return out;
    }

    /** A party proposes the pair-off of a purchased repo with another of the same pair in the opposite direction. */
    private void proposePairOff(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        if (!seller && !r.get("buyer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("not a party to repo " + ctx.pathParam("id"));
        if (!pendingHash(r, "pairOff", !seller).equals(ZERO_HASH)) throw new RuntimeException("the counterparty has proposed a pair-off: agree or refuse it");
        Object otherId = body(ctx).get("otherRepoId");
        if (otherId == null) throw new RuntimeException("otherRepoId is required");
        JsonNode other = gw.get("/repos/" + otherId);
        ctx.json(instructPairOff(r, other, pairOffOf(r, other)));
    }

    /** The other party agrees only if this service builds the same pair-off document from the two repos it holds. */
    private void agreePairOff(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        String offered = pendingHash(r, "pairOff", !seller);
        if (offered.equals(ZERO_HASH)) throw new RuntimeException("no pair-off is proposed");
        JsonNode other = gw.get("/repos/" + r.get("pairOffWith").asText());
        CdmRepo.PairedOff p = pairOffOf(r, other);
        if (!p.hash().equalsIgnoreCase(offered))
            throw new RuntimeException("the pair-off proposed for repo " + r.get("repoId").asText() + " is not the one this service builds at the business date " + businessDate);
        ctx.json(instructPairOff(r, other, p));
    }

    /** The party that did not propose the pair-off refuses it; the contract checks which party that is. */
    private void refusePairOff(Context ctx) {
        purchasedRepo(ctx);
        ctx.json(Map.of("refuseTx", gw.post("/repos/" + ctx.pathParam("id") + "/pair-off/refuse", Map.of()).path("txHash").asText()));
    }

    /** The closed cdm.event.common.TradeState of a repo settled by a pair-off: the anchored document must be the one this service builds
     *  from the two bookings it holds; null when the anchored repurchase is not a pair-off. */
    private cdm.event.common.TradeState pairedOffClosedTrade(String repoId, String repurchaseHash) {
        String doc = payloads.get(repurchaseHash);
        if (doc == null) return null;
        JsonNode d;
        try {
            d = CdmRuntime.JSON.readTree(doc);
        } catch (Exception e) {
            return null;
        }
        if (!d.has("pairOff")) return null;
        String[] ids = d.at("/pairOff/after/0/trade/executionDetails/packageReference/listId/assignedIdentifier/0/identifier/@data").asText().split("/");
        if (ids.length != 2) throw new RuntimeException("the anchored pair-off names no pair of repos");
        JsonNode ra = gw.get("/repos/" + ids[0]), rb = gw.get("/repos/" + ids[1]);
        CdmRepo.Booking a = repoBooking(ra), b = repoBooking(rb);
        if (a == null || b == null) throw new RuntimeException("a booked document of the pair-off is not in the payload store");
        CdmRepo.PairedOff p = CdmRepo.pairOff(a.trade(), b.trade(), CdmRepo.terms(a.trade()).repurchaseDate(), deductionOf(ra), deductionOf(rb));
        if (!p.hash().equalsIgnoreCase(repurchaseHash)) throw new RuntimeException("the anchored pair-off is not the one this service builds");
        return p.settlement().getRepurchase().get(p.first().equalsIgnoreCase(repoId) ? 0 : 1).getAfter().get(0);
    }

    // ---- repo roll (wp-adr-repo-roll) ----
    // Either party proposes on the Repurchase Date and the other agrees or refuses. Rules to confirm in task-sme-repo-roll-rules.

    private void addPendingRoll(Map<String, Object> m, JsonNode r, boolean seller, String state) {
        if (!state.equals("purchased")) return;
        String mine = pendingHash(r, "roll", seller), theirs = pendingHash(r, "roll", !seller);
        if (mine.equals(ZERO_HASH) && theirs.equals(ZERO_HASH)) return;
        m.put("rollPending", mine.equals(ZERO_HASH) ? "toDecide" : "requested");
        try {
            CdmRepo.Terms offered = CdmRepo.terms(CdmRepo.verify(payloads.get(mine.equals(ZERO_HASH) ? theirs : mine)).trade());
            m.put("rollToDate", offered.repurchaseDate().toString());
            m.put("rollRatePercent", offered.rate().movePointRight(2).stripTrailingZeros().toPlainString());
            // net of a buy/sell-back's income deduction; negative when the Buyer pays (wp-adr-repo-buy-sell-back)
            m.put("rollInterest", new BigInteger(r.get("repurchasePrice").asText()).subtract(new BigInteger(r.get("purchasePrice").asText()))
                    .subtract(BigInteger.valueOf(deductionOf(r))).toString());
        } catch (RuntimeException ex) {
            m.put("rollProblem", String.valueOf(ex.getMessage()));
        }
    }

    /** The roll of one purchased repo to the date and rate, built at this service's business date; a null rate keeps the current one. */
    private Replacement rollLeg(JsonNode r, LocalDate newRepurchaseDate, BigDecimal rate) {
        CdmRepo.Booking b = repoBooking(r);
        if (b == null) throw new RuntimeException("the booked document of repo " + r.get("repoId").asText() + " is not in the payload store");
        String problem = repoProblem(r, b);
        if (problem != null) throw new RuntimeException(problem);
        CdmRepo.Terms t = CdmRepo.terms(b.trade());
        if (!businessDate.equals(t.repurchaseDate())) throw new RuntimeException("a repo rolls only on its Repurchase Date " + t.repurchaseDate() + "; the business date is " + businessDate);
        CdmRepo.Rolled next = CdmRepo.roll(b.trade(), newRepurchaseDate, rate == null ? t.rate() : rate);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        Map<String, Object> amounts = new LinkedHashMap<>(Map.of("newRepurchasePrice", String.valueOf(next.booking().repurchasePrice())));
        // A buy/sell-back nets its income deduction: the Seller pays the rest, or the Buyer the excess (wp-adr-repo-buy-sell-back).
        long net = next.interest() - deductionOf(r);
        return new Replacement(r, next.booking(), "roll", amounts, Map.of(r.get("cash").asText(), seller ? Math.max(net, 0L) : Math.max(-net, 0L)));
    }

    /** A party proposes the roll of a purchased repo to a new Repurchase Date, at a repo rate in percent (default: the current rate). */
    private void proposeRoll(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        if (!pendingHash(r, "roll", !seller).equals(ZERO_HASH)) throw new RuntimeException("the counterparty has proposed a roll: agree or refuse it");
        Map<String, Object> in = body(ctx);
        BigDecimal rate = in.get("ratePercent") == null ? null : new BigDecimal(String.valueOf(in.get("ratePercent"))).movePointLeft(2);
        Replacement leg = rollLeg(r, LocalDate.parse(String.valueOf(in.get("newRepurchaseDate"))), rate);
        ctx.json(replacementRow(leg, instructReplacement(leg, totalPayments(List.of(leg)))));
    }

    /** The other party agrees only if this service builds the same event from the proposed date and rate. */
    private void agreeRoll(Context ctx) {
        JsonNode r = purchasedRepo(ctx);
        boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
        String offered = pendingHash(r, "roll", !seller);
        if (offered.equals(ZERO_HASH)) throw new RuntimeException("no roll is proposed");
        String doc = payloads.get(offered);
        if (doc == null) throw new RuntimeException("the proposed roll is not in the payload store");
        CdmRepo.Terms terms = CdmRepo.terms(CdmRepo.verify(doc).trade());
        Replacement leg = rollLeg(r, terms.repurchaseDate(), terms.rate());
        if (!leg.next().hash().equalsIgnoreCase(offered))
            throw new RuntimeException("the roll proposed for repo " + leg.id() + " is not the one this service builds at the business date " + businessDate);
        ctx.json(replacementRow(leg, instructReplacement(leg, totalPayments(List.of(leg)))));
    }

    /** The party that did not propose the roll refuses it; the contract checks which party that is. */
    private void refuseRoll(Context ctx) {
        purchasedRepo(ctx);
        ctx.json(Map.of("refuseTx", gw.post("/repos/" + ctx.pathParam("id") + "/roll/refuse", Map.of()).path("txHash").asText()));
    }

    /** The counterparty's offer is agreed only if this service builds the same event for every repo in it. */
    private void agreeReplacement(Context ctx, String kind, ReplacementBuilder builder) {
        var elections = gmraFold().terms().terms().getElections();
        List<Replacement> legs = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            if (!r.get("state").asText().equals("purchased")) continue;
            boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
            String offered = pendingHash(r, kind, !seller);
            if (offered.equals(ZERO_HASH)) continue;
            Replacement leg = builder.build(r, elections);
            if (leg == null || !leg.next().hash().equalsIgnoreCase(offered))
                throw new RuntimeException("the " + kind + " offered for repo " + r.get("repoId").asText() + " is not the one this service builds at the feed price and business date " + businessDate);
            legs.add(leg);
        }
        if (legs.isEmpty()) throw new RuntimeException("no " + kind + " is offered");
        Map<String, Long> remaining = totalPayments(legs);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Replacement leg : legs) {
            out.add(replacementRow(leg, instructReplacement(leg, remaining)));
            leg.myPayments().forEach((token, amount) -> remaining.merge(token, -amount, Long::sum));
        }
        ctx.json(Map.of("repos", out));
    }

    /** The called party agrees a GMRA call in full only for the amount this service computes for the caller. */
    private void checkGmraCallAmount(JsonNode c) {
        if (!c.get("to").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the called party responds to a call");
        long expected = CdmRepoMargin.callAmount(repoMarginState().net().negate(), gmraMta(partyIdOf(c.get("from").asText())));
        long called = new BigInteger(c.get("amount").asText()).divide(cfg.priceScale).longValue();
        if (expected != called) throw new RuntimeException("the call amount " + called + " is not the Net Exposure this service computes: " + expected);
    }

    /** The assets are of kinds the marginTransfer election allows, and their value at the feed prices covers the amount. */
    private void checkGmraCoverage(List<Map.Entry<String, Long>> assets, long agreedUsd) {
        var mt = gmraFold().terms().terms().getElections().getMarginTransfer();
        BigDecimal value = BigDecimal.ZERO;
        for (Map.Entry<String, Long> a : assets) {
            boolean cash = "tUSD".equals(a.getKey());
            if (cash && !Boolean.TRUE.equals(mt.getCashMargin())) throw new RuntimeException("the GMRA does not allow Cash Margin");
            if (!cash && !Boolean.TRUE.equals(mt.getSecuritiesMargin())) throw new RuntimeException("the GMRA does not allow Margin Securities");
            value = value.add(CdmRepoMargin.value(a.getValue(), feedPrice(cfg.tokenAddress(a.getKey()))));
        }
        if (value.compareTo(BigDecimal.valueOf(agreedUsd)) < 0) throw new RuntimeException("the assets' value " + value.toPlainString() + " does not cover the agreed amount " + agreedUsd);
    }

    /** The holder of Cash Margin states and pays the interest on it for one period, at the rate entered by hand. */
    private void stateRepoMarginInterest(Context ctx) {
        Map<String, Object> b = body(ctx);
        LocalDate start = LocalDate.parse(String.valueOf(b.get("periodStart")));
        LocalDate end = LocalDate.parse(String.valueOf(b.get("periodEnd")));
        BigDecimal rate = new BigDecimal(String.valueOf(b.get("observedRatePct"))).movePointLeft(2);
        long cash = repoMarginState().cashHeld();
        if (cash <= 0) throw new RuntimeException("this party holds no Cash Margin");
        CdmRepoMargin.Statement s = CdmRepoMargin.build(cfg.bankName(cfg.partyId), cfg.bankName(counterparty()), start, end, cash, rate, gmraFold().terms().terms().getElections());
        long amount = CdmRepoMargin.amount(s.statement());
        String interestId = Cdm.onChainId("gmra-interest-" + cfg.partyId + "-" + System.nanoTime());
        store.recordDocument(interestId, "RepoNetMarginInterestStatement", "out", s.hash(), s.json());
        payloads.put(s.hash(), s.json(), callParties);
        JsonNode tx = gw.post("/interest", Map.of("interestId", interestId, "pledgor", cfg.partyAddress(counterparty()), "cashToken", cfg.tokenAddress("tUSD"),
                "amount", String.valueOf(amount), "cdmHash", s.hash(), "hold", false));
        ctx.json(Map.of("interestId", interestId, "cdmHash", s.hash(), "amountUsd", amount, "stateTx", tx.path("stated").path("txHash").asText()));
    }

    // ---- legs of the initial margin (two-way initial margin, wp-adr-two-way-im) ----
    // A leg is {pledgor, secured party} addresses. Each party is the pledgor on one leg and the secured party on the
    // other. The default leg is the one BANK-A pledges on, so a request that names no leg acts as before.

    /** The leg on which party {@code pledgorId} (A or B) pledges to the other. */
    private String[] leg(String pledgorId) {
        String other = pledgorId.equals("A") ? "B" : "A";
        return new String[]{cfg.partyAddress(pledgorId), cfg.partyAddress(other)};
    }

    /** The leg a request names by its pledgor's party id; the default leg (A pledges) when it names none. */
    private String[] legParam(String pledgorId) {
        return leg(pledgorId == null || pledgorId.isBlank() ? "A" : pledgorId);
    }

    /** The leg on which this party pledges, or on which it is the secured party. */
    private String[] myLeg(boolean iPledge) {
        return leg(iPledge ? cfg.partyId : counterparty());
    }

    /** The leg of an initial margin call: the called party of a delivery pledges, the calling party of a return. */
    private String[] legOfCall(JsonNode c) {
        String from = c.get("from").asText(), to = c.get("to").asText();
        return c.get("kind").asInt() == 2 ? new String[]{from, to} : new String[]{to, from};
    }

    /** The leg between this party and its counterparty with this pledgor and secured party, or null. */
    private String[] legOfPair(String pledgor, String securedParty) {
        String me = cfg.myAddress, other = cfg.partyAddress(counterparty());
        boolean ours = (pledgor.equalsIgnoreCase(me) && securedParty.equalsIgnoreCase(other))
                || (pledgor.equalsIgnoreCase(other) && securedParty.equalsIgnoreCase(me));
        return ours ? new String[]{pledgor, securedParty} : null;
    }

    private static String legKey(String[] leg) {
        return leg[0].toLowerCase() + ">" + leg[1].toLowerCase();
    }

    /** Party ids of a leg's pledgor and secured party, for the console. */
    private Map<String, Object> legView(String[] leg) {
        return new LinkedHashMap<>(Map.of("pledgor", partyIdOf(leg[0]), "securedParty", partyIdOf(leg[1])));
    }

    /** The feed price of every registry token that has one, by lowercase address (scaled by priceScale). */
    private Map<String, BigInteger> feedPrices() {
        Map<String, BigInteger> priceByToken = new HashMap<>();
        for (JsonNode pr : gw.get("/prices").get("prices")) {
            if (!pr.get("price").isNull()) priceByToken.put(pr.get("token").asText().toLowerCase(), new BigInteger(pr.get("price").asText()));
        }
        return priceByToken;
    }

    /** The haircut between the pair as the contract applies it (flow-agreement-amendment: per-pair once amended). */
    private int haircutBps(String[] leg, String symbol) {
        Integer h = pairHaircuts(leg).get(symbol);
        return h != null ? h : cfg.registry.get("tokens").get(symbol).get("haircutBps").asInt();
    }

    /** Value after haircut of qty units at a price, scaled by priceScale; the same integer arithmetic as CollateralControl. */
    private static BigInteger valueAfterHaircut(BigInteger qty, BigInteger price, int haircutBps) {
        return qty.multiply(price).multiply(BigInteger.valueOf(10_000L - haircutBps)).divide(BigInteger.valueOf(10_000));
    }

    /** Value after haircuts of a list of {token symbol, qty} at the current feed prices, scaled by priceScale. */
    private BigInteger valueOf(String[] leg, List<Map<String, Object>> assets) {
        Map<String, BigInteger> prices = feedPrices();
        BigInteger v = BigInteger.ZERO;
        for (Map<String, Object> a : assets) {
            String sym = (String) a.get("token");
            BigInteger price = prices.get(cfg.tokenAddress(sym).toLowerCase());
            if (price == null) throw new RuntimeException("no feed price for " + sym);
            v = v.add(valueAfterHaircut(BigInteger.valueOf(((Number) a.get("qty")).longValue()), price, haircutBps(leg, sym)));
        }
        return v;
    }

    /** Whether a call is one this party is a counterparty to (the gateway pushes every call on the chain). */
    private boolean involvesMe(String callId) {
        if (callId == null) return false;
        JsonNode c = gw.get("/calls/" + callId);
        return c.get("from").asText().equalsIgnoreCase(cfg.myAddress) || c.get("to").asText().equalsIgnoreCase(cfg.myAddress);
    }

    private void context(Context ctx) {
        String counterparty = cfg.partyId.equals("B") ? "A" : "B";
        List<Map<String, Object>> tokens = new ArrayList<>();
        cfg.registry.get("tokens").fieldNames().forEachRemaining(sym -> {
            JsonNode t = cfg.registry.get("tokens").get(sym);
            tokens.add(new LinkedHashMap<>(Map.of(
                    "symbol", sym, "address", t.get("address").asText(),
                    "isin", t.get("isin").asText(), "cusip", t.get("cusip").asText(),
                    "dti", t.get("dti").asText(), "haircutBps", haircutBps(legParam(null), sym),
                    "authoritativeRecord", t.path("authoritativeRecord").asText("Bearer"))));
        });
        ctx.json(new LinkedHashMap<>(Map.of(
                "party", cfg.partyId, "role", cfg.role, "node", cfg.node, "address", cfg.myAddress,
                "counterparty", counterparty, "counterpartyAddress", cfg.partyAddress(counterparty),
                "priceScale", cfg.priceScale.toString(), "tokens", tokens,
                "agreement", "2018 ISDA IM Credit Support Annex (Security Interest, New York law)",
                // Both legs of the initial margin (wp-adr-two-way-im): this party pledges on the first.
                "legs", List.of(legView(myLeg(true)), legView(myLeg(false))))));
    }

    private String partyIdOf(String address) {
        String a = address.toLowerCase();
        if (a.equals(cfg.partyAddress("A").toLowerCase())) return "A";
        if (a.equals(cfg.partyAddress("B").toLowerCase())) return "B";
        if (a.equals(cfg.partyAddress("T").toLowerCase())) return "T";
        if (cfg.registry.get("parties").has("ccp") && a.equals(cfg.partyAddress("C").toLowerCase())) return "C";
        return address;
    }

    private String usd(String scaled) {
        return new BigInteger(scaled).divide(cfg.priceScale).toString();
    }

    private void state(Context ctx) {
        JsonNode calls = gw.getQuery("/party-calls", Map.of("party", cfg.myAddress));
        // Every proposal's state and assets, fetched in parallel (two gateway reads each).
        Map<String, java.util.concurrent.Future<JsonNode[]>> proposalReads = new HashMap<>();
        for (JsonNode entry : calls) {
            String id = entry.get("callId").asText();
            for (long pid = 0; pid < entry.get("call").get("proposalCount").asLong(); pid++) {
                String path = "/calls/" + id + "/proposals/" + pid;
                proposalReads.put(path, reads.submit(() -> new JsonNode[]{gw.get(path + "/state"), gw.get(path + "/assets")}));
            }
        }
        String counterparty = cfg.partyId.equals("B") ? "A" : "B";
        List<Map<String, Object>> callList = new ArrayList<>();
        for (JsonNode entry : calls) {
            String callId = entry.get("callId").asText();
            JsonNode c = entry.get("call");
            Map<String, Object> call = new LinkedHashMap<>();
            call.put("callId", callId);
            call.put("kind", c.get("kind").asInt() == 0 ? "IM" : c.get("kind").asInt() == 1 ? "VM" : "Return");
            call.put("from", partyIdOf(c.get("from").asText()));
            call.put("to", partyIdOf(c.get("to").asText()));
            call.put("amountUsd", usd(c.get("amount").asText()));
            call.put("agreedUsd", usd(c.get("agreed").asText()));
            call.put("disputedUsd", usd(c.get("disputed").asText()));
            call.put("state", CALL_STATE[c.get("state").asInt()]);
            call.put("cdmHash", c.get("cdmHash").asText());
            String requester = c.path("cancellationRequestedBy").asText(ZERO_ADDRESS);
            call.put("cancellationRequestedBy", requester.equalsIgnoreCase(ZERO_ADDRESS) ? null : partyIdOf(requester));
            String replacesId = c.path("replaces").asText(ZERO_HASH), replacedBy = c.path("replacementOf").asText(ZERO_HASH);
            call.put("replaces", replacesId.equalsIgnoreCase(ZERO_HASH) ? null : replacesId);
            call.put("replacedBy", replacedBy.equalsIgnoreCase(ZERO_HASH) ? null : replacedBy);
            String nettedIn = c.path("nettedIn").asText(ZERO_HASH);
            call.put("nettedIn", nettedIn.equalsIgnoreCase(ZERO_HASH) ? null : nettedIn);
            long proposalCount = c.get("proposalCount").asLong();
            List<Map<String, Object>> proposals = new ArrayList<>();
            for (long pid = 0; pid < proposalCount; pid++) {
                JsonNode[] read;
                try {
                    read = proposalReads.get("/calls/" + callId + "/proposals/" + pid).get();
                } catch (Exception e) {
                    throw new RuntimeException("proposal read failed: " + e.getMessage(), e);
                }
                int pstate = read[0].asInt();
                JsonNode assets = read[1];
                List<Map<String, Object>> assetList = new ArrayList<>();
                for (JsonNode a : assets) {
                    String sym = symbolByAddress.getOrDefault(a.get("token").asText().toLowerCase(), a.get("token").asText());
                    assetList.add(new LinkedHashMap<>(Map.of("token", sym, "qty", a.get("qty").asText())));
                }
                proposals.add(new LinkedHashMap<>(Map.of("proposalId", pid, "state", PROPOSAL_STATE[pstate], "assets", assetList)));
            }
            call.put("proposals", proposals);
            call.put("messages", store.messagesFor(callId));
            List<String> events = store.eventsFor(callId);
            call.put("events", events);
            call.put("enforced", events.contains("Enforced"));
            // The leg of an IM or return call, by its pledgor's party id (wp-adr-two-way-im); VM moves title and has none.
            call.put("leg", c.get("kind").asInt() == 1 ? null : partyIdOf(legOfCall(c)[0]));
            callList.add(call);
        }

        // Balances: free token balance, and the escrowed (pledged) balance on each leg, keyed by the leg's pledgor;
        // "pledged" is the default leg's (A pledges), as before two-way initial margin.
        List<Map<String, Object>> balances = new ArrayList<>();
        cfg.registry.get("tokens").fieldNames().forEachRemaining(sym -> {
            String token = cfg.tokenAddress(sym);
            String free = gw.getQuery("/balance", Map.of("token", token, "owner", cfg.myAddress)).asText();
            Map<String, Object> byLeg = new LinkedHashMap<>();
            for (String pl : List.of("A", "B")) {
                String[] lg = leg(pl);
                byLeg.put(pl, gw.getQuery("/pledged", Map.of("token", token, "pledgor", lg[0], "securedParty", lg[1])).asText());
            }
            balances.add(new LinkedHashMap<>(Map.of("token", sym, "free", free, "pledged", byLeg.get("A"), "pledgedByLeg", byLeg)));
        });

        // Default status of both counterparties, read from the oracle feed through this party's own gateway.
        Map<String, Object> defaults = new LinkedHashMap<>();
        for (String p : List.of("A", "B")) {
            defaults.put(p, gw.get("/defaults/" + cfg.partyAddress(p)).get("inDefault").asBoolean());
        }

        ctx.json(new LinkedHashMap<>(Map.of("party", cfg.partyId, "role", cfg.role, "calls", callList, "balances", balances,
                "defaults", defaults)));
    }


    /**
     * Revaluation of the initial margin held between the two parties (flow-revaluation-top-up transition 5). The
     * requirement is the outstanding IM from calls: agreed amounts of settled IM calls minus settled return calls,
     * counting only calls settled after the pair's last enforcement (enforcement empties the escrow). Top-up calls
     * (tagged by the issuing party's store) restore value and are left out of the requirement, so this is the issuing
     * secured party's view; the pledgor's service does not see the tags. The collateral is
     * valued at the oracle feed prices, read through this party's own gateway, after the eligibility haircuts. A
     * shortfall at or above the minimum transfer amount gives a top-up call amount, rounded up (delivery). The minimum
     * transfer amount (the pledgor's) and the rounding come from the agreement terms in force (flow-agreement-amendment).
     */
    private void revaluation(Context ctx) {
        String[] leg = legParam(ctx.queryParam("pledgor"));
        String pledgor = leg[0], securedParty = leg[1];
        BigInteger scale = cfg.priceScale;

        JsonNode hist = gw.getQuery("/settlement-history", Map.of("pledgor", pledgor, "securedParty", securedParty));
        long lastEnforcement = -1;
        for (JsonNode e : hist.get("enforced")) lastEnforcement = Math.max(lastEnforcement, e.get("block").asLong());
        // A close-out also empties the pair's escrow (flow-close-out-netting), and so does a reclaim (wp-adr-two-way-im).
        for (JsonNode e : hist.path("closedOut")) lastEnforcement = Math.max(lastEnforcement, e.get("block").asLong());
        for (JsonNode e : hist.path("reclaimed")) lastEnforcement = Math.max(lastEnforcement, e.get("block").asLong());
        Map<String, Long> settledAt = new HashMap<>();
        for (JsonNode s : hist.get("settled")) settledAt.merge(s.get("callId").asText().toLowerCase(), s.get("block").asLong(), Math::max);

        BigInteger required = BigInteger.ZERO;
        int imCalls = 0, returnCalls = 0, topUpCalls = 0;
        String p = pledgor.toLowerCase(), sp = securedParty.toLowerCase();
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int kind = c.get("kind").asInt(), state = c.get("state").asInt();
            if (state != 5 && state != 6) continue; // settled, or settled for the agreed part
            if (kind == 1) continue; // variation margin moves title, not escrow
            String[] callLeg = legOfCall(c);
            boolean pair = callLeg[0].equalsIgnoreCase(p) && callLeg[1].equalsIgnoreCase(sp); // this leg only
            Long block = settledAt.get(entry.get("callId").asText().toLowerCase());
            if (!pair || block == null || block <= lastEnforcement) continue;
            BigInteger agreed = new BigInteger(c.get("agreed").asText());
            // A top-up restores the value of the posted IM; it does not raise the requirement.
            if (kind == 0 && "top-up".equals(store.purposeOf(entry.get("callId").asText()))) { topUpCalls++; continue; }
            if (kind == 0) { required = required.add(agreed); imCalls++; }
            else if (kind == 2) { required = required.subtract(agreed); returnCalls++; }
        }
        if (required.signum() < 0) required = BigInteger.ZERO;

        Map<String, BigInteger> priceByToken = new HashMap<>();
        for (JsonNode pr : gw.get("/prices").get("prices")) {
            if (!pr.get("price").isNull()) priceByToken.put(pr.get("token").asText().toLowerCase(), new BigInteger(pr.get("price").asText()));
        }
        BigInteger value = BigInteger.ZERO;
        List<Map<String, Object>> tokens = new ArrayList<>();
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            String token = cfg.tokenAddress(sym);
            BigInteger qty = new BigInteger(gw.getQuery("/pledged", Map.of("token", token, "pledgor", pledgor, "securedParty", securedParty)).asText());
            if (qty.signum() == 0) continue;
            BigInteger price = priceByToken.getOrDefault(token.toLowerCase(), BigInteger.ZERO);
            int haircutBps = haircutBps(leg, sym);
            BigInteger v = qty.multiply(price).multiply(BigInteger.valueOf(10_000L - haircutBps)).divide(BigInteger.valueOf(10_000));
            value = value.add(v);
            tokens.add(new LinkedHashMap<>(Map.of("token", sym, "pledged", qty.toString(), "price", price.toString(),
                    "haircutBps", haircutBps, "valueUsd", usd(v.toString()))));
        }

        BigInteger shortfall = required.subtract(value).max(BigInteger.ZERO);
        BigInteger[] qr = shortfall.divideAndRemainder(scale);
        long shortfallUsd = qr[0].longValueExact() + (qr[1].signum() > 0 ? 1 : 0);
        CdmAgreement.Terms terms = fold(leg).terms();
        long mtaUsd = CdmAgreement.pledgorMtaUsd(terms.agreement()), roundingUsd = CdmAgreement.roundingUsd(terms.agreement());
        long topUpUsd = shortfallUsd >= mtaUsd ? ((shortfallUsd + roundingUsd - 1) / roundingUsd) * roundingUsd : 0;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requiredUsd", usd(required.toString()));
        out.put("valueUsd", usd(value.toString()));
        out.put("shortfallUsd", String.valueOf(shortfallUsd));
        out.put("topUpUsd", String.valueOf(topUpUsd));
        out.put("mtaUsd", String.valueOf(mtaUsd));
        out.put("roundingUsd", String.valueOf(roundingUsd));
        out.put("imCalls", imCalls);
        out.put("returnCalls", returnCalls);
        out.put("topUpCalls", topUpCalls);
        out.put("lastEnforcementBlock", lastEnforcement);
        out.put("tokens", tokens);
        ctx.json(out);
    }

    /**
     * The cumulative CDM MarginCallState for a call, folded from the step documents (wp-adr-cdm-payload-carrier): read
     * the on-chain ordered step hashes from the gateway, fetch each document from the payload store by hash, verify
     * keccak256(payload) == hash, and fold them through Create_MarginCallState. Both parties fold the same documents
     * and so converge to the same validated state. Cached against the step signature once every step is folded.
     */
    private Map<String, Object> cdmStateFor(String callId) {
        JsonNode steps = gw.get("/calls/" + callId + "/steps");
        List<String> hashes = new ArrayList<>();
        List<String> stepNames = new ArrayList<>();
        StringBuilder sig = new StringBuilder();
        for (JsonNode s : steps) {
            hashes.add(s.get("cdmHash").asText());
            stepNames.add(s.get("step").asText());
            sig.append(s.get("cdmHash").asText()).append(';');
        }
        FoldCache cached = foldCache.get(callId);
        if (cached != null && cached.sig().equals(sig.toString())) return withRecordKeeper(new LinkedHashMap<>(cached.result()), steps);

        // Fetch and verify the contiguous prefix of documents available to this party, then fold it.
        List<String> docs = new ArrayList<>();
        for (int i = 0; i < hashes.size(); i++) {
            String doc = payloads.get(hashes.get(i));
            if (doc == null) break; // step committed on-chain but its payload is not yet readable here
            if (!Cdm.keccakHex(doc).equalsIgnoreCase(hashes.get(i)))
                throw new RuntimeException("payload hash mismatch for step " + stepNames.get(i) + " (" + hashes.get(i) + ")");
            docs.add(doc);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalSteps", hashes.size());
        result.put("foldedSteps", docs.size());
        result.put("steps", stepNames);
        boolean converged = !hashes.isEmpty() && docs.size() == hashes.size();
        if (docs.isEmpty()) {
            result.put("status", "none");
        } else {
            MarginCallState st = CdmFold.fold(docs);
            String json = CdmRuntime.toJson(st);
            store.saveState(callId, json);
            result.put("status", String.valueOf(st.getStatus()));
            List<String> recorded = new ArrayList<>();
            if (st.getStepRecord() != null) for (var r : st.getStepRecord()) recorded.add(String.valueOf(r.getStep()));
            result.put("stepRecord", recorded);
            result.put("stateHash", Cdm.keccakHex(json)); // same state -> same hash on both parties
            // G25: each folded step's ledger anchor, built from the same chain events by both parties, kept apart from
            // the state so stateHash is unaffected (nw-ledger-anchor-redesign). A failure is reported, not thrown, so the
            // fold stays readable.
            try {
                List<cdmx.collateral.ledger.LedgerAnchor> anchors = CdmAnchors.anchors(steps, docs);
                List<Map<String, Object>> statuses = CdmAnchors.statuses(st, anchors);
                result.put("anchors", statuses);
                result.put("anchorHash", Cdm.keccakHex(CdmRuntime.toJson(anchors))); // same chain -> same hash on both parties
                result.put("anchored", statuses.stream().allMatch(s -> "Complete".equals(s.get("status"))));
            } catch (RuntimeException e) {
                result.put("anchored", false);
                result.put("anchorError", String.valueOf(e.getMessage()));
            }
        }
        result.put("converged", converged);
        if (converged) foldCache.put(callId, new FoldCache(sig.toString(), result)); // cache only once fully folded
        return withRecordKeeper(new LinkedHashMap<>(result), steps);
    }

    /** The record keeper's confirmations on the chain, or an empty list for a deployment without a RecordKeeperRegister. */
    private JsonNode registerConfirmations() {
        try {
            return gw.get("/register/confirmations");
        } catch (RuntimeException e) {
            return Config.MAPPER.createArrayNode();
        }
    }

    /**
     * Completion by authoritative record of the repo, securities loan or triparty records (flow: repo, loan or triparty)
     * that moved a Registered or Claim token (task-authoritative-record-other-flows), by record id. Read on every view,
     * because the record keeper confirms after the movement is mined. A deployment without registered tokens or without
     * a RecordKeeperRegister returns no records, and a failed read is reported in place of the records.
     */
    private Map<String, Map<String, Object>> movementCompletion(String flow) {
        if (CdmRecordKeeper.tokens(cfg.registry).values().stream().allMatch(t -> "Bearer".equals(t.getAuthoritativeRecord().toDisplayString())))
            return Map.of();
        try {
            return CdmRecordKeeper.movements(cfg.registry, gw.getQuery("/register/movements", Map.of("flow", flow)), registerConfirmations());
        } catch (RuntimeException e) {
            return Map.of("error", Map.of("recordKeeperError", String.valueOf(e.getMessage())));
        }
    }

    /** Adds recordKeeper and settlementComplete to a record's view when it moved a Registered or Claim token. */
    private static void withMovementCompletion(Map<String, Object> view, String recordId, Map<String, Map<String, Object>> completion) {
        Map<String, Object> error = completion.get("error");
        if (error != null) { // which records moved such a token is not known, so none is reported complete or not
            view.putAll(error);
            return;
        }
        Map<String, Object> c = completion.get(recordId.toLowerCase());
        if (c == null) return;
        view.put("recordKeeper", c.get("records"));
        view.put("settlementComplete", c.get("complete"));
    }

    /**
     * REG-3: a Registered or Claim token is taken as collateral (or as the purchased securities of a repo) only with a
     * recorded control agreement with its record keeper (EligibleUnderControl), as the CSA eligibility applies it.
     */
    private void requireUnderControl(String sym) {
        var t = CdmRecordKeeper.tokens(cfg.registry).get(sym);
        if (t != null && !CdmRecordKeeper.eligible(t))
            throw new IllegalArgumentException(sym + " is not eligible: its authoritative record is kept by its record keeper and no control agreement is recorded (EligibleUnderControl)");
    }

    /**
     * Completion by authoritative record of the folded steps (task-authoritative-record-settlement-enforcement): read
     * fresh on every call, outside the fold cache, because the record keeper confirms after the step is mined. A step
     * that moved a Registered or Claim token is complete only once the record keeper confirms it (REG-1, REG-2).
     */
    private Map<String, Object> withRecordKeeper(Map<String, Object> result, JsonNode steps) {
        Object anchors = result.get("anchors");
        if (!(anchors instanceof List<?> list)) return result;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> statuses = (List<Map<String, Object>>) list;
        try {
            Map<String, Object> rk = CdmRecordKeeper.steps(cfg.registry, steps, ((Number) result.get("foldedSteps")).intValue(), statuses, registerConfirmations());
            result.put("recordKeeper", rk.get("records"));
            result.put("settlementComplete", rk.get("complete"));
        } catch (RuntimeException e) {
            result.put("settlementComplete", false);
            result.put("recordKeeperError", String.valueOf(e.getMessage()));
        }
        return result;
    }

    /**
     * The completion of a call's enforcement (REG-4): the CDM CollateralEnforcement record the Enforced event names,
     * checked against its hash, its Enforcement LedgerAnchor and, for a Registered or Claim token, the record keeper's
     * confirmation. Both parties read the same chain events and the same document, so both reach the same result.
     */
    private Map<String, Object> enforcementStateFor(String callId) {
        JsonNode steps = gw.get("/calls/" + callId + "/enforcement");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("callId", callId);
        if (steps.isEmpty()) {
            out.put("enforced", false);
            out.put("complete", false);
            return out;
        }
        String hash = steps.get(0).get("cdmHash").asText();
        String doc = payloads.get(hash);
        out.put("enforced", true);
        out.put("cdmHash", hash);
        if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash)) {
            out.put("documentVerified", false);
            out.put("complete", false);
            return out;
        }
        var e = CdmEnforcement.verify(doc);
        out.put("documentVerified", true);
        out.put("eventQualifier", e.getEventQualifier());
        out.putAll(CdmRecordKeeper.enforcement(cfg.registry, steps, e.getEventIdentifier(), hash, registerConfirmations()));
        return out;
    }

    /**
     * REG-5: each Registered or Claim token's register, as the record keeper (the oracle service's transfer agent) reports
     * it, against the units each holder holds on the ledger. The record keeper's record prevails; a break means a
     * movement the register does not show yet, or the reverse.
     */
    private void registerBreaks(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode t : gw.get("/register/tokens")) {
            String sym = t.get("symbol").asText();
            String token = t.get("token").asText();
            JsonNode reg = oracle.get("/register/" + sym);
            Map<String, String> register = new java.util.TreeMap<>();
            reg.path("holdings").fields().forEachRemaining(f -> register.put(f.getKey().toLowerCase(), f.getValue().asText()));
            // The holders to check on the ledger: everyone the register names, the parties and the escrow contract.
            java.util.Set<String> holders = new java.util.TreeSet<>(register.keySet());
            cfg.registry.get("parties").forEach(a -> holders.add(a.asText().toLowerCase()));
            holders.add(cfg.registry.get("contracts").get("collateralControl").asText().toLowerCase());
            Map<String, String> onLedger = new java.util.TreeMap<>();
            for (String h : holders) onLedger.put(h, gw.getQuery("/balance", Map.of("token", token, "owner", h)).asText());
            out.add(CdmRecordKeeper.breaks(sym, register, onLedger));
        }
        ctx.json(Map.of("tokens", out, "reconciled", out.stream().allMatch(m -> Boolean.TRUE.equals(m.get("reconciled")))));
    }

    // --- provenance (task-document-provenance, wp-adr-document-provenance) ---

    /** The provenance anchors of every token on the ledger, or an empty list in a deployment without ProvenanceAnchors. */
    private JsonNode provenanceAnchors() {
        if (!cfg.registry.path("contracts").has("provenanceAnchors")) return CdmRuntime.JSON.createArrayNode();
        return gw.get("/provenance/anchors");
    }

    /** Refuses (throws) when a token the registry marks provenanceRequired has an incomplete path for a pledge to this party. */
    private void requireProvenance(List<String> symbols) {
        boolean required = symbols.stream().anyMatch(sym -> sym != null && cfg.registry.path("tokens").path(sym).path("provenanceRequired").asBoolean(false));
        if (!required) return;
        String refusal = ProvenanceLive.refusal(symbols, cfg.registry, provenanceAnchors(), payloads::get, cfg.node);
        if (refusal != null) throw new RuntimeException(refusal);
    }

    /** The provenance check of every token of the deployment (GET /api/v1/provenance?securedParty=bank-b). */
    private void provenanceAll(Context ctx) {
        JsonNode anchors = provenanceAnchors();
        String securedParty = ctx.queryParam("securedParty");
        List<Map<String, Object>> out = new ArrayList<>();
        cfg.registry.path("tokens").fieldNames().forEachRemaining(sym ->
            out.add(ProvenanceLive.check(sym, cfg.registry, anchors, payloads::get, securedParty)));
        ctx.json(Map.of("deployed", cfg.registry.path("contracts").has("provenanceAnchors"), "anchors", anchors.size(), "tokens", out));
    }

    private void provenanceOf(Context ctx) {
        ctx.json(ProvenanceLive.check(ctx.pathParam("symbol"), cfg.registry, provenanceAnchors(), payloads::get, ctx.queryParam("securedParty")));
    }

    /**
     * Seed the fixture provenance of tUST and tMMF (ProvenanceFixtures): store each document, link record and credential in
     * the payload store, readable by every party of the deployment, and anchor each record and credential hash through
     * this party's gateway. A token that already has anchors is left as it is. Body (optional): {pledgor, securedParty},
     * registry party names for tMMF's control agreement; defaults bank-a and bank-b.
     */
    private void provenanceSeed(Context ctx) {
        if (!cfg.registry.path("contracts").has("provenanceAnchors")) {
            ctx.status(409).json(Map.of("error", "this deployment has no ProvenanceAnchors; reset and redeploy"));
            return;
        }
        JsonNode body;
        try {
            body = ctx.body().isBlank() ? CdmRuntime.JSON.createObjectNode() : CdmRuntime.JSON.readTree(ctx.body());
        } catch (Exception e) {
            ctx.status(400).json(Map.of("error", "the body is not JSON"));
            return;
        }
        String pledgor = body.path("pledgor").asText("bank-a");
        String securedParty = body.path("securedParty").asText("bank-b");
        List<String> readers = new ArrayList<>();
        cfg.registry.path("parties").forEach(a -> readers.add(a.asText()));
        JsonNode anchors = provenanceAnchors();
        List<Map<String, Object>> out = new ArrayList<>();
        for (String sym : List.of("tUST", "tMMF")) {
            JsonNode token = cfg.registry.path("tokens").path(sym);
            if (token.isMissingNode()) continue;
            String address = token.get("address").asText().toLowerCase();
            boolean seeded = false;
            for (JsonNode a : anchors) seeded |= a.get("token").asText().equalsIgnoreCase(address);
            if (seeded) {
                out.add(Map.of("symbol", sym, "seeded", false, "reason", "already has provenance anchors"));
                continue;
            }
            ProvenanceFixtures.Build b = ProvenanceFixtures.build(sym, token, pledgor, securedParty, java.time.Instant.now().toString());
            for (String doc : b.documents()) payloads.put(Cdm.keccakHex(doc), doc, readers);
            List<String> txs = new ArrayList<>();
            for (ProvenanceFixtures.Anchored a : b.anchored()) {
                payloads.put(a.hash(), a.text(), readers);
                Map<String, Object> req = new LinkedHashMap<>();
                req.put("token", a.token());
                req.put("linkId", a.linkId());
                req.put("cdmHash", a.hash());
                txs.add(gw.post("/provenance/anchor", req).path("txHash").asText());
            }
            out.add(Map.of("symbol", sym, "seeded", true, "anchored", b.anchored().size(), "transactions", txs));
        }
        ctx.json(Map.of("tokens", out));
    }

    /** The validated CDM state of a call, folded from every step document (throws if one is not readable yet). */
    private MarginCallState foldedCall(String callId) {
        List<String> docs = new ArrayList<>();
        for (JsonNode s : gw.get("/calls/" + callId + "/steps")) {
            String hash = s.get("cdmHash").asText();
            String doc = payloads.get(hash);
            if (doc == null || !Cdm.keccakHex(doc).equalsIgnoreCase(hash))
                throw new RuntimeException("the CDM steps of call " + callId + " are not all readable here");
            docs.add(doc);
        }
        return CdmFold.fold(docs);
    }

    @SuppressWarnings("unchecked")
    /**
     * Fold a call after one of its steps was pushed, retrying until the fold includes that step: the pushed event can
     * arrive before the gateway's log scan returns it, and the fold of the steps before it is cached.
     */
    private void foldIncluding(String callId, String step) {
        for (int attempt = 0; attempt < 10; attempt++) {
            try {
                Map<String, Object> r = cdmStateFor(callId);
                Object folded = r.get("stepRecord");
                if (Boolean.TRUE.equals(r.get("converged")) && folded instanceof List<?> l && l.contains(step)) return;
            } catch (Exception ex) {
                System.err.println("step fold of " + callId + ": " + ex.getMessage());
            }
            try { Thread.sleep(1000); } catch (InterruptedException ie) { return; }
        }
    }

    // --- reconciliation (flow-reconciliation, task-csa-reconciliation, wp-adr-reconciliation-scope) ---

    private String myBank() {
        return cfg.bankName(cfg.partyId);
    }

    private String counterpartyBank() {
        return cfg.bankName(counterparty());
    }

    /** This party's snapshot of its seeded trades with the counterparty, committed on-chain by hash. */
    private Map<String, String> commitOwnSnapshot() {
        String json = CdmReconciliation.snapshotJson(myBank(), counterpartyBank(), CdmReconciliation.seed(cfg.node), java.time.Instant.now());
        String snapshotId = Cdm.keccakHex(myBank() + "|" + java.util.UUID.randomUUID());
        gw.post("/reconciliation/snapshots", Map.of("snapshotId", snapshotId, "counterparty", cfg.partyAddress(counterparty()), "snapshotHash", Cdm.keccakHex(json)));
        store.saveSnapshot(snapshotId, myBank(), json);
        return Map.of("snapshotId", snapshotId, "snapshot", json);
    }

    /** Check a snapshot received off-chain against the hash the counterparty committed on-chain. */
    private void verifyCounterpartySnapshot(String snapshotId, String json) {
        JsonNode s = gw.get("/reconciliation/snapshots/" + snapshotId);
        if (!s.path("party").asText().equalsIgnoreCase(cfg.partyAddress(counterparty())) || !s.path("counterparty").asText().equalsIgnoreCase(cfg.myAddress))
            throw new IllegalArgumentException("snapshot " + snapshotId + " is not the counterparty's snapshot with this party");
        if (!s.path("snapshotHash").asText().equalsIgnoreCase(Cdm.keccakHex(json)))
            throw new IllegalArgumentException("snapshot " + snapshotId + " does not match the hash committed on-chain");
        store.saveSnapshot(snapshotId, counterpartyBank(), json);
    }

    /** Compute the result from the two snapshots (first the initiator's), commit its hash, store it. */
    private Map<String, Object> reconcileAndCommit(String firstId, String firstJson, String secondId, String secondJson) {
        var r = CdmReconciliation.reconcile(firstJson, secondJson, CdmReconciliation.seed(cfg.node).toleranceUsd());
        String resultJson = CdmRuntime.toJson(r);
        String runId = gw.getQuery("/reconciliation/id", Map.of("first", firstId, "second", secondId)).get("reconciliationId").asText();
        gw.post("/reconciliation/results", Map.of("reconciliationId", runId, "firstSnapshotId", firstId, "secondSnapshotId", secondId,
                "resultHash", Cdm.keccakHex(resultJson), "breakCount", CdmReconciliation.breakCount(r)));
        store.saveRun(runId, firstId, secondId, resultJson);
        return runView(runId, firstId, secondId, resultJson);
    }

    private Map<String, Object> runView(String runId, String firstId, String secondId, String resultJson) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("reconciliationId", runId);
        v.put("firstSnapshotId", firstId);
        v.put("secondSnapshotId", secondId);
        v.put("resultHash", Cdm.keccakHex(resultJson));
        try {
            v.putAll(CdmReconciliation.view(CdmRuntime.JSON.readValue(resultJson, cdmx.collateral.reconciliation.PortfolioReconciliation.class)));
        } catch (Exception e) {
            throw new IllegalStateException("stored reconciliation unreadable: " + e.getMessage(), e);
        }
        JsonNode run = gw.get("/reconciliation/runs/" + runId);
        v.put("onChain", Map.of("state", run.path("state").asText(), "firstPartyResult", run.path("firstPartyResult").asText(),
                "secondPartyResult", run.path("secondPartyResult").asText()));
        return v;
    }

    /** Initiate a portfolio reconciliation with the counterparty: exchange snapshots, compute and commit the result. */
    private void reconcilePortfolio(Context ctx) {
        Map<String, String> mine = commitOwnSnapshot();
        JsonNode theirs = peer.post("/reconciliation/exchange", Map.of("snapshotId", mine.get("snapshotId"), "snapshot", mine.get("snapshot")));
        String theirId = theirs.get("snapshotId").asText();
        String theirJson = theirs.get("snapshot").asText();
        verifyCounterpartySnapshot(theirId, theirJson);
        ctx.json(reconcileAndCommit(mine.get("snapshotId"), mine.get("snapshot"), theirId, theirJson));
    }

    /** The counterparty side of an exchange: check the initiator's snapshot, answer with this party's, commit a result. */
    private void exchangeSnapshot(Context ctx) {
        Map<String, Object> b = body(ctx);
        String theirId = (String) b.get("snapshotId");
        String theirJson = (String) b.get("snapshot");
        verifyCounterpartySnapshot(theirId, theirJson);
        Map<String, String> mine = commitOwnSnapshot();
        reconcileAndCommit(theirId, theirJson, mine.get("snapshotId"), mine.get("snapshot"));
        ctx.json(Map.of("snapshotId", mine.get("snapshotId"), "snapshot", mine.get("snapshot")));
    }

    /** This party's reconciliation runs, latest first, with their on-chain state. */
    private void reconciliations(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, String> r : store.runs(20))
            out.add(runView(r.get("reconciliationId"), r.get("firstSnapshotId"), r.get("secondSnapshotId"), r.get("resultJson")));
        ctx.json(out);
    }

    /**
     * Records against the chain: the status, called and agreed amounts of each call between the pair, as this party's
     * stored CDM MarginCallStates state them and as the contract states them, and the pledgor's escrow with the secured
     * party by token, as this party's settled CDM records build it (CdmReconciliation.recordedEscrow) and as the control
     * contract holds it. Records stored before the current deployment are left out.
     */
    private void reconcileWithLedger(Context ctx) {
        String me = cfg.myAddress, other = cfg.partyAddress(counterparty());
        List<cdmx.collateral.reconciliation.LedgerFact> onLedger = new ArrayList<>();
        Set<String> pairCalls = new java.util.HashSet<>();
        Map<String, String> callPledgor = new HashMap<>(); // IM and return calls: the leg's pledgor
        for (JsonNode c : gw.getQuery("/party-calls", Map.of("party", me))) {
            JsonNode call = c.get("call");
            String from = call.get("from").asText(), to = call.get("to").asText();
            boolean pair = (from.equalsIgnoreCase(me) && to.equalsIgnoreCase(other)) || (from.equalsIgnoreCase(other) && to.equalsIgnoreCase(me));
            if (!pair) continue;
            String id = c.get("callId").asText().toLowerCase();
            pairCalls.add(id);
            if (call.get("kind").asInt() != 1) callPledgor.put(id, legOfCall(call)[0]);
            onLedger.addAll(CdmReconciliation.ledgerFacts(id, call, cfg.priceScale));
        }
        String since = cfg.registry.path("deployedAt").asText("1970-01-01T00:00:00Z");
        List<cdmx.collateral.reconciliation.LedgerFact> recorded = new ArrayList<>();
        Map<String, String> states = store.statesSince(since);
        for (Map.Entry<String, String> e : states.entrySet()) {
            // The same table holds folded substitutions (CollateralSubstitution, keyed by substitution id): not call records.
            try {
                String type = Config.MAPPER.readTree(e.getValue()).path("@type").asText("");
                if (!type.isEmpty() && !type.equals(MarginCallState.class.getName())) continue;
                MarginCallState st = CdmRuntime.JSON.readValue(e.getValue(), MarginCallState.class);
                recorded.addAll(CdmReconciliation.recordedFacts(e.getKey().toLowerCase(), st));
            } catch (Exception ex) {
                throw new IllegalStateException("stored state of " + e.getKey() + " unreadable: " + ex.getMessage(), ex);
            }
        }

        // Escrow positions on each leg (wp-adr-two-way-im): the pledgor's collateral the control contract holds for the
        // secured party, one escrow record per leg.
        Map<String, Long> substitutedAt = store.eventBlocks("SubstitutionSettled");
        Map<String, String> symbolByIsin = new HashMap<>();
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            symbolByIsin.put(cfg.isin(sym), sym);
        }
        List<Map<String, Object>> escrows = new ArrayList<>();
        for (boolean iPledge : new boolean[]{true, false}) {
            String[] lg = myLeg(iPledge);
            String pledgor = lg[0], securedParty = lg[1];
            String escrow = CdmReconciliation.escrowRecord(iPledge ? myBank() : counterpartyBank(), iPledge ? counterpartyBank() : myBank());
            JsonNode hist = gw.getQuery("/settlement-history", Map.of("pledgor", pledgor, "securedParty", securedParty));
            long emptiedAt = -1;
            for (JsonNode e : hist.path("enforced")) emptiedAt = Math.max(emptiedAt, e.get("block").asLong());
            for (JsonNode e : hist.path("closedOut")) emptiedAt = Math.max(emptiedAt, e.get("block").asLong());
            for (JsonNode e : hist.path("reclaimed")) emptiedAt = Math.max(emptiedAt, e.get("block").asLong());
            Map<String, Long> settledAt = new HashMap<>();
            for (JsonNode e : hist.path("settled")) settledAt.merge(e.get("callId").asText().toLowerCase(), e.get("block").asLong(), Math::max);
            List<CdmReconciliation.EscrowMovement> callMoves = new ArrayList<>(), substitutionMoves = new ArrayList<>();
            for (Map.Entry<String, String> e : states.entrySet()) {
                String id = e.getKey().toLowerCase();
                if (settledAt.containsKey(id) && pledgor.equalsIgnoreCase(callPledgor.get(id)))
                    callMoves.add(new CdmReconciliation.EscrowMovement(e.getValue(), settledAt.get(id)));
                else if (substitutedAt.containsKey(id) && pledgor.equalsIgnoreCase(gw.get("/substitutions/" + id).path("substitution").path("pledgor").asText()))
                    substitutionMoves.add(new CdmReconciliation.EscrowMovement(e.getValue(), substitutedAt.get(id)));
            }
            Map<String, Long> onChainEscrow = new java.util.TreeMap<>();
            for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
                String sym = it.next();
                long qty = new BigInteger(gw.getQuery("/pledged", Map.of("token", cfg.tokenAddress(sym), "pledgor", pledgor, "securedParty", securedParty)).asText()).longValueExact();
                if (qty != 0) onChainEscrow.put(sym, qty);
            }
            Map<String, Long> recordedEscrow = CdmReconciliation.recordedEscrow(callMoves, substitutionMoves, emptiedAt, symbolByIsin);
            recorded.addAll(CdmReconciliation.escrowFacts(escrow, recordedEscrow));
            onLedger.addAll(CdmReconciliation.escrowFacts(escrow, onChainEscrow));
            escrows.add(new LinkedHashMap<>(Map.of("record", escrow, "pledgor", partyIdOf(pledgor), "recorded", recordedEscrow, "ledger", onChainEscrow)));
        }

        Map<String, Object> v = CdmReconciliation.view(CdmReconciliation.withLedger(myBank(), counterpartyBank(), recorded, onLedger));
        v.put("calls", pairCalls.size());
        v.put("escrow", escrows.get(cfg.partyId.equals("A") ? 0 : 1)); // the default leg (A pledges)
        v.put("escrows", escrows);
        ctx.json(v);
    }

    /**
     * The CDM Dispute of a call the called party has just partially agreed or disputed, its reason citing a portfolio
     * reconciliation run and its breaks (cdm-ext Create_Dispute, G3). Recorded with the call's documents.
     */
    private Map<String, Object> disputeCitingReconciliation(String callId, String reconciliationId) {
        Map<String, String> run = null;
        for (Map<String, String> r : store.runs(100)) if (r.get("reconciliationId").equalsIgnoreCase(reconciliationId)) run = r;
        if (run == null) throw new IllegalArgumentException("no reconciliation " + reconciliationId + " at this party");
        Map<String, Object> view = runView(run.get("reconciliationId"), run.get("firstSnapshotId"), run.get("secondSnapshotId"), run.get("resultJson"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> breaks = (List<Map<String, Object>>) view.get("breaks");
        StringBuilder reason = new StringBuilder("Portfolio reconciliation " + reconciliationId + ": ");
        reason.append(breaks.size()).append(breaks.size() == 1 ? " break" : " breaks");
        for (Map<String, Object> x : breaks) reason.append("; ").append(x.get("uti")).append(" ").append(x.get("type"));
        reason.append("; exposure difference USD ").append(view.get("exposureDifferenceUsd"));
        MarginCallState st = foldedCall(callId);
        cdmx.collateral.dispute.Dispute d = CdmRuntime.fn(cdmx.collateral.dispute.functions.Create_Dispute.class).evaluate(
                st, "D-" + callId, CdmRuntime.load(cdm.base.staticdata.party.Party.class, CdmReconciliation.party(myBank())),
                cdmx.collateral.dispute.DisputeSubjectEnum.AMOUNT, reason.toString(),
                java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.SECONDS), null);
        CdmRuntime.validate(d);
        String json = CdmRuntime.toJson(d);
        String hash = Cdm.keccakHex(json);
        store.recordDocument(callId, "Dispute", "out", hash, json);
        payloads.put(hash, json, callParties);
        return Map.of("disputeIdentifier", d.getDisputeIdentifier(), "reason", d.getReason(), "cdmHash", hash, "reconciliationId", reconciliationId);
    }

    private Map<String, Object> body(Context ctx) {
        return ctx.bodyAsClass(Map.class);
    }

    private void issueCall(Context ctx) {
        Map<String, Object> b = body(ctx);
        String replaces = (String) b.get("replacesCallId"); // a cancelled call this call replaces (task-csa-call-replacement)
        JsonNode old = replaces == null ? null : gw.get("/calls/" + replaces);
        if (old != null) {
            if (!old.get("from").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the calling party replaces a call");
            if (old.get("state").asInt() != 7) throw new RuntimeException("only a cancelled call can be replaced");
            if (!old.path("replacementOf").asText(ZERO_HASH).equalsIgnoreCase(ZERO_HASH)) throw new RuntimeException("the call already has a replacement");
        }
        // A replacement keeps the replaced call's kind and called party; only the amount (and deadline) change.
        String kind = old != null ? CALL_KIND_NAME[old.get("kind").asInt()] : (String) b.getOrDefault("kind", "IM");
        String toParty = old != null ? partyIdOf(old.get("to").asText()) : (String) b.getOrDefault("toParty", "A");
        long amountUsd = ((Number) b.get("amountUsd")).longValue();
        long days = b.containsKey("deadlineDays") ? ((Number) b.get("deadlineDays")).longValue() : 1;
        String amountScaled = BigInteger.valueOf(amountUsd).multiply(cfg.priceScale).toString();
        long deadline = System.currentTimeMillis() / 1000 + days * 86400;
        long n = store.nextCallNumber(cfg.partyId);
        String callId = Cdm.onChainId(cfg.partyId + "-" + n + "-" + System.nanoTime());
        String direction = kind.equals("Return") ? "Return" : "Delivery";
        Cdm cdm = Cdm.issue(Cdm.cdmCallId(callId), cfg.bankName(cfg.partyId), amountUsd, direction,
                replaces == null ? null : Cdm.cdmCallId(replaces), Cdm.regMarginType(kind));
        if (replaces != null && !cdm.replaces(foldedCall(replaces)))
            throw new RuntimeException("the CDM state of call " + replaces + " does not allow this replacement (ReplacementAllowed)");
        record(callId, "IssueCall", cdm);
        Map<String, Object> tx = new LinkedHashMap<>(Map.of("callId", callId, "kind", CALL_KIND.get(kind), "to", cfg.partyAddress(toParty),
                "amount", amountScaled, "deadline", deadline, "cdmHash", cdm.hash));
        if (replaces != null) tx.put("replaces", replaces);
        gw.post("/calls", tx);
        if ("top-up".equals(b.get("purpose"))) store.tagCall(callId, "top-up");
        ctx.json(Map.of("callId", callId, "cdmHash", cdm.hash));
    }

    private void respond(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        String response = (String) b.getOrDefault("response", "full");
        JsonNode c = gw.get("/calls/" + callId);
        String master = callAgreement(callId);
        if ("GMRA".equals(master) && response.equals("full")) checkGmraCallAmount(c);
        if ("GMSLA".equals(master) && response.equals("full")) checkGmslaCall(callId, c);
        BigInteger amount = new BigInteger(c.get("amount").asText());
        BigInteger agreed = switch (response) {
            case "full" -> amount;
            case "partial" -> BigInteger.valueOf(((Number) b.get("agreedUsd")).longValue()).multiply(cfg.priceScale);
            default -> BigInteger.ZERO;
        };
        BigInteger disputed = amount.subtract(agreed);
        long agreedUsd = agreed.divide(cfg.priceScale).longValue();
        String kindCdm = switch (response) {
            case "full" -> "AgreeinFull";
            case "partial" -> "PartiallyAgree";
            default -> "Dispute";
        };
        String issuer = cfg.bankName(partyIdOf(c.get("from").asText()));
        String action = c.get("kind").asInt() == 2 ? "Return" : "Delivery"; // a return call is agreed and then released
        // The response states indicative collateral; the actual assets are chosen at proposal time (single-token cycle).
        long units = Math.max(1, agreedUsd);
        Cdm cdm = Cdm.respond(Cdm.cdmCallId(callId), issuer, kindCdm, agreedUsd, action, units, cfg.isin(cfg.firstTokenSymbol()),
                Cdm.regMarginType(CALL_KIND_NAME[c.get("kind").asInt()]), master);
        record(callId, "RespondToCall", cdm);
        gw.post("/calls/" + callId + "/response", Map.of("response", RESPONSE.get(response), "agreed", agreed.toString(), "cdmHash", cdm.hash));
        Map<String, Object> out = new LinkedHashMap<>(Map.of("ok", true, "agreedUsd", String.valueOf(agreedUsd)));
        String reconciliationId = (String) b.get("reconciliationId");
        if (reconciliationId != null && !reconciliationId.isBlank() && !"full".equals(response))
            out.put("dispute", disputeCitingReconciliation(callId, reconciliationId));
        ctx.json(out);
    }

    @SuppressWarnings("unchecked")
    private void propose(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        List<Map<String, Object>> assetsIn = (List<Map<String, Object>>) b.get("assets");
        JsonNode c = gw.get("/calls/" + callId);
        long nextPid = c.get("proposalCount").asLong(); // the id the contract assigns next (sequential per call)
        long agreedUsd = new BigInteger(c.get("agreed").asText()).divide(cfg.priceScale).longValue();
        String callIssuer = cfg.bankName(partyIdOf(c.get("from").asText()));
        String master = callAgreement(callId);
        if (master != null) {
            List<Map.Entry<String, Long>> proposed = new ArrayList<>();
            for (Map<String, Object> a : assetsIn) proposed.add(Map.entry((String) a.get("token"), ((Number) a.get("qty")).longValue()));
            if (master.equals("GMRA")) checkGmraCoverage(proposed, agreedUsd);
            else checkGmslaCoverage(proposed, agreedUsd);
        }
        List<Map<String, Object>> gwAssets = new ArrayList<>();
        List<Map<String, Object>> cdmAssets = new ArrayList<>();
        for (Map<String, Object> a : assetsIn) {
            String sym = (String) a.get("token");
            long qty = ((Number) a.get("qty")).longValue();
            gwAssets.add(Map.of("token", cfg.tokenAddress(sym), "qty", String.valueOf(qty)));
            cdmAssets.add(new LinkedHashMap<>(Map.of("isin", cfg.isin(sym), "units", qty)));
        }
        // The proposal covers the agreed amount (valueAfterHaircuts in the agreement's base currency).
        Cdm cdm = Cdm.propose(Cdm.cdmCallId(callId), callIssuer, "P-" + nextPid, cfg.bankName(cfg.partyId), cdmAssets, agreedUsd);
        record(callId, "ProposeCollateral", cdm);
        JsonNode r = gw.post("/calls/" + callId + "/proposals", Map.of("assets", gwAssets, "cdmHash", cdm.hash));
        ctx.json(Map.of("proposalId", r.get("proposalId").asLong(), "cdmHash", cdm.hash));
    }

    /**
     * Suggest a basket for an agreed IM or VM call (flow-allocation; wp-adr-allocation-scope). Only the called party,
     * which delivers, asks. Each registry token is a candidate: this party's balance, the oracle feed price read through
     * its own gateway, and the eligibility and haircut between the pair as the contract applies them (pledgor = the
     * called party, secured party = the calling party). The ranking is the body's {@code ranking} (token symbols, first
     * allocated first), followed by the remaining tokens in registry order; without it, the registry order. Nothing is
     * recorded: the party proposes the basket through {@link #propose}.
     */
    @SuppressWarnings("unchecked")
    private void allocation(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = ctx.body().isBlank() ? Map.of() : body(ctx);
        JsonNode c = gw.get("/calls/" + callId);
        int kind = c.get("kind").asInt(), state = c.get("state").asInt();
        if (kind == 2) throw new RuntimeException("no allocation for a return call");
        if (state != 2 && state != 3) throw new RuntimeException("the call is not agreed");
        if (!c.get("to").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the called party allocates collateral");

        List<String> order = new ArrayList<>();
        for (Object sym : (List<Object>) b.getOrDefault("ranking", List.of())) {
            if (!cfg.registry.get("tokens").has(String.valueOf(sym))) throw new RuntimeException("unknown token " + sym);
            if (!order.contains(String.valueOf(sym))) order.add(String.valueOf(sym));
        }
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            if (!order.contains(sym)) order.add(sym);
        }

        JsonNode pt = gw.getQuery("/pair-terms", Map.of("pledgor", c.get("to").asText(), "securedParty", c.get("from").asText()));
        Map<String, JsonNode> terms = new HashMap<>();
        for (JsonNode e : pt.get("eligibility")) {
            String sym = symbolOf(e.get("token").asText());
            if (sym != null) terms.put(sym, e);
        }
        Map<String, BigInteger> priceByToken = new HashMap<>();
        for (JsonNode pr : gw.get("/prices").get("prices")) {
            if (!pr.get("price").isNull()) priceByToken.put(pr.get("token").asText().toLowerCase(), new BigInteger(pr.get("price").asText()));
        }
        List<CdmAllocation.Candidate> candidates = new ArrayList<>();
        List<Map<String, Object>> inventory = new ArrayList<>();
        for (int i = 0; i < order.size(); i++) {
            String sym = order.get(i), token = cfg.tokenAddress(sym);
            long held = new BigInteger(gw.getQuery("/balance", Map.of("token", token, "owner", cfg.myAddress)).asText()).longValueExact();
            JsonNode e = terms.get(sym);
            boolean eligible = e != null && e.get("eligible").asBoolean();
            int bps = e != null ? e.get("haircutBps").asInt() : 10_000;
            BigInteger price = priceByToken.get(token.toLowerCase());
            candidates.add(new CdmAllocation.Candidate(sym, cfg.isin(sym), i + 1, held, price, eligible, bps));
            inventory.add(new LinkedHashMap<>(Map.of("token", sym, "rank", i + 1, "held", String.valueOf(held), "eligible", eligible,
                    "haircutBps", bps, "price", price == null ? "" : price.toString())));
        }
        CdmAllocation a = CdmAllocation.allocate(candidates, new BigInteger(c.get("agreed").asText()), cfg.priceScale);
        List<Map<String, Object>> assets = new ArrayList<>();
        for (CdmAllocation.Line l : a.lines) assets.add(new LinkedHashMap<>(Map.of("token", l.symbol(), "qty", l.units())));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("callId", callId);
        out.put("covers", a.covers());
        out.put("assets", assets);
        out.put("valueUsd", a.valueUsd());
        out.put("agreedUsd", usd(c.get("agreed").asText()));
        out.put("ranking", order);
        out.put("inventory", inventory);
        ctx.json(out);
    }

    private void decide(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        long proposalId = ((Number) b.get("proposalId")).longValue();
        boolean accept = Boolean.TRUE.equals(b.get("accept"));
        String reason = (String) b.get("reason");
        String master = accept ? callAgreement(callId) : null;
        if (master != null) {
            List<Map.Entry<String, Long>> proposed = new ArrayList<>();
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + proposalId + "/assets"))
                proposed.add(Map.entry(symbolByAddress.get(a.get("token").asText().toLowerCase()), a.get("qty").asLong()));
            long agreed = new BigInteger(gw.get("/calls/" + callId).get("agreed").asText()).divide(cfg.priceScale).longValue();
            if (master.equals("GMRA")) checkGmraCoverage(proposed, agreed);
            else checkGmslaCoverage(proposed, agreed);
        }
        if (accept) {
            List<String> symbols = new ArrayList<>();
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + proposalId + "/assets"))
                symbols.add(symbolByAddress.get(a.get("token").asText().toLowerCase()));
            requireProvenance(symbols);
        }
        Cdm cdm = Cdm.decide("P-" + proposalId, accept, reason);
        record(callId, "DecideProposal", cdm);
        gw.post("/calls/" + callId + "/decision", Map.of("proposalId", proposalId, "accept", accept, "cdmHash", cdm.hash));
        ctx.json(Map.of("ok", true, "decision", accept ? "accepted" : "rejected", "cdmHash", cdm.hash));
    }

    // --- margin call cancellation (task-csa-call-cancellation; rules to confirm in task-sme-call-cancellation-rules) ---

    private static final String ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    /** This party's role on a call, as the CDM header states it (Cdm.callBase): Pledgor or SecuredParty. */
    private String cdmRole(String callId) {
        return legOfCall(gw.get("/calls/" + callId))[0].equalsIgnoreCase(cfg.myAddress) ? "Pledgor" : "SecuredParty";
    }

    /** The calling party withdraws a call the other party has not answered (CDM step WithdrawCall). */
    private void withdrawCall(Context ctx) {
        String callId = ctx.pathParam("id");
        JsonNode c = gw.get("/calls/" + callId);
        if (!c.get("from").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("only the calling party withdraws a call");
        if (c.get("state").asInt() != 1) throw new RuntimeException("only an unanswered call can be withdrawn; request a cancellation instead");
        Cdm cdm = Cdm.withdraw((String) body(ctx).get("reason"));
        record(callId, "WithdrawCall", cdm);
        JsonNode tx = gw.post("/calls/" + callId + "/withdraw", Map.of("cdmHash", cdm.hash));
        ctx.json(Map.of("callId", callId, "cdmHash", cdm.hash, "withdrawTx", tx.path("txHash").asText()));
    }

    /** Either party asks to cancel an answered call that is not settled (CDM step RequestCancellation, colr.005). */
    private void requestCancellation(Context ctx) {
        String callId = ctx.pathParam("id");
        Cdm cdm = Cdm.requestCancellation(cdmRole(callId), (String) body(ctx).get("reason"));
        record(callId, "RequestCancellation", cdm);
        JsonNode tx = gw.post("/calls/" + callId + "/cancellation", Map.of("cdmHash", cdm.hash));
        ctx.json(Map.of("callId", callId, "cdmHash", cdm.hash, "requestTx", tx.path("txHash").asText()));
    }

    /** The other party accepts or refuses the pending cancellation request (CDM step DecideCancellation, colr.006). */
    private void decideCancellation(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        boolean accept = Boolean.TRUE.equals(b.get("accept"));
        JsonNode c = gw.get("/calls/" + callId);
        String requester = c.path("cancellationRequestedBy").asText(ZERO_ADDRESS);
        if (requester.equalsIgnoreCase(ZERO_ADDRESS)) throw new RuntimeException("no cancellation request is pending");
        if (requester.equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("the requesting party cannot decide its own request");
        Cdm cdm = Cdm.decideCancellation(cdmRole(callId), accept, (String) b.get("reason"));
        record(callId, "DecideCancellation", cdm);
        JsonNode tx = gw.post("/calls/" + callId + "/cancellation/decision", Map.of("accept", accept, "cdmHash", cdm.hash));
        ctx.json(Map.of("callId", callId, "accept", accept, "cdmHash", cdm.hash, "decisionTx", tx.path("txHash").asText()));
    }

    private void pledge(Context ctx) {
        settleDelivery(ctx, "/pledge");
    }

    /** Variation-margin settlement: title passes directly to the receiver (settleByTransfer), no escrow. */
    private void transfer(Context ctx) {
        settleDelivery(ctx, "/transfer");
    }

    /**
     * Delivery settlement against an accepted proposal (IM pledge or VM transfer). The proposal's assets — one or
     * several — live on-chain; the gateway approves and moves them all, so the service only names the proposal.
     */
    private void settleDelivery(Context ctx, String gatewayPath) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        long proposalId = ((Number) b.get("proposalId")).longValue();
        JsonNode assets = gw.get("/calls/" + callId + "/proposals/" + proposalId + "/assets");
        if (assets.isEmpty()) throw new RuntimeException("proposal " + proposalId + " has no assets");
        Cdm cdm = Cdm.settle("P-" + proposalId);
        record(callId, "SettleCall", cdm);
        gw.post("/calls/" + callId + gatewayPath, Map.of("proposalId", proposalId, "cdmHash", cdm.hash));
        ctx.json(Map.of("ok", true, "cdmHash", cdm.hash));
    }

    /**
     * Settle a return call: release escrowed initial margin (via = "release") or transfer equivalent variation margin
     * back (via = "transfer"). Both carry the same CDM SettleCallInstruction (releasedCollateral + releasedValue); the
     * value abstraction is the agreed return amount in base currency, matching the proposal convention.
     */
    @SuppressWarnings("unchecked")
    private void returnCollateral(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        String via = (String) b.getOrDefault("via", "release");
        List<Map<String, Object>> assetsIn = (List<Map<String, Object>>) b.get("assets");
        JsonNode c = gw.get("/calls/" + callId);
        long agreedUsd = new BigInteger(c.get("agreed").asText()).divide(cfg.priceScale).longValue();
        List<Map<String, Object>> gwAssets = new ArrayList<>();
        List<Map<String, Object>> cdmAssets = new ArrayList<>();
        for (Map<String, Object> a : assetsIn) {
            String sym = (String) a.get("token");
            long qty = ((Number) a.get("qty")).longValue();
            gwAssets.add(Map.of("token", cfg.tokenAddress(sym), "qty", String.valueOf(qty)));
            cdmAssets.add(new LinkedHashMap<>(Map.of("isin", cfg.isin(sym), "units", qty)));
        }
        Cdm cdm = Cdm.settleReturn(cdmAssets, agreedUsd, null, via.equals("transfer") ? "VM" : "RegIM");
        record(callId, "SettleCall", cdm);
        String path = via.equals("transfer") ? "/return-transfer" : "/return";
        gw.post("/calls/" + callId + path, Map.of("assets", gwAssets, "cdmHash", cdm.hash));
        ctx.json(Map.of("ok", true, "cdmHash", cdm.hash, "via", via));
    }

    /**
     * Declare the pledgor's default and enforce against the pledged initial margin (flow-default-enforcement). The
     * secured party's service forwards the default notice to the oracle service (transition 3), which publishes it to
     * the oracle feed through the operator's gateway with the publisher key (transitions 4-5); once that write is mined
     * this service sends enforce(callId) to its own gateway, signed with the secured party key (transition 5). The
     * control contract checks the feed and moves every pledged token to the secured party (transitions 6-7).
     */
    private void enforce(Context ctx) {
        String callId = ctx.pathParam("id");
        JsonNode c = gw.get("/calls/" + callId);
        if (c.get("kind").asInt() != CALL_KIND.get("IM")) throw new RuntimeException("enforcement is against an initial-margin call");
        if (!c.get("from").asText().equalsIgnoreCase(cfg.myAddress))
            throw new RuntimeException("only the secured party that issued the call (" + c.get("from").asText() + ") may enforce");
        String pledgor = c.get("to").asText();
        JsonNode notice = oracle.post("/defaults", Map.of("party", pledgor, "inDefault", true, "notifiedBy", cfg.bankName(cfg.partyId)));
        // The CDM CollateralEnforcement of the escrow taken (G14), stored and shared before the chain records its hash,
        // so both parties can check it and build its Enforcement LedgerAnchor (task-authoritative-record-settlement-enforcement).
        String[] leg = {pledgor, cfg.myAddress};
        Map<String, BigInteger> prices = feedPrices();
        List<Map<String, Object>> positions = new ArrayList<>();
        BigInteger value = BigInteger.ZERO;
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            String token = cfg.tokenAddress(sym);
            BigInteger qty = new BigInteger(gw.getQuery("/pledged", Map.of("token", token, "pledgor", pledgor, "securedParty", cfg.myAddress)).asText());
            if (qty.signum() == 0) continue;
            positions.add(Map.of("isin", cfg.isin(sym), "units", qty.longValueExact()));
            value = value.add(valueAfterHaircut(qty, prices.getOrDefault(token.toLowerCase(), BigInteger.ZERO), haircutBps(leg, sym)));
        }
        if (positions.isEmpty()) throw new RuntimeException("nothing is pledged by " + pledgor + " to enforce against");
        CdmEnforcement en = CdmEnforcement.build(callId, cfg.bankName(partyIdOf(pledgor)), myBank(), positions, value.divide(cfg.priceScale).longValueExact());
        store.recordDocument(callId, "CollateralEnforcement", "out", en.hash, en.json);
        payloads.put(en.hash, en.json, callParties);
        JsonNode enforced = gw.post("/calls/" + callId + "/enforce", Map.of("cdmHash", en.hash));
        Map<String, Object> out = new LinkedHashMap<>(Map.of("ok", true, "pledgor", pledgor,
                "defaultTx", notice.path("tx").path("txHash").asText(), "enforceTx", enforced.path("txHash").asText()));
        out.put("cdmHash", en.hash);
        out.put("eventQualifier", en.enforcement.getEventQualifier());
        ctx.json(out);
    }

    // ---- GMRA default close-out (task-repo-default-close-out, wp-adr-repo-default-close-out) ----

    private final Map<String, GmraCloseOutStatementView> repoCloseOutDocs = new java.util.concurrent.ConcurrentHashMap<>();

    private record GmraCloseOutStatementView(cdmx.collateral.repo.GmraCloseOutStatement statement) {}

    /** The statement of an on-chain close-out from the payload store, parsed once; null if not in the store. */
    private cdmx.collateral.repo.GmraCloseOutStatement closeOutStatement(String hash) {
        GmraCloseOutStatementView v = repoCloseOutDocs.get(hash);
        if (v != null) return v.statement();
        String doc = payloads.get(hash);
        if (doc == null) return null;
        if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the close-out document does not hash to the on-chain hash");
        var s = CdmRepoDefault.parse(doc);
        repoCloseOutDocs.put(hash, new GmraCloseOutStatementView(s));
        return s;
    }

    /** The GMRA calls whose margin a recorded close-out of this party settled: margin views no longer count them. */
    private Set<String> repoCloseOutSettledCalls() {
        Set<String> out = new java.util.HashSet<>();
        for (JsonNode c : gw.getQuery("/repo-default/close-outs", Map.of("party", cfg.myAddress))) {
            var s = closeOutStatement(c.get("cdmHash").asText());
            if (s != null) for (String id : CdmRepoDefault.settledCalls(s)) out.add(id.toLowerCase());
        }
        return out;
    }

    /** This party's purchased repos with the counterparty, oldest first, as the contract closes them out. */
    private List<JsonNode> purchasedWithCounterparty() {
        String other = cfg.partyAddress(counterparty());
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            if (!r.get("state").asText().equals("purchased")) continue;
            if (r.get("seller").asText().equalsIgnoreCase(other) || r.get("buyer").asText().equalsIgnoreCase(other)) out.add(r);
        }
        return out;
    }

    /** The Transactions to close out, from this service's own checked bookings, priced by `price`. */
    private List<CdmRepoDefault.TxInput> closeOutTransactions(List<JsonNode> repos, java.util.function.Function<JsonNode, BigDecimal> price) {
        List<CdmRepoDefault.TxInput> out = new ArrayList<>();
        for (JsonNode r : repos) {
            CdmRepo.Booking b = repoBooking(r);
            if (b == null) throw new RuntimeException("the booked document of repo " + r.get("repoId").asText() + " is not in the payload store");
            String problem = repoProblem(r, b);
            if (problem != null) throw new RuntimeException("repo " + r.get("repoId").asText() + ": " + problem);
            out.add(new CdmRepoDefault.TxInput(r.get("repoId").asText(), b.trade(), deductionOf(r), price.apply(r)));
        }
        return out;
    }

    /** The margin each party holds net per asset under the pair's settled GMRA calls not yet closed out, priced by `price`
     *  (asset code: the Base Currency for tUSD, the ISIN otherwise; null price: the asset is left out). */
    private List<CdmRepoDefault.MarginInput> closeOutMargin(String baseCurrency, java.util.function.Function<String, BigDecimal> price) {
        Set<String> closedOutCalls = repoCloseOutSettledCalls();
        Map<String, Long> net = new LinkedHashMap<>();
        Map<String, List<String>> calls = new LinkedHashMap<>();
        String tUsd = cfg.tokenAddress("tUSD");
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int state = c.get("state").asInt();
            String callId = entry.get("callId").asText();
            if (c.get("kind").asInt() != 1 || (state != 5 && state != 6) || !isGmraCall(callId)) continue;
            if (closedOutCalls.contains(callId.toLowerCase())) continue;
            boolean received = c.get("from").asText().equalsIgnoreCase(cfg.myAddress);
            long pid = c.get("activeProposal").asLong() - 1;
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + pid + "/assets")) {
                String token = a.get("token").asText();
                String asset = token.equalsIgnoreCase(tUsd) ? baseCurrency : cfg.isin(symbolByAddress.get(token.toLowerCase()));
                net.merge(asset, received ? a.get("qty").asLong() : -a.get("qty").asLong(), Long::sum);
                calls.computeIfAbsent(asset, k -> new ArrayList<>());
                if (!calls.get(asset).contains(callId)) calls.get(asset).add(callId);
            }
        }
        List<CdmRepoDefault.MarginInput> out = new ArrayList<>();
        for (var e : net.entrySet()) {
            if (e.getValue() == 0) continue;
            BigDecimal p = price.apply(e.getKey());
            if (p == null) continue;
            boolean mine = e.getValue() > 0;
            out.add(new CdmRepoDefault.MarginInput(mine ? myBank() : counterpartyBank(), mine ? counterpartyBank() : myBank(), e.getKey(),
                    e.getKey().equals(baseCurrency), Math.abs(e.getValue()), p, calls.get(e.getKey())));
        }
        return out;
    }

    private BigDecimal feedPriceOfAsset(String asset, String baseCurrency) {
        if (asset.equals(baseCurrency)) return BigDecimal.ONE;
        for (var e : cfg.tokenSymbols().entrySet())
            if (cfg.isin(e.getValue()).equals(asset)) return feedPrice(e.getKey());
        throw new RuntimeException("no token for " + asset);
    }

    /** The close-out statement this party would record now as the non-defaulting party, at the feed prices. */
    private CdmRepoDefault.Statement repoCloseOutPreview(CdmRepoDefault.Notice notice) {
        var elections = gmraFold().terms().terms().getElections();
        String ccy = elections.getBaseCurrency();
        List<JsonNode> repos = purchasedWithCounterparty();
        if (repos.isEmpty()) throw new RuntimeException("no purchased repo with " + counterparty() + " to close out");
        return CdmRepoDefault.statement(notice.notice(), ccy, businessDate,
                closeOutTransactions(repos, r -> feedPrice(r.get("security").asText())),
                closeOutMargin(ccy, a -> feedPriceOfAsset(a, ccy)));
    }

    /** Whether a recorded close-out's statement is the one this party rebuilds from its own trades, the chain's
     *  deductions and margin, and the prices the statement states; and the on-chain record matches it. */
    private String repoCloseOutProblem(JsonNode c, cdmx.collateral.repo.GmraCloseOutStatement s, String json) {
        String hash = c.get("cdmHash").asText();
        if (!Cdm.keccakHex(json).equalsIgnoreCase(hash)) return "the statement does not hash to the on-chain hash";
        List<JsonNode> repos = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress)))
            if (r.get("state").asText().equals("closedOut") && r.get("repurchaseHash").asText().equalsIgnoreCase(hash)) repos.add(r);
        if (repos.size() != s.getTransactionValue().size()) return "the statement values " + s.getTransactionValue().size() + " Transactions; the contract closed out " + repos.size();
        String ccy = s.getBaseCurrency();
        // The margin as it stood before this close-out: drop this statement's own calls from the exclusion.
        Set<String> own = new java.util.HashSet<>();
        for (String id : CdmRepoDefault.settledCalls(s)) own.add(id.toLowerCase());
        List<CdmRepoDefault.MarginInput> margin = new ArrayList<>();
        for (var m : CdmRepoDefault.heldMargin(s)) {
            if (!m.getCallId().stream().allMatch(id -> own.contains(id.toLowerCase()))) return "the statement's margin names unknown calls";
            margin.add(new CdmRepoDefault.MarginInput(m.getHolder(), m.getGiver(), m.getAsset(), m.getCash(), m.getQuantity().longValueExact(), m.getPrice(), m.getCallId()));
        }
        for (CdmRepoDefault.MarginInput m : margin) {
            long mine = 0;
            // Each party's own call history must give the same net quantity per asset.
            for (CdmRepoDefault.MarginInput x : closeOutMarginIncluding(ccy, own)) if (x.asset().equals(m.asset())) mine = x.holder().equals(m.holder()) ? x.quantity() : -x.quantity();
            if (mine != m.quantity()) return "the statement's margin in " + m.asset() + " is not the margin held";
        }
        CdmRepoDefault.Statement rebuilt;
        try {
            rebuilt = CdmRepoDefault.statement(s.getNotice(), ccy, s.getValuationDate().toLocalDate(),
                    closeOutTransactions(repos, r -> CdmRepoDefault.statedPrice(s, r.get("repoId").asText())), margin);
        } catch (RuntimeException ex) {
            return "the statement does not rebuild: " + ex.getMessage();
        }
        if (!rebuilt.hash().equalsIgnoreCase(hash)) return "the statement rebuilt from this party's trades differs";
        long amount = c.get("amount").asLong();
        if (amount != rebuilt.balance()) return "the on-chain balance is not the statement's";
        String payer = c.get("payer").asText();
        String payerName = amount == 0 ? null : cfg.bankName(partyIdOf(payer));
        if (amount != 0 && !payerName.equals(rebuilt.payer())) return "the on-chain payer is not the statement's";
        return null;
    }

    /** closeOutMargin with the given calls counted although a close-out settled them (to check that close-out). */
    private List<CdmRepoDefault.MarginInput> closeOutMarginIncluding(String baseCurrency, Set<String> include) {
        Map<String, Long> net = new LinkedHashMap<>();
        String tUsd = cfg.tokenAddress("tUSD");
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            String callId = entry.get("callId").asText();
            if (!include.contains(callId.toLowerCase())) continue;
            JsonNode c = entry.get("call");
            boolean received = c.get("from").asText().equalsIgnoreCase(cfg.myAddress);
            long pid = c.get("activeProposal").asLong() - 1;
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + pid + "/assets")) {
                String token = a.get("token").asText();
                String asset = token.equalsIgnoreCase(tUsd) ? baseCurrency : cfg.isin(symbolByAddress.get(token.toLowerCase()));
                net.merge(asset, received ? a.get("qty").asLong() : -a.get("qty").asLong(), Long::sum);
            }
        }
        List<CdmRepoDefault.MarginInput> out = new ArrayList<>();
        for (var e : net.entrySet()) {
            if (e.getValue() == 0) continue;
            boolean mine = e.getValue() > 0;
            out.add(new CdmRepoDefault.MarginInput(mine ? myBank() : counterpartyBank(), mine ? counterpartyBank() : myBank(), e.getKey(),
                    e.getKey().equals(baseCurrency), Math.abs(e.getValue()), BigDecimal.ONE, List.of()));
        }
        return out;
    }

    private Map<String, Object> statementView(cdmx.collateral.repo.GmraCloseOutStatement s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("earlyTerminationDate", s.getNotice().getEarlyTerminationDate().toString());
        m.put("automaticEarlyTermination", s.getNotice().getAutomaticEarlyTermination());
        m.put("nonDefaultingParty", s.getNotice().getNonDefaultingParty());
        m.put("defaultingParty", s.getNotice().getDefaultingParty());
        List<Map<String, Object>> tx = new ArrayList<>();
        for (var v : s.getTransactionValue()) {
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("repoId", v.getRepoId());
            t.put("seller", v.getSeller());
            t.put("buyer", v.getBuyer());
            t.put("buySellBack", v.getBuySellBack());
            t.put("repurchasePrice", v.getRepurchasePrice().toPlainString());
            t.put("price", v.getPrice().stripTrailingZeros().toPlainString());
            t.put("quantity", v.getQuantity().toPlainString());
            t.put("defaultMarketValue", v.getDefaultMarketValue().toPlainString());
            tx.add(t);
        }
        m.put("transactions", tx);
        List<Map<String, Object>> held = new ArrayList<>();
        for (var h : CdmRepoDefault.heldMargin(s))
            held.add(new LinkedHashMap<>(Map.of("holder", h.getHolder(), "asset", h.getAsset(), "quantity", h.getQuantity().toPlainString(), "value", h.getValue().toPlainString())));
        m.put("heldMargin", held);
        m.put("netAmount", s.getNetAmount().toPlainString());
        m.put("balance", s.getBalance().toPlainString());
        m.put("payer", s.getPayer());
        m.put("receiver", s.getReceiver());
        return m;
    }

    /** The default close-out view: the default status of both parties, the election, a preview when this party may close
     *  out, and the recorded close-outs with their verification and payment. */
    private void repoDefault(Context ctx) {
        String other = cfg.partyAddress(counterparty());
        boolean counterpartyInDefault = gw.get("/defaults/" + other).get("inDefault").asBoolean();
        boolean inDefault = gw.get("/defaults/" + cfg.myAddress).get("inDefault").asBoolean();
        var elections = gmraFold().terms().terms().getElections();
        boolean automatic = elections.getDefaultValuation().getAutomaticEarlyTermination();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("businessDate", businessDate.toString());
        m.put("counterparty", counterparty());
        m.put("counterpartyInDefault", counterpartyInDefault);
        m.put("inDefault", inDefault);
        m.put("automaticEarlyTermination", automatic);
        m.put("baseCurrency", elections.getBaseCurrency());
        int open = purchasedWithCounterparty().size();
        m.put("openTransactions", open);
        if (!inDefault && open > 0) {
            try {
                var n = CdmRepoDefault.notice(myBank(), counterpartyBank(), businessDate, businessDate, automatic);
                m.put("preview", statementView(repoCloseOutPreview(n).statement()));
            } catch (RuntimeException ex) {
                m.put("previewProblem", ex.getMessage());
            }
        }
        List<Map<String, Object>> closeOuts = new ArrayList<>();
        for (JsonNode c : gw.getQuery("/repo-default/close-outs", Map.of("party", cfg.myAddress))) {
            Map<String, Object> v = new LinkedHashMap<>();
            String hash = c.get("cdmHash").asText();
            v.put("closeOutId", c.get("closeOutId").asText());
            v.put("cdmHash", hash);
            v.put("nonDefaulting", partyIdOf(c.get("nonDefaulting").asText()));
            v.put("defaulting", partyIdOf(c.get("defaulting").asText()));
            v.put("amount", c.get("amount").asText());
            v.put("paid", c.get("paid").asBoolean());
            boolean iPay = c.get("amount").asLong() > 0 && c.get("payer").asText().equalsIgnoreCase(cfg.myAddress);
            v.put("payer", c.get("amount").asLong() > 0 ? partyIdOf(c.get("payer").asText()) : null);
            v.put("toPay", iPay && !c.get("paid").asBoolean());
            v.put("noticeServed", !c.get("noticeHash").asText().equals(ZERO_HASH));
            String doc = payloads.get(hash);
            if (doc == null) {
                v.put("verified", false);
                v.put("problem", "the statement is not in the payload store");
            } else {
                try {
                    var s = closeOutStatement(hash);
                    v.put("statement", statementView(s));
                    String problem = repoCloseOutProblem(c, s, doc);
                    v.put("verified", problem == null);
                    v.put("problem", problem);
                } catch (RuntimeException ex) {
                    v.put("verified", false);
                    v.put("problem", ex.getMessage());
                }
            }
            closeOuts.add(0, v);
        }
        m.put("closeOuts", closeOuts);
        ctx.json(m);
    }

    /** The non-defaulting party closes out every purchased repo with the counterparty (GMRA paragraph 10). The default
     *  goes to the oracle service first when the feed does not show it (as in flow-default-enforcement). Without
     *  automatic early termination this service serves the Default Notice on-chain; the Early Termination Date and the
     *  Default Valuation Time are its business date. It records the statement and the balance on RepoSettlement. */
    private void closeOutRepoDefault(Context ctx) {
        String other = cfg.partyAddress(counterparty());
        if (gw.get("/defaults/" + cfg.myAddress).get("inDefault").asBoolean())
            throw new RuntimeException("the oracle feed records this party in default; only the non-defaulting party closes out");
        String defaultTx = null;
        if (!gw.get("/defaults/" + other).get("inDefault").asBoolean()) {
            JsonNode notified = oracle.post("/defaults", Map.of("party", other, "inDefault", true, "notifiedBy", myBank()));
            defaultTx = notified.path("tx").path("txHash").asText(null);
        }
        var elections = gmraFold().terms().terms().getElections();
        boolean automatic = elections.getDefaultValuation().getAutomaticEarlyTermination();
        CdmRepoDefault.Notice notice = CdmRepoDefault.notice(myBank(), counterpartyBank(), businessDate, businessDate, automatic);
        CdmRepoDefault.Statement st = repoCloseOutPreview(notice);
        String noticeHash = ZERO_HASH, noticeTx = null;
        String closeOutId = Cdm.onChainId("repo-close-out-" + cfg.partyId + "-" + System.nanoTime());
        if (!automatic) {
            store.recordDocument(closeOutId, "GmraDefaultNotice", "out", notice.hash(), notice.json());
            payloads.put(notice.hash(), notice.json(), callParties);
            noticeTx = gw.post("/repo-default/notice", Map.of("defaulting", other, "noticeHash", notice.hash())).path("txHash").asText();
            noticeHash = notice.hash();
        }
        store.recordDocument(closeOutId, "GmraCloseOutStatement", "out", st.hash(), st.json());
        payloads.put(st.hash(), st.json(), callParties);
        String payer = st.balance() == 0 ? "0x0000000000000000000000000000000000000000"
                : (st.payer().equals(myBank()) ? cfg.myAddress : other);
        JsonNode tx = gw.post("/repo-default/close-outs", Map.of("closeOutId", closeOutId, "defaulting", other, "noticeHash", noticeHash,
                "cdmHash", st.hash(), "cash", cfg.tokenAddress("tUSD"), "payer", payer, "amount", String.valueOf(st.balance())));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("closeOutId", closeOutId);
        out.put("cdmHash", st.hash());
        out.put("noticeHash", noticeHash.equals(ZERO_HASH) ? null : noticeHash);
        out.put("statement", statementView(st.statement()));
        out.put("defaultTx", defaultTx);
        out.put("noticeTx", noticeTx);
        out.put("closeOutTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    /** The party that owes a close-out balance pays it, after checking the statement. */
    private void payRepoCloseOut(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode c = null;
        for (JsonNode x : gw.getQuery("/repo-default/close-outs", Map.of("party", cfg.myAddress)))
            if (x.get("closeOutId").asText().equalsIgnoreCase(id)) c = x;
        if (c == null) throw new RuntimeException("no close-out " + id + " of this party");
        if (c.get("paid").asBoolean()) throw new RuntimeException("close-out " + id + " is paid");
        if (!c.get("payer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("this party does not owe the balance of close-out " + id);
        String hash = c.get("cdmHash").asText();
        String doc = payloads.get(hash);
        if (doc == null) throw new RuntimeException("the statement is not in the payload store");
        String problem = repoCloseOutProblem(c, closeOutStatement(hash), doc);
        if (problem != null) throw new RuntimeException("close-out " + id + ": " + problem);
        store.recordDocument(id, "GmraCloseOutStatement", "in", hash, doc);
        JsonNode tx = gw.post("/repo-default/close-outs/" + id + "/pay", Map.of("token", c.get("cash").asText(), "amount", c.get("amount").asText()));
        ctx.json(Map.of("closeOutId", id, "amount", c.get("amount").asText(), "payTx", tx.path("txHash").asText()));
    }

    // ---- GMSLA default close-out (task-gmsla-default-close-out, wp-adr-gmsla-default-close-out) ----
    // As the GMRA close-out above: the non-defaulting party's service builds the cdm-ext GmslaCloseOutStatement over every
    // open loan of the pair and the margin held under the pair's settled GMSLA calls, at the feed prices on its business
    // date, and records it on SecuritiesLoan; the other party's service rebuilds it from its own loan documents, the
    // chain's billed-through dates and margin, and the prices the statement states. Rules: task-sme-gmsla-default-rules.

    private final Map<String, cdmx.collateral.gmsla.GmslaCloseOutStatement> loanCloseOutDocs = new ConcurrentHashMap<>();

    /** The statement of an on-chain loan close-out from the payload store, parsed once; null if not in the store. */
    private cdmx.collateral.gmsla.GmslaCloseOutStatement loanCloseOutStatement(String hash) {
        var known = loanCloseOutDocs.get(hash);
        if (known != null) return known;
        String doc = payloads.get(hash);
        if (doc == null) return null;
        if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("the close-out document does not hash to the on-chain hash");
        var s = CdmLoanDefault.parse(doc);
        loanCloseOutDocs.put(hash, s);
        return s;
    }

    /** The GMSLA calls whose margin a recorded loan close-out of this party settled: margin views no longer count them. */
    private Set<String> loanCloseOutSettledCalls() {
        Set<String> out = new java.util.HashSet<>();
        for (JsonNode c : gw.getQuery("/loan-default/close-outs", Map.of("party", cfg.myAddress))) {
            var s = loanCloseOutStatement(c.get("cdmHash").asText());
            if (s != null) for (String id : CdmLoanDefault.settledCalls(s)) out.add(id.toLowerCase());
        }
        return out;
    }

    /** This party's open loans with the counterparty, as the contract closes them out. */
    private List<JsonNode> openLoansWithCounterparty() {
        String other = cfg.partyAddress(counterparty());
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode l : gw.getQuery("/loans", Map.of("party", cfg.myAddress))) {
            if (!l.get("state").asText().equals("open")) continue;
            if (l.get("lender").asText().equalsIgnoreCase(other) || l.get("borrower").asText().equalsIgnoreCase(other)) out.add(l);
        }
        return out;
    }

    /** The loans to close out, from this service's own checked documents, priced by `prices` (the loaned security's
     *  price and the collateral's). */
    private List<CdmLoanDefault.LoanInput> closeOutLoans(List<JsonNode> loans, java.util.function.Function<JsonNode, BigDecimal[]> prices) {
        List<CdmLoanDefault.LoanInput> out = new ArrayList<>();
        for (JsonNode l : loans) {
            String id = l.get("loanId").asText();
            LoanCurrent c = loanCurrent(l);
            if (c == null) throw new RuntimeException("the document of loan " + id + " is not in the payload store");
            String problem = loanProblem(l, c);
            if (problem != null) throw new RuntimeException("loan " + id + ": " + problem);
            var timeline = loanTimeline(l);
            int through = l.path("bill").path("billedThrough").asInt(0);
            LocalDate from = through == 0 ? timeline.get(0).date() : CdmRecall.fromYyyymmdd(through);
            BigDecimal[] p = prices.apply(l);
            out.add(new CdmLoanDefault.LoanInput(id, c.trade(), c.terms(), timeline, from, p[0], p[1]));
        }
        return out;
    }

    /** The feed prices of a loan's security and collateral (1 for tUSD). */
    private BigDecimal[] loanFeedPrices(JsonNode l) {
        String col = symbolByAddress.get(l.get("collateral").asText().toLowerCase());
        return new BigDecimal[]{loanFeedPrice(symbolByAddress.get(l.get("security").asText().toLowerCase())),
                "tUSD".equals(col) ? BigDecimal.ONE : loanFeedPrice(col)};
    }

    /** The margin each party holds net per asset under the pair's settled GMSLA calls, priced by `price` (asset code:
     *  the Base Currency for tUSD, the ISIN otherwise). `only` null: every call not yet closed out; otherwise just those
     *  calls (to check the close-out that settled them). */
    private List<CdmLoanDefault.MarginInput> closeOutGmslaMargin(String baseCurrency, java.util.function.Function<String, BigDecimal> price, Set<String> only) {
        Set<String> closedOut = only == null ? loanCloseOutSettledCalls() : Set.of();
        Map<String, Long> net = new LinkedHashMap<>();
        Map<String, List<String>> calls = new LinkedHashMap<>();
        String tUsd = cfg.tokenAddress("tUSD");
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int state = c.get("state").asInt();
            String callId = entry.get("callId").asText();
            if (only != null ? !only.contains(callId.toLowerCase())
                    : (c.get("kind").asInt() != 1 || (state != 5 && state != 6) || !isGmslaCall(callId) || closedOut.contains(callId.toLowerCase()))) continue;
            boolean received = c.get("from").asText().equalsIgnoreCase(cfg.myAddress);
            long pid = c.get("activeProposal").asLong() - 1;
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + pid + "/assets")) {
                String token = a.get("token").asText();
                String asset = token.equalsIgnoreCase(tUsd) ? baseCurrency : cfg.isin(symbolByAddress.get(token.toLowerCase()));
                net.merge(asset, received ? a.get("qty").asLong() : -a.get("qty").asLong(), Long::sum);
                calls.computeIfAbsent(asset, k -> new ArrayList<>());
                if (!calls.get(asset).contains(callId)) calls.get(asset).add(callId);
            }
        }
        List<CdmLoanDefault.MarginInput> out = new ArrayList<>();
        for (var e : net.entrySet()) {
            if (e.getValue() == 0) continue;
            boolean mine = e.getValue() > 0;
            out.add(new CdmLoanDefault.MarginInput(mine ? myBank() : counterpartyBank(), mine ? counterpartyBank() : myBank(), e.getKey(),
                    e.getKey().equals(baseCurrency), Math.abs(e.getValue()), price.apply(e.getKey()), calls.get(e.getKey())));
        }
        return out;
    }

    /** Whether the GMSLA terms elect automatic early termination for the counterparty's default. */
    private boolean gmslaAutomaticFor(String partyId) {
        var role = partyId.equals("A") ? cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_1 : cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_2;
        return CdmGmsla.automaticEarlyTermination(gmslaFold().terms().terms(), role);
    }

    private String gmslaBaseCurrency() {
        return CdmGmsla.gmsla(gmslaFold().terms().terms()).getBaseCurrency().getBaseCurrency().toDisplayString();
    }

    /** The close-out statement this party would record now as the non-defaulting party, at the feed prices. */
    private CdmLoanDefault.Statement loanCloseOutPreview(CdmLoanDefault.Notice notice) {
        String ccy = gmslaBaseCurrency();
        List<JsonNode> loans = openLoansWithCounterparty();
        if (loans.isEmpty()) throw new RuntimeException("no open loan with " + counterparty() + " to close out");
        return CdmLoanDefault.statement(notice.notice(), ccy, businessDate, closeOutLoans(loans, this::loanFeedPrices),
                closeOutGmslaMargin(ccy, a -> feedPriceOfAsset(a, ccy), null));
    }

    /** Whether a recorded loan close-out's statement is the one this party rebuilds from its own loan documents, the
     *  chain's billed-through dates and margin, and the prices the statement states; and the on-chain record matches. */
    private String loanCloseOutProblem(JsonNode c, cdmx.collateral.gmsla.GmslaCloseOutStatement s, String json) {
        String hash = c.get("cdmHash").asText();
        if (!Cdm.keccakHex(json).equalsIgnoreCase(hash)) return "the statement does not hash to the on-chain hash";
        String closeOutId = c.get("closeOutId").asText();
        List<JsonNode> loans = new ArrayList<>();
        for (JsonNode l : gw.getQuery("/loans", Map.of("party", cfg.myAddress)))
            if (l.get("state").asText().equals("closedOut") && l.path("closeOutId").asText().equalsIgnoreCase(closeOutId)) loans.add(l);
        if (loans.size() != s.getLoanValue().size()) return "the statement values " + s.getLoanValue().size() + " loans; the contract closed out " + loans.size();
        String ccy = s.getBaseCurrency();
        Set<String> own = new java.util.HashSet<>();
        for (String id : CdmLoanDefault.settledCalls(s)) own.add(id.toLowerCase());
        Map<String, BigDecimal> statedMarginPrice = new HashMap<>();
        for (var m : CdmLoanDefault.heldMargin(s)) statedMarginPrice.put(m.getAsset(), m.getPrice());
        List<CdmLoanDefault.MarginInput> margin = closeOutGmslaMargin(ccy, a -> statedMarginPrice.getOrDefault(a, BigDecimal.ONE), own);
        if (margin.size() != CdmLoanDefault.heldMargin(s).size()) return "the statement's margin is not the margin held under its calls";
        CdmLoanDefault.Statement rebuilt;
        try {
            rebuilt = CdmLoanDefault.statement(s.getNotice(), ccy, s.getValuationDate().toLocalDate(),
                    closeOutLoans(loans, l -> CdmLoanDefault.statedPrices(s, l.get("loanId").asText())), margin);
        } catch (RuntimeException ex) {
            return "the statement does not rebuild: " + ex.getMessage();
        }
        if (!rebuilt.hash().equalsIgnoreCase(hash)) return "the statement rebuilt from this party's loans differs";
        long amount = c.get("amount").asLong();
        if (amount != rebuilt.balance()) return "the on-chain balance is not the statement's";
        if (amount != 0 && !cfg.bankName(partyIdOf(c.get("payer").asText())).equals(rebuilt.payer())) return "the on-chain payer is not the statement's";
        return null;
    }

    /** The GMSLA default close-out view: the default status of both parties, the election, a preview when this party may
     *  close out, and the recorded close-outs with their verification and payment. */
    private void loanDefault(Context ctx) {
        String other = cfg.partyAddress(counterparty());
        boolean counterpartyInDefault = gw.get("/defaults/" + other).get("inDefault").asBoolean();
        boolean inDefault = gw.get("/defaults/" + cfg.myAddress).get("inDefault").asBoolean();
        boolean automatic = gmslaAutomaticFor(counterparty());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("businessDate", businessDate.toString());
        m.put("counterparty", counterparty());
        m.put("counterpartyInDefault", counterpartyInDefault);
        m.put("inDefault", inDefault);
        m.put("automaticEarlyTermination", automatic);
        m.put("baseCurrency", gmslaBaseCurrency());
        int open = openLoansWithCounterparty().size();
        m.put("openLoans", open);
        if (!inDefault && open > 0) {
            try {
                var n = CdmLoanDefault.notice(myBank(), counterpartyBank(), businessDate, businessDate, automatic);
                m.put("preview", CdmLoanDefault.view(loanCloseOutPreview(n).statement()));
            } catch (RuntimeException ex) {
                m.put("previewProblem", ex.getMessage());
            }
        }
        List<Map<String, Object>> closeOuts = new ArrayList<>();
        for (JsonNode c : gw.getQuery("/loan-default/close-outs", Map.of("party", cfg.myAddress))) {
            Map<String, Object> v = new LinkedHashMap<>();
            String hash = c.get("cdmHash").asText();
            v.put("closeOutId", c.get("closeOutId").asText());
            v.put("cdmHash", hash);
            v.put("nonDefaulting", partyIdOf(c.get("nonDefaulting").asText()));
            v.put("defaulting", partyIdOf(c.get("defaulting").asText()));
            v.put("amount", c.get("amount").asText());
            v.put("paid", c.get("paid").asBoolean());
            boolean owed = c.get("amount").asLong() > 0;
            v.put("payer", owed ? partyIdOf(c.get("payer").asText()) : null);
            v.put("toPay", owed && c.get("payer").asText().equalsIgnoreCase(cfg.myAddress) && !c.get("paid").asBoolean());
            v.put("noticeServed", !c.get("noticeHash").asText().equals(ZERO_HASH));
            String doc = payloads.get(hash);
            if (doc == null) {
                v.put("verified", false);
                v.put("problem", "the statement is not in the payload store");
            } else {
                try {
                    var s = loanCloseOutStatement(hash);
                    v.put("statement", CdmLoanDefault.view(s));
                    String problem = loanCloseOutProblem(c, s, doc);
                    v.put("verified", problem == null);
                    v.put("problem", problem);
                } catch (RuntimeException ex) {
                    v.put("verified", false);
                    v.put("problem", ex.getMessage());
                }
            }
            closeOuts.add(0, v);
        }
        m.put("closeOuts", closeOuts);
        ctx.json(m);
    }

    /** The non-defaulting party closes out every open loan with the counterparty. The default goes to the oracle
     *  service first when the feed does not show it. Without automatic early termination this service serves the
     *  Default Notice on-chain; the Early Termination Date and the prices are its business date's. */
    private void closeOutLoanDefault(Context ctx) {
        String other = cfg.partyAddress(counterparty());
        if (gw.get("/defaults/" + cfg.myAddress).get("inDefault").asBoolean())
            throw new RuntimeException("the oracle feed records this party in default; only the non-defaulting party closes out");
        if (openLoansWithCounterparty().isEmpty()) throw new RuntimeException("no open loan with " + counterparty() + " to close out");
        String defaultTx = null;
        if (!gw.get("/defaults/" + other).get("inDefault").asBoolean()) {
            JsonNode notified = oracle.post("/defaults", Map.of("party", other, "inDefault", true, "notifiedBy", myBank()));
            defaultTx = notified.path("tx").path("txHash").asText(null);
        }
        boolean automatic = gmslaAutomaticFor(counterparty());
        CdmLoanDefault.Notice notice = CdmLoanDefault.notice(myBank(), counterpartyBank(), businessDate, businessDate, automatic);
        CdmLoanDefault.Statement st = loanCloseOutPreview(notice);
        String noticeHash = ZERO_HASH, noticeTx = null;
        String closeOutId = Cdm.onChainId("loan-close-out-" + cfg.partyId + "-" + System.nanoTime());
        if (!automatic) {
            store.recordDocument(closeOutId, "GmslaDefaultNotice", "out", notice.hash(), notice.json());
            payloads.put(notice.hash(), notice.json(), callParties);
            noticeTx = gw.post("/loan-default/notice", Map.of("defaulting", other, "noticeHash", notice.hash())).path("txHash").asText();
            noticeHash = notice.hash();
        }
        store.recordDocument(closeOutId, "GmslaCloseOutStatement", "out", st.hash(), st.json());
        payloads.put(st.hash(), st.json(), callParties);
        loanCloseOutDocs.put(st.hash(), st.statement());
        String payer = st.balance() == 0 ? "0x0000000000000000000000000000000000000000"
                : (st.payer().equals(myBank()) ? cfg.myAddress : other);
        JsonNode tx = gw.post("/loan-default/close-outs", Map.of("closeOutId", closeOutId, "defaulting", other, "noticeHash", noticeHash,
                "cdmHash", st.hash(), "cash", cfg.tokenAddress("tUSD"), "payer", payer, "amount", String.valueOf(st.balance())));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("closeOutId", closeOutId);
        out.put("cdmHash", st.hash());
        out.put("noticeHash", noticeHash.equals(ZERO_HASH) ? null : noticeHash);
        out.put("statement", CdmLoanDefault.view(st.statement()));
        out.put("defaultTx", defaultTx);
        out.put("noticeTx", noticeTx);
        out.put("closeOutTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    /** The party that owes a loan close-out balance pays it, after checking the statement. */
    private void payLoanCloseOut(Context ctx) {
        String id = ctx.pathParam("id");
        JsonNode c = null;
        for (JsonNode x : gw.getQuery("/loan-default/close-outs", Map.of("party", cfg.myAddress)))
            if (x.get("closeOutId").asText().equalsIgnoreCase(id)) c = x;
        if (c == null) throw new RuntimeException("no loan close-out " + id + " of this party");
        if (c.get("paid").asBoolean()) throw new RuntimeException("close-out " + id + " is paid");
        if (!c.get("payer").asText().equalsIgnoreCase(cfg.myAddress)) throw new RuntimeException("this party does not owe the balance of close-out " + id);
        String hash = c.get("cdmHash").asText();
        String doc = payloads.get(hash);
        if (doc == null) throw new RuntimeException("the statement is not in the payload store");
        String problem = loanCloseOutProblem(c, loanCloseOutStatement(hash), doc);
        if (problem != null) throw new RuntimeException("close-out " + id + ": " + problem);
        store.recordDocument(id, "GmslaCloseOutStatement", "in", hash, doc);
        JsonNode tx = gw.post("/loan-default/close-outs/" + id + "/pay", Map.of("token", c.get("cash").asText(), "amount", c.get("amount").asText()));
        ctx.json(Map.of("closeOutId", id, "amount", c.get("amount").asText(), "payTx", tx.path("txHash").asText()));
    }

    // ---- reclaim after the secured party's default (two-way initial margin, wp-adr-two-way-im) ----

    /**
     * The pledgor takes back its whole escrow on the leg it pledges on once the oracle feed records its secured
     * party's default (the counterparty). The service values the escrow at the feed prices after the leg's haircuts,
     * builds the CDM CollateralReclaim (cdm-ext Create_CollateralReclaim), publishes it to the payload store, and
     * submits reclaim with its hash; the control contract checks the feed and returns every pledged token.
     */
    private void reclaim(Context ctx) {
        String[] lg = myLeg(true);
        String securedParty = lg[1];
        if (!gw.get("/defaults/" + securedParty).get("inDefault").asBoolean())
            throw new RuntimeException("the oracle feed does not record " + counterparty() + "'s default");
        Map<String, BigInteger> prices = feedPrices();
        List<Map<String, Object>> positions = new ArrayList<>();
        BigInteger value = BigInteger.ZERO;
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            String token = cfg.tokenAddress(sym);
            BigInteger qty = new BigInteger(gw.getQuery("/pledged", Map.of("token", token, "pledgor", lg[0], "securedParty", securedParty)).asText());
            if (qty.signum() == 0) continue;
            positions.add(Map.of("isin", cfg.isin(sym), "units", qty.longValueExact()));
            value = value.add(valueAfterHaircut(qty, prices.getOrDefault(token.toLowerCase(), BigInteger.ZERO), haircutBps(lg, sym)));
        }
        if (positions.isEmpty()) throw new RuntimeException("nothing is pledged by " + cfg.partyId + " to " + counterparty() + " to reclaim");
        String reclaimId = Cdm.onChainId("reclaim-" + cfg.partyId + "-" + System.nanoTime());
        CdmReclaim r = CdmReclaim.build(reclaimId, myBank(), counterpartyBank(), positions, value.divide(cfg.priceScale).longValueExact());
        store.recordDocument(reclaimId, "CollateralReclaim", "out", r.hash, r.json);
        payloads.put(r.hash, r.json, callParties);
        JsonNode tx = gw.post("/reclaims", Map.of("reclaimId", reclaimId, "securedParty", securedParty, "cdmHash", r.hash));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reclaimId", reclaimId);
        out.put("cdmHash", r.hash);
        out.put("reclaimedUsd", String.valueOf(value.divide(cfg.priceScale)));
        out.put("eventQualifier", r.reclaim.getEventQualifier());
        out.put("reclaimTx", tx.path("txHash").asText());
        ctx.json(out);
    }

    // ---- close-out netting on default (flow-close-out-netting, G15) ----

    /**
     * Close out after the pledgor's default (secured party only). The default notice goes to the oracle service first
     * when the feed does not show it yet (transitions 3-5). The service values the escrow after haircuts at the feed
     * prices, builds the CDM CloseOutStatement from the Close-out Amount the secured party gives (CloseOutNetting, ISDA
     * 2002 MA Section 6(e)), publishes it to the payload store, and submits closeOut with the statement's hash and the
     * Early Termination Amount owed (transition 6); the control contract applies the collateral and returns the surplus
     * (transition 7).
     */
    private void closeOut(Context ctx) {
        // On the leg the counterparty pledges on: this party is its secured party (wp-adr-two-way-im).
        Map<String, Object> b = body(ctx);
        long closeOutAmountUsd = ((Number) b.get("closeOutAmountUsd")).longValue();
        String pledgor = cfg.partyAddress(counterparty());
        String defaultTx = null;
        if (!gw.get("/defaults/" + pledgor).get("inDefault").asBoolean()) {
            JsonNode notice = oracle.post("/defaults", Map.of("party", pledgor, "inDefault", true, "notifiedBy", cfg.bankName(cfg.partyId)));
            defaultTx = notice.path("tx").path("txHash").asText(null);
        }
        BigInteger held = BigInteger.ZERO;
        Map<String, BigInteger> prices = feedPrices();
        for (Iterator<String> it = cfg.registry.get("tokens").fieldNames(); it.hasNext(); ) {
            String sym = it.next();
            String token = cfg.tokenAddress(sym);
            BigInteger qty = new BigInteger(gw.getQuery("/pledged", Map.of("token", token, "pledgor", pledgor, "securedParty", cfg.myAddress)).asText());
            if (qty.signum() > 0) held = held.add(valueAfterHaircut(qty, prices.getOrDefault(token.toLowerCase(), BigInteger.ZERO), haircutBps(myLeg(false), sym)));
        }
        if (held.signum() == 0) throw new RuntimeException("nothing is pledged by " + counterparty() + " to close out against");
        long heldUsd = held.divide(cfg.priceScale).longValueExact();
        CdmCloseOut c = CdmCloseOut.build(cfg.bankName(cfg.partyId), cfg.bankName(counterparty()), closeOutAmountUsd, heldUsd);
        long etaUsd = CdmCloseOut.usd(c.statement.getEarlyTerminationAmount());
        BigInteger owed = BigInteger.valueOf(Math.max(etaUsd, 0)).multiply(cfg.priceScale);
        String closeOutId = Cdm.onChainId("close-out-" + cfg.partyId + "-" + System.nanoTime());
        store.recordDocument(closeOutId, "CloseOutStatement", "out", c.hash, c.json);
        payloads.put(c.hash, c.json, callParties);
        JsonNode tx = gw.post("/close-outs", Map.of("closeOutId", closeOutId, "pledgor", pledgor, "owed", owed.toString(), "cdmHash", c.hash));
        Map<String, Object> out = new LinkedHashMap<>(statementSummary(c.statement));
        out.put("closeOutId", closeOutId);
        out.put("cdmHash", c.hash);
        out.put("closeOutTx", tx.path("txHash").asText());
        if (defaultTx != null) out.put("defaultTx", defaultTx);
        ctx.json(out);
    }

    private static Map<String, Object> statementSummary(cdmx.collateral.closeout.CloseOutStatement s) {
        Map<String, Object> m = new LinkedHashMap<>();
        long closeOutAmount = 0;
        if (s.getCloseOutAmount() != null) for (var a : s.getCloseOutAmount()) closeOutAmount += CdmCloseOut.usd(a.getAmount());
        m.put("closeOutAmountUsd", String.valueOf(closeOutAmount));
        m.put("earlyTerminationAmountUsd", String.valueOf(CdmCloseOut.usd(s.getEarlyTerminationAmount())));
        m.put("collateralHeldUsd", String.valueOf(CdmCloseOut.usd(s.getCollateralHeld())));
        m.put("collateralAppliedUsd", String.valueOf(CdmCloseOut.usd(s.getCollateralApplied())));
        m.put("amountPayableUsd", String.valueOf(CdmCloseOut.usd(s.getAmountPayable())));
        return m;
    }

    /**
     * The close-outs this party is in, from the ClosedOut events, each with its CDM CloseOutStatement fetched from the
     * payload store by the on-chain hash and checked: the hash matches and CloseOutNetting over the statement's inputs
     * gives the same statement (verified). Both parties check the same document.
     */
    private void closeOuts(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/close-outs", Map.of("party", cfg.myAddress))) {
            Map<String, Object> m = new LinkedHashMap<>();
            String hash = r.get("cdmHash").asText();
            m.put("closeOutId", r.get("closeOutId").asText());
            m.put("securedParty", partyIdOf(r.get("securedParty").asText()));
            m.put("pledgor", partyIdOf(r.get("pledgor").asText()));
            m.put("owedUsd", usd(r.get("owed").asText()));
            m.put("appliedUsd", usd(r.get("applied").asText()));
            m.put("cdmHash", hash);
            m.put("block", r.get("block").asText());
            String doc = payloads.get(hash);
            try {
                if (doc == null) throw new IllegalStateException("statement not readable in the payload store");
                if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("payload hash mismatch");
                m.putAll(statementSummary(CdmCloseOut.verify(doc)));
                m.put("verified", true);
            } catch (RuntimeException e) {
                m.put("verified", false);
                m.put("error", String.valueOf(e.getMessage()));
            }
            out.add(m);
        }
        ctx.json(out);
    }

    // ---- interest on cash collateral (flow-interest-on-cash, G17) ----

    private static final String[] INTEREST_STATE = {"none", "stated", "settled"};

    /**
     * State the Interest Amount on the pledgor's cash collateral for one Interest Period (secured party only). Interim
     * reduction (task-sme-interest-daily-balances): every day of the period has the tUSD now in escrow and the one
     * observed rate the secured party gives. The service builds the CDM CollateralInterestStatement
     * (Create_CollateralInterestStatement under the agreement's CollateralInterestParameters), publishes it to the
     * payload store and submits stateInterest with the transfer amount and the statement's hash; a positive amount is
     * paid to the pledgor in the same transaction (transitions 3-7).
     */
    private void stateInterest(Context ctx) {
        // On the leg the counterparty pledges on: this party holds its cash collateral (wp-adr-two-way-im).
        Map<String, Object> b = body(ctx);
        LocalDate start = LocalDate.parse(String.valueOf(b.get("periodStart")));
        LocalDate end = LocalDate.parse(String.valueOf(b.get("periodEnd")));
        BigDecimal rate = new BigDecimal(String.valueOf(b.get("observedRatePct"))).movePointLeft(2);
        String pledgor = cfg.partyAddress(counterparty());
        String cash = cfg.tokenAddress("tUSD");
        long balance = new BigInteger(gw.getQuery("/pledged", Map.of("token", cash, "pledgor", pledgor, "securedParty", cfg.myAddress)).asText()).longValueExact();
        if (balance == 0) throw new RuntimeException(counterparty() + " has no tUSD cash collateral in escrow");
        CdmInterest c = CdmInterest.build(cfg.bankName(cfg.partyId), cfg.bankName(counterparty()), start, end, balance, rate);
        long amount = CdmInterest.usd(c.statement.getTransferAmount());
        // Held for settlement netting (flow-settlement-netting; election netInterestWithMarginCalls): stated, not paid.
        boolean hold = Boolean.TRUE.equals(b.get("holdForNetting"));
        if (hold && amount == 0) throw new RuntimeException("an Interest Amount of zero has nothing to net");
        String interestId = Cdm.onChainId("interest-" + cfg.partyId + "-" + System.nanoTime());
        store.recordDocument(interestId, "CollateralInterestStatement", "out", c.hash, c.json);
        payloads.put(c.hash, c.json, callParties);
        JsonNode tx = gw.post("/interest", Map.of("interestId", interestId, "pledgor", pledgor, "cashToken", cash,
                "amount", String.valueOf(amount), "cdmHash", c.hash, "hold", hold));
        Map<String, Object> out = new LinkedHashMap<>(interestSummary(c.statement));
        out.put("interestId", interestId);
        out.put("cdmHash", c.hash);
        out.put("stateTx", tx.path("stated").path("txHash").asText());
        out.put("held", hold);
        ctx.json(out);
    }

    /** Pay a stated Interest Amount: the pledgor a negative one, the secured party a positive one held for netting. */
    private void payInterest(Context ctx) {
        JsonNode tx = gw.post("/interest/" + ctx.pathParam("id") + "/pay", Map.of());
        ctx.json(Map.of("payTx", tx.path("paid").path("txHash").asText()));
    }

    private static Map<String, Object> interestSummary(cdmx.collateral.interest.CollateralInterestStatement s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("periodStart", s.getPeriodStartDate().toString());
        m.put("periodEnd", s.getPeriodEndDate().toString());
        m.put("days", s.getAccrual().size());
        m.put("balanceUsd", s.getAccrual().get(0).getBalance().getValue().toPlainString());
        m.put("ratePct", s.getAccrual().get(0).getRate().movePointRight(2).stripTrailingZeros().toPlainString());
        m.put("interestAmountUsd", String.valueOf(CdmInterest.usd(s.getInterestAmount())));
        m.put("transferAmountUsd", String.valueOf(CdmInterest.usd(s.getTransferAmount())));
        m.put("handling", s.getHandling().toString());
        return m;
    }

    /**
     * The interest statements this party is in, from the InterestStated events, each with its CDM
     * CollateralInterestStatement fetched from the payload store by the on-chain hash and checked: the hash matches and
     * Create_CollateralInterestStatement over the statement's days gives the same statement (verified).
     */
    private void interestStatements(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/interest", Map.of("party", cfg.myAddress))) {
            Map<String, Object> m = new LinkedHashMap<>();
            String hash = r.get("cdmHash").asText();
            String stated = payloads.get(hash);
            if (stated != null && CdmRepoMargin.isStatement(stated)) continue; // Net Margin interest: see /repo-margin
            m.put("interestId", r.get("interestId").asText());
            m.put("securedParty", partyIdOf(r.get("securedParty").asText()));
            m.put("pledgor", partyIdOf(r.get("pledgor").asText()));
            m.put("amountUsd", r.get("amount").asText());
            m.put("state", INTEREST_STATE[r.get("state").asInt()]);
            m.put("cdmHash", hash);
            m.put("block", r.get("block").asText());
            Map<String, Object> known = interestVerified.get(hash + "/" + r.get("amount").asText());
            if (known != null) {
                m.putAll(known);
                out.add(m);
                continue;
            }
            Map<String, Object> checked = new LinkedHashMap<>();
            String doc = payloads.get(hash);
            try {
                if (doc == null) throw new IllegalStateException("statement not readable in the payload store");
                if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("payload hash mismatch");
                var st = CdmInterest.verify(doc);
                checked.putAll(interestSummary(st));
                checked.put("verified", String.valueOf(CdmInterest.usd(st.getTransferAmount())).equals(r.get("amount").asText()));
                if (!(Boolean) checked.get("verified")) checked.put("error", "the on-chain amount differs from the statement's transfer amount");
                interestVerified.put(hash + "/" + r.get("amount").asText(), checked); // a fetch failure is retried next time
            } catch (RuntimeException e) {
                checked.put("verified", false);
                checked.put("error", String.valueOf(e.getMessage()));
            }
            m.putAll(checked);
            out.add(m);
        }
        ctx.json(out);
    }

    // ---- settlement netting (flow-settlement-netting, task-csa-settlement-netting) ----
    // Scope is the project owner's choice of 2026-11-06; the rules are assumptions awaiting a business SME
    // (task-sme-settlement-netting-rules). Initial margin is segregated in escrow and does not net.

    /** One movement that can be netted: an agreed VM call or return call, or a held Interest Amount (whole USD, tUSD). */
    private record Movement(String id, String kind, String type, String payer, String receiver, long usd, Long proposalId) {
        Map<String, Object> summary() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("kind", kind);
            m.put("type", type);
            m.put("payer", payer);
            m.put("receiver", receiver);
            m.put("amountUsd", String.valueOf(usd));
            return m;
        }
    }

    /**
     * The movements between this party and its counterparty that settlement netting can settle now: VM calls agreed
     * with an accepted proposal of tUSD alone, return calls agreed for a whole tUSD amount (settled as a VM return by
     * transfer), and Interest Amounts held for netting. IM calls and calls with a pending cancellation request are left
     * out. On a VM call and on a return call the called party pays the calling party.
     */
    private List<Movement> nettable() {
        String cash = cfg.tokenAddress("tUSD");
        BigInteger price = feedPrices().get(cash.toLowerCase());
        List<Movement> out = new ArrayList<>();
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int kind = c.get("kind").asInt(), st = c.get("state").asInt();
            if (kind == 0 || !(st == 2 || st == 3)) continue;
            if (!c.path("cancellationRequestedBy").asText(ZERO_ADDRESS).equalsIgnoreCase(ZERO_ADDRESS)) continue;
            String callId = entry.get("callId").asText();
            String payer = partyIdOf(c.get("to").asText()), receiver = partyIdOf(c.get("from").asText());
            if (kind == 1) {
                long active = c.get("activeProposal").asLong();
                if (active == 0) continue;
                long pid = active - 1;
                if (gw.get("/calls/" + callId + "/proposals/" + pid + "/state").asInt() != 2) continue;
                JsonNode assets = gw.get("/calls/" + callId + "/proposals/" + pid + "/assets");
                if (assets.size() != 1 || !assets.get(0).get("token").asText().equalsIgnoreCase(cash)) continue;
                out.add(new Movement(callId, "VM", "DeliveryAmount", payer, receiver, assets.get(0).get("qty").asLong(), pid));
            } else {
                if (price == null || price.signum() == 0) continue;
                BigInteger[] qr = new BigInteger(c.get("agreed").asText()).divideAndRemainder(price);
                if (qr[1].signum() != 0 || qr[0].signum() == 0) continue;
                out.add(new Movement(callId, "Return", "ReturnAmount", payer, receiver, qr[0].longValueExact(), null));
            }
        }
        for (JsonNode r : gw.getQuery("/interest", Map.of("party", cfg.myAddress))) {
            if (r.get("state").asInt() != 1 || !r.get("cashToken").asText().equalsIgnoreCase(cash)) continue;
            long amount = Long.parseLong(r.get("amount").asText());
            String sp = partyIdOf(r.get("securedParty").asText()), pl = partyIdOf(r.get("pledgor").asText());
            out.add(new Movement(r.get("interestId").asText(), "Interest", "InterestAmount", amount < 0 ? pl : sp,
                    amount < 0 ? sp : pl, Math.abs(amount), null));
        }
        return out;
    }

    /** What this party owes on the movements less what it is owed: positive when it pays the net. */
    private long netFor(List<Movement> xs) {
        long net = 0;
        for (Movement m : xs) net += m.payer().equals(cfg.partyId) ? m.usd() : -m.usd();
        return net;
    }

    private void nettingCandidates(Context ctx) {
        List<Movement> xs = nettable();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Movement m : xs) rows.add(m.summary());
        long net = netFor(xs);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("movements", rows);
        out.put("netUsd", String.valueOf(Math.abs(net)));
        out.put("payer", net > 0 ? cfg.partyId : net < 0 ? counterparty() : null);
        ctx.json(out);
    }

    /**
     * Settle the chosen movements (all nettable ones when none are named) by one transfer of tUSD (transitions 1-6). The
     * service builds the CDM SettlementNettingStatement (Create_SettlementNetting) and, per call, the SettleCall step
     * naming the netting; publishes them to the payload store; and submits settleNetted with their hashes. Only the
     * party that owes the net settles (either party when the movements offset).
     */
    @SuppressWarnings("unchecked")
    private void settleNetting(Context ctx) {
        Map<String, Object> b = body(ctx);
        List<String> callIds = (List<String>) b.get("callIds");
        List<String> interestIds = (List<String>) b.get("interestIds");
        List<Movement> all = nettable();
        List<Movement> chosen = new ArrayList<>();
        if (callIds == null && interestIds == null) {
            chosen.addAll(all);
        } else {
            List<String> wanted = new ArrayList<>();
            if (callIds != null) wanted.addAll(callIds);
            if (interestIds != null) wanted.addAll(interestIds);
            for (String id : wanted) {
                Movement m = all.stream().filter(x -> x.id().equalsIgnoreCase(id)).findFirst()
                        .orElseThrow(() -> new RuntimeException("not nettable now: " + id));
                if (!chosen.contains(m)) chosen.add(m);
            }
        }
        List<Movement> calls = chosen.stream().filter(m -> !m.kind().equals("Interest")).toList();
        List<Movement> interest = chosen.stream().filter(m -> m.kind().equals("Interest")).toList();
        if (calls.isEmpty() || chosen.size() < 2)
            throw new RuntimeException("settlement netting needs at least two movements, one of them a VM call or return");
        long net = netFor(chosen);
        if (net < 0) throw new RuntimeException(counterparty() + " owes the net amount (USD " + (-net) + "); its party settles");

        String nettingId = Cdm.onChainId("netting-" + cfg.partyId + "-" + System.nanoTime());
        List<CdmNetting.Item> items = new ArrayList<>();
        for (Movement m : chosen)
            items.add(new CdmNetting.Item(m.id(), m.type(), cfg.bankName(m.payer()), cfg.bankName(m.receiver()), m.usd()));
        CdmNetting n = CdmNetting.build(nettingId, LocalDate.now(java.time.ZoneOffset.UTC), items);

        List<String> callHashes = new ArrayList<>();
        for (Movement m : calls) {
            Cdm settle = m.kind().equals("VM")
                    ? Cdm.settle("P-" + m.proposalId(), nettingId)
                    : Cdm.settleReturn(List.of(new LinkedHashMap<>(Map.of("isin", cfg.isin("tUSD"), "units", m.usd()))), m.usd(), nettingId);
            record(m.id(), "SettleCall", settle);
            callHashes.add(settle.hash);
        }
        store.recordDocument(nettingId, "SettlementNettingStatement", "out", n.hash, n.json);
        payloads.put(n.hash, n.json, callParties);
        JsonNode tx = gw.post("/nettings", Map.of("nettingId", nettingId,
                "callIds", calls.stream().map(Movement::id).toList(), "callCdmHashes", callHashes,
                "interestIds", interest.stream().map(Movement::id).toList(),
                "cashToken", cfg.tokenAddress("tUSD"), "cdmHash", n.hash, "amount", String.valueOf(net)));
        Map<String, Object> out = new LinkedHashMap<>(nettingSummary(n.statement));
        out.put("nettingId", nettingId);
        out.put("cdmHash", n.hash);
        out.put("settleTx", tx.path("settled").path("txHash").asText());
        ctx.json(out);
    }

    private Map<String, Object> nettingSummary(cdmx.collateral.netting.SettlementNettingStatement s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("settlementDate", s.getSettlementDate().toString());
        m.put("netUsd", String.valueOf(CdmInterest.usd(s.getNetAmount())));
        m.put("payer", s.getPayer() == null ? null : cfg.partyIdOfBank(CdmNetting.partyName(s.getPayer())));
        m.put("receiver", s.getReceiver() == null ? null : cfg.partyIdOfBank(CdmNetting.partyName(s.getReceiver())));
        List<Map<String, Object>> obligations = new ArrayList<>();
        for (var o : s.getObligations()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", o.getReference());
            r.put("type", o.getObligationType().toString());
            r.put("payer", cfg.partyIdOfBank(CdmNetting.partyName(o.getPayer())));
            r.put("receiver", cfg.partyIdOfBank(CdmNetting.partyName(o.getReceiver())));
            r.put("amountUsd", String.valueOf(CdmInterest.usd(o.getAmount())));
            obligations.add(r);
        }
        m.put("movements", obligations);
        return m;
    }

    /**
     * The nettings this party is in, from the SettlementNetted events, each with its CDM SettlementNettingStatement
     * fetched from the payload store by the on-chain hash and checked: the hash matches, Create_SettlementNetting over
     * the statement's obligations gives the same statement, the net and its payer match the chain, and the statement's
     * obligations are the calls and interest statements the contract settled (verified).
     */
    private void nettings(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode r : gw.getQuery("/nettings", Map.of("party", cfg.myAddress))) {
            Map<String, Object> m = new LinkedHashMap<>();
            String hash = r.get("cdmHash").asText();
            long amount = Long.parseLong(r.get("amount").asText());
            m.put("nettingId", r.get("nettingId").asText());
            m.put("settledBy", partyIdOf(r.get("settledBy").asText()));
            m.put("counterparty", partyIdOf(r.get("counterparty").asText()));
            m.put("amountUsd", String.valueOf(amount));
            m.put("cdmHash", hash);
            m.put("block", r.get("block").asText());
            String doc = payloads.get(hash);
            try {
                if (doc == null) throw new IllegalStateException("statement not readable in the payload store");
                if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new IllegalStateException("payload hash mismatch");
                var st = CdmNetting.verify(doc);
                m.putAll(nettingSummary(st));
                Set<String> onChain = new java.util.HashSet<>();
                for (JsonNode x : r.get("callIds")) onChain.add(x.asText().toLowerCase());
                for (JsonNode x : r.get("interestIds")) onChain.add(x.asText().toLowerCase());
                Set<String> inStatement = new java.util.HashSet<>();
                for (var o : st.getObligations()) inStatement.add(o.getReference().toLowerCase());
                String problem = null;
                if (CdmInterest.usd(st.getNetAmount()) != amount) problem = "the on-chain amount differs from the statement's net amount";
                else if (amount > 0 && !String.valueOf(m.get("payer")).equals(m.get("settledBy"))) problem = "the statement's payer did not settle";
                else if (!onChain.equals(inStatement)) problem = "the statement's movements differ from those settled on-chain";
                m.put("verified", problem == null);
                if (problem != null) m.put("error", problem);
            } catch (RuntimeException e) {
                m.put("verified", false);
                m.put("error", String.valueOf(e.getMessage()));
            }
            out.add(m);
        }
        ctx.json(out);
    }

    // ---- substitution of pledged initial margin (flow-substitution, G16) ----

    private static final String[] SUBSTITUTION_STATE = {"none", "requested", "consented", "refused", "settled"};
    private final Map<String, FoldCache> substitutionCache = new ConcurrentHashMap<>();

    private boolean substitutionInvolvesMe(String id) {
        JsonNode s = gw.get("/substitutions/" + id).get("substitution");
        return s.get("pledgor").asText().equalsIgnoreCase(cfg.myAddress) || s.get("securedParty").asText().equalsIgnoreCase(cfg.myAddress);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> assetsIn(Map<String, Object> b, String key) {
        List<Map<String, Object>> xs = (List<Map<String, Object>>) b.get(key);
        if (xs == null || xs.isEmpty()) throw new RuntimeException(key + " is empty");
        return xs;
    }

    private List<Map<String, Object>> gwAssets(List<Map<String, Object>> xs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> a : xs) out.add(Map.of("token", cfg.tokenAddress((String) a.get("token")), "qty", String.valueOf(((Number) a.get("qty")).longValue())));
        return out;
    }

    private List<Map<String, Object>> cdmAssets(List<Map<String, Object>> xs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> a : xs) out.add(new LinkedHashMap<>(Map.of("isin", cfg.isin((String) a.get("token")), "units", ((Number) a.get("qty")).longValue())));
        return out;
    }

    /**
     * The pledgor gives notice of a substitution (transitions 1-4): the escrowed items it asks back and the substitute it
     * offers, each valued after haircuts at the feed prices. The CDM SubstitutionInstruction (request) goes to the payload
     * store and its hash on-chain with the request.
     */
    private void requestSubstitution(Context ctx) {
        // On the leg this party pledges on (wp-adr-two-way-im).
        Map<String, Object> b = body(ctx);
        List<Map<String, Object>> original = assetsIn(b, "original");
        List<Map<String, Object>> substitute = assetsIn(b, "substitute");
        long originalUsd = valueOf(myLeg(true), original).divide(cfg.priceScale).longValueExact();
        long substituteUsd = valueOf(myLeg(true), substitute).divide(cfg.priceScale).longValueExact();
        String id = Cdm.onChainId("substitution-" + cfg.partyId + "-" + System.nanoTime());
        CdmSubstitution req = CdmSubstitution.request(id, cdmAssets(original), originalUsd, cdmAssets(substitute), substituteUsd);
        store.recordDocument(id, "SubstitutionRequest", "out", req.hash, req.json);
        payloads.put(req.hash, req.json, callParties);
        gw.post("/substitutions", Map.of("substitutionId", id, "securedParty", cfg.partyAddress(counterparty()),
                "original", gwAssets(original), "substitute", gwAssets(substitute), "cdmHash", req.hash));
        ctx.json(Map.of("substitutionId", id, "cdmHash", req.hash, "originalUsd", String.valueOf(originalUsd), "substituteUsd", String.valueOf(substituteUsd)));
    }

    /** The secured party consents or refuses (transitions 5-8), under the agreement's consent election. */
    private void decideSubstitution(Context ctx) {
        String id = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        boolean consent = Boolean.TRUE.equals(b.get("consent"));
        if (consent) {
            List<String> symbols = new ArrayList<>();
            for (JsonNode a : gw.get("/substitutions/" + id).path("substitute"))
                symbols.add(symbolByAddress.get(a.get("token").asText().toLowerCase()));
            requireProvenance(symbols);
        }
        CdmSubstitution d = CdmSubstitution.consent(id, consent, (String) b.get("reason"));
        store.recordDocument(id, "SubstitutionConsent", "out", d.hash, d.json);
        payloads.put(d.hash, d.json, callParties);
        gw.post("/substitutions/" + id + "/decision", Map.of("consent", consent, "cdmHash", d.hash));
        ctx.json(Map.of("ok", true, "decision", consent ? "consented" : "refused", "cdmHash", d.hash));
    }

    /** The pledgor settles a consented substitution (transitions 9-12): substitute into escrow, originals back. */
    private void settleSubstitution(Context ctx) {
        String id = ctx.pathParam("id");
        CdmSubstitution st = CdmSubstitution.settle(id);
        store.recordDocument(id, "SubstitutionSettle", "out", st.hash, st.json);
        payloads.put(st.hash, st.json, callParties);
        gw.post("/substitutions/" + id + "/settle", Map.of("cdmHash", st.hash));
        ctx.json(Map.of("ok", true, "cdmHash", st.hash));
    }

    private List<Map<String, Object>> symbolAssets(JsonNode xs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode a : xs) out.add(new LinkedHashMap<>(Map.of(
                "token", symbolByAddress.getOrDefault(a.get("token").asText().toLowerCase(), a.get("token").asText()), "qty", a.get("qty").asText())));
        return out;
    }

    /** The substitutions this party is in, with their on-chain state, assets and CDM fold. */
    private void substitutions(Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode entry : gw.getQuery("/substitutions", Map.of("party", cfg.myAddress))) {
            String id = entry.get("substitutionId").asText();
            JsonNode full = gw.get("/substitutions/" + id);
            JsonNode s = full.get("substitution");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("substitutionId", id);
            m.put("pledgor", partyIdOf(s.get("pledgor").asText()));
            m.put("securedParty", partyIdOf(s.get("securedParty").asText()));
            m.put("state", SUBSTITUTION_STATE[s.get("state").asInt()]);
            m.put("original", symbolAssets(full.get("original")));
            m.put("substitute", symbolAssets(full.get("substitute")));
            m.put("cdm", substitutionStateFor(id));
            m.put("messages", store.messagesFor(id));
            out.add(m);
        }
        ctx.json(out);
    }

    /**
     * The CDM fold of one substitution (wp-adr-cdm-payload-carrier): the on-chain ordered step hashes, each document
     * fetched from the payload store and checked against its hash, folded through Create_CollateralSubstitution with the
     * portfolio both parties read at the block before each step. Cached once every step is folded.
     */
    private Map<String, Object> substitutionStateFor(String id) {
        JsonNode steps = gw.get("/substitutions/" + id + "/steps");
        StringBuilder sig = new StringBuilder();
        for (JsonNode st : steps) sig.append(st.get("cdmHash").asText()).append(';');
        FoldCache cached = substitutionCache.get(id);
        if (cached != null && cached.sig().equals(sig.toString())) return cached.result();

        JsonNode sub = gw.get("/substitutions/" + id).get("substitution");
        String pledgor = sub.get("pledgor").asText(), securedParty = sub.get("securedParty").asText();
        List<CdmSubstitution.Step> fold = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (JsonNode st : steps) {
            names.add(st.get("step").asText());
            String hash = st.get("cdmHash").asText();
            String doc = payloads.get(hash);
            if (doc == null) break; // committed on-chain, not yet readable here
            if (!Cdm.keccakHex(doc).equalsIgnoreCase(hash)) throw new RuntimeException("payload hash mismatch for substitution step " + st.get("step").asText());
            long before = st.get("block").asLong() - 1;
            fold.add(new CdmSubstitution.Step(doc, portfolioAt(id, pledgor, securedParty, before), st.get("timestamp").asLong()));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalSteps", steps.size());
        result.put("foldedSteps", fold.size());
        result.put("steps", names);
        boolean converged = steps.size() > 0 && fold.size() == steps.size();
        if (fold.isEmpty()) {
            result.put("status", "none");
        } else {
            try {
                var events = CdmSubstitution.fold(id, fold);
                var last = events.get(events.size() - 1);
                String json = CdmRuntime.toJson(last);
                store.saveState(id, json);
                result.put("status", String.valueOf(last.getAfter().getStatus()));
                result.put("qualifiers", events.stream().map(e -> String.valueOf(e.getEventQualifier())).toList());
                result.put("stateHash", Cdm.keccakHex(json)); // same documents and chain -> same hash on both parties
            } catch (RuntimeException e) {
                converged = false;
                result.put("status", "invalid");
                result.put("error", String.valueOf(e.getMessage()));
            }
        }
        result.put("converged", converged);
        if (converged) substitutionCache.put(id, new FoldCache(sig.toString(), result));
        return result;
    }

    /**
     * The CDM portfolio of the pledgor's escrow with the secured party at the end of a block, valued after haircuts. Read
     * once from this party's node and kept in the store: the node serves state for recent blocks only.
     */
    private cdm.event.common.CollateralPortfolio portfolioAt(String substitutionId, String pledgor, String securedParty, long block) {
        String kept = store.portfolioAt(substitutionId, block);
        try {
            if (kept != null) return CdmRuntime.JSON.readValue(kept, cdm.event.common.CollateralPortfolio.class);
        } catch (Exception e) {
            throw new RuntimeException("stored portfolio unreadable: " + e.getMessage(), e);
        }
        cdm.event.common.CollateralPortfolio p = readPortfolioAt(pledgor, securedParty, block);
        store.savePortfolioAt(substitutionId, block, CdmRuntime.toJson(p));
        return p;
    }

    private cdm.event.common.CollateralPortfolio readPortfolioAt(String pledgor, String securedParty, long block) {
        JsonNode escrow = gw.getQuery("/escrow-at", Map.of("pledgor", pledgor, "securedParty", securedParty, "block", String.valueOf(block)));
        List<Map<String, Object>> positions = new ArrayList<>();
        BigInteger value = BigInteger.ZERO;
        for (JsonNode t : escrow) {
            BigInteger qty = new BigInteger(t.get("qty").asText());
            if (qty.signum() == 0) continue;
            String sym = symbolByAddress.get(t.get("token").asText().toLowerCase());
            if (sym == null) throw new RuntimeException("token " + t.get("token").asText() + " is not in the registry");
            positions.add(Map.of("isin", cfg.isin(sym), "units", qty.longValueExact()));
            if (!t.get("price").isNull()) value = value.add(valueAfterHaircut(qty, new BigInteger(t.get("price").asText()), haircutBps(new String[]{pledgor, securedParty}, sym)));
        }
        return CdmSubstitution.portfolio(positions, value.divide(cfg.priceScale).longValueExact(),
                cfg.bankName(partyIdOf(pledgor)), cfg.bankName(partyIdOf(securedParty)));
    }
}
