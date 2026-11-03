package oracle;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import io.javalin.Javalin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The oracle service against a stub operator gateway (JDK HttpServer): a default notice is validated and forwarded to
 * POST /ledger/v1/oracle/defaults unchanged, and a gateway refusal surfaces as an error, not a success.
 */
class AppTest {
    private static final String PARTY = "0x00000000000000000000000000000000000000a1";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TUST = "0x00000000000000000000000000000000000000b1";
    private static final String TUSD = "0x00000000000000000000000000000000000000b3";
    /** The operator gateway's GET /prices: tUST at 98.40 and tUSD at 1.00 on the feed, tNEW with no price yet. */
    private static final String PRICES = "{\"priceScale\":\"100000000\",\"prices\":["
            + "{\"symbol\":\"tUST\",\"token\":\"" + TUST + "\",\"price\":\"9840000000\"},"
            + "{\"symbol\":\"tUSD\",\"token\":\"" + TUSD + "\",\"price\":\"100000000\"},"
            + "{\"symbol\":\"tNEW\",\"token\":\"0x00000000000000000000000000000000000000b9\",\"price\":null}]}";

    private HttpServer stub;
    private final List<String> received = new CopyOnWriteArrayList<>();
    private volatile int stubStatus = 200;
    private Javalin app;
    private String base;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void start() throws Exception {
        stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stub.createContext("/ledger/v1/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (ex.getRequestMethod().equals("GET") && ex.getRequestURI().getPath().equals("/ledger/v1/prices")) {
                byte[] list = PRICES.getBytes(StandardCharsets.UTF_8);
                ex.sendResponseHeaders(200, list.length);
                ex.getResponseBody().write(list);
                ex.close();
                return;
            }
            received.add(ex.getRequestMethod() + " " + ex.getRequestURI().getPath() + " " + body);
            byte[] out = (stubStatus == 200
                    ? "{\"txHash\":\"0xabc\",\"block\":\"7\"}"
                    : "{\"error\":\"NotPublisher\"}").getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(stubStatus, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        stub.start();
        app = new App(new OperatorGateway("http://127.0.0.1:" + stub.getAddress().getPort())).create().start(0);
        base = "http://127.0.0.1:" + app.port() + "/oracle/v1";
    }

    @AfterEach
    void stop() {
        app.stop();
        stub.stop(0);
    }

    private HttpResponse<String> post(String path, String json) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(base + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private static Map<String, Object> json(String s) throws Exception {
        return MAPPER.readValue(s, new TypeReference<>() {});
    }

    @Test
    void forwardsDefaultNoticeToOperatorGateway() throws Exception {
        HttpResponse<String> res = post("/defaults", "{\"party\":\"" + PARTY + "\",\"notifiedBy\":\"BANK-B\"}");
        assertEquals(200, res.statusCode(), res.body());
        Map<String, Object> out = json(res.body());
        assertEquals(PARTY, out.get("party"));
        assertEquals(true, out.get("inDefault"));
        assertEquals("BANK-B", out.get("notifiedBy"));
        assertEquals(Map.of("txHash", "0xabc", "block", "7"), out.get("tx"));

        assertEquals(1, received.size());
        String req = received.get(0);
        assertTrue(req.startsWith("POST /ledger/v1/oracle/defaults "), req);
        Map<String, Object> sent = json(req.substring(req.indexOf('{')));
        assertEquals(Map.of("party", PARTY, "inDefault", true), sent);
    }

    @Test
    void forwardsAnExplicitCure() throws Exception {
        HttpResponse<String> res = post("/defaults", "{\"party\":\"" + PARTY + "\",\"inDefault\":false}");
        assertEquals(200, res.statusCode(), res.body());
        Map<String, Object> sent = json(received.get(0).substring(received.get(0).indexOf('{')));
        assertEquals(false, sent.get("inDefault"));
    }

    @Test
    void rejectsAMalformedPartyWithoutCallingTheGateway() throws Exception {
        HttpResponse<String> res = post("/defaults", "{\"party\":\"BANK-A\"}");
        assertEquals(400, res.statusCode());
        assertTrue(json(res.body()).get("error").toString().contains("address"));
        assertTrue(received.isEmpty());
    }

    @Test
    void rejectsANonBooleanFlag() throws Exception {
        HttpResponse<String> res = post("/defaults", "{\"party\":\"" + PARTY + "\",\"inDefault\":\"yes\"}");
        assertEquals(400, res.statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void surfacesAGatewayRefusal() throws Exception {
        stubStatus = 400;
        HttpResponse<String> res = post("/defaults", "{\"party\":\"" + PARTY + "\"}");
        assertEquals(502, res.statusCode());
        assertTrue(json(res.body()).get("error").toString().contains("NotPublisher"));
    }

    @Test
    void readsDefaultStatusThroughTheGateway() throws Exception {
        HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(base + "/defaults/" + PARTY)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, res.statusCode());
        assertTrue(received.get(0).startsWith("GET /ledger/v1/defaults/" + PARTY));
    }

    // flow-oracle-update: mock market data and price publishing.

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(base + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> put(String path, String json) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(base + path))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(json)).build(), HttpResponse.BodyHandlers.ofString());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> token(String symbol) throws Exception {
        List<Map<String, Object>> tokens = (List<Map<String, Object>>) json(get("/market-data").body()).get("tokens");
        return tokens.stream().filter(t -> symbol.equals(t.get("symbol"))).findFirst().orElseThrow();
    }

    @Test
    void marketDataStartsFromTheOnChainPricesWithMockRatings() throws Exception {
        HttpResponse<String> res = get("/market-data");
        assertEquals(200, res.statusCode(), res.body());
        assertEquals("100000000", json(res.body()).get("priceScale"));
        Map<String, Object> tust = token("tUST");
        assertEquals("9840000000", tust.get("price"));
        assertEquals("98.4", tust.get("priceUsd"));
        assertEquals("AA+", tust.get("rating"));
        assertEquals(null, token("tUSD").get("rating"));
        assertEquals(null, token("tNEW").get("price"));
        assertTrue(received.isEmpty(), "reading market data writes nothing");
    }

    @Test
    void anOperatorPriceEditIsPublishedOnChain() throws Exception {
        HttpResponse<String> res = put("/market-data/tUST", "{\"price\":\"97.5\"}");
        assertEquals(200, res.statusCode(), res.body());
        Map<String, Object> out = json(res.body());
        assertEquals("9750000000", out.get("price"));
        assertEquals(Map.of("txHash", "0xabc", "block", "7"), out.get("tx"));
        assertEquals(1, received.size());
        String req = received.get(0);
        assertTrue(req.startsWith("POST /ledger/v1/oracle/prices "), req);
        assertEquals(Map.of("token", TUST, "price", "9750000000"), json(req.substring(req.indexOf('{'))));
        assertEquals("9750000000", token("tUST").get("price"));
    }

    @Test
    void aRatingOnlyEditStaysOffChain() throws Exception {
        HttpResponse<String> res = put("/market-data/tUST", "{\"rating\":\"AA\"}");
        assertEquals(200, res.statusCode(), res.body());
        assertEquals("AA", token("tUST").get("rating"));
        assertEquals("9840000000", token("tUST").get("price"));
        assertTrue(received.isEmpty(), "a rating change is not written to the feed");
    }

    @Test
    void rejectsAPriceFinerThanTheFeedScale() throws Exception {
        HttpResponse<String> res = put("/market-data/tUST", "{\"price\":\"97.123456789\"}");
        assertEquals(400, res.statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void rejectsAnUnknownSymbol() throws Exception {
        HttpResponse<String> res = put("/market-data/tXYZ", "{\"price\":\"1\"}");
        assertEquals(400, res.statusCode());
        assertTrue(json(res.body()).get("error").toString().contains("tXYZ"));
    }

    @Test
    void keepsTheOldPriceWhenTheGatewayRefuses() throws Exception {
        stubStatus = 400;
        HttpResponse<String> res = put("/market-data/tUST", "{\"price\":\"90\"}");
        assertEquals(502, res.statusCode());
        stubStatus = 200;
        assertEquals("9840000000", token("tUST").get("price"));
    }

    @Test
    void publishesEveryPricedTokenOrOneSymbol() throws Exception {
        HttpResponse<String> all = post("/prices/publish", "");
        assertEquals(200, all.statusCode(), all.body());
        assertEquals(2, received.size(), "tNEW has no price and is skipped");
        received.clear();
        HttpResponse<String> one = post("/prices/publish", "{\"symbol\":\"tUSD\"}");
        assertEquals(200, one.statusCode(), one.body());
        assertEquals(1, received.size());
        assertEquals(Map.of("token", TUSD, "price", "100000000"), json(received.get(0).substring(received.get(0).indexOf('{'))));
    }
}
