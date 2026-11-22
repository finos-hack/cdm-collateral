package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The live provenance path (task-document-provenance): the fixture provenance the service seeds for tUST and tMMF,
 * read back the way GET /api/v1/provenance reads it, from anchor events and a content-addressed store.
 */
class ProvenanceLiveTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static JsonNode registry() throws Exception {
        return M.readTree("{\"chainId\":1337,\"tokens\":{" +
            "\"tUST\":{\"address\":\"0x" + "a1".repeat(20) + "\",\"isin\":\"US912810TM60\",\"dti\":\"QX4V2W9N3\",\"authoritativeRecord\":\"Bearer\"}," +
            "\"tMMF\":{\"address\":\"0x" + "a2".repeat(20) + "\",\"isin\":\"US9128100000\",\"dti\":\"QZ0000000\",\"authoritativeRecord\":\"Registered\"," +
            "\"recordKeeper\":\"MMF Transfer Agent\",\"controlAgreement\":\"CA-TMMF-2026-01\"}}}");
    }

    /** A store and a chain: what the seed would write, as the gateway would return it. */
    private static final class Ledger {
        final Map<String, String> store = new HashMap<>();
        final ArrayNode anchors = M.createArrayNode();
        int block = 10;

        void seed(String sym, JsonNode token) {
            ProvenanceFixtures.Build b = ProvenanceFixtures.build(sym, token, "bank-a", "bank-b", "2026-11-22T17:00:00Z");
            for (String d : b.documents()) store.put(Cdm.keccakHex(d).toLowerCase(), d);
            for (ProvenanceFixtures.Anchored a : b.anchored()) {
                store.put(a.hash(), a.text());
                ObjectNode e = anchors.addObject();
                e.put("token", a.token());
                e.put("linkId", a.linkId());
                e.put("cdmHash", a.hash());
                e.put("revisionOf", "0x" + "00".repeat(32));
                e.put("block", String.valueOf(block++));
                e.put("logIndex", 0);
                e.put("txHash", String.format("0x%064x", block));
                e.put("contract", "0x" + "c9".repeat(20));
                e.putObject("network").put("name", "besu-prototype").put("platform", "Hyperledger Besu").put("chainId", 1337);
                e.put("status", "Final");
            }
        }
    }

    @Test
    void theSeededTustAndTmmfPathsAreComplete() throws Exception {
        JsonNode reg = registry();
        Ledger l = new Ledger();
        l.seed("tUST", reg.at("/tokens/tUST"));
        l.seed("tMMF", reg.at("/tokens/tMMF"));
        Map<String, Object> tust = ProvenanceLive.check("tUST", reg, l.anchors, l.store::get, null);
        assertEquals(true, tust.get("complete"), () -> "breaks: " + tust.get("breaks"));
        assertEquals(5, ((List<?>) tust.get("links")).size());
        Map<String, Object> tmmf = ProvenanceLive.check("tMMF", reg, l.anchors, l.store::get, "bank-b");
        assertEquals(true, tmmf.get("complete"), () -> "breaks: " + tmmf.get("breaks"));
        assertEquals(6, ((List<?>) tmmf.get("links")).size());
        assertEquals("CA-TMMF-2026-01", tmmf.get("controlAgreement"));
    }

    @Test
    void anUnseededTokenReportsEveryLinkMissing() throws Exception {
        JsonNode reg = registry();
        Ledger l = new Ledger();
        l.seed("tUST", reg.at("/tokens/tUST"));
        Map<String, Object> tmmf = ProvenanceLive.check("tMMF", reg, l.anchors, l.store::get, null);
        assertEquals(false, tmmf.get("complete"));
        assertEquals(6, ((List<?>) tmmf.get("breaks")).size());
    }

    @Test
    void aPledgeToAnotherSecuredPartyIsNotCoveredByTheControlAgreement() throws Exception {
        JsonNode reg = registry();
        Ledger l = new Ledger();
        l.seed("tMMF", reg.at("/tokens/tMMF"));
        Map<String, Object> r = ProvenanceLive.check("tMMF", reg, l.anchors, l.store::get, "bank-c");
        assertEquals(false, r.get("complete"));
        assertTrue(r.get("breaks").toString().contains("ControlAgreementMismatch"));
    }

    @Test
    void aStoreThatDoesNotHoldARecordMakesThePathIncomplete() throws Exception {
        JsonNode reg = registry();
        Ledger l = new Ledger();
        l.seed("tUST", reg.at("/tokens/tUST"));
        String first = l.anchors.get(0).get("cdmHash").asText();
        l.store.remove(first);
        Map<String, Object> r = ProvenanceLive.check("tUST", reg, l.anchors, l.store::get, null);
        assertEquals(false, r.get("complete"));
        assertEquals(List.of(first), r.get("unreadable"));
    }

    // The gate on accepting collateral: only a token the registry marks provenanceRequired is checked.
    private static JsonNode required(JsonNode reg) {
        ObjectNode r = reg.deepCopy();
        ((ObjectNode) r.at("/tokens/tUST")).put("provenanceRequired", true);
        ((ObjectNode) r.at("/tokens/tMMF")).put("provenanceRequired", true);
        ((ObjectNode) r.path("tokens")).putObject("tUSD").put("address", "0x" + "a3".repeat(20)).put("isin", "US0000000USD")
            .put("dti", "QSD000000").put("authoritativeRecord", "Bearer");
        return r;
    }

    @Test
    void theGateAcceptsTokensWhosePathIsComplete() throws Exception {
        JsonNode reg = required(registry());
        Ledger l = new Ledger();
        l.seed("tUST", reg.at("/tokens/tUST"));
        l.seed("tMMF", reg.at("/tokens/tMMF"));
        assertNull(ProvenanceLive.refusal(List.of("tUST", "tMMF", "tUSD"), reg, l.anchors, l.store::get, "bank-b"));
    }

    @Test
    void theGateRefusesARequiredTokenWithoutProvenanceAndIgnoresOthers() throws Exception {
        JsonNode reg = required(registry());
        Ledger l = new Ledger();
        l.seed("tUST", reg.at("/tokens/tUST"));
        String refusal = ProvenanceLive.refusal(List.of("tUST", "tMMF"), reg, l.anchors, l.store::get, "bank-b");
        assertNotNull(refusal);
        assertTrue(refusal.contains("tMMF (Missing)"), refusal);
        assertFalse(refusal.contains("tUST"), refusal);
        assertNull(ProvenanceLive.refusal(List.of("tUSD"), reg, l.anchors, l.store::get, "bank-b"));
        assertNull(ProvenanceLive.refusal(List.of("tMMF"), registry(), l.anchors, l.store::get, "bank-b")); // not marked
    }

    @Test
    void theGateRefusesTmmfToASecuredPartyItsControlAgreementDoesNotName() throws Exception {
        JsonNode reg = required(registry());
        Ledger l = new Ledger();
        l.seed("tMMF", reg.at("/tokens/tMMF"));
        String refusal = ProvenanceLive.refusal(List.of("tMMF"), reg, l.anchors, l.store::get, "bank-c");
        assertNotNull(refusal);
        assertTrue(refusal.contains("ControlAgreementMismatch"), refusal);
    }
}
