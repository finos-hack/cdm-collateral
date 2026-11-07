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

    private static String pos(String isin, long units) {
        return "{\"priceQuantity\":[{\"quantity\":{\"value\":" + units + "}}],\"asset\":{\"identifier\":[{\"identifier\":{\"@data\":\"" + isin + "\"}}]}}";
    }

    private static CdmReconciliation.EscrowMovement delivery(String margin, String isin, long units, long block) {
        return new CdmReconciliation.EscrowMovement("{\"issuance\":{\"regMarginType\":\"" + margin + "\"},\"direction\":\"Delivery\",\"status\":\"Settled\","
                + "\"settlement\":{\"proposalId\":\"P-1\"},\"proposal\":[{\"proposalIdentifier\":{\"assignedIdentifier\":[{\"identifier\":{\"@data\":\"P-0\"}}]},\"proposedCollateral\":[" + pos(isin, 999) + "]},"
                + "{\"proposalIdentifier\":{\"assignedIdentifier\":[{\"identifier\":{\"@data\":\"P-1\"}}]},\"proposedCollateral\":[" + pos(isin, units) + "]}]}", block);
    }

    private static CdmReconciliation.EscrowMovement ret(String returned, String isin, long units, long block) {
        String type = returned == null ? "" : ",\"returnedMarginType\":\"" + returned + "\"";
        return new CdmReconciliation.EscrowMovement("{\"issuance\":{\"regMarginType\":\"RegIM\"},\"direction\":\"Return\",\"status\":\"Settled\","
                + "\"settlement\":{\"releasedCollateral\":[" + pos(isin, units) + "]" + type + "}}", block);
    }

    @Test
    void escrowFromTheRecordsCountsInitialMarginOnlySinceTheEscrowWasEmptied() {
        Map<String, String> sym = Map.of("UST", "tUST", "USD", "tUSD", "MMF", "tMMF");
        var calls = List.of(
                delivery("RegIM", "UST", 500, 5),   // before the enforcement at block 10: left out
                delivery("RegIM", "UST", 1_000, 11),
                delivery("VM", "USD", 70_000, 12),  // VM passes title directly
                ret("RegIM", "UST", 300, 13),
                ret("VM", "USD", 20_000, 14),
                ret(null, "UST", 100, 15));         // a return recorded before returnedMarginType: not read as a release
        var subs = List.of(new CdmReconciliation.EscrowMovement("{\"after\":{\"status\":\"Settled\",\"request\":{\"originalCollateral\":["
                + pos("UST", 200) + "],\"substituteCollateral\":[" + pos("MMF", 40) + "]}}}", 16));
        assertEquals(Map.of("tUST", 500L, "tMMF", 40L), CdmReconciliation.recordedEscrow(calls, subs, 10, sym));
    }

    @Test
    void anEscrowDifferenceIsABreak() {
        String rec = CdmReconciliation.escrowRecord("BANK-A", "BANK-B");
        LedgerReconciliation r = CdmReconciliation.withLedger("BANK-A", "BANK-B",
                CdmReconciliation.escrowFacts(rec, Map.of("tUST", 500L)),
                CdmReconciliation.escrowFacts(rec, Map.of("tUST", 450L, "tMMF", 40L)));
        assertFalse(r.getReconciled());
        List<String> got = new ArrayList<>();
        for (var b : r.getLedgerBreak()) got.add(b.getAttribute() + ":" + b.getBreakType());
        got.sort(null);
        assertEquals(List.of("tMMF:MissingFromRecords", "tUST:ValueDiffers"), got);
    }
}
