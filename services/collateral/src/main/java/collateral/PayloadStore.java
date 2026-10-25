package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * HTTP client for the content-addressed CDM payload store (ADR wp-adr-cdm-payload-carrier). The service writes each
 * step's CDM document here keyed by its keccak-256 hash, and reads the counterparty's documents by hash to fold them
 * into its MarginCallState. The on-chain cdmHash is the retrieval key; the store and the reader both check content
 * addressing.
 */
public final class PayloadStore {
    private final String baseUrl;
    private final String token; // per-party bearer token; the store resolves it to this party's identity
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    public PayloadStore(String baseUrl, String token) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.token = token;
    }

    /** Store a step's CDM document (Rune JSON) keyed by its keccak hash, readable by the given parties. Idempotent. */
    public void put(String hash, String documentJson, List<String> parties) {
        try {
            String body = mapper.writeValueAsString(Map.of("hash", hash, "document", documentJson, "parties", parties));
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/docs"))
                    .timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + token)
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 300) throw new RuntimeException("store PUT " + hash + " -> " + res.statusCode() + ": " + res.body());
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("store put failed: " + e.getMessage(), e);
        }
    }

    /** Fetch a document by hash; null if not found or not permitted (not readable by this party, or step not yet written).
     *  The reader's identity is the bearer token — the store resolves it to a party and enforces the document allowlist. */
    public String get(String hash) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/docs/" + hash))
                    .timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + token).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 404 || res.statusCode() == 403) return null;
            if (res.statusCode() >= 300) throw new RuntimeException("store GET " + hash + " -> " + res.statusCode() + ": " + res.body());
            JsonNode node = mapper.readTree(res.body());
            return node.get("document").asText();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("store get failed: " + e.getMessage(), e);
        }
    }
}
