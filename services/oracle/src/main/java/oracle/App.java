package oracle;

import io.javalin.Javalin;
import io.javalin.http.Context;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Oracle service (architecture node oracle-service), shared and run by the market data operator. It publishes to the
 * oracle feed contract through the operator's own ledger gateway (relationship oracle-to-gateway); the gateway signs
 * with the publisher key, the only key OracleFeed accepts for writes.
 * <ul>
 *   <li>Default notices (flow-default-enforcement): a party's collateral service forwards a pledgor default
 *       (service-to-oracle, transition 3) and this service publishes it (transition 4).</li>
 *   <li>Prices (flow-oracle-update): mock market data per token (oracle-to-market-data, transition 1), published on
 *       request (transitions 2-3). An operator's price edit publishes the new price at once. Ratings are mock values
 *       and stay off-chain; OracleFeed has no rating field.</li>
 *   <li>Record keeper ({@link TransferAgent}, task-authoritative-record-settlement-enforcement): the transfer agent of
 *       the Registered and Claim tokens keeps their register and confirms each ledger transaction that moves them.</li>
 * </ul>
 *
 * Environment: PORT (default 8100), GATEWAY_URL — the operator's gateway (default http://localhost:8200).
 */
public final class App {
    private static final Pattern ADDRESS = Pattern.compile("^0x[0-9a-fA-F]{40}$");

    private final OperatorGateway gateway;
    private final MarketData market;
    private final TransferAgent transferAgent;

    public App(OperatorGateway gateway) {
        this.gateway = gateway;
        this.market = new MarketData(gateway);
        this.transferAgent = new TransferAgent(gateway);
    }

    public static void main(String[] args) {
        // Node's HTTP servers (gateway, payload store) close an idle keep-alive connection after 5 s. Java's HttpClient
        // keeps pooled connections longer and can send a request on one the server has just closed ("header parser
        // received no bytes", CI run 43061438276). Drop idle connections after 3 s, before any client is built.
        System.setProperty("jdk.httpclient.keepalive.timeout", "3");
        int port = Integer.parseInt(env("PORT", "8100"));
        String gatewayUrl = env("GATEWAY_URL", "http://localhost:8200");
        App oracle = new App(new OperatorGateway(gatewayUrl));
        oracle.create().start(port);
        oracle.transferAgent.start(Long.parseLong(env("TRANSFER_AGENT_PERIOD_MS", "1000")));
        System.out.printf("oracle service on http://localhost:%d/oracle/v1 -> operator gateway %s%n", port, gatewayUrl);
    }

    /** Build the HTTP app without starting it, so a test can start it on a free port. */
    public Javalin create() {
        Javalin app = Javalin.create(c -> c.showJavalinBanner = false);
        app.before(ctx -> {
            ctx.header("Access-Control-Allow-Origin", "*");
            ctx.header("Access-Control-Allow-Headers", "Content-Type");
            ctx.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
        });
        app.options("/*", ctx -> ctx.status(204));
        app.exception(IllegalArgumentException.class, (e, ctx) -> ctx.status(400).json(Map.of("error", String.valueOf(e.getMessage()))));
        app.exception(Exception.class, (e, ctx) -> ctx.status(502).json(Map.of("error", String.valueOf(e.getMessage()))));

        app.get("/oracle/v1/health", ctx -> ctx.json(Map.of("service", "oracle", "ok", true)));
        app.post("/oracle/v1/defaults", this::publishDefault);
        app.get("/oracle/v1/defaults/{party}", ctx -> ctx.json(gateway.defaultStatus(party(ctx.pathParam("party")))));
        app.get("/oracle/v1/market-data", this::marketData);
        app.put("/oracle/v1/market-data/{symbol}", this::editMarketData);
        app.post("/oracle/v1/prices/publish", this::publishPrices);
        app.get("/oracle/v1/register", ctx -> ctx.json(Map.of("tokens", transferAgent.symbols(), "paused", transferAgent.paused())));
        app.get("/oracle/v1/register/{symbol}", ctx -> ctx.json(transferAgent.holdings(ctx.pathParam("symbol"))));
        // A paused transfer agent confirms nothing: the live spec uses it to show a step waiting for the record keeper.
        app.put("/oracle/v1/register/paused", ctx -> {
            transferAgent.setPaused(Boolean.parseBoolean(String.valueOf(ctx.bodyAsClass(Map.class).get("paused"))));
            ctx.json(Map.of("paused", transferAgent.paused()));
        });
        return app;
    }

    private void marketData(Context ctx) {
        BigInteger scale = market.scale();
        List<Map<String, Object>> tokens = new ArrayList<>();
        for (MarketData.Entry e : market.all()) tokens.add(e.json(scale));
        ctx.json(Map.of("priceScale", scale.toString(), "tokens", tokens));
    }

    /**
     * Operator edit of one token's mock data: {price: USD decimal (optional), rating: string (optional)}. A price
     * change is published to the oracle feed before the edit is kept, so the mock data never runs ahead of the chain.
     */
    @SuppressWarnings("unchecked")
    private void editMarketData(Context ctx) {
        MarketData.Entry e = market.get(ctx.pathParam("symbol"));
        Map<String, Object> b = ctx.bodyAsClass(Map.class);
        if (!b.containsKey("price") && !b.containsKey("rating")) throw new IllegalArgumentException("nothing to change: give price and/or rating");
        BigInteger price = b.containsKey("price") ? market.toScaled(b.get("price")) : e.price();
        String rating = b.containsKey("rating") ? (b.get("rating") == null ? null : String.valueOf(b.get("rating"))) : e.rating();
        Map<String, Object> out = new LinkedHashMap<>();
        if (b.containsKey("price")) out.put("tx", gateway.publishPrice(e.token(), price.toString()));
        MarketData.Entry updated = market.put(new MarketData.Entry(e.symbol(), e.token(), price, rating));
        out.putAll(updated.json(market.scale()));
        System.out.printf("market data: %s price=%s rating=%s%n", e.symbol(), price, rating);
        ctx.json(out);
    }

    /** Publish the current mock price of one token ({symbol}) or of every token with a price ({}). */
    @SuppressWarnings("unchecked")
    private void publishPrices(Context ctx) {
        String body = ctx.body();
        Map<String, Object> b = body == null || body.isBlank() ? Map.of() : ctx.bodyAsClass(Map.class);
        List<MarketData.Entry> targets = b.get("symbol") == null ? market.all() : List.of(market.get(String.valueOf(b.get("symbol"))));
        List<Map<String, Object>> published = new ArrayList<>();
        for (MarketData.Entry e : targets) {
            if (e.price() == null) continue;
            Map<String, Object> row = new LinkedHashMap<>(e.json(market.scale()));
            row.put("tx", gateway.publishPrice(e.token(), e.price().toString()));
            published.add(row);
        }
        ctx.json(Map.of("published", published));
    }

    /**
     * Publish a default notice: {party: address, inDefault: boolean (default true), notifiedBy: string (optional)}.
     * Returns once the operator's gateway has the feed write mined (QBFT finality), so the caller may enforce next.
     */
    @SuppressWarnings("unchecked")
    private void publishDefault(Context ctx) {
        Map<String, Object> b = ctx.bodyAsClass(Map.class);
        String party = party(b.get("party"));
        Object flag = b.getOrDefault("inDefault", Boolean.TRUE);
        if (!(flag instanceof Boolean)) throw new IllegalArgumentException("inDefault must be a boolean");
        boolean inDefault = (Boolean) flag;
        Map<String, Object> tx = gateway.setDefault(party, inDefault);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("party", party);
        out.put("inDefault", inDefault);
        if (b.get("notifiedBy") != null) out.put("notifiedBy", String.valueOf(b.get("notifiedBy")));
        out.put("tx", tx);
        System.out.printf("default notice: party %s inDefault=%s (notified by %s)%n", party, inDefault, b.getOrDefault("notifiedBy", "?"));
        ctx.json(out);
    }

    static String party(Object value) {
        if (!(value instanceof String s) || !ADDRESS.matcher(s).matches()) {
            throw new IllegalArgumentException("party must be a 0x-prefixed 20-byte address, got " + value);
        }
        return s;
    }

    private static String env(String k, String dflt) {
        String v = System.getenv(k);
        return v == null || v.isBlank() ? dflt : v;
    }
}
