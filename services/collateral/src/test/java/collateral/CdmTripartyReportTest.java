package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static collateral.CdmTripartyTest.AGY;
import static collateral.CdmTripartyTest.UST;
import static org.junit.jupiter.api.Assertions.*;

/** The triparty agent's report (task-triparty-reporting, wp-adr-triparty-reporting) over the trade-start repo on its
 *  Purchase Date: 3,000 tUST (289,296) and 2,190 tAGY (210,730.56) held against 500,000; 1,810 tAGY free. */
class CdmTripartyReportTest {
    static List<CdmTriparty.Deposit> held() {
        return List.of(new CdmTriparty.Deposit(1, UST, 3_000, new BigDecimal("98.4")), new CdmTriparty.Deposit(2, AGY, 2_190, new BigDecimal("99.2")));
    }

    static List<CdmTriparty.Deposit> free() {
        return List.of(new CdmTriparty.Deposit(2, AGY, 1_810, new BigDecimal("99.2")));
    }

    static CdmTriparty.Report report(CdmTriparty.Allocation a, List<CdmTriparty.Deposit> held) {
        return CdmTriparty.report(CdmTripartyTradeStartTest.terms().terms(), "0xterms", CdmTripartyTradeStartTest.PURCHASE,
                List.of(new CdmTriparty.ReportedRepo("0xrepo", "TP-B-1", CdmTriparty.parseAllocation(a.json()).getTrade(), held)), free(), "BANK-B", "BANK-A");
    }

    @Test
    void theReportGivesEachRepoItsExposureValueAndCdmPortfolioAndTheFreeCollateral() {
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var r = report(a, held());
        var doc = r.report();
        var repo = doc.getRepos().get(0);
        assertEquals(0, new BigDecimal("500000").compareTo(repo.getExposure().getValue()));
        assertEquals(0, new BigDecimal("500026.56").compareTo(repo.getValueAfterHaircuts().getValue()));
        assertTrue(repo.getCovered());
        var p = repo.getPortfolio();
        assertEquals("TP-B-1", p.getPortfolioIdentifier().getAssignedIdentifier().get(0).getIdentifier().getValue());
        assertEquals(2, p.getCollateralBalance().size());
        assertEquals(0, new BigDecimal("512448").compareTo(p.getCollateralBalance().get(1).getAmountBaseCurrency().getValue()));
        assertEquals("BANK-B", p.getCollateralBalance().get(0).getPayerReceiver().getPayerPartyReference().getValue().getName().getValue());
        assertEquals(1, doc.getFreeValued().size());
        assertEquals(1, doc.getFree().getCollateralPosition().size());
        // The giver and the receiver rebuild it; another holding gives another report.
        assertEquals(r.hash(), CdmTriparty.verifyReport(r.json(), CdmTripartyTradeStartTest.terms().terms(), "0xterms", CdmTripartyTradeStartTest.PURCHASE,
                List.of(new CdmTriparty.ReportedRepo("0xrepo", "TP-B-1", CdmTriparty.parseAllocation(a.json()).getTrade(), held())), free(), "BANK-B", "BANK-A").hash());
        Map<String, Object> v = CdmTriparty.reportView(doc);
        assertEquals("500026.56", ((List<Map<String, Object>>) v.get("repos")).get(0).get("valueAfterHaircuts"));
        assertEquals(r.hash(), Cdm.keccakHex(CdmRuntime.toJson(CdmTriparty.parseReport(r.json()))));
    }

    @Test
    void aShortRepoIsReportedUncovered() {
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var r = report(a, List.of(new CdmTriparty.Deposit(1, UST, 3_000, new BigDecimal("96.0")), new CdmTriparty.Deposit(2, AGY, 2_190, new BigDecimal("97.0"))));
        assertFalse(r.report().getRepos().get(0).getCovered());
    }

    @Test
    void termsWithNoRepoReportOnlyTheFreeCollateral() {
        var r = CdmTriparty.report(CdmTripartyTradeStartTest.terms().terms(), "0xterms", CdmTripartyTradeStartTest.PURCHASE, List.of(), free(), "BANK-B", "BANK-A");
        assertNull(r.report().getRepos());
        assertEquals(1, r.report().getFreeValued().size());
    }
}
