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
        app.get("/api/v1/calls/{id}/cdm-state", ctx -> ctx.json(cdmStateFor(ctx.pathParam("id"))));
        app.post("/api/v1/calls", this::issueCall);
        app.post("/api/v1/calls/{id}/response", this::respond);
        app.post("/api/v1/calls/{id}/proposal", this::propose);
        app.post("/api/v1/calls/{id}/decision", this::decide);
        app.post("/api/v1/calls/{id}/pledge", this::pledge);
        app.post("/api/v1/calls/{id}/transfer", this::transfer);
        app.post("/api/v1/calls/{id}/return", this::returnCollateral);
        app.post("/api/v1/calls/{id}/enforce", this::enforce);
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
                if (event.equals("DefaultPublished") || involvesMe(callId)) {
                    store.recordEvent(event, callId, party, block, logIndex, data);
                }
            } else if ("SettleCall".equals(e.path("step").asText()) && involvesMe(e.path("callId").asText(null))) {
                cdmStateFor(e.get("callId").asText());
            }
        } catch (Exception ex) {
            System.err.println("event relay: could not process " + data + ": " + ex.getMessage());
        }
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
}
