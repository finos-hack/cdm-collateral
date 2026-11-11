package collateral;

import cdm.event.common.TradeState;
import cdm.event.qualification.functions.Qualify_Substitution;
import cdmx.collateral.gmsla.GmslaLoanTerms;
import cdmx.collateral.gmsla.functions.GmslaIsSubstitution;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** The substitution of a loan's non-cash collateral (task-gmsla-substitution, wp-adr-gmsla-substitution). */
class CdmLoanSubstitutionTest {
    static final String TAGY = "US3137EAGY10";
    static final LocalDate ON = LocalDate.of(2026, 11, 12);
    static final BigDecimal MMF = BigDecimal.ONE, AGY = new BigDecimal("99.2");

    static CdmLoan.Booking loan(boolean cash) {
        return CdmLoan.book(CdmLoanTest.terms(cash));
    }

    static GmslaLoanTerms lt(CdmLoan.Booking b) {
        return b.loan().getTerms();
    }

    @Test
    void theSubstituteMeetsTheRequiredCollateralAndTheLoanKeepsItsLotDatesAndRecall() {
        CdmLoan.Booking b = loan(false);
        var s = CdmLoanSubstitution.substitute(b.trade(), lt(b), TAGY, MMF, AGY, ON);
        assertEquals(1029, s.quantity()); // 100,000 x 1.00 x 1.02 / 99.20 = 1028.2, rounded up
        assertEquals(1037, s.returned());
        TradeState after = s.after();
        CdmLoan.Terms before = CdmLoan.terms(b.trade(), lt(b)), now = CdmLoan.terms(after, lt(b));
        assertEquals(TAGY, now.collateralIsin());
        assertEquals(1029, now.collateralAmount());
        assertEquals(before.quantity(), now.quantity());
        assertEquals(0, before.price().compareTo(now.price()));
        assertEquals(before.isin(), now.isin());
        assertEquals(b.trade().getTrade().getProduct().getEconomicTerms().getEffectiveDate(),
                after.getTrade().getProduct().getEconomicTerms().getEffectiveDate());
        assertNotNull(after.getTrade().getProduct().getEconomicTerms().getTerminationProvision().getRecallProvision());
        assertTrue(CdmRuntime.fn(GmslaIsSubstitution.class).evaluate(s.doc().getSubstitutionEvent()));
        assertFalse(CdmRuntime.fn(Qualify_Substitution.class).evaluate(s.doc().getSubstitutionEvent())); // D22
        assertEquals(ON, s.doc().getSubstitutionEvent().getEventDate().toLocalDate());
        // The eligible collateral names the substitute, with the loan's margin (the project owner's choice 1b).
        var eligible = after.getTrade().getProduct().getEconomicTerms().getCollateral().getCollateralProvisions().getEligibleCollateral();
        assertEquals(1, eligible.size());
        String criteria = CdmRuntime.JSON.valueToTree(eligible.get(0).getCollateralCriteria()).toString();
        assertTrue(criteria.contains(TAGY), criteria);
        assertFalse(criteria.contains(before.collateralIsin()), criteria);
        assertEquals(0, before.margin().compareTo(eligible.get(0).getTreatment().getValuationTreatment().getMarginPercentage()));
    }

    @Test
    void theLenderRebuildsTheSameDocumentAndRefusesATamperedOne() {
        CdmLoan.Booking b = loan(false);
        var s = CdmLoanSubstitution.substitute(b.trade(), lt(b), TAGY, MMF, AGY, ON);
        assertEquals(s.hash(), CdmLoanSubstitution.verify(s.json()).hash());
        String fewer = s.json().replaceFirst("\"value\"\\s*:\\s*1029", "\"value\" : 1000");
        assertNotEquals(s.json(), fewer);
        assertThrows(RuntimeException.class, () -> CdmLoanSubstitution.verify(fewer));
        String cheaper = s.json().replaceFirst("\"substitutePrice\"\\s*:\\s*99.2", "\"substitutePrice\":120");
        assertNotEquals(s.json(), cheaper);
        assertThrows(RuntimeException.class, () -> CdmLoanSubstitution.verify(cheaper));
    }

    @Test
    void cashCollateralTheCurrentCollateralAndTheLoanedSecurityAreRefused() {
        CdmLoan.Booking cash = loan(true), ust = loan(false);
        assertThrows(IllegalArgumentException.class, () -> CdmLoanSubstitution.substitute(cash.trade(), lt(cash), TAGY, MMF, AGY, ON));
        assertThrows(IllegalArgumentException.class, () -> CdmLoanSubstitution.substitute(ust.trade(), lt(ust), CdmLoanTest.TUST, MMF, AGY, ON));
        assertThrows(IllegalArgumentException.class, () -> CdmLoanSubstitution.substitute(ust.trade(), lt(ust), CdmLoanTest.TMMF, MMF, AGY, ON));
    }

    @Test
    void aReturnAfterASubstitutionRedeliversTheSubstitute() {
        CdmLoan.Booking b = loan(false);
        var s = CdmLoanSubstitution.substitute(b.trade(), lt(b), TAGY, MMF, AGY, ON);
        var r = CdmLoan.returnOf(s.after(), lt(b), 40_000, ON.plusDays(1));
        assertEquals(411, r.collateralAmount()); // 1029 x 40,000 / 100,000 = 411.6, rounded down
        assertEquals(r.hash(), CdmLoan.verifyReturn(r.json()).hash());
    }
}
