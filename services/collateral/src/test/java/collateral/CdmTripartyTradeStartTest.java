package collateral;

import cdm.product.qualification.functions.Qualify_RepurchaseAgreement;
import cdmx.collateral.repo.functions.RepoPurchasePrice;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static collateral.CdmTripartyTest.AGY;
import static collateral.CdmTripartyTest.UST;
import static org.junit.jupiter.api.Assertions.*;

/** Triparty trade start (task-triparty-trade-start, wp-adr-triparty-trade-start), with the live spec's numbers: BANK-B
 *  gives collateral to BANK-A for a 500,000 tUSD repo; tUST at 98.4 ranked first, tAGY at 99.2 second. */
class CdmTripartyTradeStartTest {
    static final LocalDate PURCHASE = LocalDate.of(2026, 11, 12), REPURCHASE = LocalDate.of(2026, 11, 19);
    static final BigDecimal UST_PRICE = new BigDecimal("98.4"), AGY_PRICE = new BigDecimal("99.2");

    static CdmTriparty.Terms terms() {
        return CdmTriparty.build("BANK-B", "BANK-A", CdmTriparty.AGENT, CdmTripartyTest.GMRA, PURCHASE, UST, AGY);
    }

    static CdmTriparty.Request request() {
        return CdmTriparty.request(terms().hash(), "TP-B-1", 500_000, new BigDecimal("0.05"), PURCHASE, REPURCHASE);
    }

    static List<CdmTriparty.Deposit> deposit(long ust, long agy) {
        return List.of(new CdmTriparty.Deposit(1, UST, ust, UST_PRICE), new CdmTriparty.Deposit(2, AGY, agy, AGY_PRICE));
    }

    static CdmTriparty.Allocation allocate(long ust, long agy) {
        var r = request();
        return CdmTriparty.allocate(terms().terms(), r.request(), r.hash(), deposit(ust, agy));
    }

    @Test
    void theReceiverVerifiesTheGiversRequest() {
        var r = request();
        assertEquals(r.hash(), CdmTriparty.verifyRequest(r.json(), terms().hash(), 500_000).hash());
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifyRequest(r.json(), terms().hash(), 400_000));
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifyRequest(r.json(), "0x" + "00".repeat(32), 500_000));
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifyRequest("{}", terms().hash(), 500_000));
    }

    @Test
    void aShortDepositAllocatesNothingAndBooksNoRepo() {
        var a = allocate(2_000, 4_000);
        assertFalse(a.covers());
        assertNull(a.trade());
        assertTrue(a.units().isEmpty());
        assertEquals(false, CdmTriparty.allocationView(a.allocation()).get("covers"));
    }

    @Test
    void theAllocationBooksAValidCdmRepoWithOnePositionPerAllocatedAsset() {
        var a = allocate(3_000, 4_000);
        assertTrue(a.covers());
        assertEquals(Map.of(UST, 3_000L, AGY, 2_190L), a.units());
        var ts = a.trade();
        assertEquals("", String.join("; ", CdmRuntime.failures(ts).stream().map(Object::toString).toList()));
        assertEquals(Map.of(UST, 3_000L, AGY, 2_190L), CdmRepo.collateralPositions(ts));
        assertEquals(0, BigDecimal.valueOf(500_000).compareTo(CdmRuntime.fn(RepoPurchasePrice.class).evaluate(ts).getValue()));
        assertTrue(CdmRuntime.fn(Qualify_RepurchaseAgreement.class).evaluate(ts.getTrade().getProduct().getEconomicTerms()));
        assertEquals(3, ts.getTrade().getParty().size());
        Map<String, Object> v = CdmTriparty.allocationView(a.allocation());
        assertEquals("500026.56", v.get("allocatedValue"));
        @SuppressWarnings("unchecked") List<Map<String, Object>> ps = (List<Map<String, Object>>) v.get("positions");
        assertEquals("0.4215", ps.get(1).get("share"));
    }

    @Test
    void theGiverAndTheReceiverRecomputeTheAgentsAllocation() {
        var a = allocate(3_000, 4_000);
        var r = request();
        assertEquals(a.hash(), CdmTriparty.verifyAllocation(a.json(), terms().terms(), r.request(), r.hash(), deposit(3_000, 4_000)).hash());
        assertEquals(a.hash(), CdmTriparty.verifyAllocation(a.json(), terms().terms(), CdmTriparty.parseRequest(r.json()), r.hash(), deposit(3_000, 4_000)).hash());
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifyAllocation(a.json(), terms().terms(), r.request(), r.hash(), deposit(2_000, 4_000)));
        assertEquals(a.hash(), Cdm.keccakHex(CdmRuntime.toJson(CdmTriparty.parseAllocation(a.json()))));
    }
}
