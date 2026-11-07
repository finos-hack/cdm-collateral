package collateral;

import cdmx.collateral.reconciliation.LedgerReconciliation;
import cdmx.collateral.reconciliation.PortfolioReconciliation;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Reconciliation as the collateral service builds it (flow-reconciliation). */
class CdmReconciliationTest {
    private static final Instant AS_OF = Instant.parse("2026-11-07T17:00:00Z");

    private static String snapshot(String node, String bank, String counterparty) {
        return CdmReconciliation.snapshotJson(bank, counterparty, CdmReconciliation.seed(node), AS_OF);
    }

    @SuppressWarnings("unchecked")
    @Test
    void theSeededPortfoliosReconcileWithAValuationBreakAndAMissingTrade() {
        String a = snapshot("bank-a", "BANK-A", "BANK-B");
        String b = snapshot("bank-b", "BANK-B", "BANK-A");
        PortfolioReconciliation r = CdmReconciliation.reconcile(a, b, CdmReconciliation.seed("bank-a").toleranceUsd());
        Map<String, Object> v = CdmReconciliation.view(r);
        assertEquals(false, v.get("reconciled"));
        assertEquals(1, v.get("matchedTrades"));
        List<String> breaks = new ArrayList<>();
        for (Map<String, Object> x : (List<Map<String, Object>>) v.get("breaks")) breaks.add(x.get("uti") + ":" + x.get("type") + ":" + x.get("differenceUsd"));
        assertEquals(List.of("56323:MissingFromSecond:null", "DRTY123456:ValuationDiffers:40000"), breaks);
        assertEquals("1625000", v.get("firstExposureUsd"));
        assertEquals("-1510000", v.get("secondExposureUsd"));
        assertEquals("115000", v.get("exposureDifferenceUsd"));
    }

    @Test
    void bothPartiesGetTheSameResultHashFromTheExchangedJson() {
        String a = snapshot("bank-a", "BANK-A", "BANK-B");
        String b = snapshot("bank-b", "BANK-B", "BANK-A");
        assertEquals(a, CdmRuntime.toJson(CdmReconciliation.parseSnapshot(a)));  // the JSON round-trips unchanged
        String h1 = Cdm.keccakHex(CdmRuntime.toJson(CdmReconciliation.reconcile(a, b, CdmReconciliation.seed("bank-a").toleranceUsd())));
        String h2 = Cdm.keccakHex(CdmRuntime.toJson(CdmReconciliation.reconcile(a, b, CdmReconciliation.seed("bank-b").toleranceUsd())));
        assertEquals(h1, h2);
    }

    @Test
    void ledgerFactsFromTheContractUseTheCdmStatusNames() throws Exception {
        JsonNode settled = Config.MAPPER.readTree("{\"state\":6,\"amount\":\"120000000000000\",\"agreed\":\"100000000000000\"}");
        var facts = CdmReconciliation.ledgerFacts("0xc1", settled, BigInteger.TEN.pow(8));
        List<String> got = new ArrayList<>();
        for (var f : facts) got.add(f.getAttribute() + "=" + f.getFactValue());
        assertEquals(List.of("status=Settled", "calledAmount=1200000", "agreedAmount=1000000"), got);

        JsonNode issued = Config.MAPPER.readTree("{\"state\":1,\"amount\":\"120000000000000\",\"agreed\":\"0\"}");
        assertEquals(2, CdmReconciliation.ledgerFacts("0xc2", issued, BigInteger.TEN.pow(8)).size());
    }

    @Test
    void aStaleRecordIsABreak() throws Exception {
        JsonNode agreed = Config.MAPPER.readTree("{\"state\":2,\"amount\":\"100000000\",\"agreed\":\"100000000\"}");
        LedgerReconciliation r = CdmReconciliation.withLedger("BANK-A", "BANK-B",
                List.of(CdmReconciliation.fact("0xc1", "status", "Issued"), CdmReconciliation.fact("0xc1", "calledAmount", "1")),
                CdmReconciliation.ledgerFacts("0xc1", agreed, BigInteger.TEN.pow(8)));
        assertFalse(r.getReconciled());
        assertEquals(3, r.getCheckedFactCount());
        assertEquals(2, r.getLedgerBreak().size());
    }
}
