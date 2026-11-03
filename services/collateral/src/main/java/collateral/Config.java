package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Per-participant configuration for one collateral workflow service instance. Reads the deployment registry
 * (contracts/deployments/besu.json) for token and party addresses, and the participant identity from the environment:
 * PARTY_ID (A|B), NODE (bank-a|bank-b), ROLE, PORT, GATEWAY_URL, ORACLE_URL. One service instance acts for exactly one party.
 */
public final class Config {
    public final String partyId;      // console party id: "A" or "B"
    public final String node;         // besu node id: "bank-a" or "bank-b"
    public final String role;         // "Pledgor" or "Secured Party"
    public final int port;
    public final String gatewayUrl;
    public final String oracleUrl;     // the shared oracle service, run by the market operator (service-to-oracle)
    public final String storeUrl;      // content-addressed CDM payload store (wp-adr-cdm-payload-carrier)
    public final String storeToken;    // this party's bearer token for the store; the store resolves it to this identity
    public final String dbPath;
    public final JsonNode registry;   // parsed besu.json
    public final BigInteger priceScale;
    public final String myAddress;

    public static final ObjectMapper MAPPER = new ObjectMapper();

    private Config(String partyId, String node, String role, int port, String gatewayUrl, String oracleUrl, String storeUrl, String storeToken, String dbPath, JsonNode registry) {
        this.partyId = partyId;
        this.node = node;
        this.role = role;
        this.port = port;
        this.gatewayUrl = gatewayUrl;
        this.oracleUrl = oracleUrl;
        this.storeUrl = storeUrl;
        this.storeToken = storeToken;
        this.dbPath = dbPath;
        this.registry = registry;
        this.priceScale = new BigInteger(registry.get("priceScale").asText());
        this.myAddress = registry.get("parties").get(node).asText();
    }

    public static Config fromEnv() {
        String partyId = env("PARTY_ID", "A");
        String node = env("NODE", partyId.equals("B") ? "bank-b" : "bank-a");
        String role = env("ROLE", partyId.equals("B") ? "Secured Party" : "Pledgor");
        int port = Integer.parseInt(env("PORT", partyId.equals("B") ? "8002" : "8001"));
        String gatewayUrl = env("GATEWAY_URL", partyId.equals("B") ? "http://localhost:8202" : "http://localhost:8201");
        String oracleUrl = env("ORACLE_URL", "http://localhost:8100");
        String storeUrl = env("STORE_URL", "http://localhost:8300/store/v1");
        String storeToken = env("STORE_TOKEN", "");
        String repoRoot = env("REPO_ROOT", Path.of(System.getProperty("user.dir")).toString());
        Path regPath = findRegistry(Path.of(repoRoot));
        String dbPath = env("DB_PATH", "./data/" + node + ".db");
        try {
            JsonNode registry = MAPPER.readTree(Files.readString(regPath));
            return new Config(partyId, node, role, port, gatewayUrl, oracleUrl, storeUrl, storeToken, dbPath, registry);
        } catch (Exception e) {
            throw new RuntimeException("failed to read deployment registry at " + regPath + ": " + e.getMessage(), e);
        }
    }

    // Walk up from the working directory to find contracts/deployments/besu.json (the service may run from its own dir).
    private static Path findRegistry(Path start) {
        for (Path p = start; p != null; p = p.getParent()) {
            Path candidate = p.resolve("contracts").resolve("deployments").resolve("besu.json");
            if (Files.exists(candidate)) return candidate;
        }
        throw new RuntimeException("contracts/deployments/besu.json not found upward from " + start + "; run deploy:besu first");
    }

    public String tokenAddress(String symbol) {
        return registry.get("tokens").get(symbol).get("address").asText();
    }

    public int haircutBps(String symbol) {
        return registry.get("tokens").get(symbol).get("haircutBps").asInt();
    }

    public String isin(String symbol) {
        return registry.get("tokens").get(symbol).get("isin").asText();
    }

    /** The single collateral token of this cycle, used where a response states indicative collateral before a proposal. */
    public String firstTokenSymbol() {
        return registry.get("tokens").fieldNames().next();
    }

    /** CDM party name for a console party id (the lifecycle documents name BANK-A / BANK-B). */
    public String bankName(String partyId) {
        return partyId.equals("B") ? "BANK-B" : "BANK-A";
    }

    public String partyAddress(String partyId) {
        return registry.get("parties").get(partyId.equals("B") ? "bank-b" : "bank-a").asText();
    }

    public Map<String, String> tokenSymbols() {
        var m = new java.util.LinkedHashMap<String, String>();
        registry.get("tokens").fieldNames().forEachRemaining(sym -> m.put(registry.get("tokens").get(sym).get("address").asText().toLowerCase(), sym));
        return m;
    }

    private static String env(String k, String dflt) {
        String v = System.getenv(k);
        return v == null || v.isBlank() ? dflt : v;
    }
}
