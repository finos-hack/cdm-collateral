package collateral;

import cdmx.collateral.margincall.MarginCallState;
import com.fasterxml.jackson.databind.JsonNode;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.sse.SseClient;

import java.math.BigInteger;
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
    private static final Map<String, Integer> RESPONSE = Map.of("full", 0, "partial", 1, "dispute", 2);
    private static final String[] CALL_STATE = {"none", "issued", "agreed", "partially agreed", "disputed", "settled", "settled (agreed part)"};
    private static final String[] PROPOSAL_STATE = {"none", "proposed", "accepted", "rejected"};

    private final Config cfg;
    private final Store store;
    private final Gateway gw;
    private final Gateway oracle; // the shared oracle service (service-to-oracle), same JSON conventions
    private final PayloadStore payloads;
    private final List<String> callParties; // reader allowlist for stored docs: both counterparties (A, B)
    private final Map<String, String> symbolByAddress; // lowercase address -> symbol
    private final Map<String, FoldCache> foldCache = new ConcurrentHashMap<>();
    private final Set<SseClient> sseClients = ConcurrentHashMap.newKeySet(); // console clients subscribed to live events

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
        app.post("/api/v1/calls/{id}/decision", this::decide);
        app.post("/api/v1/calls/{id}/pledge", this::pledge);
        app.post("/api/v1/calls/{id}/transfer", this::transfer);
        app.post("/api/v1/calls/{id}/return", this::returnCollateral);
        app.post("/api/v1/calls/{id}/enforce", this::enforce);
        app.get("/api/v1/close-outs", this::closeOuts);
        app.post("/api/v1/close-outs", this::closeOut);
        app.get("/api/v1/substitutions", this::substitutions);
        app.post("/api/v1/substitutions", this::requestSubstitution);
        app.post("/api/v1/substitutions/{id}/decision", this::decideSubstitution);
        app.post("/api/v1/substitutions/{id}/settle", this::settleSubstitution);
        app.get("/api/v1/substitutions/{id}/cdm-state", ctx -> ctx.json(substitutionStateFor(ctx.pathParam("id"))));
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
                            onLedgerEvent(data);
                            for (SseClient c : sseClients) {
                                try { c.sendEvent("step", data); } catch (Exception ignored) { }
                            }
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

    /**
     * Act on one pushed chain event before relaying it. Returned, Enforced and DefaultPublished are recorded in this
     * party's store (flow-return transition 14, flow-default-enforcement transition 8: the pledgor's service records the
     * default and each service records the enforcement). A SettleCall step is folded at once, so each service holds the
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
                } else if (event.startsWith("Substitution")) {
                    String id = e.get("substitutionId").asText();
                    if (substitutionInvolvesMe(id)) {
                        store.recordEvent(event, id, party, block, logIndex, data);
                        if (event.equals("SubstitutionSettled")) substitutionStateFor(id);
                    }
                } else if (event.equals("DefaultPublished") || involvesMe(callId)) {
                    store.recordEvent(event, callId, party, block, logIndex, data);
                }
            } else if ("SettleCall".equals(e.path("step").asText()) && involvesMe(e.path("callId").asText(null))) {
                cdmStateFor(e.get("callId").asText());
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

    private String counterparty() {
        return cfg.partyId.equals("B") ? "A" : "B";
    }

    /** {pledgor, secured party} addresses between this party and its counterparty. */
    private String[] pledgorAndSecuredParty() {
        String cpAddr = cfg.partyAddress(counterparty());
        return cfg.role.equals("Pledgor") ? new String[]{cfg.myAddress, cpAddr} : new String[]{cpAddr, cfg.myAddress};
    }

    /** The feed price of every registry token that has one, by lowercase address (scaled by priceScale). */
    private Map<String, BigInteger> feedPrices() {
        Map<String, BigInteger> priceByToken = new HashMap<>();
        for (JsonNode pr : gw.get("/prices").get("prices")) {
            if (!pr.get("price").isNull()) priceByToken.put(pr.get("token").asText().toLowerCase(), new BigInteger(pr.get("price").asText()));
        }
        return priceByToken;
    }

    private int haircutBps(String symbol) {
        return cfg.registry.get("tokens").get(symbol).get("haircutBps").asInt();
    }

    /** Value after haircut of qty units at a price, scaled by priceScale; the same integer arithmetic as CollateralControl. */
    private static BigInteger valueAfterHaircut(BigInteger qty, BigInteger price, int haircutBps) {
        return qty.multiply(price).multiply(BigInteger.valueOf(10_000L - haircutBps)).divide(BigInteger.valueOf(10_000));
    }

    /** Value after haircuts of a list of {token symbol, qty} at the current feed prices, scaled by priceScale. */
    private BigInteger valueOf(List<Map<String, Object>> assets) {
        Map<String, BigInteger> prices = feedPrices();
        BigInteger v = BigInteger.ZERO;
        for (Map<String, Object> a : assets) {
            String sym = (String) a.get("token");
            BigInteger price = prices.get(cfg.tokenAddress(sym).toLowerCase());
            if (price == null) throw new RuntimeException("no feed price for " + sym);
            v = v.add(valueAfterHaircut(BigInteger.valueOf(((Number) a.get("qty")).longValue()), price, haircutBps(sym)));
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
                    "dti", t.get("dti").asText(), "haircutBps", t.get("haircutBps").asInt())));
        });
        ctx.json(new LinkedHashMap<>(Map.of(
                "party", cfg.partyId, "role", cfg.role, "node", cfg.node, "address", cfg.myAddress,
                "counterparty", counterparty, "counterpartyAddress", cfg.partyAddress(counterparty),
                "priceScale", cfg.priceScale.toString(), "tokens", tokens,
                "agreement", "2018 ISDA IM Credit Support Annex (Security Interest, New York law)")));
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
            long proposalCount = c.get("proposalCount").asLong();
            List<Map<String, Object>> proposals = new ArrayList<>();
            for (long pid = 0; pid < proposalCount; pid++) {
                int pstate = gw.get("/calls/" + callId + "/proposals/" + pid + "/state").asInt();
                JsonNode assets = gw.get("/calls/" + callId + "/proposals/" + pid + "/assets");
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
            callList.add(call);
        }

        // Balances: free token balance, and escrowed (pledged) balance between this party and its counterparty.
        List<Map<String, Object>> balances = new ArrayList<>();
        String cpAddr = cfg.partyAddress(counterparty);
        cfg.registry.get("tokens").fieldNames().forEachRemaining(sym -> {
            String token = cfg.tokenAddress(sym);
            String free = gw.getQuery("/balance", Map.of("token", token, "owner", cfg.myAddress)).asText();
            String pledgor = cfg.role.equals("Pledgor") ? cfg.myAddress : cpAddr;
            String securedParty = cfg.role.equals("Pledgor") ? cpAddr : cfg.myAddress;
            String pledged = gw.getQuery("/pledged", Map.of("token", token, "pledgor", pledgor, "securedParty", securedParty)).asText();
            balances.add(new LinkedHashMap<>(Map.of("token", sym, "free", free, "pledged", pledged)));
        });

        // Default status of both counterparties, read from the oracle feed through this party's own gateway.
        Map<String, Object> defaults = new LinkedHashMap<>();
        for (String p : List.of("A", "B")) {
            defaults.put(p, gw.get("/defaults/" + cfg.partyAddress(p)).get("inDefault").asBoolean());
        }

        ctx.json(new LinkedHashMap<>(Map.of("party", cfg.partyId, "role", cfg.role, "calls", callList, "balances", balances,
                "defaults", defaults)));
    }

    /** IM agreement terms used by the revaluation (console/src/domain/reference.ts, 2018 ISDA IM CSA). */
    static final long IM_MTA_USD = 500_000;
    static final long IM_ROUNDING_USD = 10_000;

    /**
     * Revaluation of the initial margin held between the two parties (flow-revaluation-top-up transition 5). The
     * requirement is the outstanding IM from calls: agreed amounts of settled IM calls minus settled return calls,
     * counting only calls settled after the pair's last enforcement (enforcement empties the escrow). Top-up calls
     * (tagged by the issuing party's store) restore value and are left out of the requirement, so this is the issuing
     * secured party's view; the pledgor's service does not see the tags. The collateral is
     * valued at the oracle feed prices, read through this party's own gateway, after the eligibility haircuts. A
     * shortfall at or above the minimum transfer amount gives a top-up call amount, rounded up (delivery).
     */
    private void revaluation(Context ctx) {
        String counterparty = cfg.partyId.equals("B") ? "A" : "B";
        String cpAddr = cfg.partyAddress(counterparty);
        String pledgor = cfg.role.equals("Pledgor") ? cfg.myAddress : cpAddr;
        String securedParty = cfg.role.equals("Pledgor") ? cpAddr : cfg.myAddress;
        BigInteger scale = cfg.priceScale;

        JsonNode hist = gw.getQuery("/settlement-history", Map.of("pledgor", pledgor, "securedParty", securedParty));
        long lastEnforcement = -1;
        for (JsonNode e : hist.get("enforced")) lastEnforcement = Math.max(lastEnforcement, e.get("block").asLong());
        // A close-out also empties the pair's escrow (flow-close-out-netting).
        for (JsonNode e : hist.path("closedOut")) lastEnforcement = Math.max(lastEnforcement, e.get("block").asLong());
        Map<String, Long> settledAt = new HashMap<>();
        for (JsonNode s : hist.get("settled")) settledAt.merge(s.get("callId").asText().toLowerCase(), s.get("block").asLong(), Math::max);

        BigInteger required = BigInteger.ZERO;
        int imCalls = 0, returnCalls = 0, topUpCalls = 0;
        String p = pledgor.toLowerCase(), sp = securedParty.toLowerCase();
        for (JsonNode entry : gw.getQuery("/party-calls", Map.of("party", cfg.myAddress))) {
            JsonNode c = entry.get("call");
            int kind = c.get("kind").asInt(), state = c.get("state").asInt();
            if (state != 5 && state != 6) continue; // settled, or settled for the agreed part
            String from = c.get("from").asText().toLowerCase(), to = c.get("to").asText().toLowerCase();
            boolean pair = (from.equals(p) && to.equals(sp)) || (from.equals(sp) && to.equals(p));
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
            int haircutBps = cfg.registry.get("tokens").get(sym).get("haircutBps").asInt();
            BigInteger v = qty.multiply(price).multiply(BigInteger.valueOf(10_000L - haircutBps)).divide(BigInteger.valueOf(10_000));
            value = value.add(v);
            tokens.add(new LinkedHashMap<>(Map.of("token", sym, "pledged", qty.toString(), "price", price.toString(),
                    "haircutBps", haircutBps, "valueUsd", usd(v.toString()))));
        }

        BigInteger shortfall = required.subtract(value).max(BigInteger.ZERO);
        BigInteger[] qr = shortfall.divideAndRemainder(scale);
        long shortfallUsd = qr[0].longValueExact() + (qr[1].signum() > 0 ? 1 : 0);
        long topUpUsd = shortfallUsd >= IM_MTA_USD ? ((shortfallUsd + IM_ROUNDING_USD - 1) / IM_ROUNDING_USD) * IM_ROUNDING_USD : 0;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requiredUsd", usd(required.toString()));
        out.put("valueUsd", usd(value.toString()));
        out.put("shortfallUsd", String.valueOf(shortfallUsd));
        out.put("topUpUsd", String.valueOf(topUpUsd));
        out.put("mtaUsd", String.valueOf(IM_MTA_USD));
        out.put("roundingUsd", String.valueOf(IM_ROUNDING_USD));
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> body(Context ctx) {
        return ctx.bodyAsClass(Map.class);
    }

    private void issueCall(Context ctx) {
        Map<String, Object> b = body(ctx);
        String kind = (String) b.getOrDefault("kind", "IM");
        String toParty = (String) b.getOrDefault("toParty", "A");
        long amountUsd = ((Number) b.get("amountUsd")).longValue();
        long days = b.containsKey("deadlineDays") ? ((Number) b.get("deadlineDays")).longValue() : 1;
        String amountScaled = BigInteger.valueOf(amountUsd).multiply(cfg.priceScale).toString();
        long deadline = System.currentTimeMillis() / 1000 + days * 86400;
        long n = store.nextCallNumber(cfg.partyId);
        String callId = Cdm.onChainId(cfg.partyId + "-" + n + "-" + System.nanoTime());
        String direction = kind.equals("Return") ? "Return" : "Delivery";
        Cdm cdm = Cdm.issue(Cdm.cdmCallId(callId), cfg.bankName(cfg.partyId), amountUsd, direction);
        record(callId, "IssueCall", cdm);
        gw.post("/calls", Map.of("callId", callId, "kind", CALL_KIND.get(kind), "to", cfg.partyAddress(toParty),
                "amount", amountScaled, "deadline", deadline, "cdmHash", cdm.hash));
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
        Cdm cdm = Cdm.respond(Cdm.cdmCallId(callId), issuer, kindCdm, agreedUsd, action, units, cfg.isin(cfg.firstTokenSymbol()));
        record(callId, "RespondToCall", cdm);
        gw.post("/calls/" + callId + "/response", Map.of("response", RESPONSE.get(response), "agreed", agreed.toString(), "cdmHash", cdm.hash));
        ctx.json(Map.of("ok", true, "agreedUsd", String.valueOf(agreedUsd)));
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
        Cdm cdm = Cdm.settleReturn(cdmAssets, agreedUsd);
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
        if (!cfg.role.equals("Secured Party")) throw new RuntimeException("only the secured party closes out");
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
            if (qty.signum() > 0) held = held.add(valueAfterHaircut(qty, prices.getOrDefault(token.toLowerCase(), BigInteger.ZERO), haircutBps(sym)));
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
        if (!cfg.role.equals("Pledgor")) throw new RuntimeException("only the pledgor requests a substitution");
        Map<String, Object> b = body(ctx);
        List<Map<String, Object>> original = assetsIn(b, "original");
        List<Map<String, Object>> substitute = assetsIn(b, "substitute");
        long originalUsd = valueOf(original).divide(cfg.priceScale).longValueExact();
        long substituteUsd = valueOf(substitute).divide(cfg.priceScale).longValueExact();
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
            if (!t.get("price").isNull()) value = value.add(valueAfterHaircut(qty, new BigInteger(t.get("price").asText()), haircutBps(sym)));
        }
        return CdmSubstitution.portfolio(positions, value.divide(cfg.priceScale).longValueExact(),
                cfg.bankName(partyIdOf(pledgor)), cfg.bankName(partyIdOf(securedParty)));
    }
}
