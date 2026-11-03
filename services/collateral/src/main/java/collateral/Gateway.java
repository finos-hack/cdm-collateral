package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * HTTP client for this participant's ledger gateway (architecture relationship service-to-gateway). The service sends
 * ledger instructions here; the gateway signs with this participant's key and submits to Besu. All amounts and
 * quantities cross as decimal strings (they exceed JSON safe-integer range).
 */
public final class Gateway {
    private final String baseUrl;
    private final String prefix;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    public Gateway(String baseUrl) {
        this(baseUrl, "/ledger/v1");
    }

    /** A JSON client for another service with the same conventions, e.g. the oracle service under /oracle/v1. */
    public Gateway(String baseUrl, String prefix) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.prefix = prefix;
    }

    public JsonNode post(String path, Map<String, Object> body) {
        return send("POST", path, body);
    }

    public JsonNode get(String path) {
        return send("GET", path, null);
    }

    public JsonNode getQuery(String path, Map<String, String> params) {
        StringBuilder q = new StringBuilder(path).append("?");
        params.forEach((k, v) -> q.append(URLEncoder.encode(k, StandardCharsets.UTF_8)).append("=")
                .append(URLEncoder.encode(v, StandardCharsets.UTF_8)).append("&"));
        return send("GET", q.toString(), null);
    }

    private JsonNode send(String method, String path, Map<String, Object> body) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(baseUrl + prefix + path))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json");
            if ("POST".equals(method)) {
                b.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body == null ? Map.of() : body)));
            } else {
                b.GET();
            }
            HttpResponse<String> res = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            JsonNode node = res.body() == null || res.body().isBlank() ? mapper.nullNode() : mapper.readTree(res.body());
            if (res.statusCode() >= 300) {
                String msg = node.has("error") ? node.get("error").asText() : res.body();
                throw new RuntimeException(baseUrl + prefix + " " + method + " " + path + " -> " + res.statusCode() + ": " + msg);
            }
            return node;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("gateway call failed: " + e.getMessage(), e);
        }
    }
}
