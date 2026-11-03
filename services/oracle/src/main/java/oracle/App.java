package oracle;

import io.javalin.Javalin;
import io.javalin.http.Context;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Oracle service (architecture node oracle-service), shared and run by the market data operator. This first scope
 * serves the default notice of flow-default-enforcement: a party's collateral service forwards a pledgor default
 * (relationship service-to-oracle, transition 3) and this service publishes it to the oracle feed contract through the
 * operator's own ledger gateway (relationship oracle-to-gateway, transition 4). The gateway signs with the publisher
 * key; OracleFeed.setDefault accepts only that key. Prices, NAV and ratings (flow-oracle-update) are not served yet.
 *
 * Environment: PORT (default 8100), GATEWAY_URL — the operator's gateway (default http://localhost:8200).
 */
public final class App {
    private static final Pattern ADDRESS = Pattern.compile("^0x[0-9a-fA-F]{40}$");

    private final OperatorGateway gateway;

    public App(OperatorGateway gateway) {
        this.gateway = gateway;
    }

    public static void main(String[] args) {
        int port = Integer.parseInt(env("PORT", "8100"));
        String gatewayUrl = env("GATEWAY_URL", "http://localhost:8200");
        new App(new OperatorGateway(gatewayUrl)).create().start(port);
        System.out.printf("oracle service on http://localhost:%d/oracle/v1 -> operator gateway %s%n", port, gatewayUrl);
    }

    /** Build the HTTP app without starting it, so a test can start it on a free port. */
    public Javalin create() {
        Javalin app = Javalin.create(c -> c.showJavalinBanner = false);
        app.before(ctx -> {
            ctx.header("Access-Control-Allow-Origin", "*");
            ctx.header("Access-Control-Allow-Headers", "Content-Type");
            ctx.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        });
        app.options("/*", ctx -> ctx.status(204));
        app.exception(IllegalArgumentException.class, (e, ctx) -> ctx.status(400).json(Map.of("error", String.valueOf(e.getMessage()))));
        app.exception(Exception.class, (e, ctx) -> ctx.status(502).json(Map.of("error", String.valueOf(e.getMessage()))));

        app.get("/oracle/v1/health", ctx -> ctx.json(Map.of("service", "oracle", "ok", true)));
        app.post("/oracle/v1/defaults", this::publishDefault);
        app.get("/oracle/v1/defaults/{party}", ctx -> ctx.json(gateway.defaultStatus(party(ctx.pathParam("party")))));
        return app;
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
