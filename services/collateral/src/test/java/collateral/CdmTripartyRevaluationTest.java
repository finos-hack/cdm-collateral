package collateral;

import cdm.event.qualification.functions.Qualify_Substitution;
import cdm.event.qualification.functions.Qualify_ValuationUpdate;
import cdm.product.qualification.functions.Qualify_RepurchaseAgreement;
import cdmx.collateral.repo.functions.RepoIsSubstitution;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import cdmx.collateral.triparty.TripartyRevaluationOutcomeEnum;
import cdmx.collateral.triparty.functions.RepoIsCollateralRelease;
import cdmx.collateral.triparty.functions.RepoIsCollateralTopUp;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static collateral.CdmTripartyTest.AGY;
import static collateral.CdmTripartyTest.UST;
import static org.junit.jupiter.api.Assertions.*;

/** Triparty revaluation (task-triparty-revaluation, wp-adr-triparty-revaluation) over the trade-start repo: 500,000 tUSD
 *  at 5% from 2026-11-12 to 2026-11-19 with 3,000 tUST and 2,190 tAGY held and 1,810 tAGY free, revalued on 2026-11-15
 *  (required value 500,208.33). The live spec's numbers. */
class CdmTripartyRevaluationTest {
    static final LocalDate REVAL = LocalDate.of(2026, 11, 15);

    static CdmTriparty.Allocation start() {
        return CdmTripartyTradeStartTest.allocate(3_000, 4_000);
    }

    static List<CdmTriparty.Deposit> held(long ust, long agy, String ustPrice, String agyPrice) {
        return List.of(new CdmTriparty.Deposit(1, UST, ust, new BigDecimal(ustPrice)), new CdmTriparty.Deposit(2, AGY, agy, new BigDecimal(agyPrice)));
    }

    static List<CdmTriparty.Deposit> freeAgy(long agy, String agyPrice) {
        return List.of(new CdmTriparty.Deposit(1, UST, 0, new BigDecimal("96.0")), new CdmTriparty.Deposit(2, AGY, agy, new BigDecimal(agyPrice)));
    }

    static CdmTriparty.Revaluation revalue(CdmTriparty.Allocation a, List<CdmTriparty.Deposit> held, List<CdmTriparty.Deposit> free) {
        return CdmTriparty.revalue(CdmTripartyTradeStartTest.terms().terms(), a.trade(), a.hash(), REVAL, held, free);
    }

    @Test
    void aPriceFallTopsUpAndBooksAValuationAndAQualifiedTopUpOfTheCdmRepo() {
        var a = start();
        var r = revalue(a, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0"));
        assertEquals(TripartyRevaluationOutcomeEnum.TOP_UP, r.outcome());
        assertEquals(Map.of(UST, 3_000L, AGY, 2_317L), r.units());
        var doc = r.revaluation();
        assertEquals(a.hash(), doc.getBasisHash());
        assertEquals(0, new BigDecimal("500208.33").compareTo(doc.getRequiredValue().getValue()));
        // The valuation event: CDM's valuation update, with the agent's two valuations on the repo.
        assertTrue(CdmRuntime.fn(Qualify_ValuationUpdate.class).evaluate(doc.getValuation()));
        assertEquals(2, doc.getValuation().getAfter().get(0).getValuationHistory().size());
        // The terms change: a top-up, not a substitution or a release; CDM's own qualifier stays false (D22).
        var adj = doc.getAdjustment();
        assertTrue(CdmRuntime.fn(RepoIsCollateralTopUp.class).evaluate(adj));
        assertFalse(CdmRuntime.fn(RepoIsCollateralRelease.class).evaluate(adj));
        assertTrue(CdmRuntime.fn(RepoIsSubstitution.class).evaluate(adj));
        assertFalse(CdmRuntime.fn(Qualify_Substitution.class).evaluate(adj));
        // The repo after: valid, still a repo, the new collateral, and the accrual not restarted.
        var ts = r.trade();
        assertEquals("", String.join("; ", CdmRuntime.failures(ts).stream().map(Object::toString).toList()));
        assertTrue(CdmRuntime.fn(Qualify_RepurchaseAgreement.class).evaluate(ts.getTrade().getProduct().getEconomicTerms()));
        assertEquals(Map.of(UST, 3_000L, AGY, 2_317L), CdmRepo.collateralPositions(ts));
        assertEquals(0, new BigDecimal("500486").compareTo(CdmRuntime.fn(RepoRepurchasePrice.class).evaluate(ts, 0).getValue()));
        Map<String, Object> v = CdmTriparty.revaluationView(doc);
        assertEquals("TopUp", v.get("outcome"));
        assertEquals("488297.1", v.get("valueBefore"));
        assertEquals("500246.53", v.get("valueAfter"));
        assertEquals(2, v.get("cdmEvents"));
    }

    @Test
    void aLaterPriceRiseReleasesFromTheRepoAsTheTopUpLeftIt() {
        var a = start();
        var up = revalue(a, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0"));
        // tUST 98.4 (96.432) and tAGY 101.0 (97.97): 289,296 + 226,996.49 = 516,292.49, 16,084.16 above; 164 tAGY go.
        var down = CdmTriparty.revalue(CdmTripartyTradeStartTest.terms().terms(), up.trade(), up.hash(), REVAL,
                held(3_000, 2_317, "98.4", "101.0"), freeAgy(1_683, "101.0"));
        assertEquals(TripartyRevaluationOutcomeEnum.RELEASE, down.outcome());
        assertEquals(Map.of(UST, 3_000L, AGY, 2_153L), down.units());
        assertTrue(CdmRuntime.fn(RepoIsCollateralRelease.class).evaluate(down.revaluation().getAdjustment()));
        assertFalse(CdmRuntime.fn(RepoIsCollateralTopUp.class).evaluate(down.revaluation().getAdjustment()));
        assertEquals(Map.of(UST, 3_000L, AGY, 2_153L), CdmRepo.collateralPositions(down.trade()));
        assertEquals(4, down.trade().getValuationHistory().size());
    }

    @Test
    void theRepoReadBackFromTheAllocationDocumentRevaluesTheSame() {
        // The services read the repo from the stored allocation document, after a Rune JSON round trip.
        var a = start();
        var parsed = CdmTriparty.parseAllocation(a.json()).getTrade();
        var r = CdmTriparty.revalue(CdmTripartyTradeStartTest.terms().terms(), parsed, a.hash(), REVAL, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0"));
        assertEquals(revalue(a, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0")).units(), r.units());
        var again = CdmTriparty.revalue(CdmTripartyTradeStartTest.terms().terms(), CdmTriparty.tradeAfter(CdmTriparty.parseRevaluation(r.json())), r.hash(), REVAL,
                held(3_000, 2_317, "98.4", "101.0"), freeAgy(1_683, "101.0"));
        assertEquals(Map.of(UST, 3_000L, AGY, 2_153L), again.units());
    }

    @Test
    void anUncoveredShortfallBooksOnlyTheValuation() {
        var r = revalue(start(), held(3_000, 2_190, "96.0", "97.0"), freeAgy(100, "97.0"));
        assertEquals(TripartyRevaluationOutcomeEnum.UNCOVERED, r.outcome());
        assertNull(r.revaluation().getAdjustment());
        assertNotNull(r.revaluation().getValuation());
        assertEquals(Map.of(UST, 3_000L, AGY, 2_190L), CdmRepo.collateralPositions(r.trade()));
    }

    @Test
    void theGiverAndTheReceiverRecomputeTheAgentsRevaluation() {
        var a = start();
        var r = revalue(a, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0"));
        var terms = CdmTripartyTradeStartTest.terms().terms();
        assertEquals(r.hash(), CdmTriparty.verifyRevaluation(r.json(), terms, a.trade(), a.hash(), REVAL, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0")).hash());
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifyRevaluation(r.json(), terms, a.trade(), a.hash(), REVAL, held(3_000, 2_190, "96.0", "97.5"), freeAgy(1_810, "97.5")));
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifyRevaluation(r.json(), terms, a.trade(), "0x" + "00".repeat(32), REVAL, held(3_000, 2_190, "96.0", "97.0"), freeAgy(1_810, "97.0")));
        assertEquals(r.hash(), Cdm.keccakHex(CdmRuntime.toJson(CdmTriparty.parseRevaluation(r.json()))));
    }
}
