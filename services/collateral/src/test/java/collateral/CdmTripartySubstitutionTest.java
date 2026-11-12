package collateral;

import cdm.event.qualification.functions.Qualify_Substitution;
import cdmx.collateral.repo.functions.RepoIsSubstitution;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import cdmx.collateral.triparty.TripartyRequesterEnum;
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

/** Triparty substitution (task-triparty-substitution, wp-adr-triparty-substitution) over the trade-start repo on its
 *  Purchase Date (required value 500,000): 3,000 tUST and 2,190 tAGY held; B has 1,500 tUST and 1,810 tAGY free. The live
 *  spec's numbers. */
class CdmTripartySubstitutionTest {
    static final LocalDate DAY = CdmTripartyTradeStartTest.PURCHASE;

    static List<CdmTriparty.Deposit> held(long ust, long agy) {
        return List.of(new CdmTriparty.Deposit(1, UST, ust, new BigDecimal("98.4")), new CdmTriparty.Deposit(2, AGY, agy, new BigDecimal("99.2")));
    }

    static CdmTriparty.Substitution substitute(CdmTriparty.Allocation a, CdmTriparty.SubstitutionRequest r, List<CdmTriparty.Deposit> held, List<CdmTriparty.Deposit> free) {
        return CdmTriparty.substitute(CdmTripartyTradeStartTest.terms().terms(), CdmTriparty.parseAllocation(a.json()).getTrade(), a.hash(), r.hash(), r.request(), "BANK-B", DAY, held, free);
    }

    @Test
    void theGiversRecallIsReplacedFromItsFreeAccountAndBookedAsACdmSubstitutionWithItsWorkflow() {
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var req = CdmTriparty.substitutionRequest("TP-B-1", AGY, 1_000, false, DAY);
        var s = substitute(a, req, held(3_000, 2_190), held(1_500, 1_810));
        assertTrue(s.substituted());
        assertEquals(Map.of(UST, 3_998L, AGY, 1_190L), s.units());
        var doc = s.substitution();
        var adj = doc.getAdjustment();
        assertTrue(CdmRuntime.fn(RepoIsSubstitution.class).evaluate(adj));
        assertFalse(CdmRuntime.fn(RepoIsCollateralTopUp.class).evaluate(adj));
        assertFalse(CdmRuntime.fn(RepoIsCollateralRelease.class).evaluate(adj));
        assertFalse(CdmRuntime.fn(Qualify_Substitution.class).evaluate(adj)); // D22
        assertEquals("", String.join("; ", CdmRuntime.failures(doc.getProposed()).stream().map(Object::toString).toList()));
        assertEquals("", String.join("; ", CdmRuntime.failures(doc.getAccepted()).stream().map(Object::toString).toList()));
        assertEquals("BANK-B", doc.getProposed().getParty().get(0).getName().getValue());
        assertEquals("BANK-T", doc.getProposed().getApproval().get(0).getParty().getValue().getName().getValue());
        assertEquals(req.hash(), doc.getProposed().getEventIdentifier().get(0).getAssignedIdentifier().get(0).getIdentifier().getValue());
        assertEquals(Map.of(UST, 3_998L, AGY, 1_190L), CdmRepo.collateralPositions(s.trade()));
        assertEquals(0, new BigDecimal("500486").compareTo(CdmRuntime.fn(RepoRepurchasePrice.class).evaluate(s.trade(), 0).getValue()));
        // The giver and the receiver recompute it; a different free account gives a different document.
        var terms = CdmTripartyTradeStartTest.terms().terms();
        var basis = CdmTriparty.parseAllocation(a.json()).getTrade();
        assertEquals(s.hash(), CdmTriparty.verifySubstitution(s.json(), terms, basis, a.hash(), req.hash(), req.request(), "BANK-B", DAY, held(3_000, 2_190), held(1_500, 1_810)).hash());
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verifySubstitution(s.json(), terms, basis, a.hash(), req.hash(), req.request(), "BANK-B", DAY, held(3_000, 2_190), held(1_600, 1_810)));
        assertEquals("Substituted", CdmTriparty.substitutionView(doc).get("outcome"));
        assertEquals(2, CdmTriparty.substitutionView(doc).get("workflowSteps"));
    }

    @Test
    void aRecallTheFreeAccountCannotReplaceIsDeclinedAndKeepsTheRepo() {
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var first = substitute(a, CdmTriparty.substitutionRequest("TP-B-1", AGY, 1_000, false, DAY), held(3_000, 2_190), held(1_500, 1_810));
        var req = CdmTriparty.substitutionRequest("TP-B-1", AGY, 1_190, false, DAY);
        var s = CdmTriparty.substitute(CdmTripartyTradeStartTest.terms().terms(), CdmTriparty.parseSubstitution(first.json()).getAdjustment() == null ? null
                : CdmTriparty.tradeAfter(CdmTriparty.parseSubstitution(first.json())), first.hash(), req.hash(), req.request(), "BANK-B", DAY, held(3_998, 1_190), held(502, 2_810));
        assertFalse(s.substituted());
        assertNull(s.substitution().getAdjustment());
        assertNull(s.substitution().getProposed());
        assertEquals(Map.of(UST, 3_998L, AGY, 1_190L), CdmRepo.collateralPositions(s.trade()));
    }

    @Test
    void theAgentAsksBackTheUnitsOverALimitAndSubstitutesThem() {
        // tAGY at 120 (116.40) makes 2,190 tAGY 254,916, 4,916 over half of 500,000: 43 units over the limit.
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var r = CdmTriparty.revalue(CdmTripartyTradeStartTest.terms().terms(), a.trade(), a.hash(), DAY,
                List.of(new CdmTriparty.Deposit(1, UST, 3_000, new BigDecimal("80.0")), new CdmTriparty.Deposit(2, AGY, 2_190, new BigDecimal("120.0"))), List.of());
        var excess = CdmTriparty.excessUnits(r.revaluation().getHeldAfter(), r.revaluation().getBreaches(), r.revaluation().getRequiredValue().getValue());
        assertEquals(Map.of(AGY, 43L), excess);
        var req = CdmTriparty.substitutionRequest("TP-B-1", AGY, 43, true, DAY);
        assertEquals(TripartyRequesterEnum.AGENT, req.request().getRequestedBy());
        var s = CdmTriparty.substitute(CdmTripartyTradeStartTest.terms().terms(), r.trade(), r.hash(), req.hash(), req.request(), "BANK-B", DAY,
                List.of(new CdmTriparty.Deposit(1, UST, 3_000, new BigDecimal("80.0")), new CdmTriparty.Deposit(2, AGY, 2_190, new BigDecimal("120.0"))),
                List.of(new CdmTriparty.Deposit(1, UST, 500, new BigDecimal("80.0"))));
        // 3,000 tUST (235,200) and 2,147 tAGY (249,910.80) leave 14,889.20 short; 190 tUST (14,896) replace them.
        assertTrue(s.substituted());
        assertEquals(Map.of(UST, 3_190L, AGY, 2_147L), s.units());
        assertNull(s.substitution().getBreaches());
        assertEquals("BANK-T", s.substitution().getProposed().getParty().get(0).getName().getValue());
    }
}
