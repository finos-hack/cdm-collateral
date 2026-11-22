package collateral;

import cdmx.collateral.ledger.LedgerNetwork;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.LedgerTransactionStatusEnum;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * The provenance check of a deployed token from what the ledger and the payload store hold (task-document-provenance):
 * the gateway's ProvenanceAnchored events give every anchored hash; each hash is read from the payload store and is
 * either a PROV-O link record or a record keeper's credential; each record's document is read by the hash the record
 * names. Nothing is taken from the service's own state, so every party that reads the same chain and store gets the
 * same result.
 */
public final class ProvenanceLive {
    private static final ObjectMapper M = new ObjectMapper();

    private ProvenanceLive() {}

    /** The ledger events of the gateway's /provenance/anchors as CDM LedgerTransactions, in the order given. */
    static List<LedgerTransaction> observed(JsonNode anchors) {
        List<LedgerTransaction> out = new ArrayList<>();
        for (JsonNode a : anchors) {
            JsonNode n = a.get("network");
            out.add(LedgerTransaction.builder()
                .setNetwork(LedgerNetwork.builder().setName(n.get("name").asText()).setPlatform(n.get("platform").asText())
                    .setChainId(n.hasNonNull("chainId") ? n.get("chainId").asInt() : null).build())
                .setContractAddress(a.get("contract").asText().toLowerCase())
                .setTransactionHash(a.get("txHash").asText().toLowerCase())
                .setBlockNumber(Integer.parseInt(a.get("block").asText()))
                .setLogIndex(a.get("logIndex").asInt())
                .setEventName("ProvenanceAnchored")
                .setRecordedHash(a.get("cdmHash").asText().toLowerCase())
                .setStatus("Reverted".equals(a.path("status").asText()) ? LedgerTransactionStatusEnum.REVERTED : LedgerTransactionStatusEnum.FINAL)
                .build());
        }
        return out;
    }

    /**
     * The check of token {@code symbol}, as JSON for the console.
     *
     * @param registry     the deployment registry (its tokens give the token's address, DTI and profile)
     * @param anchors      every provenance anchor on the ledger (all tokens: another token's issuance can claim the same asset)
     * @param fetch        reads a text from the payload store by hash; null when absent or not readable here
     * @param securedParty the pledge's secured party (a registry party name), or null
     */
    public static Map<String, Object> check(String symbol, JsonNode registry, JsonNode anchors, Function<String, String> fetch,
                                            String securedParty) {
        JsonNode token = registry.path("tokens").path(symbol);
        if (token.isMissingNode()) throw new IllegalArgumentException("no token " + symbol + " in the deployment");
        String urn = "urn:dti:" + token.get("dti").asText();
        List<JsonNode> records = new ArrayList<>();
        List<JsonNode> credentials = new ArrayList<>();
        List<String> unreadable = new ArrayList<>();
        Map<String, String> documents = new HashMap<>();
        for (JsonNode a : anchors) {
            String hash = a.get("cdmHash").asText().toLowerCase();
            String text = fetch.apply(hash);
            if (text == null || !Cdm.keccakHex(text).equalsIgnoreCase(hash)) {
                unreadable.add(hash);
                continue;
            }
            JsonNode n;
            try {
                n = M.readTree(text);
            } catch (Exception e) {
                unreadable.add(hash);
                continue;
            }
            if (n.path("type").isArray() && n.path("type").toString().contains("\"VerifiableCredential\"")) credentials.add(n);
            else if (n.has("cdmx:relation")) records.add(n);
        }
        for (JsonNode r : records) {
            String d = ProvRecords.documentHash(r);
            if (documents.containsKey(d)) continue;
            String doc = fetch.apply(d);
            if (doc != null) documents.put(d, doc);
        }
        ProvenanceCheck.TokenProfile profile = ProvenanceCheck.TokenProfile.fromRegistry(token, securedParty);
        ProvenanceCheck.Result r = ProvenanceCheck.check(new ProvenanceCheck.Input(urn, profile, records, credentials, documents,
            observed(anchors), Map.of(), null));
        List<Map<String, Object>> links = new ArrayList<>();
        for (String relation : profile.path()) {
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("relation", relation);
            String hash = r.current().get(relation);
            l.put("recordHash", hash);
            records.stream().filter(x -> hash != null && hash.equals(ProvRecords.hash(x))).findFirst().ifPresent(x -> {
                l.put("id", ProvRecords.id(x));
                l.put("recordKeeper", ProvRecords.recordKeeper(x));
                l.put("documentHash", ProvRecords.documentHash(x));
            });
            l.put("breaks", r.breaks().stream().filter(b -> relation.equals(b.relation()))
                .map(b -> Map.of("kind", b.kind().name(), "detail", b.detail())).toList());
            l.put("ok", hash != null && r.breaks().stream().noneMatch(b -> relation.equals(b.relation())));
            links.add(l);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("symbol", symbol);
        out.put("token", urn);
        out.put("authoritativeRecord", profile.authoritativeRecord());
        if (profile.recordKeeper() != null) out.put("recordKeeper", profile.recordKeeper());
        if (profile.controlAgreement() != null) out.put("controlAgreement", profile.controlAgreement());
        if (securedParty != null) out.put("securedParty", securedParty);
        out.put("complete", r.clean() && unreadable.isEmpty());
        out.put("links", links);
        out.put("breaks", r.breaks().stream().map(b -> Map.of("kind", b.kind().name(), "relation", b.relation(), "detail", b.detail())).toList());
        out.put("tokensOnAsset", r.tokensOnAsset());
        out.put("anchors", anchors.size());
        if (!unreadable.isEmpty()) out.put("unreadable", unreadable);
        return out;
    }

    /**
     * The provenance gate (task-document-provenance): why the secured party may not accept these tokens, or null if it may.
     * A token the registry marks {@code provenanceRequired} is accepted only when its provenance path, for a pledge to
     * {@code securedParty}, is complete; a token without the mark is not checked.
     */
    public static String refusal(List<String> symbols, JsonNode registry, JsonNode anchors, Function<String, String> fetch,
                                 String securedParty) {
        List<String> reasons = new ArrayList<>();
        for (String sym : symbols.stream().distinct().toList()) {
            if (sym == null || !registry.path("tokens").path(sym).path("provenanceRequired").asBoolean(false)) continue;
            Map<String, Object> r = check(sym, registry, anchors, fetch, securedParty);
            if (Boolean.TRUE.equals(r.get("complete"))) continue;
            @SuppressWarnings("unchecked")
            List<Map<String, String>> breaks = (List<Map<String, String>>) r.get("breaks");
            String kinds = breaks.stream().map(b -> b.get("kind")).distinct().reduce((a, b) -> a + ", " + b)
                .orElse(r.containsKey("unreadable") ? "records not readable" : "incomplete");
            reasons.add(sym + " (" + kinds + ")");
        }
        return reasons.isEmpty() ? null
            : "the provenance of " + String.join("; ", reasons) + " is not complete, so it cannot be accepted as collateral"
                + " (GET /api/v1/provenance shows each link)";
    }
}
