package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Completion by authoritative record (task-authoritative-record-settlement-enforcement; interim rules REG-1 to REG-5 of
 * task-sme-registered-asset-completion): a Bearer token completes on the final ledger transaction, a Registered token
 * only once its record keeper confirms the transaction, and a Registered token without a control agreement is not
 * eligible.
 */
class CdmRecordKeeperTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final String TX = "0x" + "22".repeat(32);
    private static final String CALLS = "0x" + "c1".repeat(20);
    private static final String CONTROL = "0x" + "c2".repeat(20);
    private static final String TUST = "0x" + "a1".repeat(20);
    private static final String TMMF = "0x" + "a2".repeat(20);

    private static JsonNode registry(boolean controlAgreement) throws Exception {
        return M.readTree("{\"chainId\":1337,\"tokens\":{" +
            "\"tUST\":{\"address\":\"" + TUST + "\",\"decimals\":0,\"isin\":\"US912810TM60\",\"dti\":\"QX4V2W9N3\",\"authoritativeRecord\":\"Bearer\"}," +
            "\"tMMF\":{\"address\":\"" + TMMF + "\",\"decimals\":0,\"isin\":\"US9128100000\",\"dti\":\"QZ0000000\",\"authoritativeRecord\":\"Registered\"," +
            "\"recordKeeper\":\"MMF Transfer Agent\"" + (controlAgreement ? ",\"controlAgreement\":\"CA-TMMF-2026-01\"" : "") + "}}}");
    }

    /** One settled step whose transaction moved the given token. */
    private static JsonNode settle(String token, String event) throws Exception {
        return M.readTree("[{\"step\":\"SettleCall\",\"event\":\"" + event + "\",\"cdmHash\":\"0x" + "ab".repeat(32) + "\",\"block\":\"12\",\"logIndex\":2," +
            "\"txHash\":\"" + TX + "\",\"contract\":\"" + CALLS + "\",\"network\":{\"name\":\"besu-prototype\",\"platform\":\"Hyperledger Besu\",\"chainId\":1337}," +
            "\"status\":\"Final\",\"txLogs\":[{\"contract\":\"" + token + "\",\"logIndex\":0,\"event\":\"Transfer\"},{\"contract\":\"" + CONTROL + "\",\"logIndex\":1,\"event\":\"Pledged\"}]}]");
    }

    private static JsonNode confirmed(String token) throws Exception {
        return M.readTree("[{\"txHash\":\"" + TX + "\",\"token\":\"" + token + "\",\"ref\":\"TA-tMMF-1\",\"block\":\"13\"}]");
    }

    private static final List<Map<String, Object>> COMPLETE = List.of(Map.of("identifier", "S-1", "status", "Complete"));

    @Test
    void aBearerSettlementIsCompleteOnTheLedger() throws Exception {
        Map<String, Object> r = CdmRecordKeeper.steps(registry(true), settle(TUST, "CallSettled"), 1, COMPLETE, M.readTree("[]"));
        assertEquals(true, r.get("complete"));
    }

    @Test
    void aRegisteredSettlementWaitsForTheRecordKeeper() throws Exception {
        Map<String, Object> waiting = CdmRecordKeeper.steps(registry(true), settle(TMMF, "CallSettled"), 1, COMPLETE, M.readTree("[]"));
        assertEquals(false, waiting.get("complete"));
        Map<String, Object> done = CdmRecordKeeper.steps(registry(true), settle(TMMF, "CallSettled"), 1, COMPLETE, confirmed(TMMF));
        assertEquals(true, done.get("complete"));
        @SuppressWarnings("unchecked")
        Map<String, Object> token = ((List<Map<String, Object>>) ((List<Map<String, Object>>) done.get("records")).get(0).get("tokens")).get(0);
        assertEquals("tMMF", token.get("symbol"));
        assertEquals("MMF Transfer Agent", token.get("recordKeeper"));
        assertEquals("TA-tMMF-1", token.get("reference"));
    }

    @Test
    void aConfirmationOfAnotherTokenDoesNotComplete() throws Exception {
        Map<String, Object> r = CdmRecordKeeper.steps(registry(true), settle(TMMF, "CallSettled"), 1, COMPLETE, confirmed(TUST));
        assertEquals(false, r.get("complete"));
    }

    @Test
    void aPendingAnchorIsNotCompleteEvenWhenConfirmed() throws Exception {
        Map<String, Object> r = CdmRecordKeeper.steps(registry(true), settle(TMMF, "CallSettled"), 1,
            List.of(Map.of("identifier", "S-1", "status", "Pending")), confirmed(TMMF));
        assertEquals(false, r.get("complete"));
    }

    @Test
    void aRegisteredTokenNeedsAControlAgreementToBeEligible() throws Exception {
        assertTrue(CdmRecordKeeper.eligible(CdmRecordKeeper.tokens(registry(true)).get("tMMF")));
        assertFalse(CdmRecordKeeper.eligible(CdmRecordKeeper.tokens(registry(false)).get("tMMF")));
        assertTrue(CdmRecordKeeper.eligible(CdmRecordKeeper.tokens(registry(false)).get("tUST")));
    }

    @Test
    void anEnforcementOfARegisteredTokenWaitsForTheRecordKeeper() throws Exception {
        CdmEnforcement e = CdmEnforcement.build("0x" + "c0".repeat(32), "BANK-A", "BANK-B",
            List.of(Map.of("isin", "US9128100000", "units", 1000L)), 960);
        assertEquals("CollateralEnforced", e.enforcement.getEventQualifier());
        JsonNode steps = M.readTree(settle(TMMF, "Enforced").toString().replace(
            "\"contract\":\"" + CALLS + "\"", "\"contract\":\"" + CONTROL + "\"").replace("0x" + "ab".repeat(32), e.hash));
        Map<String, Object> waiting = CdmRecordKeeper.enforcement(registry(true), steps, e.enforcement.getEventIdentifier(), e.hash, M.readTree("[]"));
        assertEquals("Complete", waiting.get("anchorStatus"));
        assertEquals(false, waiting.get("complete"));
        Map<String, Object> done = CdmRecordKeeper.enforcement(registry(true), steps, e.enforcement.getEventIdentifier(), e.hash, confirmed(TMMF));
        assertEquals(true, done.get("complete"));
    }

    // task-authoritative-record-other-flows: the repo, securities loan and triparty movements the gateway reads from the
    // flow contract's logs (/register/movements), grouped by the record id.
    private static final String LOAN = "0x" + "1a".repeat(32);
    private static final String OTHER_LOAN = "0x" + "1b".repeat(32);

    private static JsonNode movements(String... recordAndToken) throws Exception {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < recordAndToken.length; i += 2) {
            if (i > 0) b.append(',');
            String tx = i == 0 ? TX : "0x" + ("4" + (i / 2)).repeat(32); // a distinct transaction per movement
            b.append("{\"recordId\":\"").append(recordAndToken[i]).append("\",\"txHash\":\"").append(tx)
                .append("\",\"block\":\"20\",\"events\":[\"LoanDelivered\"],\"status\":\"Final\",\"txLogs\":[{\"contract\":\"")
                .append(recordAndToken[i + 1]).append("\",\"logIndex\":0,\"event\":\"Transfer\"}]}");
        }
        return M.readTree(b.append(']').toString());
    }

    @Test
    void aLoanDeliveryOfTMmfWaitsForTheRecordKeeper() throws Exception {
        Map<String, Map<String, Object>> waiting = CdmRecordKeeper.movements(registry(true), movements(LOAN, TMMF), M.readTree("[]"));
        assertEquals(false, waiting.get(LOAN).get("complete"));
        Map<String, Map<String, Object>> done = CdmRecordKeeper.movements(registry(true), movements(LOAN, TMMF), confirmed(TMMF));
        assertEquals(true, done.get(LOAN).get("complete"));
        @SuppressWarnings("unchecked")
        Map<String, Object> rec = ((List<Map<String, Object>>) done.get(LOAN).get("records")).get(0);
        assertEquals("LoanDelivered", rec.get("identifier"));
        assertEquals(TX, rec.get("txHash"));
    }

    @Test
    void aRecordIsCompleteOnlyWhenEachOfItsMovementsIs() throws Exception {
        // LOAN moved tMMF twice: the first transaction is confirmed (TX), the second is not.
        Map<String, Map<String, Object>> r = CdmRecordKeeper.movements(registry(true), movements(LOAN, TMMF, LOAN, TMMF), confirmed(TMMF));
        assertEquals(2, ((List<?>) r.get(LOAN).get("records")).size());
        assertEquals(false, r.get(LOAN).get("complete"));
    }

    @Test
    void movementsAreKeptApartByRecordAndOnlyRegisteredTokensCount() throws Exception {
        Map<String, Map<String, Object>> r = CdmRecordKeeper.movements(registry(true), movements(LOAN, TMMF, OTHER_LOAN, TUST), M.readTree("[]"));
        assertEquals(false, r.get(LOAN).get("complete"));
        // The Bearer movement is complete on the ledger alone.
        assertEquals(true, r.get(OTHER_LOAN).get("complete"));
        assertEquals(Map.of(), CdmRecordKeeper.movements(registry(true), M.readTree("[]"), M.readTree("[]")));
    }

    @Test
    void theRegisterAndTheLedgerAreReconciledHolderByHolder() {
        Map<String, Object> same = CdmRecordKeeper.breaks("tMMF", Map.of("0xaa", "100"), Map.of("0xaa", "100", "0xbb", "0"));
        assertEquals(true, same.get("reconciled"));
        Map<String, Object> differ = CdmRecordKeeper.breaks("tMMF", Map.of("0xaa", "100"), Map.of("0xaa", "60", "0xbb", "40"));
        assertEquals(false, differ.get("reconciled"));
        assertEquals(2, ((List<?>) differ.get("breaks")).size());
    }
}
