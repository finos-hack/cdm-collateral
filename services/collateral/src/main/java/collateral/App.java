package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import io.javalin.Javalin;
import io.javalin.http.Context;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    private final Map<String, String> symbolByAddress; // lowercase address -> symbol

    private App(Config cfg) {
        this.cfg = cfg;
        this.store = new Store(cfg.dbPath);
        this.gw = new Gateway(cfg.gatewayUrl);
        this.symbolByAddress = cfg.tokenSymbols();
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
        app.post("/api/v1/calls", this::issueCall);
        app.post("/api/v1/calls/{id}/response", this::respond);
        app.post("/api/v1/calls/{id}/proposal", this::propose);
        app.post("/api/v1/calls/{id}/decision", this::decide);
        app.post("/api/v1/calls/{id}/pledge", this::pledge);

        app.start(cfg.port);
        System.out.printf("collateral service: party %s (%s) %s on http://localhost:%d/api/v1 -> gateway %s%n",
                cfg.partyId, cfg.role, cfg.myAddress, cfg.port, cfg.gatewayUrl);
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

        ctx.json(new LinkedHashMap<>(Map.of("party", cfg.partyId, "role", cfg.role, "calls", callList, "balances", balances)));
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
        String callId = Cdm.callId(cfg.partyId + "-" + n + "-" + System.nanoTime());
        Cdm cdm = Cdm.marginCallIssuance(callId, kind, cfg.partyId, toParty, amountScaled, deadline);
        store.recordMessage(callId, "MarginCallIssuance", "out", cdm);
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
        Cdm cdm = Cdm.marginCallResponse(callId, response, agreed.toString(), disputed.toString());
        store.recordMessage(callId, "MarginCallResponse", "out", cdm);
        gw.post("/calls/" + callId + "/response", Map.of("response", RESPONSE.get(response), "agreed", agreed.toString(), "cdmHash", cdm.hash));
        ctx.json(Map.of("ok", true, "agreedUsd", agreed.divide(cfg.priceScale).toString()));
    }

    @SuppressWarnings("unchecked")
    private void propose(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        List<Map<String, Object>> assetsIn = (List<Map<String, Object>>) b.get("assets");
        List<Map<String, Object>> gwAssets = new ArrayList<>();
        List<Map<String, Object>> cdmAssets = new ArrayList<>();
        for (Map<String, Object> a : assetsIn) {
            String sym = (String) a.get("token");
            String qty = String.valueOf(((Number) a.get("qty")).longValue());
            gwAssets.add(Map.of("token", cfg.tokenAddress(sym), "qty", qty));
            cdmAssets.add(new LinkedHashMap<>(Map.of("token", sym, "isin", cfg.registry.get("tokens").get(sym).get("isin").asText(), "quantity", qty)));
        }
        Cdm cdm = Cdm.collateralProposal(callId, cdmAssets);
        store.recordMessage(callId, "CollateralProposal", "out", cdm);
        JsonNode r = gw.post("/calls/" + callId + "/proposals", Map.of("assets", gwAssets, "cdmHash", cdm.hash));
        ctx.json(Map.of("proposalId", r.get("proposalId").asLong(), "cdmHash", cdm.hash));
    }

    private void decide(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        long proposalId = ((Number) b.get("proposalId")).longValue();
        boolean accept = Boolean.TRUE.equals(b.get("accept"));
        gw.post("/calls/" + callId + "/decision", Map.of("proposalId", proposalId, "accept", accept));
        ctx.json(Map.of("ok", true, "decision", accept ? "accepted" : "rejected"));
    }

    private void pledge(Context ctx) {
        String callId = ctx.pathParam("id");
        Map<String, Object> b = body(ctx);
        long proposalId = ((Number) b.get("proposalId")).longValue();
        JsonNode assets = gw.get("/calls/" + callId + "/proposals/" + proposalId + "/assets");
        if (assets.isEmpty()) throw new RuntimeException("proposal " + proposalId + " has no assets");
        // First-cycle scope: single-asset pledge. The gateway approves the control contract then pledges.
        JsonNode a0 = assets.get(0);
        gw.post("/calls/" + callId + "/pledge", Map.of("proposalId", proposalId, "token", a0.get("token").asText(), "qty", a0.get("qty").asText()));
        ctx.json(Map.of("ok", true));
    }
}
