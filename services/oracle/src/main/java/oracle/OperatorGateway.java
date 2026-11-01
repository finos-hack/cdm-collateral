package oracle;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * HTTP client for the market operator's ledger gateway (architecture relationship oracle-to-gateway). That gateway
 * instance holds the oracle publisher key, the only key OracleFeed accepts for writes.
 */
public class OperatorGateway {
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final String baseUrl;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    public OperatorGateway(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    /** Write a party's default status to the oracle feed; returns the mined transaction {txHash, block}. */
    public Map<String, Object> setDefault(String party, boolean inDefault) {
        return send("POST", "/oracle/defaults", Map.of("party", party, "inDefault", inDefault));
    }

    /** Read a party's default status from the oracle feed: {party, inDefault}. */
    public Map<String, Object> defaultStatus(String party) {
        return send("GET", "/defaults/" + party, null);
    }

    private Map<String, Object> send(String method, String path, Map<String, Object> body) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(baseUrl + "/ledger/v1" + path))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json");
            if ("POST".equals(method)) b.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
            else b.GET();
            HttpResponse<String> res = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            Map<String, Object> node = res.body() == null || res.body().isBlank() ? Map.of() : mapper.readValue(res.body(), MAP);
            if (res.statusCode() >= 300) {
                throw new IllegalStateException("operator gateway " + method + " " + path + " -> " + res.statusCode() + ": "
                        + node.getOrDefault("error", res.body()));
            }
            return node;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("operator gateway call failed: " + e.getMessage(), e);
        }
    }
}
