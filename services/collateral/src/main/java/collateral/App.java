package collateral;

import cdmx.collateral.margincall.MarginCallState;
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
import java.util.List;
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
                            onLedgerEvent(data);
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
                if (event.equals("ClosedOut")) {
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
     *  registry's haircuts (the deployed global schedule). */
    private synchronized CdmAgreement.Terms baselineTerms(String[] ps) {
        return baselineTerms.computeIfAbsent(legKey(ps), k -> {
            Map<String, Integer> h = new LinkedHashMap<>();
            cfg.registry.get("tokens").fieldNames().forEachRemaining(sym ->
                    h.put(cfg.isin(sym), cfg.registry.get("tokens").get(sym).get("haircutBps").asInt()));
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
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) out.add(0, repoView(r));
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

    private final Map<String, Boolean> gmraCalls = new ConcurrentHashMap<>();

    /** Whether a call's anchored issuance names the GMRA (a known answer is kept: a call's issuance never changes). */
    private boolean isGmraCall(String callId) {
        Boolean known = gmraCalls.get(callId.toLowerCase());
        if (known != null) return known;
        // The gateway's log scan and the payload store can lag the mined issuance by a moment.
        for (int attempt = 0; attempt < 5; attempt++) {
            JsonNode steps = gw.get("/calls/" + callId + "/steps");
            String hash = steps.isEmpty() ? null : steps.get(0).get("cdmHash").asText();
            String doc = hash == null ? null : payloads.get(hash);
            if (doc != null && Cdm.keccakHex(doc).equalsIgnoreCase(hash)) {
                boolean gmra = CdmRepoMargin.isGmraIssue(doc);
                gmraCalls.put(callId.toLowerCase(), gmra);
                return gmra;
            }
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return false;
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
        m.put("repriceOffered", replacementPending("reprice", true));
        m.put("repriceToAgree", replacementPending("reprice", false));
        m.put("adjustOffered", replacementPending("adjustment", true));
        m.put("adjustToAgree", replacementPending("adjustment", false));
        m.put("substitutionsPending", substitutionsPending());
        m.put("paymentsPending", paymentsPending());
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
        if (replacementsPending() > 0) throw new RuntimeException("a reprice, adjustment, substitution or payment between the parties is still pending");
        RepoMarginState s = repoMarginState();
        long amountUsd = CdmRepoMargin.callAmount(s.net(), gmraMta(cfg.partyId));
        if (amountUsd == 0) throw new RuntimeException("the Net Exposure " + s.net().toPlainString() + " does not exceed the minimum transfer amount");
        long deadline = System.currentTimeMillis() / 1000 + 86400L * Math.max(1, gmraFold().terms().terms().getElections().getMarginTransfer().getTransferBusinessDays());
        String callId = Cdm.onChainId(cfg.partyId + "-gmra-" + System.nanoTime());
        Cdm cdm = Cdm.issue(Cdm.cdmCallId(callId), cfg.bankName(cfg.partyId), amountUsd, "Delivery", null, "VM", true);
        record(callId, "IssueCall", cdm);
        gmraCalls.put(callId.toLowerCase(), true);
        gw.post("/calls", new LinkedHashMap<>(Map.of("callId", callId, "kind", CALL_KIND.get("VM"), "to", cfg.partyAddress(counterparty()),
                "amount", BigInteger.valueOf(amountUsd).multiply(cfg.priceScale).toString(), "deadline", deadline, "cdmHash", cdm.hash)));
        ctx.json(Map.of("callId", callId, "cdmHash", cdm.hash, "amountUsd", amountUsd, "settlementMethod", "TitleTransfer"));
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

    /** The purchased repos with a pending instruction of this kind ("reprice" or "adjustment") from this party (mine) or
     *  from the counterparty. */
    private int replacementPending(String kind, boolean mine) {
        int n = 0;
        for (JsonNode r : gw.getQuery("/repos", Map.of("party", cfg.myAddress))) {
            if (!r.get("state").asText().equals("purchased")) continue;
            boolean seller = r.get("seller").asText().equalsIgnoreCase(cfg.myAddress);
            if (!pendingHash(r, kind, mine ? seller : !seller).equals(ZERO_HASH)) n++;
        }
        return n;
    }

    private int replacementsPending() {
        return replacementPending("reprice", true) + replacementPending("reprice", false)
                + replacementPending("adjustment", true) + replacementPending("adjustment", false)
                + substitutionsPending() + paymentsPending();
    }

    private int paymentsPending() {
        return replacementPending("interimInterest", true) + replacementPending("interimInterest", false)
                + replacementPending("income", true) + replacementPending("income", false)
                + replacementPending("roll", true) + replacementPending("roll", false);
    }

    private int substitutionsPending() {
        return replacementPending("substitution", true) + replacementPending("substitution", false);
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
        if (replacementPending("reprice", false) + replacementPending("adjustment", false) > 0) throw new RuntimeException("the counterparty has made an offer: agree to it");
        if (substitutionsPending() + paymentsPending() > 0) throw new RuntimeException("a substitution or payment between the parties is still pending");
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
                    "dti", t.get("dti").asText(), "haircutBps", haircutBps(legParam(null), sym))));
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
        if (cached != null && cached.sig().equals(sig.toString())) return cached.result();

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
        return result;
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
        boolean gmra = isGmraCall(callId);
        if (gmra && response.equals("full")) checkGmraCallAmount(c);
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
                Cdm.regMarginType(CALL_KIND_NAME[c.get("kind").asInt()]), gmra);
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
        if (isGmraCall(callId)) {
            List<Map.Entry<String, Long>> proposed = new ArrayList<>();
            for (Map<String, Object> a : assetsIn) proposed.add(Map.entry((String) a.get("token"), ((Number) a.get("qty")).longValue()));
            checkGmraCoverage(proposed, agreedUsd);
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
        if (accept && isGmraCall(callId)) {
            List<Map.Entry<String, Long>> proposed = new ArrayList<>();
            for (JsonNode a : gw.get("/calls/" + callId + "/proposals/" + proposalId + "/assets"))
                proposed.add(Map.entry(symbolByAddress.get(a.get("token").asText().toLowerCase()), a.get("qty").asLong()));
            checkGmraCoverage(proposed, new BigInteger(gw.get("/calls/" + callId).get("agreed").asText()).divide(cfg.priceScale).longValue());
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
        JsonNode enforced = gw.post("/calls/" + callId + "/enforce", Map.of());
        ctx.json(new LinkedHashMap<>(Map.of("ok", true, "pledgor", pledgor,
                "defaultTx", notice.path("tx").path("txHash").asText(), "enforceTx", enforced.path("txHash").asText())));
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
