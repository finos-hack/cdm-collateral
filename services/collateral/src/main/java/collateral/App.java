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
            if (doc != null && Cdm.keccakHex(doc).equalsIgnoreCase(hash)) {
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
                Cdm.regMarginType(CALL_KIND_NAME[c.get("kind").asInt()]));
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
