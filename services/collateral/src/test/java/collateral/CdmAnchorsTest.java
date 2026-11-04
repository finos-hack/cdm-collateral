package collateral;

import cdmx.collateral.ledger.AnchorStatusEnum;
import cdmx.collateral.ledger.LedgerAnchor;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.functions.AnchorStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** G25: anchors of folded steps from the gateway's steps response (CdmAnchors). The payloads stand in for the step
 *  documents; only their keccak256 matters here. */
class CdmAnchorsTest {
    private static final String ISSUE = "{\"issue\":1}";
    private static final String SETTLE = "{\"settle\":2}";
    private static final String TX1 = "0x" + "11".repeat(32);
    private static final String TX2 = "0x" + "22".repeat(32);
    private static final String CALLS = "0x" + "c1".repeat(20);
    private static final String CONTROL = "0x" + "c2".repeat(20);
    private static final String TUST = "0x" + "a1".repeat(20);

    private static JsonNode steps(String settleStatus) throws Exception {
        String network = "{\"name\":\"besu-prototype\",\"platform\":\"Hyperledger Besu\",\"chainId\":1337}";
        return new ObjectMapper().readTree("[" +
            "{\"step\":\"IssueCall\",\"event\":\"CallIssued\",\"cdmHash\":\"" + Cdm.keccakHex(ISSUE) + "\",\"block\":\"10\",\"logIndex\":0," +
            "\"txHash\":\"" + TX1 + "\",\"contract\":\"" + CALLS + "\",\"network\":" + network + ",\"status\":\"Final\",\"txLogs\":[]}," +
            "{\"step\":\"SettleCall\",\"event\":\"CallSettled\",\"cdmHash\":\"" + Cdm.keccakHex(SETTLE) + "\",\"block\":\"12\",\"logIndex\":2," +
            "\"txHash\":\"" + TX2 + "\",\"contract\":\"" + CALLS + "\",\"network\":" + network + ",\"status\":\"" + settleStatus + "\",\"txLogs\":[" +
            "{\"contract\":\"" + TUST + "\",\"logIndex\":0,\"event\":\"Transfer\"}," +
            "{\"contract\":\"" + CONTROL + "\",\"logIndex\":1,\"event\":\"Pledged\"}," +
            "{\"contract\":\"" + CONTROL + "\",\"logIndex\":3}]}" +
            "]");
    }

    @Test
    void eachFoldedStepIsAnchoredOnItsOwnTransaction() throws Exception {
        List<LedgerAnchor> anchors = CdmAnchors.anchors(steps("Final"), List.of(ISSUE, SETTLE));
        assertEquals(List.of("S-1", "S-2"), anchors.stream().map(LedgerAnchor::getRecordIdentifier).toList());
        assertEquals(List.of("CallIssued"), anchors.get(0).getTransaction().stream().map(LedgerTransaction::getEventName).toList());
        LedgerAnchor settle = anchors.get(1);
        assertEquals(Cdm.keccakHex(SETTLE).toLowerCase(), settle.getDocumentHash());
        assertEquals(List.of(0, 1, 2, 3), settle.getTransaction().stream().map(LedgerTransaction::getLogIndex).toList());
        assertNull(settle.getTransaction().get(3).getEventName()); // an event the gateway does not know
        assertTrue(settle.getTransaction().stream().allMatch(t -> TX2.equals(t.getTransactionHash())));
        anchors.forEach(a -> assertEquals(List.of(), CdmRuntime.failures(a)));
    }

    @Test
    void bothPartiesBuildTheSameAnchors() throws Exception {
        String mine = CdmRuntime.toJson(CdmAnchors.anchors(steps("Final"), List.of(ISSUE, SETTLE)));
        String theirs = CdmRuntime.toJson(CdmAnchors.anchors(steps("Final"), List.of(ISSUE, SETTLE)));
        assertEquals(mine, theirs);
        assertEquals(Cdm.keccakHex(mine), Cdm.keccakHex(theirs));
    }

    @Test
    void onlyFoldedStepsAreAnchored() throws Exception {
        assertEquals(1, CdmAnchors.anchors(steps("Final"), List.of(ISSUE)).size());
    }

    @Test
    void aRevertedSettlementFailsItsAnchor() throws Exception {
        AnchorStatus status = CdmRuntime.fn(AnchorStatus.class);
        List<LedgerAnchor> anchors = CdmAnchors.anchors(steps("Reverted"), List.of(ISSUE, SETTLE));
        assertEquals(AnchorStatusEnum.COMPLETE, status.evaluate(anchors.get(0), 1));
        assertEquals(AnchorStatusEnum.FAILED, status.evaluate(anchors.get(1), 1));
    }

    @Test
    void aPayloadThatIsNotOnChainHasNoAnchor() throws Exception {
        assertThrows(RuntimeException.class, () -> CdmAnchors.anchors(steps("Final"), List.of("{\"other\":0}")));
    }
}
